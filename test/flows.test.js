import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';

let server;
let base;

before(async () => {
  ({ server } = createApp({ dbPath: ':memory:' }));
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function register(role, name) {
  const { status, data } = await call('POST', '/api/auth/register', {
    body: { email: `${name}@example.com`, password: 'password123', name, role },
  });
  assert.equal(status, 200);
  return data.token;
}

async function makeProperty(token, title = 'Warehouse A') {
  const { data } = await call('POST', '/api/properties', {
    token,
    body: { title, address: '100 Industrial Way', type: 'industrial', sqft: 20000 },
  });
  return data.property;
}

function listingBody(propertyId, overrides = {}) {
  return {
    property_id: propertyId,
    allow_lease_now: true,
    allow_bids: true,
    lease_now_rent_cents: 900000,     // $9,000/mo
    min_bid_rent_cents: 700000,       // $7,000/mo
    bid_deadline: new Date(Date.now() + 60_000).toISOString(),
    approval_mode: 'manual',
    commitment_deposit_cents: 250000, // $2,500
    security_deposit_months: 2,
    term_months: 36,
    min_credit_score: 650,
    min_income_ratio: 3,
    ...overrides,
  };
}

test('full auction lifecycle: screen, commit, accept, sign', async () => {
  const landlord = await register('landlord', 'gadol');
  const alice = await register('tenant', 'alice');
  const bob = await register('tenant', 'bob');
  const carol = await register('tenant', 'carol');

  const property = await makeProperty(landlord);
  const { status: ls, data: ld } = await call('POST', '/api/listings', {
    token: landlord, body: listingBody(property.id),
  });
  assert.equal(ls, 200);
  const listing = ld.listing;
  assert.equal(listing.status, 'active');

  // Bidding without a screening profile is refused.
  let res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: alice, body: { monthly_rent_cents: 750000 },
  });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /profile/i);

  // Alice qualifies (high income, good credit); Bob has weak credit; Carol qualifies.
  await call('PUT', '/api/me/tenant-profile', {
    token: alice, body: { annual_income_cents: 40000000, credit_score: 720, occupation: 'Logistics co' },
  });
  await call('PUT', '/api/me/tenant-profile', {
    token: bob, body: { annual_income_cents: 50000000, credit_score: 600 },
  });
  await call('PUT', '/api/me/tenant-profile', {
    token: carol, body: { annual_income_cents: 36000000, credit_score: 800 },
  });

  // Bob fails the credit-score minimum.
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: bob, body: { monthly_rent_cents: 800000 },
  });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /credit score/i);

  // Below minimum bid is refused.
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: alice, body: { monthly_rent_cents: 600000 },
  });
  assert.equal(res.status, 400);

  // Alice commits at $7,500.
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: alice, body: { monthly_rent_cents: 750000 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.bid.status, 'committed');

  // Carol must beat the high bid.
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: carol, body: { monthly_rent_cents: 750000 },
  });
  assert.equal(res.status, 409);

  // Carol commits at $8,000; Alice raises to $8,200 (old bid superseded, hold released).
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: carol, body: { monthly_rent_cents: 800000 },
  });
  assert.equal(res.status, 200);
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: alice, body: { monthly_rent_cents: 820000 },
  });
  assert.equal(res.status, 200);
  const aliceBid = res.data.bid;

  const myBids = await call('GET', '/api/me/bids', { token: alice });
  const statuses = myBids.data.bids.map((b) => b.status).sort();
  assert.deepEqual(statuses, ['committed', 'superseded']);

  // Public view exposes high-bid amount but not bidders; landlord sees screening details.
  const pub = await call('GET', `/api/listings/${listing.id}`, { token: carol });
  assert.equal(pub.data.listing.high_bid_cents, 820000);
  assert.equal(pub.data.listing.committed_bid_count, 2);
  assert.equal(pub.data.bids, undefined);

  const own = await call('GET', `/api/listings/${listing.id}`, { token: landlord });
  assert.equal(own.data.bids.filter((b) => b.status === 'committed').length, 2);
  assert.equal(own.data.bids[0].tenant_profile.credit_score, 720);

  // Landlord manually accepts Alice's committed bid.
  res = await call('POST', `/api/bids/${aliceBid.id}/accept`, { token: landlord });
  assert.equal(res.status, 200);
  const lease = res.data.lease;
  assert.equal(lease.status, 'pending_signatures');
  assert.equal(lease.monthly_rent_cents, 820000);
  assert.equal(lease.security_deposit_cents, 1640000); // 2 months

  // Carol's losing bid is released.
  const carolBids = await call('GET', '/api/me/bids', { token: carol });
  assert.equal(carolBids.data.bids[0].status, 'lost');

  // Both parties sign → lease active, listing leased.
  res = await call('POST', `/api/leases/${lease.id}/sign`, { token: alice });
  assert.equal(res.data.lease.status, 'pending_signatures');
  res = await call('POST', `/api/leases/${lease.id}/sign`, { token: landlord });
  assert.equal(res.data.lease.status, 'active');

  const finalListing = await call('GET', `/api/listings/${listing.id}`);
  assert.equal(finalListing.data.listing.status, 'leased');

  // Late bids are refused.
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: carol, body: { monthly_rent_cents: 850000 },
  });
  assert.equal(res.status, 409);
});

