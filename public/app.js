/* LeaseBid SPA — vanilla JS, hash routing. */

const app = document.getElementById('app');
const nav = document.getElementById('nav');

// ---------- state & api ----------

const state = {
  get token() { return localStorage.getItem('leasebid_token'); },
  set token(v) { v ? localStorage.setItem('leasebid_token', v) : localStorage.removeItem('leasebid_token'); },
  user: null,
  tenantProfile: null,
};

async function api(method, url, body) {
  const headers = { 'content-type': 'application/json' };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function loadMe() {
  if (!state.token) { state.user = null; return; }
  try {
    const { user, tenant_profile } = await api('GET', '/api/me');
    state.user = user;
    state.tenantProfile = tenant_profile;
  } catch {
    state.token = null;
    state.user = null;
  }
}

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const money = (cents) => cents == null ? '—'
  : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const dollarsToCents = (v) => Math.round(parseFloat(v) * 100);

function timeLeft(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

const STATUS_BADGE = {
  active: '<span class="badge green">Open</span>',
  under_review: '<span class="badge yellow">Under review</span>',
  awarded: '<span class="badge blue">Awarded</span>',
  leased: '<span class="badge blue">Leased</span>',
  expired: '<span class="badge">Expired</span>',
  cancelled: '<span class="badge red">Cancelled</span>',
};

function flash(kind, text) {
  const box = document.getElementById('flash');
  if (box) box.innerHTML = `<div class="msg ${kind}">${esc(text)}</div>`;
}

function bindForm(id, handler) {
  const form = document.getElementById(id);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await handler(data, form);
    } catch (err) {
      flash('error', err.message);
    }
  });
}

// ---------- nav ----------

function renderNav() {
  const links = [`<a href="#/browse">Browse listings</a>`];
  if (state.user) {
    links.push(`<a href="#/dashboard">${state.user.role === 'landlord' ? 'My properties' : 'My activity'}</a>`);
    links.push(`<span class="who">${esc(state.user.name)} · ${esc(state.user.role)}</span>`);
    links.push(`<a href="#" id="logout">Sign out</a>`);
  } else {
    links.push(`<a href="#/login">Sign in</a>`, `<a href="#/register" class="btn">Get started</a>`);
  }
  nav.innerHTML = links.join('');
  const logout = document.getElementById('logout');
  if (logout) logout.addEventListener('click', (e) => {
    e.preventDefault();
    state.token = null;
    state.user = null;
    location.hash = '#/browse';
  });
}

// ---------- views ----------

async function viewBrowse() {
  const { listings } = await api('GET', '/api/listings');
  const hero = state.user ? '' : `
    <div class="hero">
      <h1>Lease it now — or bid to lease it.</h1>
      <p>Landlords list properties with an instant "Lease Now" rent. Tenants can take it on the spot,
         or place a <strong>committed bid</strong> backed by a real deposit hold — so every offer a
         landlord sees is from a screened tenant who is ready to sign and pay.</p>
      <a class="btn" href="#/register">Create an account</a>
    </div>`;

  const cards = listings.map((l) => `
    <div class="card">
      <a href="#/listing/${l.id}">
        <h3>${esc(l.property.title)}</h3>
        <div class="addr">${esc(l.property.address)}</div>
        <div class="pricing">
          ${l.allow_lease_now ? `<div class="item"><div class="label">Lease now</div><div class="value accent">${money(l.lease_now_rent_cents)}/mo</div></div>` : ''}
          ${l.allow_bids ? `<div class="item"><div class="label">${l.high_bid_cents ? 'High bid' : 'Min bid'}</div><div class="value">${money(l.high_bid_cents ?? l.min_bid_rent_cents)}/mo</div></div>` : ''}
        </div>
        <div class="meta">
          <span>${esc(l.property.type)}</span>
          <span>${l.property.sqft.toLocaleString()} sqft</span>
          <span>${l.term_months} mo term</span>
          ${l.allow_bids ? `<span>${l.committed_bid_count} committed bid${l.committed_bid_count === 1 ? '' : 's'}</span>` : ''}
          ${l.bid_deadline ? `<span>${timeLeft(l.bid_deadline)}</span>` : ''}
        </div>
      </a>
    </div>`).join('');

  app.innerHTML = `${hero}
    <h1>Open listings</h1>
    <div id="flash"></div>
    ${listings.length ? `<div class="grid">${cards}</div>` : '<p class="muted">No open listings yet. Landlords: sign up and publish the first one.</p>'}`;
}

