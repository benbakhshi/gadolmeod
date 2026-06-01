"""Database engine and session management.

The engine is created at import from ``GMRE_DATABASE_URL`` (default: a SQLite file
in the repo root), and can be rebound at runtime via :func:`configure` — used by
the tests to point at an isolated database.
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

_DEFAULT_DB = Path(__file__).resolve().parent.parent / "gmre.db"

Base = declarative_base()

# Bound by configure() below; reassigned if configure() is called again.
engine = None
SessionLocal = None
DATABASE_URL: str = ""


def configure(database_url: str | None = None):
    """(Re)create the engine and session factory. Returns the engine."""
    global engine, SessionLocal, DATABASE_URL
    DATABASE_URL = database_url or os.environ.get(
        "GMRE_DATABASE_URL", f"sqlite:///{_DEFAULT_DB}"
    )
    connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
    engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return engine


configure()


def init_db() -> None:
    """Create all tables (idempotent)."""
    from . import models  # noqa: F401  (register models on Base)

    Base.metadata.create_all(bind=engine)


def get_session():
    """FastAPI dependency: yield a session and always close it."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
