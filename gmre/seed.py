"""Load the registry source-of-truth (portfolio.yaml) into the database."""

from __future__ import annotations

import csv
from datetime import date, datetime
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import SessionLocal, init_db
from .models import Entity, FinancialRecord, Lease, Property

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PORTFOLIO_FILE = DATA_DIR / "portfolio.yaml"
TEMPLATE_DIR = DATA_DIR / "templates"


def _parse_date(value) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value), "%Y-%m-%d").date()


def seed(portfolio_file: Path = PORTFOLIO_FILE, *, reset: bool = True) -> dict:
    """Load entities and properties from YAML. Returns a count summary.

    Leases and financials are NOT mass-loaded from YAML (they are imported via
    CSV), but any present in the file are honored.
    """
    init_db()
    data = yaml.safe_load(portfolio_file.read_text()) or {}

    session: Session = SessionLocal()
    try:
        if reset:
            # Re-seeding rebuilds the registry skeleton; keep it simple and explicit.
            for model in (Lease, Property, Entity):
                for row in session.scalars(select(model)).all():
                    session.delete(row)
            session.flush()

        counts = {"entities": 0, "properties": 0, "leases": 0, "financials": 0}

        for e in data.get("entities", []) or []:
            session.merge(Entity(**{k: e.get(k) for k in
                                    ("id", "name", "type", "role", "notes")}))
            counts["entities"] += 1

        for p in data.get("properties", []) or []:
            session.merge(Property(
                id=p["id"], name=p["name"], entity_id=p.get("entity_id"),
                street=p.get("street"), city=p.get("city"), state=p.get("state"),
                zip=p.get("zip"), property_type=p.get("property_type"),
                status=p.get("status"), sqft=p.get("sqft"),
                acquisition_date=_parse_date(p.get("acquisition_date")),
                acquisition_price=p.get("acquisition_price"), notes=p.get("notes"),
            ))
            counts["properties"] += 1

        for lease in data.get("leases", []) or []:
            session.add(Lease(
                property_id=lease["property_id"], tenant_name=lease["tenant_name"],
                unit=lease.get("unit"), start_date=_parse_date(lease.get("start_date")),
                end_date=_parse_date(lease.get("end_date")),
                monthly_rent=lease.get("monthly_rent"),
                status=lease.get("status", "active"),
            ))
            counts["leases"] += 1

        for fr in data.get("financials", []) or []:
            session.add(FinancialRecord(
                property_id=fr.get("property_id"), entity_id=fr.get("entity_id"),
                period=fr["period"], kind=fr["kind"], category=fr.get("category"),
                amount=fr["amount"], source=fr.get("source", "yaml"),
            ))
            counts["financials"] += 1

        session.commit()
        _write_templates()
        return counts
    finally:
        session.close()


def import_leases(csv_file: Path) -> int:
    """Import leases from a CSV. Columns: property_id,tenant_name,unit,start_date,
    end_date,monthly_rent,status."""
    session = SessionLocal()
    n = 0
    try:
        with open(csv_file, newline="") as fh:
            for row in csv.DictReader(fh):
                session.add(Lease(
                    property_id=row["property_id"].strip(),
                    tenant_name=row["tenant_name"].strip(),
                    unit=(row.get("unit") or "").strip() or None,
                    start_date=_parse_date(row.get("start_date")),
                    end_date=_parse_date(row.get("end_date")),
                    monthly_rent=float(row["monthly_rent"]) if row.get("monthly_rent") else None,
                    status=(row.get("status") or "active").strip(),
                ))
                n += 1
        session.commit()
        return n
    finally:
        session.close()


def import_financials(csv_file: Path) -> int:
    """Import financial records from a CSV. Columns: property_id,entity_id,period,
    kind,category,amount,source."""
    session = SessionLocal()
    n = 0
    try:
        with open(csv_file, newline="") as fh:
            for row in csv.DictReader(fh):
                session.add(FinancialRecord(
                    property_id=(row.get("property_id") or "").strip() or None,
                    entity_id=(row.get("entity_id") or "").strip() or None,
                    period=row["period"].strip(),
                    kind=row["kind"].strip(),
                    category=(row.get("category") or "").strip() or None,
                    amount=float(row["amount"]),
                    source=(row.get("source") or "csv").strip(),
                ))
                n += 1
        session.commit()
        return n
    finally:
        session.close()


def _write_templates() -> None:
    """Write CSV import templates so the user knows the expected columns."""
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    leases = TEMPLATE_DIR / "leases.csv"
    if not leases.exists():
        leases.write_text(
            "property_id,tenant_name,unit,start_date,end_date,monthly_rent,status\n"
            "railroad-warehouse,Example Tenant LLC,B1G6,2025-01-01,2026-12-31,1650,active\n"
        )
    financials = TEMPLATE_DIR / "financials.csv"
    if not financials.exists():
        financials.write_text(
            "property_id,entity_id,period,kind,category,amount,source\n"
            "railroad-warehouse,400-railroad-partners-llc,2026-05,income,rent,1650,csv\n"
            "railroad-warehouse,400-railroad-partners-llc,2026-05,expense,taxes,282,csv\n"
        )