async function viewListing(id) {
  let data;
  try {
    data = await api('GET', `/api/listings/${id}`);
  } catch (err) {
    app.innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    return;
  }
  const l = data.listing;
  const isOwner = state.user && state.user.id === l.landlord_id;
  const isTenant = state.user && state.user.role === 'tenant';
  const open = l.status === 'active';

  const reqs = [];
  if (l.min_credit_score > 0) reqs.push(`Credit score of ${l.min_credit_score} or higher`);
  if (l.min_income_ratio > 0) reqs.push(`Monthly income at least ${l.min_income_ratio}× the rent`);
  reqs.push(`Commitment deposit of ${money(l.commitment_deposit_cents)} held when you bid or lease`);
  reqs.push(`Security deposit: ${l.security_deposit_months} month(s) of rent at signing`);

  let actionPanel = '';
  if (isTenant && open) {
    const s = data.my_screening;
    const qualified = s && s.qualified;
    actionPanel = `
      <div class="panel">
        <h2 style="margin-top:0">Take action</h2>
        ${!state.tenantProfile ? `<div class="msg info">Complete your <a href="#/dashboard">tenant profile</a> (income &amp; credit score) before bidding.</div>` : ''}
        ${s && !qualified ? `<div class="msg error">You don't currently qualify: ${esc(s.reasons.join(' '))}</div>` : ''}
        ${l.allow_lease_now ? `
          <p class="small muted">Lease instantly at the asking rent — skips the auction entirely.</p>
          <div class="actions"><button class="success" id="lease-now">Lease Now — ${money(l.lease_now_rent_cents)}/mo</button></div>
          <hr class="sep">` : ''}
        ${l.allow_bids ? `
          <p class="small muted">Or place a <strong>committed bid</strong>. A ${money(l.commitment_deposit_cents)}
             deposit is held when you bid and is binding until the auction resolves — it's applied to your
             security deposit if you win, and released in full if you don't.</p>
          <form id="bid-form">
            <div class="row">
              <label>Your monthly rent offer ($)
                <input name="rent" type="number" min="1" step="1" required
                  placeholder="min ${(l.min_bid_rent_cents / 100).toFixed(0)}" />
              </label>
            </div>
            <label class="inline"><input type="checkbox" required />
              I understand this bid is a binding commitment backed by a ${money(l.commitment_deposit_cents)} deposit hold.</label>
            <button type="submit">Place committed bid</button>
          </form>` : ''}
      </div>`;
  } else if (!state.user && open) {
    actionPanel = `<div class="panel"><a class="btn" href="#/register">Sign up to lease or bid</a></div>`;
  }

  let ownerPanel = '';
  if (isOwner) {
    const rows = (data.bids || []).map((b) => `
      <tr>
        <td>${money(b.monthly_rent_cents)}/mo</td>
        <td>${esc(b.tenant_name)}<div class="small muted">${esc(b.tenant_email)}</div></td>
        <td>${b.tenant_profile ? `Credit ${b.tenant_profile.credit_score} · ${money(b.tenant_profile.annual_income_cents)}/yr<div class="small muted">${esc(b.tenant_profile.occupation)}</div>` : '<span class="muted">No profile</span>'}</td>
        <td><span class="badge ${b.status === 'committed' ? 'green' : b.status === 'accepted' ? 'blue' : ''}">${esc(b.status)}</span></td>
        <td>${b.status === 'committed' && ['active', 'under_review'].includes(l.status) ? `
          <div class="actions">
            <button class="success" data-accept="${b.id}">Accept</button>
            <button class="danger" data-reject="${b.id}">Reject</button>
          </div>` : ''}</td>
      </tr>`).join('');
    ownerPanel = `
      <div class="panel">
        <h2 style="margin-top:0">Bids on your listing</h2>
        <p class="small muted">Every committed bid below is deposit-backed and pre-screened against your minimums.
          ${l.approval_mode === 'auto' ? 'This auction awards the highest committed bid automatically at the deadline.' : 'You choose the winner — accept any committed bid, before or after the deadline.'}</p>
        ${rows ? `<div class="table-wrap"><table><thead><tr><th>Offer</th><th>Tenant</th><th>Screening</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No bids yet.</p>'}
        ${['active', 'under_review'].includes(l.status) ? `<div class="actions"><button class="danger" id="cancel-listing">Cancel listing</button></div>` : ''}
      </div>`;
  }

  app.innerHTML = `
    <div id="flash"></div>
    <div class="panel">
      <h1 style="margin-bottom:0.25rem">${esc(l.property.title)} ${STATUS_BADGE[l.status] || ''}</h1>
      <div class="addr muted">${esc(l.property.address)} · listed by ${esc(l.landlord_name)}</div>
      <div class="pricing" style="margin-top:0.9rem">
        ${l.allow_lease_now ? `<div class="item"><div class="label">Lease now</div><div class="value accent">${money(l.lease_now_rent_cents)}/mo</div></div>` : ''}
        ${l.allow_bids ? `
          <div class="item"><div class="label">Minimum bid</div><div class="value">${money(l.min_bid_rent_cents)}/mo</div></div>
          <div class="item"><div class="label">Current high bid</div><div class="value">${l.high_bid_cents ? money(l.high_bid_cents) + '/mo' : '—'}</div></div>
          <div class="item"><div class="label">Committed bids</div><div class="value">${l.committed_bid_count}</div></div>
          <div class="item"><div class="label">Auction</div><div class="value">${timeLeft(l.bid_deadline) || '—'}</div></div>` : ''}
      </div>
      <div class="meta" style="margin-top:0.5rem">
        <span>${esc(l.property.type)}</span>
        <span>${l.property.sqft.toLocaleString()} sqft</span>
        <span>${l.term_months}-month term</span>
        <span>${l.approval_mode === 'auto' ? 'Highest bid wins at deadline' : 'Landlord approves the winner'}</span>
      </div>
      ${l.property.description ? `<p style="margin-top:0.9rem">${esc(l.property.description)}</p>` : ''}
      <h2>Tenant requirements</h2>
      <ul class="reqs">${reqs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>
    ${actionPanel}
    ${ownerPanel}`;

  const leaseNowBtn = document.getElementById('lease-now');
  if (leaseNowBtn) leaseNowBtn.addEventListener('click', async () => {
    if (!confirm(`Lease this property now at ${money(l.lease_now_rent_cents)}/mo? A ${money(l.commitment_deposit_cents)} commitment deposit will be held and a lease will be generated for signing.`)) return;
    try {
      await api('POST', `/api/listings/${l.id}/lease-now`);
      location.hash = '#/dashboard';
    } catch (err) { flash('error', err.message); }
  });

  bindForm('bid-form', async (data) => {
    await api('POST', `/api/listings/${l.id}/bids`, { monthly_rent_cents: dollarsToCents(data.rent) });
    flash('ok', 'Committed bid placed — your deposit is held until the auction resolves.');
    setTimeout(() => viewListing(l.id), 800);
  });

  app.querySelectorAll('[data-accept]').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Accept this bid? All other bids will be released and a lease will be generated.')) return;
    try { await api('POST', `/api/bids/${btn.dataset.accept}/accept`); viewListing(l.id); }
    catch (err) { flash('error', err.message); }
  }));
  app.querySelectorAll('[data-reject]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await api('POST', `/api/bids/${btn.dataset.reject}/reject`); viewListing(l.id); }
    catch (err) { flash('error', err.message); }
  }));
  const cancelBtn = document.getElementById('cancel-listing');
  if (cancelBtn) cancelBtn.addEventListener('click', async () => {
    if (!confirm('Cancel this listing? All committed bid deposits will be released.')) return;
    try { await api('POST', `/api/listings/${l.id}/cancel`); viewListing(l.id); }
    catch (err) { flash('error', err.message); }
  });
}

