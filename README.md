# LeaseBid

**Lease it now — or bid to lease it.** An online marketplace where landlords list properties
for lease and prospective tenants either take them instantly at the asking rent ("Lease Now")
or place **committed, deposit-backed bids** — auction-style.

Built by Gadol Meod Inc.

## The idea

Leasing today is a slow negotiation over email and brokers, and landlords can't tell serious
prospects from tire-kickers. LeaseBid fixes both sides:

- **For tenants** — see the real price to lease *right now*, or offer a different rent and
  compete transparently. No guessing what the landlord will take.
- **For landlords** — every bid you see is **committed**: the bidder has passed your minimum
  requirements and has a real deposit held in escrow. When you accept, they sign and pay —
  or forfeit the hold. No ghosting, no wasted showings.

### How it works

1. **Landlord publishes a listing** for a property with any combination of:
   - a **Lease Now** rent (instant lease, like "Buy It Now"),
   - an **auction**: minimum bid, bid deadline, and a commitment deposit amount;
   plus lease terms (term length, security deposit), **minimum tenant requirements**
   (credit score, income-to-rent ratio), **bid visibility** (open — bidders see the
   current high bid — or **sealed** — offers hidden, only the landlord sees them), and a
   **signing deadline** for the eventual winner.
2. **Tenant completes a screening profile** (income, credit score). Bids from tenants who
   don't meet a listing's minimums are rejected automatically.
3. **Tenant acts**:
   - *Lease Now* — commitment deposit is held, the auction ends, a lease is generated.
   - *Committed bid* — in open auctions it must beat the current high bid (the previous
     high bidder gets an **outbid notification**); in sealed auctions any qualifying offer
     stands. Either way a commitment deposit is held and the bid is **binding** until the
     auction resolves.
4. **Award** — the landlord picks the model when listing:
   - `auto` — at the deadline, the highest committed bid wins automatically.
   - `manual` — the landlord reviews screened, committed bids and accepts one (before or
     after the deadline; at the deadline the listing moves to *under review*). They can
     also **counter-offer** any bid at a higher rent — the tenant accepts (leasing at the
     countered rent, re-screened at that level) or declines and their original bid stands.
5. **Lease & deposits** — the winner's commitment hold is applied toward the security
   deposit; both parties e-sign and the lease goes active. Losing bidders get their holds
   released in full automatically.
6. **Committed means committed** — the winner must sign by the listing's signing deadline.
   If the tenant won but never signed, the landlord can void the award and **keep the
   commitment deposit**; if the landlord failed to sign, the tenant walks away and the
   hold is released in full. Every step (outbid, counter, award, release, forfeiture)
   generates an in-app notification.

## Running it

Requires Node.js ≥ 22.13 (uses the built-in `node:sqlite` — **zero npm dependencies**).

```bash
npm start          # serves UI + API at http://localhost:3000
npm test           # end-to-end tests of the full lifecycle
```

Data persists to `leasebid.sqlite` (override with `LEASEBID_DB=path`, or `:memory:`).

## Architecture

```
src/db.js       SQLite schema: users, tenant_profiles, properties, listings,
                bids, deposit_holds, leases
src/service.js  Domain engine: screening, committed bids, deposit escrow,
                auto/manual award, deadline finalization, lease signing
src/server.js   Zero-dependency HTTP server: JSON API + static frontend
src/util.js     Auth hashing, validation, error types
public/         Single-page app (vanilla JS): browse, listing detail with bid
                panel, landlord dashboard, tenant dashboard
test/           End-to-end API tests (node --test)
```

Money is stored as integer cents. Auctions finalize lazily on read when the deadline passes.

## What's simulated (MVP) vs. the roadmap

| MVP (this repo) | Production roadmap |
| --- | --- |
| Deposit holds tracked in a ledger table (held / released / applied / forfeited) | Real escrow / payment rails (Stripe manual-capture holds, escrow.com) |
| Self-reported income & credit score | Verified screening (credit bureau, bank linking, background checks) |
| Click-to-sign leases with signing deadlines | Real e-signature (DocuSign etc.) + jurisdiction-specific lease templates |
| Single-node SQLite, lazy deadline finalization | Postgres, background jobs, email/SMS delivery of the notification feed |
| In-app notification feed | Push/email notifications, digest settings |

Other roadmap ideas: landlord pre-approval of bidders before they may bid, photos and
floor plans, broker accounts, scheduled tours, one-click relisting after a voided award,
and rent-concession bidding (bid on free-rent months instead of rate).
