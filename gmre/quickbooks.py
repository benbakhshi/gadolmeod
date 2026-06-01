"""QuickBooks Online -> registry sync.

The reporting app holds no QuickBooks credentials of its own. QBO data is pulled
through the connected QuickBooks integration and handed to this module as a report
payload, which we normalize into income/expense line items and persist as
``FinancialRecord`` rows for a given entity and period. Those rows then feed the
income statement and per-entity NOI automatically.

Two input shapes are accepted by :func:`parse_pl_report`:

1. **Intuit standard** QuickBooks Online ``ProfitAndLoss`` report JSON (the
   ``Rows -> Row`` tree with ``group`` sections: Income / COGS / Expenses).
2. **Normalized** form, convenient to hand-produce::

       {"period": "2026-05",
        "lines": [{"kind": "income", "category": "Rent", "amount": 1650.0},
                  {"kind": "expense", "category": "Property Taxes", "amount": 282.0}]}
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import delete
from sqlalchemy.orm import Session

from .models import FinancialRecord

_INCOME_GROUPS = {"Income"}
_EXPENSE_GROUPS = {"COGS", "Expenses", "OtherExpenses"}


@dataclass
class PLLine:
    kind: str  # "income" | "expense"
    category: str
    amount: float


def _to_float(raw) -> float | None:
    if raw in (None, ""):
        return None
    try:
        return float(str(raw).replace(",", "").replace("$", ""))
    except ValueError:
        return None


def _walk_section(section: dict, kind: str) -> list[PLLine]:
    """Recursively collect leaf Data rows under an Intuit report section."""
    out: list[PLLine] = []
    for row in section.get("Rows", {}).get("Row", []):
        rtype = row.get("type")
        if rtype == "Data":
            cols = row.get("ColData", [])
            if len(cols) >= 2:
                name = cols[0].get("value") or "uncategorized"
                amount = _to_float(cols[-1].get("value"))
                if amount:
                    out.append(PLLine(kind, name, abs(amount)))
        elif rtype == "Section":
            out.extend(_walk_section(row, kind))
    return out


def parse_pl_report(report: dict) -> list[PLLine]:
    """Normalize a QBO P&L payload (Intuit or normalized form) into PLLines."""
    # Normalized form.
    if "lines" in report:
        lines = []
        for ln in report["lines"]:
            amt = _to_float(ln.get("amount"))
            if amt is None:
                continue
            kind = ln.get("kind")
            if kind not in ("income", "expense"):
                continue
            lines.append(PLLine(kind, ln.get("category") or "uncategorized", abs(amt)))
        return lines

    # Intuit standard report form.
    out: list[PLLine] = []
    for section in report.get("Rows", {}).get("Row", []):
        group = section.get("group")
        if group in _INCOME_GROUPS:
            out.extend(_walk_section(section, "income"))
        elif group in _EXPENSE_GROUPS:
            out.extend(_walk_section(section, "expense"))
    return out


def period_from_report(report: dict) -> str | None:
    """Best-effort YYYY-MM period from a report payload."""
    if report.get("period"):
        return report["period"][:7]
    end = report.get("Header", {}).get("EndPeriod")
    return end[:7] if end else None


def load_pl_into_records(
    session: Session,
    lines: list[PLLine],
    *,
    entity_id: str,
    period: str,
    property_id: str | None = None,
    source: str = "quickbooks",
    replace: bool = True,
) -> int:
    """Persist PLLines as FinancialRecords for an entity/period.

    When ``replace`` is set (default), existing ``quickbooks``-sourced records for
    the same entity + period are removed first, so re-syncing a period is idempotent.
    """
    if replace:
        session.execute(
            delete(FinancialRecord).where(
                FinancialRecord.entity_id == entity_id,
                FinancialRecord.period == period,
                FinancialRecord.source == source,
            )
        )
    for ln in lines:
        session.add(FinancialRecord(
            entity_id=entity_id, property_id=property_id, period=period,
            kind=ln.kind, category=ln.category, amount=ln.amount, source=source,
        ))
    session.commit()
    return len(lines)