function authForm(kind) {
  const isReg = kind === 'register';
  app.innerHTML = `
    <div style="max-width:420px;margin:2rem auto">
      <h1>${isReg ? 'Create your account' : 'Sign in'}</h1>
      <div id="flash"></div>
      <form id="auth-form" class="panel">
        ${isReg ? `
          <label>Full name / company<input name="name" required /></label>
          <label>I am a
            <select name="role">
              <option value="tenant">Tenant — I want to lease space</option>
              <option value="landlord">Landlord — I have properties to lease</option>
            </select>
          </label>` : ''}
        <label>Email<input name="email" type="email" required /></label>
        <label>Password<input name="password" type="password" required minlength="8" /></label>
        <button type="submit">${isReg ? 'Create account' : 'Sign in'}</button>
        <p class="small muted" style="margin-top:0.75rem">
          ${isReg ? 'Already have an account? <a href="#/login">Sign in</a>' : 'New here? <a href="#/register">Create an account</a>'}
        </p>
      </form>
    </div>`;
  bindForm('auth-form', async (data) => {
    const res = await api('POST', `/api/auth/${isReg ? 'register' : 'login'}`, data);
    state.token = res.token;
    await loadMe();
    renderNav();
    location.hash = '#/dashboard';
  });
}

async function viewDashboard() {
  if (!state.user) { location.hash = '#/login'; return; }
  if (state.user.role === 'landlord') return viewLandlordDashboard();
  return viewTenantDashboard();
}

