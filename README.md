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
   plus lease terms (term length, security deposit) and **minimum tenant requirements**
   (credit score, income-to-rent ratio).
2. **Tenant completes a screening profile** (income, credit score). Bids from tenants who
   don't meet a listing's minimums are rejected automatically.
3. **Tenant acts**:
   - *Lease Now* — commitment deposit is held, the auction ends, a lease is generated.
   - *Committed bid* — must beat the current high bid; a commitment deposit is held and the
     bid is **binding** until the auction resolves.
4. **Award** — the landlord picks the model when listing:
   - `auto` — at the deadline, the highest committed bid wins automatically.
   - `manual` — the landlord reviews screened, committed bids and accepts one (before or
     after the deadline; at the deadline the listing moves to *under review*).
5. **Lease & deposits** — the winner's commitment hold is applied toward the security
   deposit; both parties e-sign and the lease goes active. Losing bidders get their holds
   released in full automatically.

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
| Deposit holds tracked in a ledger table | Real escrow / payment rails (Stripe, escrow.com) |
| Self-reported income & credit score | Verified screening (credit bureau, bank linking, background checks) |
| Click-to-sign leases | Real e-signature (DocuSign etc.) + jurisdiction-specific lease templates |
| Single-node SQLite | Postgres, background jobs for deadline finalization, notifications |
| Anonymous high-bid display | Landlord-configurable bid visibility (sealed vs. open auctions) |

Other roadmap ideas: counter-offers, landlord pre-approval of bidders before they may bid,
photos and floor plans, broker accounts, scheduled tours, and rent-concession bidding
(bid on free-rent months instead of rate).
