# Gadol Meod — Real Estate Reporting & Registry

Gadol Meod Inc is a C corporation focused on value-add and hold of industrial
real estate and publicly traded securities of quality and growing companies.

This repo is the company's **real estate reporting and registry system**: a single
source of truth for every entity and property, plus reporting (portfolio overview,
rent roll, per-entity rollups, income statement) served as a **web dashboard**, a
**JSON API**, and a **CLI**.

## What's in the box

- **Registry** — `data/portfolio.yaml` is the human-editable source of truth for
  entities (LLCs/LPs/Trust/Corp) and properties. It is version-controlled and
  loaded into a local SQLite database with `gmre seed`.
- **Reporting engine** (`gmre/reporting.py`) — portfolio overview, rent roll &
  occupancy, entity rollups with NOI, and an income statement.
- **Web dashboard + JSON API** (`gmre/main.py`, FastAPI) — `/` for the dashboard,
  `/api/*` for JSON.
- **CLI** (`gmre`) — seed, import, report, serve.

> **On data integrity:** the registry ships seeded with the *real* entities and
> properties from the portfolio, but financial figures (rents, prices, NOI) are
> **left blank where not independently known** — they are never guessed. Populate
> them in the YAML, import them via CSV, or wire up the QuickBooks sync.

## Quick start

```bash
uv venv --python 3.11
source .venv/bin/activate
uv pip install -e ".[dev]"

gmre seed                 # load data/portfolio.yaml -> gmre.db
gmre serve                # dashboard at http://127.0.0.1:8000
```

## CLI

```bash
gmre seed                              # (re)load the registry from portfolio.yaml
gmre report overview                   # portfolio counts & rollups (JSON)
gmre report rent-roll                  # per-property rent roll
gmre report entities                   # per-entity rollup with NOI
gmre report income --period 2026-05    # income statement for a month
gmre report health                     # registry gaps to fill in
gmre import-leases   data/templates/leases.csv
gmre import-financials data/templates/financials.csv
gmre serve --host 0.0.0.0 --port 8000  # web dashboard + API
```

## JSON API

| Endpoint | Description |
|---|---|
| `GET /api/overview` | Portfolio counts, sqft, annualized rent |
| `GET /api/properties` | All properties |
| `GET /api/entities` | Entity rollup with NOI |
| `GET /api/rent-roll` | Rent roll & occupancy |
| `GET /api/income-statement?period=YYYY-MM` | Income statement |
| `GET /api/data-health` | Registry gaps |

## Populating data

1. **Registry edits** — edit `data/portfolio.yaml` (addresses, sqft, owner entity,
   acquisition price/date), then `gmre seed`. The dashboard's *Data health* panel
   lists what's still missing.
2. **Leases** — fill `data/templates/leases.csv` (written on first seed) and run
   `gmre import-leases <file>`. This drives the rent roll and occupancy.
3. **Financials** — fill `data/templates/financials.csv` and run
   `gmre import-financials <file>`. This drives the income statement and per-entity
   NOI. Export these from QuickBooks (P&L by class/property) and map columns to
   `property_id,entity_id,period,kind,category,amount,source`.

### Wiring up QuickBooks later

`FinancialRecord.source` is designed to distinguish `quickbooks` from `csv`/`manual`
rows. A future sync can pull P&L lines per entity/property and upsert them as
financial records for a period — the reporting layer already consumes them.

## Data model

- **Entity** — a legal entity (Gadol Meod Inc, Herzl Capital LLC, 400 Railroad
  Partners LLC, First Street Partners LLC, Bakhshi Family Trust, …).
- **Property** — a real estate asset, owned by an Entity.
- **Lease** — a tenancy at a Property (rent roll / occupancy).
- **FinancialRecord** — a periodic income/expense line (income statement / NOI).

## Tests

```bash
python -m pytest -q
```

## Configuration

- `GMRE_DATABASE_URL` — SQLAlchemy URL (default: `sqlite:///gmre.db`). `gmre.db` is
  git-ignored and fully regenerated from `data/portfolio.yaml`.