async function viewLandlordDashboard() {
  const [{ properties }, { listings }, { leases }] = await Promise.all([
    api('GET', '/api/properties'),
    api('GET', '/api/listings?mine=1'),
    api('GET', '/api/me/leases'),
  ]);

  const propOptions = properties.map((p) => `<option value="${p.id}">${esc(p.title)} — ${esc(p.address)}</option>`).join('');
  const listingRows = listings.map((l) => `
    <tr>
      <td><a href="#/listing/${l.id}" style="color:var(--accent)">${esc(l.property.title)}</a></td>
      <td>${STATUS_BADGE[l.status] || esc(l.status)}</td>
      <td>${l.allow_lease_now ? money(l.lease_now_rent_cents) : '—'}</td>
      <td>${l.high_bid_cents ? money(l.high_bid_cents) : (l.allow_bids ? 'no bids' : '—')}</td>
      <td>${l.committed_bid_count}</td>
      <td>${l.bid_deadline ? esc(timeLeft(l.bid_deadline)) : '—'}</td>
    </tr>`).join('');

  app.innerHTML = `
    <h1>Landlord dashboard</h1>
    <div id="flash"></div>

    <h2>Your listings</h2>
    ${listingRows ? `<div class="panel table-wrap"><table>
      <thead><tr><th>Property</th><th>Status</th><th>Lease now</th><th>High bid</th><th>Bids</th><th>Auction</th></tr></thead>
      <tbody>${listingRows}</tbody></table></div>` : '<p class="muted">No listings yet — add a property below, then publish a listing.</p>'}

    ${renderLeases(leases, 'landlord')}

    <h2>Add a property</h2>
    <form id="prop-form" class="panel">
      <div class="row">
        <label>Title<input name="title" required placeholder="Warehouse B — Dock-High" /></label>
        <label>Type
          <select name="type">
            <option value="industrial">Industrial</option>
            <option value="office">Office</option>
            <option value="retail">Retail</option>
            <option value="residential">Residential</option>
            <option value="land">Land</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label>Address<input name="address" required /></label>
      <div class="row">
        <label>Square feet<input name="sqft" type="number" min="1" required /></label>
      </div>
      <label>Description<textarea name="description" rows="2"></textarea></label>
      <button type="submit">Add property</button>
    </form>

    <h2>Publish a listing</h2>
    ${properties.length ? `
    <form id="listing-form" class="panel">
      <label>Property<select name="property_id" required>${propOptions}</select></label>
      <div class="row">
        <label class="inline"><input type="checkbox" name="allow_lease_now" checked /> Offer "Lease Now" at a fixed rent</label>
        <label class="inline"><input type="checkbox" name="allow_bids" checked /> Accept committed bids (auction)</label>
      </div>
      <div class="row">
        <label>Lease Now rent ($/mo)<input name="lease_now_rent" type="number" min="1" placeholder="8500" /></label>
        <label>Minimum bid ($/mo)<input name="min_bid_rent" type="number" min="1" placeholder="7000" /></label>
      </div>
      <div class="row">
        <label>Bid deadline<input name="bid_deadline" type="datetime-local" /></label>
        <label>Award mode
          <select name="approval_mode">
            <option value="manual">I approve the winning bid myself</option>
            <option value="auto">Highest committed bid wins automatically</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label>Lease term (months)<input name="term_months" type="number" min="1" value="36" required /></label>
        <label>Commitment deposit held per bid ($)<input name="commitment_deposit" type="number" min="1" value="2500" required /></label>
      </div>
      <div class="row">
        <label>Security deposit (months of rent)<input name="security_deposit_months" type="number" min="1" value="2" required /></label>
      </div>
      <h2 style="margin-top:0.5rem">Minimum tenant requirements</h2>
      <div class="row">
        <label>Minimum credit score (0 = none)<input name="min_credit_score" type="number" min="0" max="850" value="650" /></label>
        <label>Income-to-rent ratio (0 = none)<input name="min_income_ratio" type="number" min="0" max="20" step="0.5" value="3" /></label>
      </div>
      <button type="submit">Publish listing</button>
    </form>` : '<p class="muted">Add a property first.</p>'}`;

  bindForm('prop-form', async (data, form) => {
    await api('POST', '/api/properties', { ...data, sqft: Number(data.sqft) });
    flash('ok', 'Property added.');
    form.reset();
    setTimeout(viewLandlordDashboard, 600);
  });

  bindForm('listing-form', async (data) => {
    const body = {
      property_id: data.property_id,
      allow_lease_now: !!data.allow_lease_now,
      allow_bids: !!data.allow_bids,
      approval_mode: data.approval_mode,
      term_months: Number(data.term_months),
      security_deposit_months: Number(data.security_deposit_months),
      commitment_deposit_cents: dollarsToCents(data.commitment_deposit),
      min_credit_score: Number(data.min_credit_score || 0),
      min_income_ratio: Number(data.min_income_ratio || 0),
    };
    if (body.allow_lease_now) body.lease_now_rent_cents = dollarsToCents(data.lease_now_rent);
    if (body.allow_bids) {
      body.min_bid_rent_cents = dollarsToCents(data.min_bid_rent);
      body.bid_deadline = data.bid_deadline ? new Date(data.bid_deadline).toISOString() : null;
    }
    const { listing } = await api('POST', '/api/listings', body);
    location.hash = `#/listing/${listing.id}`;
  });
}

