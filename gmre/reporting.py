"""Reporting engine: portfolio overview, rent roll, entity rollups, income statements.

All functions take a SQLAlchemy Session and return plain dicts/lists so they can be
consumed equally by the JSON API, the HTML dashboard, and the CLI.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Entity, FinancialRecord, Lease, Property


def portfolio_overview(session: Session) -> dict:
    """High-level counts and rollups across the whole portfolio."""
    properties = session.scalars(select(Property)).all()
    entities = session.scalars(select(Entity)).all()

    by_type: dict[str, int] = defaultdict(int)
    by_status: dict[str, int] = defaultdict(int)
    by_state: dict[str, int] = defaultdict(int)
    total_sqft = 0
    for p in properties:
        by_type[p.property_type or "unspecified"] += 1
        by_status[p.status or "unspecified"] += 1
        by_state[p.state or "unspecified"] += 1
        total_sqft += p.sqft or 0

    return {
        "entity_count": len(entities),
        "property_count": len(properties),
        "total_sqft": total_sqft,
        "by_type": dict(sorted(by_type.items())),
        "by_status": dict(sorted(by_status.items())),
        "by_state": dict(sorted(by_state.items())),
        "annualized_rent": _annualized_rent(session),
    }


def _annualized_rent(session: Session) -> float:
    leases = session.scalars(
        select(Lease).where(Lease.status == "active")
    ).all()
    return round(sum((l.monthly_rent or 0) for l in leases) * 12, 2)


def rent_roll(session: Session) -> list[dict]:
    """Per-property rent roll with occupancy and annualized rent."""
    rows = []
    for p in session.scalars(select(Property)).all():
        active = [l for l in p.leases if l.status == "active"]
        monthly = sum((l.monthly_rent or 0) for l in active)
        rows.append({
            "property_id": p.id,
            "property": p.name,
            "entity": p.entity.name if p.entity else None,
            "type": p.property_type,
            "active_leases": len(active),
            "occupied": len(active) > 0,
            "monthly_rent": round(monthly, 2),
            "annual_rent": round(monthly * 12, 2),
            "tenants": [
                {"tenant": l.tenant_name, "unit": l.unit, "monthly_rent": l.monthly_rent}
                for l in active
            ],
        })
    return rows


def entity_rollup(session: Session) -> list[dict]:
    """Per-entity view: properties owned, and net operating income if available.

    A financial record is attributed to an entity by its explicit ``entity_id``
    (e.g. an entity-level QuickBooks P&L), or, when that is absent, by the owning
    entity of its property. Each record is counted exactly once.
    """
    entities = session.scalars(select(Entity)).all()
    property_owner = {p.id: p.entity_id for e in entities for p in e.properties}

    income: dict[str, float] = defaultdict(float)
    expense: dict[str, float] = defaultdict(float)
    for fr in session.scalars(select(FinancialRecord)).all():
        owner = fr.entity_id or property_owner.get(fr.property_id)
        if owner is None:
            continue
        bucket = income if fr.kind == "income" else expense
        bucket[owner] += fr.amount

    rollup = []
    for e in entities:
        props = e.properties
        rollup.append({
            "entity_id": e.id,
            "entity": e.name,
            "type": e.type,
            "role": e.role,
            "property_count": len(props),
            "properties": [p.name for p in props],
            "income": round(income[e.id], 2),
            "expense": round(expense[e.id], 2),
            "noi": round(income[e.id] - expense[e.id], 2),
        })
    return rollup


def income_statement(session: Session, period: str | None = None) -> dict:
    """Income statement across the portfolio, optionally filtered to a YYYY-MM period.

    Returns income and expense totals broken out by category.
    """
    stmt = select(FinancialRecord)
    if period:
        stmt = stmt.where(FinancialRecord.period == period)
    records = session.scalars(stmt).all()

    income: dict[str, float] = defaultdict(float)
    expense: dict[str, float] = defaultdict(float)
    for r in records:
        bucket = income if r.kind == "income" else expense
        bucket[r.category or "uncategorized"] += r.amount

    total_income = round(sum(income.values()), 2)
    total_expense = round(sum(expense.values()), 2)
    return {
        "period": period or "all",
        "income": {k: round(v, 2) for k, v in sorted(income.items())},
        "expense": {k: round(v, 2) for k, v in sorted(expense.items())},
        "total_income": total_income,
        "total_expense": total_expense,
        "net_operating_income": round(total_income - total_expense, 2),
        "record_count": len(records),
    }


def data_health(session: Session) -> dict:
    """Flag registry gaps so the user knows what to fill in (no guessing)."""
    properties = session.scalars(select(Property)).all()
    missing_entity = [p.name for p in properties if not p.entity_id]
    missing_address = [p.name for p in properties if not (p.city and p.state)]
    no_leases = [p.name for p in properties if not p.leases]
    has_financials = session.scalar(select(FinancialRecord.id).limit(1)) is not None
    return {
        "properties_missing_owner_entity": missing_entity,
        "properties_missing_city_state": missing_address,
        "properties_without_leases": no_leases,
        "any_financials_imported": has_financials,
    }
