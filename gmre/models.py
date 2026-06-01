"""SQLAlchemy ORM models for the registry."""

from __future__ import annotations

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Entity(Base):
    """A legal entity that owns property or manages assets (LLC, LP, Trust, Corp)."""

    __tablename__ = "entities"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str | None] = mapped_column(String)  # C-Corp, LLC, LP, Trust
    role: Mapped[str | None] = mapped_column(String)  # holding, fund, operating, ...
    notes: Mapped[str | None] = mapped_column(Text)

    properties: Mapped[list["Property"]] = relationship(back_populates="entity")


class Property(Base):
    """A real estate asset."""

    __tablename__ = "properties"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"))
    street: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String)
    state: Mapped[str | None] = mapped_column(String)
    zip: Mapped[str | None] = mapped_column(String)
    property_type: Mapped[str | None] = mapped_column(String)  # warehouse, office, SFR
    status: Mapped[str | None] = mapped_column(String)  # owned, under_contract, sold
    sqft: Mapped[int | None] = mapped_column(Integer)
    acquisition_date: Mapped[date | None] = mapped_column(Date)
    acquisition_price: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)

    entity: Mapped["Entity | None"] = relationship(back_populates="properties")
    leases: Mapped[list["Lease"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )
    financials: Mapped[list["FinancialRecord"]] = relationship(
        back_populates="property", cascade="all, delete-orphan"
    )

    @property
    def address(self) -> str:
        parts = [self.street, self.city, self.state, self.zip]
        return ", ".join(p for p in parts if p) or "—"


class Lease(Base):
    """A tenancy at a property. Drives the rent roll and occupancy reporting."""

    __tablename__ = "leases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[str] = mapped_column(ForeignKey("properties.id"), nullable=False)
    tenant_name: Mapped[str] = mapped_column(String, nullable=False)
    unit: Mapped[str | None] = mapped_column(String)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    monthly_rent: Mapped[float | None] = mapped_column(Float)
    status: Mapped[str | None] = mapped_column(String, default="active")  # active, vacant

    property: Mapped["Property"] = relationship(back_populates="leases")


class FinancialRecord(Base):
    """A periodic income or expense line, typically imported from QuickBooks/CSV."""

    __tablename__ = "financial_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[str | None] = mapped_column(ForeignKey("properties.id"))
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"))
    period: Mapped[str] = mapped_column(String, nullable=False)  # YYYY-MM
    kind: Mapped[str] = mapped_column(String, nullable=False)  # income | expense
    category: Mapped[str | None] = mapped_column(String)  # rent, taxes, repairs, ...
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str | None] = mapped_column(String)  # quickbooks, csv, manual

    property: Mapped["Property | None"] = relationship(back_populates="financials")
