"""Database engine and session management."""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Default to a SQLite file in the repo root; override with GMRE_DATABASE_URL.
_DEFAULT_DB = Path(__file__).resolve().parent.parent / "gmre.db"
DATABASE_URL = os.environ.get("GMRE_DATABASE_URL", f"sqlite:///{_DEFAULT_DB}")

# check_same_thread is only needed for SQLite + the FastAPI threadpool.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base = declarative_base()


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
