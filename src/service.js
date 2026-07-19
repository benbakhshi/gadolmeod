import {
  uid, now, bad, forbidden, notFound, conflict, asPositiveInt,
} from './util.js';

/**
 * Domain service for LeaseBid.
 *
 * Core concepts:
 *  - A landlord publishes a LISTING for a property with any combination of:
 *      * "Lease Now" — take it instantly at the asking rent (like Buy It Now)
 *      * committed bids — offer a different rent, backed by a real deposit hold
 *  - A bid only counts once the tenant passes the listing's minimum requirements
 *    (credit score, income-to-rent ratio) AND a commitment deposit is held in
 *    escrow. Committed bids are binding until the auction resolves — that is the
 *    signal to the landlord that bidders will actually pay.
 *  - The landlord chooses the approval mode:
 *      * 'auto'   — at the bid deadline the highest committed bid wins automatically
 *      * 'manual' — the landlord reviews committed (pre-screened) bids and picks one;
 *                   at the deadline the listing moves to 'under_review' until they decide
 *  - Winning converts the commitment hold toward the lease's security deposit and
 *    generates a lease for both parties to sign. Losing bids get their holds released.
 */
export class LeaseBidService {
  constructor(db) {
    this.db = db;
  }

  // ---------- helpers ----------

  getUser(id) {
    return this.db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);
  }

  getListing(id) {
    const listing = this.db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
    if (!listing) throw notFound('Listing not found');
    return this.#finalizeIfDue(listing);
  }

  getProperty(id) {
    const property = this.db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    if (!property) throw notFound('Property not found');
    return property;
  }

  highestCommittedBid(listingId) {
    return this.db.prepare(
      `SELECT * FROM bids WHERE listing_id = ? AND status = 'committed'
       ORDER BY monthly_rent_cents DESC, created_at ASC LIMIT 1`
    ).get(listingId);
  }

  committedBidCount(listingId) {
    return this.db.prepare(
      `SELECT COUNT(*) AS n FROM bids WHERE listing_id = ? AND status = 'committed'`
    ).get(listingId).n;
  }

  #holdDeposit(userId, listingId, amountCents) {
    // Simulated escrow: in production this is a payment-provider authorization/hold.
    const id = uid();
    const ts = now();
    this.db.prepare(
      `INSERT INTO deposit_holds (id, user_id, listing_id, amount_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'held', ?, ?)`
    ).run(id, userId, listingId, amountCents, ts, ts);
    return id;
  }

  #setHoldStatus(holdId, status) {
    this.db.prepare('UPDATE deposit_holds SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now(), holdId);
  }

  #releaseBid(bid, newStatus) {
    this.db.prepare('UPDATE bids SET status = ? WHERE id = ?').run(newStatus, bid.id);
    this.#setHoldStatus(bid.deposit_hold_id, 'released');
  }

  #releaseOtherCommittedBids(listingId, exceptBidId, newStatus) {
    const others = this.db.prepare(
      `SELECT * FROM bids WHERE listing_id = ? AND status = 'committed' AND id != ?`
    ).all(listingId, exceptBidId ?? '');
    for (const bid of others) this.#releaseBid(bid, newStatus);
  }

  /** Lazily resolve listings whose bid deadline has passed. */
  #finalizeIfDue(listing) {
    if (listing.status !== 'active' || !listing.bid_deadline) return listing;
    if (new Date(listing.bid_deadline).getTime() > Date.now()) return listing;

    const high = this.highestCommittedBid(listing.id);
    if (!high) {
      this.db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('expired', listing.id);
      return this.db.prepare('SELECT * FROM listings WHERE id = ?').get(listing.id);
    }
    if (listing.approval_mode === 'auto') {
      this.#award(listing, high);
    } else {
      this.db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('under_review', listing.id);
    }
    return this.db.prepare('SELECT * FROM listings WHERE id = ?').get(listing.id);
  }

  /** Award the listing to a bid: reject the rest, create the lease. */
  #award(listing, bid) {
    this.db.prepare('UPDATE bids SET status = ? WHERE id = ?').run('accepted', bid.id);
    this.#releaseOtherCommittedBids(listing.id, bid.id, 'lost');
    this.db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('awarded', listing.id);
    return this.#createLease(listing, bid.tenant_id, bid.monthly_rent_cents, bid.deposit_hold_id);
  }

  #createLease(listing, tenantId, rentCents, depositHoldId) {
    const id = uid();
    const securityDeposit = rentCents * listing.security_deposit_months;
    this.db.prepare(
      `INSERT INTO leases (id, listing_id, property_id, landlord_id, tenant_id, monthly_rent_cents,
                           term_months, security_deposit_cents, deposit_hold_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_signatures', ?)`
    ).run(id, listing.id, listing.property_id, listing.landlord_id, tenantId, rentCents,
      listing.term_months, securityDeposit, depositHoldId, now());
    return this.db.prepare('SELECT * FROM leases WHERE id = ?').get(id);
  }

  // ---------- screening ----------

  getTenantProfile(userId) {
    return this.db.prepare('SELECT * FROM tenant_profiles WHERE user_id = ?').get(userId);
  }

  upsertTenantProfile(userId, { annual_income_cents, credit_score, occupation = '', notes = '' }) {
    const income = asPositiveInt(annual_income_cents, 'annual_income_cents');
    const score = Number(credit_score);
    if (!Number.isInteger(score) || score < 300 || score > 850) {
      throw bad('credit_score must be an integer between 300 and 850');
    }
    this.db.prepare(
      `INSERT INTO tenant_profiles (user_id, annual_income_cents, credit_score, occupation, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         annual_income_cents = excluded.annual_income_cents,
         credit_score = excluded.credit_score,
         occupation = excluded.occupation,
         notes = excluded.notes,
         updated_at = excluded.updated_at`
    ).run(userId, income, score, String(occupation), String(notes), now());
    return this.getTenantProfile(userId);
  }

  /** Check a tenant against a listing's minimum requirements for a given rent. */
  screenTenant(listing, tenantId, rentCents) {
    const profile = this.getTenantProfile(tenantId);
    const reasons = [];
    if (!profile) {
      reasons.push('Tenant profile is required before bidding (income and credit score).');
      return { qualified: false, reasons };
    }
    if (profile.credit_score < listing.min_credit_score) {
      reasons.push(`Credit score ${profile.credit_score} is below the required minimum of ${listing.min_credit_score}.`);
    }
    const monthlyIncome = profile.annual_income_cents / 12;
    if (listing.min_income_ratio > 0 && monthlyIncome < listing.min_income_ratio * rentCents) {
      reasons.push(`Monthly income must be at least ${listing.min_income_ratio}x the rent.`);
    }
    return { qualified: reasons.length === 0, reasons };
  }

  // ---------- properties & listings ----------

  createProperty(landlord, { title, description = '', address, type, sqft }) {
    if (landlord.role !== 'landlord') throw forbidden('Only landlords can create properties');
    const id = uid();
    this.db.prepare(
      `INSERT INTO properties (id, landlord_id, title, description, address, type, sqft, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, landlord.id, String(title), String(description), String(address), String(type),
      asPositiveInt(sqft, 'sqft'), now());
    return this.getProperty(id);
  }

  listMyProperties(landlordId) {
    return this.db.prepare('SELECT * FROM properties WHERE landlord_id = ? ORDER BY created_at DESC')
      .all(landlordId);
  }

  createListing(landlord, body) {
    if (landlord.role !== 'landlord') throw forbidden('Only landlords can create listings');
    const property = this.getProperty(body.property_id);
    if (property.landlord_id !== landlord.id) throw forbidden('You do not own this property');

    const allowLeaseNow = body.allow_lease_now ? 1 : 0;
    const allowBids = body.allow_bids ? 1 : 0;
    if (!allowLeaseNow && !allowBids) throw bad('Enable Lease Now, bidding, or both');

    const approvalMode = body.approval_mode ?? 'manual';
    if (!['auto', 'manual'].includes(approvalMode)) throw bad("approval_mode must be 'auto' or 'manual'");

    let leaseNowRent = null;
    let minBidRent = null;
    let deadline = null;
    if (allowLeaseNow) leaseNowRent = asPositiveInt(body.lease_now_rent_cents, 'lease_now_rent_cents');
    if (allowBids) {
      minBidRent = asPositiveInt(body.min_bid_rent_cents, 'min_bid_rent_cents');
      const parsed = new Date(body.bid_deadline ?? '');
      if (Number.isNaN(parsed.getTime())) throw bad('bid_deadline must be a valid timestamp');
      if (parsed.getTime() <= Date.now()) throw bad('bid_deadline must be in the future');
      deadline = parsed.toISOString();
      if (allowLeaseNow && minBidRent >= leaseNowRent) {
        throw bad('min_bid_rent_cents should be below the Lease Now rent');
      }
    }

    const minCredit = body.min_credit_score === undefined ? 0 : Number(body.min_credit_score);
    if (!Number.isInteger(minCredit) || minCredit < 0 || minCredit > 850) {
      throw bad('min_credit_score must be an integer between 0 and 850');
    }
    const minIncomeRatio = body.min_income_ratio === undefined ? 0 : Number(body.min_income_ratio);
    if (!(minIncomeRatio >= 0 && minIncomeRatio <= 20)) throw bad('min_income_ratio must be between 0 and 20');

    const id = uid();
    this.db.prepare(
      `INSERT INTO listings (id, property_id, landlord_id, status, lease_now_rent_cents, min_bid_rent_cents,
                             commitment_deposit_cents, security_deposit_months, term_months, bid_deadline,
                             approval_mode, allow_lease_now, allow_bids, min_credit_score, min_income_ratio, created_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, property.id, landlord.id, leaseNowRent, minBidRent,
      asPositiveInt(body.commitment_deposit_cents, 'commitment_deposit_cents'),
      asPositiveInt(body.security_deposit_months, 'security_deposit_months'),
      asPositiveInt(body.term_months, 'term_months'),
      deadline, approvalMode, allowLeaseNow, allowBids, minCredit, minIncomeRatio, now(),
    );
    return this.getListing(id);
  }

  /** Public browse view. */
  listActiveListings() {
    const listings = this.db.prepare(
      `SELECT * FROM listings WHERE status IN ('active', 'under_review') ORDER BY created_at DESC`
    ).all().map((l) => this.#finalizeIfDue(l))
      .filter((l) => ['active', 'under_review'].includes(l.status));
    return listings.map((l) => this.publicListingView(l));
  }

  publicListingView(listing) {
    const property = this.getProperty(listing.property_id);
    const landlord = this.getUser(listing.landlord_id);
    const high = this.highestCommittedBid(listing.id);
    return {
      ...listing,
      property,
      landlord_name: landlord.name,
      committed_bid_count: this.committedBidCount(listing.id),
      // Amount is public to drive the auction; bidder identity is not.
      high_bid_cents: high ? high.monthly_rent_cents : null,
    };
  }

  /** Landlord-only detail: committed bids with screening summaries. */
  listingBidsForLandlord(listing, landlordId) {
    if (listing.landlord_id !== landlordId) throw forbidden('Only the listing owner can view bids');
    const bids = this.db.prepare(
      `SELECT * FROM bids WHERE listing_id = ? ORDER BY monthly_rent_cents DESC, created_at ASC`
    ).all(listing.id);
    return bids.map((bid) => {
      const tenant = this.getUser(bid.tenant_id);
      const profile = this.getTenantProfile(bid.tenant_id);
      return {
        ...bid,
        tenant_name: tenant.name,
        tenant_email: tenant.email,
        tenant_profile: profile && {
          annual_income_cents: profile.annual_income_cents,
          credit_score: profile.credit_score,
          occupation: profile.occupation,
        },
      };
    });
  }

  cancelListing(listing, landlordId) {
    if (listing.landlord_id !== landlordId) throw forbidden('Only the listing owner can cancel it');
    if (!['active', 'under_review'].includes(listing.status)) {
      throw conflict(`Cannot cancel a listing in status '${listing.status}'`);
    }
    this.#releaseOtherCommittedBids(listing.id, null, 'cancelled');
    this.db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('cancelled', listing.id);
    return this.getListingRaw(listing.id);
  }

  getListingRaw(id) {
    return this.db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  }

  // ---------- tenant actions ----------

  /** Instantly lease at the asking rent. Requires screening + commitment deposit. */
  leaseNow(listing, tenant) {
    if (tenant.role !== 'tenant') throw forbidden('Only tenants can lease');
    if (listing.status !== 'active') throw conflict(`Listing is not open (status: '${listing.status}')`);
    if (!listing.allow_lease_now) throw conflict('This listing does not offer Lease Now');
    if (listing.landlord_id === tenant.id) throw forbidden('You cannot lease your own listing');

    const rent = listing.lease_now_rent_cents;
    const screening = this.screenTenant(listing, tenant.id, rent);
    if (!screening.qualified) {
      throw conflict(`You do not meet this listing's requirements: ${screening.reasons.join(' ')}`);
    }

    const holdId = this.#holdDeposit(tenant.id, listing.id, listing.commitment_deposit_cents);
    this.#releaseOtherCommittedBids(listing.id, null, 'lost');
    this.db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('awarded', listing.id);
    return this.#createLease(listing, tenant.id, rent, holdId);
  }

  /**
   * Place a committed bid: screened against requirements, must beat the current
   * high bid, and backed by a deposit hold. Binding until the auction resolves.
   */
  placeBid(listing, tenant, rentCents) {
    if (tenant.role !== 'tenant') throw forbidden('Only tenants can bid');
    if (listing.status !== 'active') throw conflict(`Bidding is closed (status: '${listing.status}')`);
    if (!listing.allow_bids) throw conflict('This listing does not accept bids');
    if (listing.landlord_id === tenant.id) throw forbidden('You cannot bid on your own listing');

    const rent = asPositiveInt(rentCents, 'monthly_rent_cents');
    if (rent < listing.min_bid_rent_cents) {
      throw bad(`Bid must be at least the minimum rent of ${listing.min_bid_rent_cents} cents`);
    }
    if (listing.allow_lease_now && rent >= listing.lease_now_rent_cents) {
      throw bad('Bid meets or exceeds the Lease Now rent — use Lease Now instead');
    }
    const high = this.highestCommittedBid(listing.id);
    if (high && high.tenant_id !== tenant.id && rent <= high.monthly_rent_cents) {
      throw conflict(`Bid must beat the current high bid of ${high.monthly_rent_cents} cents`);
    }
    const own = this.db.prepare(
      `SELECT * FROM bids WHERE listing_id = ? AND tenant_id = ? AND status = 'committed'`
    ).get(listing.id, tenant.id);
    if (own && rent <= own.monthly_rent_cents) {
      throw conflict('New bid must be higher than your existing committed bid');
    }

    const screening = this.screenTenant(listing, tenant.id, rent);
    if (!screening.qualified) {
      throw conflict(`You do not meet this listing's requirements: ${screening.reasons.join(' ')}`);
    }

    // Replace the tenant's previous committed bid (release its hold, take a new one).
    if (own) this.#releaseBid(own, 'superseded');

    const holdId = this.#holdDeposit(tenant.id, listing.id, listing.commitment_deposit_cents);
    const id = uid();
    this.db.prepare(
      `INSERT INTO bids (id, listing_id, tenant_id, monthly_rent_cents, status, deposit_hold_id, created_at)
       VALUES (?, ?, ?, ?, 'committed', ?, ?)`
    ).run(id, listing.id, tenant.id, rent, holdId, now());
    return this.db.prepare('SELECT * FROM bids WHERE id = ?').get(id);
  }

  listMyBids(tenantId) {
    return this.db.prepare('SELECT * FROM bids WHERE tenant_id = ? ORDER BY created_at DESC')
      .all(tenantId)
      .map((bid) => ({ ...bid, listing: this.publicListingView(this.getListingRaw(bid.listing_id)) }));
  }

  // ---------- landlord decisions ----------

  /** Manual acceptance of a committed bid (allowed before or after the deadline). */
  acceptBid(bidId, landlordId) {
    const bid = this.db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId);
    if (!bid) throw notFound('Bid not found');
    const listing = this.getListing(bid.listing_id);
    if (listing.landlord_id !== landlordId) throw forbidden('Only the listing owner can accept bids');
    if (!['active', 'under_review'].includes(listing.status)) {
      throw conflict(`Listing is no longer open (status: '${listing.status}')`);
    }
    if (bid.status !== 'committed') throw conflict(`Bid is not committed (status: '${bid.status}')`);
    return this.#award(listing, bid);
  }

  rejectBid(bidId, landlordId) {
    const bid = this.db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId);
    if (!bid) throw notFound('Bid not found');
    const listing = this.getListing(bid.listing_id);
    if (listing.landlord_id !== landlordId) throw forbidden('Only the listing owner can reject bids');
    if (bid.status !== 'committed') throw conflict(`Bid is not committed (status: '${bid.status}')`);
    this.#releaseBid(bid, 'rejected');
    // If the auction was under review and the landlord rejects the last bid, it expires.
    if (listing.status === 'under_review' && this.committedBidCount(listing.id) === 0) {
      this.db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('expired', listing.id);
    }
    return this.db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId);
  }

  // ---------- leases ----------

  getLease(id) {
    const lease = this.db.prepare('SELECT * FROM leases WHERE id = ?').get(id);
    if (!lease) throw notFound('Lease not found');
    return lease;
  }

  listMyLeases(userId) {
    return this.db.prepare(
      'SELECT * FROM leases WHERE tenant_id = ? OR landlord_id = ? ORDER BY created_at DESC'
    ).all(userId, userId)
      .map((lease) => ({ ...lease, property: this.getProperty(lease.property_id) }));
  }

  /** E-sign simulation. When both parties have signed, the lease activates. */
  signLease(leaseId, user) {
    const lease = this.getLease(leaseId);
    if (lease.status !== 'pending_signatures') {
      throw conflict(`Lease is not awaiting signatures (status: '${lease.status}')`);
    }
    if (user.id === lease.tenant_id) {
      if (lease.tenant_signed_at) throw conflict('You already signed this lease');
      this.db.prepare('UPDATE leases SET tenant_signed_at = ? WHERE id = ?').run(now(), leaseId);
    } else if (user.id === lease.landlord_id) {
      if (lease.landlord_signed_at) throw conflict('You already signed this lease');
      this.db.prepare('UPDATE leases SET landlord_signed_at = ? WHERE id = ?').run(now(), leaseId);
    } else {
      throw forbidden('You are not a party to this lease');
    }

    const updated = this.getLease(leaseId);
    if (updated.tenant_signed_at && updated.landlord_signed_at) {
      this.db.prepare('UPDATE leases SET status = ? WHERE id = ?').run('active', leaseId);
      // Commitment hold is applied toward the security deposit.
      this.#setHoldStatus(updated.deposit_hold_id, 'applied');
      this.db.prepare('UPDATE listings SET status = ? WHERE id = ?').run('leased', updated.listing_id);
    }
    return this.getLease(leaseId);
  }
}
