import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from './db.js';
import { LeaseBidService } from './service.js';
import {
  ApiError, uid, now, bad, unauthorized, conflict,
  hashPassword, verifyPassword, readJsonBody, requireFields,
} from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export function createApp({ dbPath } = {}) {
  const db = openDb(dbPath);
  const svc = new LeaseBidService(db);

  // ---- auth helpers ----
  function currentUser(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return null;
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    return session ? svc.getUser(session.user_id) : null;
  }

  function requireUser(req) {
    const user = currentUser(req);
    if (!user) throw unauthorized();
    return user;
  }

  function createSession(userId) {
    const token = uid() + uid().replaceAll('-', '');
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
      .run(token, userId, now());
    return token;
  }

  // ---- routes: [method, pattern, handler(req, params, body)] ----
  const routes = [
    ['POST', /^\/api\/auth\/register$/, async (req, _p, body) => {
      requireFields(body, ['email', 'password', 'name', 'role']);
      if (!['landlord', 'tenant'].includes(body.role)) throw bad("role must be 'landlord' or 'tenant'");
      if (String(body.password).length < 8) throw bad('Password must be at least 8 characters');
      const email = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Invalid email address');
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        throw conflict('An account with this email already exists');
      }
      const id = uid();
      db.prepare('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, email, hashPassword(String(body.password)), String(body.name), body.role, now());
      return { user: svc.getUser(id), token: createSession(id) };
    }],

    ['POST', /^\/api\/auth\/login$/, async (req, _p, body) => {
      requireFields(body, ['email', 'password']);
      const row = db.prepare('SELECT * FROM users WHERE email = ?')
        .get(String(body.email).trim().toLowerCase());
      if (!row || !verifyPassword(String(body.password), row.password_hash)) {
        throw unauthorized('Invalid email or password');
      }
      return { user: svc.getUser(row.id), token: createSession(row.id) };
    }],

    ['GET', /^\/api\/me$/, async (req) => {
      const user = requireUser(req);
      return {
        user,
        tenant_profile: svc.getTenantProfile(user.id),
        unread_notifications: svc.unreadNotificationCount(user.id),
      };
    }],

    ['GET', /^\/api\/me\/notifications$/, async (req) => {
      const user = requireUser(req);
      return {
        notifications: svc.listNotifications(user.id),
        unread: svc.unreadNotificationCount(user.id),
      };
    }],
    ['POST', /^\/api\/me\/notifications\/read$/, async (req) => {
      const user = requireUser(req);
      svc.markNotificationsRead(user.id);
      return { ok: true };
    }],

    ['PUT', /^\/api\/me\/tenant-profile$/, async (req, _p, body) => {
      const user = requireUser(req);
      if (user.role !== 'tenant') throw bad('Only tenants have a screening profile');
      requireFields(body, ['annual_income_cents', 'credit_score']);
      return { tenant_profile: svc.upsertTenantProfile(user.id, body) };
    }],

    // Properties
    ['POST', /^\/api\/properties$/, async (req, _p, body) => {
      const user = requireUser(req);
      requireFields(body, ['title', 'address', 'type', 'sqft']);
      return { property: svc.createProperty(user, body) };
    }],
    ['GET', /^\/api\/properties$/, async (req) => {
      const user = requireUser(req);
      return { properties: svc.listMyProperties(user.id) };
    }],

    // Listings
    ['POST', /^\/api\/listings$/, async (req, _p, body) => {
      const user = requireUser(req);
      requireFields(body, ['property_id', 'commitment_deposit_cents', 'security_deposit_months', 'term_months']);
      return { listing: svc.publicListingView(svc.createListing(user, body)) };
    }],
    ['GET', /^\/api\/listings$/, async (req) => {
      const user = currentUser(req);
      const url = new URL(req.url, 'http://localhost');
      if (url.searchParams.get('mine') === '1') {
        if (!user) throw unauthorized();
        const rows = db.prepare('SELECT id FROM listings WHERE landlord_id = ? ORDER BY created_at DESC')
          .all(user.id);
        return { listings: rows.map((r) => svc.publicListingView(svc.getListing(r.id))) };
      }
      return { listings: svc.listActiveListings() };
    }],
    ['GET', /^\/api\/listings\/([\w-]+)$/, async (req, [id]) => {
      const listing = svc.getListing(id);
      const user = currentUser(req);
      const view = { listing: svc.publicListingView(listing) };
      if (user && user.id === listing.landlord_id) {
        view.bids = svc.listingBidsForLandlord(listing, user.id);
      }
      if (user && user.role === 'tenant') {
        view.my_screening = svc.screenTenant(
          listing, user.id, listing.min_bid_rent_cents ?? listing.lease_now_rent_cents,
        );
      }
      return view;
    }],
    ['POST', /^\/api\/listings\/([\w-]+)\/cancel$/, async (req, [id]) => {
      const user = requireUser(req);
      return { listing: svc.cancelListing(svc.getListing(id), user.id) };
    }],

    // Tenant actions
    ['POST', /^\/api\/listings\/([\w-]+)\/lease-now$/, async (req, [id]) => {
      const user = requireUser(req);
      return { lease: svc.leaseNow(svc.getListing(id), user) };
    }],
    ['POST', /^\/api\/listings\/([\w-]+)\/bids$/, async (req, [id], body) => {
      const user = requireUser(req);
      requireFields(body, ['monthly_rent_cents']);
      return { bid: svc.placeBid(svc.getListing(id), user, body.monthly_rent_cents) };
    }],
    ['GET', /^\/api\/me\/bids$/, async (req) => {
      const user = requireUser(req);
      return { bids: svc.listMyBids(user.id) };
    }],

    // Landlord decisions
    ['POST', /^\/api\/bids\/([\w-]+)\/accept$/, async (req, [id]) => {
      const user = requireUser(req);
      return { lease: svc.acceptBid(id, user.id) };
    }],
    ['POST', /^\/api\/bids\/([\w-]+)\/reject$/, async (req, [id]) => {
      const user = requireUser(req);
      return { bid: svc.rejectBid(id, user.id) };
    }],
    ['POST', /^\/api\/bids\/([\w-]+)\/counter$/, async (req, [id], body) => {
      const user = requireUser(req);
      requireFields(body, ['monthly_rent_cents']);
      return { bid: svc.counterBid(id, user.id, body.monthly_rent_cents) };
    }],
    ['POST', /^\/api\/bids\/([\w-]+)\/counter\/accept$/, async (req, [id]) => {
      const user = requireUser(req);
      return svc.respondToCounter(id, user, true);
    }],
    ['POST', /^\/api\/bids\/([\w-]+)\/counter\/decline$/, async (req, [id]) => {
      const user = requireUser(req);
      return svc.respondToCounter(id, user, false);
    }],

    // Leases
    ['GET', /^\/api\/me\/leases$/, async (req) => {
      const user = requireUser(req);
      return { leases: svc.listMyLeases(user.id) };
    }],
    ['POST', /^\/api\/leases\/([\w-]+)\/sign$/, async (req, [id]) => {
      const user = requireUser(req);
      return { lease: svc.signLease(id, user) };
    }],
    ['POST', /^\/api\/leases\/([\w-]+)\/void$/, async (req, [id]) => {
      const user = requireUser(req);
      return { lease: svc.voidLease(id, user) };
    }],
  ];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;

    try {
      if (pathname.startsWith('/api/')) {
        for (const [method, pattern, handler] of routes) {
          const match = pathname.match(pattern);
          if (match && req.method === method) {
            const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJsonBody(req) : {};
            const result = await handler(req, match.slice(1), body);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
          }
        }
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      // Static frontend
      let filePath = pathname === '/' ? '/index.html' : pathname;
      filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
      const full = path.join(PUBLIC_DIR, filePath);
      if (full.startsWith(PUBLIC_DIR) && fs.existsSync(full) && fs.statSync(full).isFile()) {
        res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
        res.end(fs.readFileSync(full));
      } else {
        // SPA fallback
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(PUBLIC_DIR, 'index.html')));
      }
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      if (status === 500) console.error(err);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Internal server error' : err.message }));
    }
  });

  return { server, db, svc };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT || 3000);
  const { server } = createApp();
  server.listen(port, () => {
    console.log(`LeaseBid running at http://localhost:${port}`);
  });
}
