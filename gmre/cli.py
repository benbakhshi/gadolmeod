"""Command-line interface: gmre <command>."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import database, reporting, seed as seed_mod
from .database import init_db


def _print_json(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


def cmd_seed(args) -> int:
    counts = seed_mod.seed(reset=not args.no_reset)
    print(f"Seeded registry: {counts['entities']} entities, "
          f"{counts['properties']} properties, {counts['leases']} leases, "
          f"{counts['financials']} financial records.")
    return 0


def cmd_import_leases(args) -> int:
    n = seed_mod.import_leases(Path(args.file))
    print(f"Imported {n} leases from {args.file}.")
    return 0


def cmd_import_financials(args) -> int:
    n = seed_mod.import_financials(Path(args.file))
    print(f"Imported {n} financial records from {args.file}.")
    return 0


def cmd_report(args) -> int:
    init_db()
    session = database.SessionLocal()
    try:
        fn = {
            "overview": reporting.portfolio_overview,
            "rent-roll": reporting.rent_roll,
            "entities": reporting.entity_rollup,
            "health": reporting.data_health,
        }
        if args.name == "income":
            _print_json(reporting.income_statement(session, args.period))
        else:
            _print_json(fn[args.name](session))
        return 0
    finally:
        session.close()


def cmd_sync_quickbooks(args) -> int:
    import json as _json

    from . import quickbooks as qb

    report = _json.loads(Path(args.file).read_text())
    lines = qb.parse_pl_report(report)
    period = args.period or qb.period_from_report(report)
    if not period:
        print("error: could not determine period; pass --period YYYY-MM", file=sys.stderr)
        return 2

    if args.dry_run:
        print(f"Parsed {len(lines)} lines for entity={args.entity} period={period}:")
        for ln in lines:
            print(f"  {ln.kind:<8} {ln.category:<32} {ln.amount:>12,.2f}")
        return 0

    init_db()
    session = database.SessionLocal()
    try:
        n = qb.load_pl_into_records(
            session, lines, entity_id=args.entity, period=period,
            property_id=args.property, replace=not args.no_replace,
        )
        print(f"Loaded {n} QuickBooks financial records "
              f"for entity={args.entity} period={period}.")
        return 0
    finally:
        session.close()


def cmd_serve(args) -> int:
    import uvicorn

    init_db()
    uvicorn.run("gmre.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="gmre", description="Gadol Meod real estate "
                                "reporting & registry.")
    sub = p.add_subparsers(dest="command", required=True)

    s = sub.add_parser("seed", help="Load data/portfolio.yaml into the database.")
    s.add_argument("--no-reset", action="store_true",
                   help="Merge instead of rebuilding the registry skeleton.")
    s.set_defaults(func=cmd_seed)

    il = sub.add_parser("import-leases", help="Import leases from a CSV.")
    il.add_argument("file")
    il.set_defaults(func=cmd_import_leases)

    fi = sub.add_parser("import-financials", help="Import financial records from a CSV.")
    fi.add_argument("file")
    fi.set_defaults(func=cmd_import_financials)

    r = sub.add_parser("report", help="Print a report as JSON.")
    r.add_argument("name", choices=["overview", "rent-roll", "entities", "income", "health"])
    r.add_argument("--period", help="YYYY-MM filter for the income statement.")
    r.set_defaults(func=cmd_report)

    sq = sub.add_parser("sync-quickbooks",
                        help="Load a QuickBooks P&L report (JSON) as financial records.")
    sq.add_argument("file", help="Path to a QBO P&L report JSON (Intuit or normalized form).")
    sq.add_argument("--entity", required=True, help="Entity id to attribute the report to.")
    sq.add_argument("--period", help="YYYY-MM (inferred from the report if omitted).")
    sq.add_argument("--property", help="Optional property id to attribute records to.")
    sq.add_argument("--no-replace", action="store_true",
                    help="Append instead of replacing existing QBO records for the period.")
    sq.add_argument("--dry-run", action="store_true", help="Print parsed lines; don't write.")
    sq.set_defaults(func=cmd_sync_quickbooks)

    sv = sub.add_parser("serve", help="Run the web dashboard + API.")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8000)
    sv.add_argument("--reload", action="store_true")
    sv.set_defaults(func=cmd_serve)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv if argv is not None else sys.argv[1:])
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
