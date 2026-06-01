"""End-to-end tests against an isolated, in-temp-dir database."""

import csv
import os
from pathlib import Path

import pytest

# Point the app at a throwaway SQLite DB before importing any gmre module.
_TMP_DB = Path(__file__).resolve().parent / "_test_gmre.db"
os.environ["GMRE_DATABASE_URL"] = f"sqlite:///{_TMP_DB}"


@pytest.fixture(scope="module", autouse=True)
def fresh_db():
    if _TMP_DB.exists():
        _TMP_DB.unlink()
    from gmre import seed
    seed.seed(reset=True)
    yield
    if _TMP_DB.exists():
        _TMP_DB.unlink()


def _session():
    from gmre.database import SessionLocal
    return SessionLocal()


def test_seed_loaded_real_portfolio():
    from gmre.models import Entity, Property
    s = _session()
    try:
        entities = {e.name for e in s.query(Entity).all()}
        props = {p.name for p in s.query(Property).all()}
        assert "Gadol Meod Inc" in entities
        assert "400 Railroad Partners LLC" in entities
        assert any("Railroad Warehouse" in p for p in props)
        assert "213 W 1st St, Huntingburg" in props
        assert len(props) >= 15  # warehouses, offices, and the SFR portfolio
    finally:
        s.close()


def test_overview_counts():
    from gmre import reporting
    s = _session()
    try:
        ov = reporting.portfolio_overview(s)
        assert ov["property_count"] >= 15
        assert ov["entity_count"] >= 10
        assert ov["total_sqft"] >= 30000  # the Trafford office is known at 30k sqft
        assert ov["annualized_rent"] == 0  # no leases seeded -> honest zero
    finally:
        s.close()


def test_lease_import_drives_rent_roll(tmp_path):
    from gmre import reporting, seed
    csv_file = tmp_path / "leases.csv"
    with open(csv_file, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["property_id", "tenant_name", "unit", "start_date",
                    "end_date", "monthly_rent", "status"])
        w.writerow(["railroad-warehouse", "Acme LLC", "B1G6", "2025-01-01",
                    "2026-12-31", "1650", "active"])
    assert seed.import_leases(csv_file) == 1

    s = _session()
    try:
        roll = {r["property_id"]: r for r in reporting.rent_roll(s)}
        assert roll["railroad-warehouse"]["monthly_rent"] == 1650
        assert roll["railroad-warehouse"]["annual_rent"] == 19800
        assert roll["railroad-warehouse"]["occupied"] is True
    finally:
        s.close()


def test_financials_import_drives_income_statement(tmp_path):
    from gmre import reporting, seed
    csv_file = tmp_path / "fin.csv"
    with open(csv_file, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["property_id", "entity_id", "period", "kind",
                    "category", "amount", "source"])
        w.writerow(["railroad-warehouse", "", "2026-05", "income", "rent", "1650", "csv"])
        w.writerow(["railroad-warehouse", "", "2026-05", "expense", "taxes", "282", "csv"])
    assert seed.import_financials(csv_file) == 2

    s = _session()
    try:
        stmt = reporting.income_statement(s, "2026-05")
        assert stmt["total_income"] == 1650
        assert stmt["total_expense"] == 282
        assert stmt["net_operating_income"] == 1368
    finally:
        s.close()


def test_api_endpoints():
    from fastapi.testclient import TestClient
    from gmre.main import app

    client = TestClient(app)
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/overview").json()["property_count"] >= 15
    assert client.get("/").status_code == 200  # dashboard renders
    assert len(client.get("/api/properties").json()) >= 15