async function viewTenantDashboard() {
  const [{ bids }, { leases }] = await Promise.all([
    api('GET', '/api/me/bids'),
    api('GET', '/api/me/leases'),
  ]);
  const p = state.tenantProfile;

  const bidRows = bids.map((b) => `
    <tr>
      <td><a href="#/listing/${b.listing_id}" style="color:var(--accent)">${esc(b.listing.property.title)}</a></td>
      <td>${money(b.monthly_rent_cents)}/mo</td>
      <td><span class="badge ${b.status === 'committed' ? 'green' : b.status === 'accepted' ? 'blue' : ''}">${esc(b.status)}</span></td>
      <td>${b.listing.bid_deadline ? esc(timeLeft(b.listing.bid_deadline)) : '—'}</td>
    </tr>`).join('');

  app.innerHTML = `
    <h1>Tenant dashboard</h1>
    <div id="flash"></div>

    <h2>Screening profile</h2>
    <p class="small muted">Listings set minimum requirements; your profile is checked automatically when you bid.
      (Self-reported in this MVP — verified screening is on the roadmap.)</p>
    <form id="profile-form" class="panel">
      <div class="row">
        <label>Annual income ($)<input name="income" type="number" min="1" required value="${p ? p.annual_income_cents / 100 : ''}" /></label>
        <label>Credit score<input name="credit_score" type="number" min="300" max="850" required value="${p ? p.credit_score : ''}" /></label>
      </div>
      <label>Occupation / business<input name="occupation" value="${p ? esc(p.occupation) : ''}" /></label>
      <button type="submit">${p ? 'Update profile' : 'Save profile'}</button>
    </form>

    <h2>My committed bids</h2>
    ${bidRows ? `<div class="panel table-wrap"><table>
      <thead><tr><th>Property</th><th>My offer</th><th>Status</th><th>Auction</th></tr></thead>
      <tbody>${bidRows}</tbody></table></div>` : '<p class="muted">No bids yet — <a href="#/browse" style="color:var(--accent)">browse open listings</a>.</p>'}

    ${renderLeases(leases, 'tenant')}`;

  bindForm('profile-form', async (data) => {
    const { tenant_profile } = await api('PUT', '/api/me/tenant-profile', {
      annual_income_cents: dollarsToCents(data.income),
      credit_score: Number(data.credit_score),
      occupation: data.occupation,
    });
    state.tenantProfile = tenant_profile;
    flash('ok', 'Profile saved.');
  });
}

