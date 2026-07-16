import { createHmac } from 'node:crypto';
import { config, nowIso } from './config.js';
import { makeId, withWrite } from './storage.js';
import { verifyPassword } from './passwords.js';
import { withPostgresTransaction } from './postgresStore.js';
import { usePostgresRowMode } from './storageMode.js';

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(value) {
  return createHmac('sha256', config.auth.secret).update(value).digest('base64url');
}

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rawValue.join('='));
  }
  return out;
}

export function makeSessionCookie(session) {
  const payload = base64Url(JSON.stringify(session));
  const value = `${payload}.${sign(payload)}`;
  const flags = [
    `session=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=604800'
  ];
  if (config.auth.secureCookie) flags.push('Secure');
  return flags.join('; ');
}

export function clearSessionCookie() {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function verifySessionCookie(req) {
  const cookie = parseCookies(req).session;
  if (!cookie || !cookie.includes('.')) return null;

  const [payload, signature] = cookie.split('.');
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function login(db, username, password) {
  const admin = db.admins.find((item) => item.username === username);
  if (!admin || !verifyPassword(password, admin.passwordSalt, admin.passwordHash)) {
    return null;
  }

  const session = {
    id: makeId('ses'),
    adminId: admin.id,
    username: admin.username,
    role: admin.role,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };

  db.sessions.push(session);
  return session;
}

export async function loginForRequest(username, password) {
  if (!usePostgresRowMode()) {
    let session = null;
    await withWrite(async (db) => {
      session = await login(db, username, password);
    });
    return session;
  }

  return withPostgresTransaction(async (client) => {
    const adminResult = await client.query(
      `SELECT doc
       FROM app_documents
       WHERE collection = 'admins' AND doc->>'username' = $1
       LIMIT 1`,
      [username]
    );
    const admin = adminResult.rows[0]?.doc;
    if (!admin || !verifyPassword(password, admin.passwordSalt, admin.passwordHash)) {
      return null;
    }

    const session = {
      id: makeId('ses'),
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
      createdAt: nowIso(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    await client.query(
      `DELETE FROM app_documents
       WHERE collection = 'sessions'
         AND (doc->>'expiresAt')::timestamptz < now()`
    );
    await client.query(
      `INSERT INTO app_documents (collection, id, doc, updated_at)
       VALUES ('sessions', $1, $2::jsonb, now())`,
      [session.id, JSON.stringify(session)]
    );
    return session;
  });
}

export async function logout(sessionId) {
  if (usePostgresRowMode()) {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `DELETE FROM app_documents WHERE collection = 'sessions' AND id = $1`,
        [sessionId]
      );
    });
    return;
  }

  await withWrite(async (db) => {
    db.sessions = db.sessions.filter((session) => session.id !== sessionId);
  });
}

export function requireAdmin(req, db) {
  const session = verifySessionCookie(req);
  if (!session) return null;
  const storedSession = db.sessions.find((item) => item.id === session.id && item.adminId === session.adminId);
  if (!storedSession) return null;
  const admin = db.admins.find((item) => item.id === session.adminId);
  if (!admin) return null;
  return { ...admin, sessionId: session.id };
}