test('lease now awards instantly and releases committed bids', async () => {
  const landlord = await register('landlord', 'landlord2');
  const dana = await register('tenant', 'dana');
  const evan = await register('tenant', 'evan');
  await call('PUT', '/api/me/tenant-profile', {
    token: dana, body: { annual_income_cents: 60000000, credit_score: 780 },
  });
  await call('PUT', '/api/me/tenant-profile', {
    token: evan, body: { annual_income_cents: 60000000, credit_score: 700 },
  });

  const property = await makeProperty(landlord, 'Flex Space B');
  const { data: ld } = await call('POST', '/api/listings', {
    token: landlord, body: listingBody(property.id),
  });

  // Evan places a committed bid first.
  await call('POST', `/api/listings/${ld.listing.id}/bids`, {
    token: evan, body: { monthly_rent_cents: 760000 },
  });

  // Dana leases now at asking rent — instant award.
  const res = await call('POST', `/api/listings/${ld.listing.id}/lease-now`, { token: dana });
  assert.equal(res.status, 200);
  assert.equal(res.data.lease.monthly_rent_cents, 900000);

  const listing = await call('GET', `/api/listings/${ld.listing.id}`);
  assert.equal(listing.data.listing.status, 'awarded');

  // Evan's committed bid was released.
  const evanBids = await call('GET', '/api/me/bids', { token: evan });
  assert.equal(evanBids.data.bids[0].status, 'lost');
});

test('auto mode: highest committed bid wins at the deadline', async () => {
  const landlord = await register('landlord', 'landlord3');
  const fay = await register('tenant', 'fay');
  const gil = await register('tenant', 'gil');
  await call('PUT', '/api/me/tenant-profile', {
    token: fay, body: { annual_income_cents: 60000000, credit_score: 700 },
  });
  await call('PUT', '/api/me/tenant-profile', {
    token: gil, body: { annual_income_cents: 60000000, credit_score: 700 },
  });

  const property = await makeProperty(landlord, 'Yard C');
  const { data: ld } = await call('POST', '/api/listings', {
    token: landlord,
    body: listingBody(property.id, {
      approval_mode: 'auto',
      bid_deadline: new Date(Date.now() + 300).toISOString(),
    }),
  });

  await call('POST', `/api/listings/${ld.listing.id}/bids`, {
    token: fay, body: { monthly_rent_cents: 710000 },
  });
  const gilBid = await call('POST', `/api/listings/${ld.listing.id}/bids`, {
    token: gil, body: { monthly_rent_cents: 740000 },
  });
  assert.equal(gilBid.status, 200);

  await new Promise((r) => setTimeout(r, 400));

  // Reading the listing lazily finalizes the auction: highest bid wins.
  const after = await call('GET', `/api/listings/${ld.listing.id}`);
  assert.equal(after.data.listing.status, 'awarded');

  const gilLeases = await call('GET', '/api/me/leases', { token: gil });
  assert.equal(gilLeases.data.leases.length, 1);
  assert.equal(gilLeases.data.leases[0].monthly_rent_cents, 740000);

  const fayBids = await call('GET', '/api/me/bids', { token: fay });
  assert.equal(fayBids.data.bids[0].status, 'lost');
});

test('manual mode: listing moves to under_review at deadline; cancel releases deposits', async () => {
  const landlord = await register('landlord', 'landlord4');
  const hana = await register('tenant', 'hana');
  await call('PUT', '/api/me/tenant-profile', {
    token: hana, body: { annual_income_cents: 60000000, credit_score: 700 },
  });

  const property = await makeProperty(landlord, 'Depot D');
  const { data: ld } = await call('POST', '/api/listings', {
    token: landlord,
    body: listingBody(property.id, { bid_deadline: new Date(Date.now() + 300).toISOString() }),
  });
  await call('POST', `/api/listings/${ld.listing.id}/bids`, {
    token: hana, body: { monthly_rent_cents: 720000 },
  });

  await new Promise((r) => setTimeout(r, 400));

  const after = await call('GET', `/api/listings/${ld.listing.id}`);
  assert.equal(after.data.listing.status, 'under_review');

  // Landlord can still cancel; the committed deposit is released.
  const cancel = await call('POST', `/api/listings/${ld.listing.id}/cancel`, { token: landlord });
  assert.equal(cancel.status, 200);
  const hanaBids = await call('GET', '/api/me/bids', { token: hana });
  assert.equal(hanaBids.data.bids[0].status, 'cancelled');
});

test('validation and authorization guards', async () => {
  const landlord = await register('landlord', 'landlord5');
  const tenant = await register('tenant', 'ivan');
  const property = await makeProperty(landlord, 'Lot E');

  // Tenants cannot create listings.
  let res = await call('POST', '/api/listings', { token: tenant, body: listingBody(property.id) });
  assert.equal(res.status, 403);

  // A listing must enable at least one channel.
  res = await call('POST', '/api/listings', {
    token: landlord,
    body: listingBody(property.id, { allow_lease_now: false, allow_bids: false }),
  });
  assert.equal(res.status, 400);

  // Deadline must be in the future.
  res = await call('POST', '/api/listings', {
    token: landlord,
    body: listingBody(property.id, { bid_deadline: new Date(Date.now() - 1000).toISOString() }),
  });
  assert.equal(res.status, 400);

  // Landlords cannot bid on their own listing.
  const { data: ld } = await call('POST', '/api/listings', { token: landlord, body: listingBody(property.id) });
  res = await call('POST', `/api/listings/${ld.listing.id}/bids`, {
    token: landlord, body: { monthly_rent_cents: 750000 },
  });
  assert.equal(res.status, 403);

  // Unauthenticated bid is refused.
  res = await call('POST', `/api/listings/${ld.listing.id}/bids`, { body: { monthly_rent_cents: 750000 } });
  assert.equal(res.status, 401);

  // Duplicate registration is refused.
  res = await call('POST', '/api/auth/register', {
    body: { email: 'ivan@example.com', password: 'password123', name: 'ivan', role: 'tenant' },
  });
  assert.equal(res.status, 409);
});