function renderLeases(leases, role) {
  if (!leases.length) return '';
  const rows = leases.map((lease) => {
    const mySigned = role === 'tenant' ? lease.tenant_signed_at : lease.landlord_signed_at;
    const canSign = lease.status === 'pending_signatures' && !mySigned;
    return `
      <tr>
        <td>${esc(lease.property.title)}<div class="small muted">${esc(lease.property.address)}</div></td>
        <td>${money(lease.monthly_rent_cents)}/mo × ${lease.term_months} mo</td>
        <td>${money(lease.security_deposit_cents)}</td>
        <td><span class="badge ${lease.status === 'active' ? 'green' : 'yellow'}">${esc(lease.status.replace('_', ' '))}</span>
          <div class="small muted">tenant ${lease.tenant_signed_at ? '✓' : '…'} · landlord ${lease.landlord_signed_at ? '✓' : '…'}</div></td>
        <td>${canSign ? `<button class="success" data-sign="${lease.id}">Sign lease</button>` : ''}</td>
      </tr>`;
  }).join('');
  setTimeout(() => {
    document.querySelectorAll('[data-sign]').forEach((btn) => btn.addEventListener('click', async () => {
      try { await api('POST', `/api/leases/${btn.dataset.sign}/sign`); viewDashboard(); }
      catch (err) { flash('error', err.message); }
    }));
  });
  return `
    <h2>Leases</h2>
    <div class="panel table-wrap"><table>
      <thead><tr><th>Property</th><th>Terms</th><th>Security deposit</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

// ---------- router ----------

async function route() {
  renderNav();
  const hash = location.hash || '#/browse';
  const listingMatch = hash.match(/^#\/listing\/([\w-]+)$/);
  try {
    if (hash === '#/browse' || hash === '#/') await viewBrowse();
    else if (listingMatch) await viewListing(listingMatch[1]);
    else if (hash === '#/login') authForm('login');
    else if (hash === '#/register') authForm('register');
    else if (hash === '#/dashboard') await viewDashboard();
    else await viewBrowse();
  } catch (err) {
    app.innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
  }
}

window.addEventListener('hashchange', route);
loadMe().then(route);
