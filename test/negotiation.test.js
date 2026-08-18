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
  return { status: res.status, data: await res.json() };
}

async function register(role, name) {
  const { data } = await call('POST', '/api/auth/register', {
    body: { email: `${name}@example.com`, password: 'password123', name, role },
  });
  return data.token;
}

async function tenantWithProfile(name, income = 60000000, credit = 720) {
  const token = await register('tenant', name);
  await call('PUT', '/api/me/tenant-profile', {
    token, body: { annual_income_cents: income, credit_score: credit },
  });
  return token;
}

async function makeListing(landlord, overrides = {}) {
  const { data: pd } = await call('POST', '/api/properties', {
    token: landlord,
    body: { title: overrides._title || 'Unit', address: '1 Main St', type: 'industrial', sqft: 10000 },
  });
  const { status, data } = await call('POST', '/api/listings', {
    token: landlord,
    body: {
      property_id: pd.property.id,
      allow_lease_now: true,
      allow_bids: true,
      lease_now_rent_cents: 900000,
      min_bid_rent_cents: 700000,
      bid_deadline: new Date(Date.now() + 60_000).toISOString(),
      approval_mode: 'manual',
      commitment_deposit_cents: 250000,
      security_deposit_months: 2,
      term_months: 36,
      min_credit_score: 650,
      min_income_ratio: 3,
      ...overrides,
    },
  });
  assert.equal(status, 200);
  return data.listing;
}

test('sealed auction: amounts hidden, any qualifying bid stands, highest wins in auto mode', async () => {
  const landlord = await register('landlord', 'sealed-ll');
  const t1 = await tenantWithProfile('sealed-t1');
  const t2 = await tenantWithProfile('sealed-t2');

  const listing = await makeListing(landlord, {
    bid_visibility: 'sealed',
    approval_mode: 'auto',
    bid_deadline: new Date(Date.now() + 500).toISOString(),
  });

  let res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t1, body: { monthly_rent_cents: 780000 },
  });
  assert.equal(res.status, 200);

  // In a sealed auction a lower bid from another tenant is still accepted.
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t2, body: { monthly_rent_cents: 720000 },
  });
  assert.equal(res.status, 200);

  // And a tenant may revise their own offer downward.
  res = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t2, body: { monthly_rent_cents: 710000 },
  });
  assert.equal(res.status, 200);

  // The high bid amount is never exposed publicly.
  const pub = await call('GET', `/api/listings/${listing.id}`, { token: t2 });
  assert.equal(pub.data.listing.high_bid_cents, null);
  assert.equal(pub.data.listing.committed_bid_count, 2);

  // The landlord still sees every offer.
  const own = await call('GET', `/api/listings/${listing.id}`, { token: landlord });
  const amounts = own.data.bids.filter((b) => b.status === 'committed').map((b) => b.monthly_rent_cents);
  assert.deepEqual(amounts.sort(), [710000, 780000]);

  // At the deadline, auto mode awards the highest sealed offer.
  await new Promise((r) => setTimeout(r, 600));
  const done = await call('GET', `/api/listings/${listing.id}`);
  assert.equal(done.data.listing.status, 'awarded');
  const leases = await call('GET', '/api/me/leases', { token: t1 });
  assert.equal(leases.data.leases.length, 1);
  assert.equal(leases.data.leases[0].monthly_rent_cents, 780000);
});

test('counter-offer: landlord counters, tenant accepts, lease at countered rent', async () => {
  const landlord = await register('landlord', 'counter-ll');
  const t1 = await tenantWithProfile('counter-t1');

  const listing = await makeListing(landlord);
  const bidRes = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t1, body: { monthly_rent_cents: 750000 },
  });
  const bidId = bidRes.data.bid.id;

  // Counter must be above the bid and at most the Lease Now rent.
  let res = await call('POST', `/api/bids/${bidId}/counter`, {
    token: landlord, body: { monthly_rent_cents: 700000 },
  });
  assert.equal(res.status, 400);
  res = await call('POST', `/api/bids/${bidId}/counter`, {
    token: landlord, body: { monthly_rent_cents: 950000 },
  });
  assert.equal(res.status, 400);

  // Only the listing owner may counter.
  res = await call('POST', `/api/bids/${bidId}/counter`, {
    token: t1, body: { monthly_rent_cents: 800000 },
  });
  assert.equal(res.status, 403);

  res = await call('POST', `/api/bids/${bidId}/counter`, {
    token: landlord, body: { monthly_rent_cents: 820000 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.bid.counter_status, 'offered');

  // Tenant was notified.
  const notes = await call('GET', '/api/me/notifications', { token: t1 });
  assert.ok(notes.data.notifications.some((n) => n.type === 'counter_offered'));

  // Only the bid's tenant can respond.
  res = await call('POST', `/api/bids/${bidId}/counter/accept`, { token: landlord });
  assert.equal(res.status, 403);

  res = await call('POST', `/api/bids/${bidId}/counter/accept`, { token: t1 });
  assert.equal(res.status, 200);
  assert.equal(res.data.lease.monthly_rent_cents, 820000);
  assert.equal(res.data.lease.status, 'pending_signatures');

  const listingAfter = await call('GET', `/api/listings/${listing.id}`);
  assert.equal(listingAfter.data.listing.status, 'awarded');
});

