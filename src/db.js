import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('landlord', 'tenant')),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Tenant financial profile used for automated screening against listing requirements.
-- MVP: self-reported. Roadmap: verified via credit bureau / bank-linking integrations.
CREATE TABLE IF NOT EXISTS tenant_profiles (
  user_id             TEXT PRIMARY KEY REFERENCES users(id),
  annual_income_cents INTEGER NOT NULL,
  credit_score        INTEGER NOT NULL,
  occupation          TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS properties (
  id          TEXT PRIMARY KEY,
  landlord_id TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('industrial', 'office', 'retail', 'residential', 'land', 'other')),
  sqft        INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id                       TEXT PRIMARY KEY,
  property_id              TEXT NOT NULL REFERENCES properties(id),
  landlord_id              TEXT NOT NULL REFERENCES users(id),
  status                   TEXT NOT NULL CHECK (status IN
                             ('active', 'under_review', 'awarded', 'leased', 'expired', 'cancelled')),
  lease_now_rent_cents     INTEGER,            -- NULL when allow_lease_now = 0
  min_bid_rent_cents       INTEGER,            -- NULL when allow_bids = 0
  commitment_deposit_cents INTEGER NOT NULL,   -- held when a tenant bids or leases now
  security_deposit_months  INTEGER NOT NULL,
  term_months              INTEGER NOT NULL,
  bid_deadline             TEXT,               -- ISO timestamp; NULL when allow_bids = 0
  approval_mode            TEXT NOT NULL CHECK (approval_mode IN ('auto', 'manual')),
  allow_lease_now          INTEGER NOT NULL,
  allow_bids               INTEGER NOT NULL,
  min_credit_score         INTEGER NOT NULL DEFAULT 0,
  min_income_ratio         REAL NOT NULL DEFAULT 0, -- monthly income must be >= ratio * offered rent
  created_at               TEXT NOT NULL
);

-- Simulated escrow. Roadmap: real payment rails (Stripe/escrow provider).
CREATE TABLE IF NOT EXISTS deposit_holds (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  listing_id   TEXT NOT NULL REFERENCES listings(id),
  amount_cents INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('held', 'released', 'applied')),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bids (
  id                 TEXT PRIMARY KEY,
  listing_id         TEXT NOT NULL REFERENCES listings(id),
  tenant_id          TEXT NOT NULL REFERENCES users(id),
  monthly_rent_cents INTEGER NOT NULL,
  status             TEXT NOT NULL CHECK (status IN
                       ('committed', 'superseded', 'accepted', 'rejected', 'lost', 'cancelled')),
  deposit_hold_id    TEXT NOT NULL REFERENCES deposit_holds(id),
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leases (
  id                      TEXT PRIMARY KEY,
  listing_id              TEXT NOT NULL REFERENCES listings(id),
  property_id             TEXT NOT NULL REFERENCES properties(id),
  landlord_id             TEXT NOT NULL REFERENCES users(id),
  tenant_id               TEXT NOT NULL REFERENCES users(id),
  monthly_rent_cents      INTEGER NOT NULL,
  term_months             INTEGER NOT NULL,
  security_deposit_cents  INTEGER NOT NULL,
  deposit_hold_id         TEXT NOT NULL REFERENCES deposit_holds(id),
  status                  TEXT NOT NULL CHECK (status IN ('pending_signatures', 'active', 'cancelled')),
  tenant_signed_at        TEXT,
  landlord_signed_at      TEXT,
  created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_bids_listing ON bids(listing_id);
CREATE INDEX IF NOT EXISTS idx_holds_listing ON deposit_holds(listing_id);
`;

export function openDb(path = process.env.LEASEBID_DB || 'leasebid.sqlite') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
