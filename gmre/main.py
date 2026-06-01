"""FastAPI application: JSON API + server-rendered dashboard."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import reporting
from .database import get_session, init_db
from .models import Entity, Property

BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Gadol Meod Real Estate — Reporting & Registry",
    version="0.1.0",
    lifespan=lifespan,
)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")


# ----------------------------- JSON API -----------------------------------

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/overview")
def api_overview(session: Session = Depends(get_session)) -> dict:
    return reporting.portfolio_overview(session)


@app.get("/api/properties")
def api_properties(session: Session = Depends(get_session)) -> list[dict]:
    props = session.scalars(select(Property)).all()
    return [
        {
            "id": p.id, "name": p.name, "entity_id": p.entity_id,
            "address": p.address, "type": p.property_type, "status": p.status,
            "sqft": p.sqft,
        }
        for p in props
    ]


@app.get("/api/entities")
def api_entities(session: Session = Depends(get_session)) -> list[dict]:
    return reporting.entity_rollup(session)


@app.get("/api/rent-roll")
def api_rent_roll(session: Session = Depends(get_session)) -> list[dict]:
    return reporting.rent_roll(session)


@app.get("/api/income-statement")
def api_income_statement(
    period: str | None = None, session: Session = Depends(get_session)
) -> dict:
    return reporting.income_statement(session, period)


@app.get("/api/data-health")
def api_data_health(session: Session = Depends(get_session)) -> dict:
    return reporting.data_health(session)


# ----------------------------- Dashboard ----------------------------------

@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request, session: Session = Depends(get_session)):
    return templates.TemplateResponse(
        request,
        "dashboard.html",
        {
            "overview": reporting.portfolio_overview(session),
            "rent_roll": reporting.rent_roll(session),
            "entities": reporting.entity_rollup(session),
            "income": reporting.income_statement(session),
            "health": reporting.data_health(session),
        },
    )


@app.get("/properties/{property_id}", response_class=HTMLResponse)
def property_detail(
    property_id: str, request: Request, session: Session = Depends(get_session)
):
    prop = session.get(Property, property_id)
    if prop is None:
        return HTMLResponse("Property not found", status_code=404)
    return templates.TemplateResponse(request, "property.html", {"p": prop})