test('counter-offer: decline keeps the original committed bid standing', async () => {
  const landlord = await register('landlord', 'decline-ll');
  const t1 = await tenantWithProfile('decline-t1');

  const listing = await makeListing(landlord);
  const bidRes = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t1, body: { monthly_rent_cents: 750000 },
  });
  const bidId = bidRes.data.bid.id;

  await call('POST', `/api/bids/${bidId}/counter`, {
    token: landlord, body: { monthly_rent_cents: 850000 },
  });
  const res = await call('POST', `/api/bids/${bidId}/counter/decline`, { token: t1 });
  assert.equal(res.status, 200);
  assert.equal(res.data.bid.counter_status, 'declined');
  assert.equal(res.data.bid.status, 'committed');

  // The landlord can still accept the original bid.
  const accept = await call('POST', `/api/bids/${bidId}/accept`, { token: landlord });
  assert.equal(accept.status, 200);
  assert.equal(accept.data.lease.monthly_rent_cents, 750000);
});

test('counter accept re-screens at the higher rent', async () => {
  const landlord = await register('landlord', 'screen-ll');
  // Income $28,800/yr-scale: qualifies at 750000 with ratio 3? monthly = income/12.
  // Choose income so tenant passes at $7,500/mo but fails at $8,900/mo (ratio 3):
  // need monthly >= 3*rent → income 12*3*760000 = 27,360,000 cents.
  const t1 = await tenantWithProfile('screen-t1', 27500000, 720);

  const listing = await makeListing(landlord);
  const bidRes = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t1, body: { monthly_rent_cents: 750000 },
  });
  await call('POST', `/api/bids/${bidRes.data.bid.id}/counter`, {
    token: landlord, body: { monthly_rent_cents: 890000 },
  });
  const res = await call('POST', `/api/bids/${bidRes.data.bid.id}/counter/accept`, { token: t1 });
  assert.equal(res.status, 409);
  assert.match(res.data.error, /qualify/i);
});

test('signing deadline: tenant no-show forfeits the commitment deposit', async () => {
  const landlord = await register('landlord', 'forfeit-ll');
  const t1 = await tenantWithProfile('forfeit-t1');

  const listing = await makeListing(landlord, { signing_deadline_hours: 0.0001 }); // ~0.36s
  const bidRes = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t1, body: { monthly_rent_cents: 750000 },
  });
  const accept = await call('POST', `/api/bids/${bidRes.data.bid.id}/accept`, { token: landlord });
  const lease = accept.data.lease;

  // Landlord signs; tenant never does.
  await call('POST', `/api/leases/${lease.id}/sign`, { token: landlord });

  // Cannot void before the deadline passes.
  let res = await call('POST', `/api/leases/${lease.id}/void`, { token: landlord });
  assert.equal(res.status, 409);

  await new Promise((r) => setTimeout(r, 500));

  res = await call('POST', `/api/leases/${lease.id}/void`, { token: landlord });
  assert.equal(res.status, 200);
  assert.equal(res.data.lease.status, 'cancelled');

  // Tenant sees the forfeiture; listing is expired and can be relisted.
  const notes = await call('GET', '/api/me/notifications', { token: t1 });
  assert.ok(notes.data.notifications.some((n) => n.type === 'deposit_forfeited'));
  const after = await call('GET', `/api/listings/${listing.id}`);
  assert.equal(after.data.listing.status, 'expired');
});

test('signing deadline: landlord no-show releases the deposit instead', async () => {
  const landlord = await register('landlord', 'release-ll');
  const t1 = await tenantWithProfile('release-t1');

  const listing = await makeListing(landlord, { signing_deadline_hours: 0.0001 });
  const bidRes = await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t1, body: { monthly_rent_cents: 750000 },
  });
  const accept = await call('POST', `/api/bids/${bidRes.data.bid.id}/accept`, { token: landlord });

  // Tenant signs; landlord never does.
  await call('POST', `/api/leases/${accept.data.lease.id}/sign`, { token: t1 });
  await new Promise((r) => setTimeout(r, 500));

  const res = await call('POST', `/api/leases/${accept.data.lease.id}/void`, { token: t1 });
  assert.equal(res.status, 200);

  const notes = await call('GET', '/api/me/notifications', { token: t1 });
  const voided = notes.data.notifications.find((n) => n.type === 'award_voided');
  assert.ok(voided);
  assert.match(voided.message, /released in full/i);
});

test('notifications: outbid alerts fire in open auctions and can be marked read', async () => {
  const landlord = await register('landlord', 'notify-ll');
  const t1 = await tenantWithProfile('notify-t1');
  const t2 = await tenantWithProfile('notify-t2');

  const listing = await makeListing(landlord);
  await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t1, body: { monthly_rent_cents: 750000 },
  });
  await call('POST', `/api/listings/${listing.id}/bids`, {
    token: t2, body: { monthly_rent_cents: 780000 },
  });

  const me = await call('GET', '/api/me', { token: t1 });
  assert.ok(me.data.unread_notifications >= 1);
  const notes = await call('GET', '/api/me/notifications', { token: t1 });
  assert.ok(notes.data.notifications.some((n) => n.type === 'outbid'));

  await call('POST', '/api/me/notifications/read', { token: t1 });
  const after = await call('GET', '/api/me', { token: t1 });
  assert.equal(after.data.unread_notifications, 0);
});
