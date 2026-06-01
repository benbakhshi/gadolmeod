"""Tests for the QuickBooks P&L sync (parsing + loading)."""

from pathlib import Path

import pytest

_TMP_DB = Path(__file__).resolve().parent / "_test_qbo.db"


@pytest.fixture(scope="module", autouse=True)
def fresh_db():
    if _TMP_DB.exists():
        _TMP_DB.unlink()
    from gmre import database, seed
    database.configure(f"sqlite:///{_TMP_DB}")
    seed.seed(reset=True)
    yield
    if _TMP_DB.exists():
        _TMP_DB.unlink()


# A trimmed but structurally faithful Intuit QBO ProfitAndLoss payload.
INTUIT_REPORT = {
    "Header": {"ReportName": "ProfitAndLoss",
               "StartPeriod": "2026-05-01", "EndPeriod": "2026-05-31"},
    "Rows": {"Row": [
        {"group": "Income", "type": "Section",
         "Rows": {"Row": [
             {"type": "Data", "ColData": [{"value": "Rental Income"}, {"value": "1,650.00"}]},
             {"type": "Data", "ColData": [{"value": "Late Fees"}, {"value": "50.00"}]},
         ]}},
        {"group": "Expenses", "type": "Section",
         "Rows": {"Row": [
             {"type": "Data", "ColData": [{"value": "Property Taxes"}, {"value": "282.00"}]},
             {"type": "Section", "Rows": {"Row": [
                 {"type": "Data", "ColData": [{"value": "Repairs"}, {"value": "120.00"}]},
             ]}},
         ]}},
        {"group": "NetIncome", "type": "Section", "Rows": {"Row": []}},
    ]},
}


def test_parse_intuit_report():
    from gmre import quickbooks as qb
    lines = qb.parse_pl_report(INTUIT_REPORT)
    income = {l.category: l.amount for l in lines if l.kind == "income"}
    expense = {l.category: l.amount for l in lines if l.kind == "expense"}
    assert income == {"Rental Income": 1650.0, "Late Fees": 50.0}
    assert expense == {"Property Taxes": 282.0, "Repairs": 120.0}  # nested row captured
    assert qb.period_from_report(INTUIT_REPORT) == "2026-05"


def test_parse_normalized_form():
    from gmre import quickbooks as qb
    report = {"period": "2026-04", "lines": [
        {"kind": "income", "category": "Rent", "amount": 900},
        {"kind": "expense", "category": "Insurance", "amount": 100},
        {"kind": "other", "category": "ignored", "amount": 5},  # dropped
    ]}
    lines = qb.parse_pl_report(report)
    assert len(lines) == 2
    assert qb.period_from_report(report) == "2026-04"


def test_load_and_idempotent_replace():
    from gmre import quickbooks as qb, reporting
    from gmre.database import SessionLocal

    lines = qb.parse_pl_report(INTUIT_REPORT)

    s = SessionLocal()
    try:
        qb.load_pl_into_records(s, lines, entity_id="400-railroad-partners-llc",
                                period="2026-05")
        # Re-loading the same period must not double-count (idempotent replace).
        qb.load_pl_into_records(s, lines, entity_id="400-railroad-partners-llc",
                                period="2026-05")
    finally:
        s.close()

    s = SessionLocal()
    try:
        stmt = reporting.income_statement(s, "2026-05")
        assert stmt["total_income"] == 1700.0   # 1650 + 50, counted once
        assert stmt["total_expense"] == 402.0    # 282 + 120, counted once
        assert stmt["net_operating_income"] == 1298.0

        rollup = {e["entity_id"]: e for e in reporting.entity_rollup(s)}
        assert rollup["400-railroad-partners-llc"]["noi"] == 1298.0
    finally:
        s.close()
