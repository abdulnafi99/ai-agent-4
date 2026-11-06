// Request authentication.
//  - Firebase mode: browser signs in with Firebase Auth and sends its ID token;
//    the server verifies it with firebase-admin (and OWNER_EMAILS if set).
//  - Key mode: a shared OWNER_ACCESS_KEY.
//  - Open mode: no auth configured (local development only).
import crypto from 'node:crypto';
import { config } from './config.js';
import { firebaseAuth } from './firebase.js';

let adminAuth = null;
async function getAdminAuth() {
  adminAuth ||= await firebaseAuth();
  return adminAuth;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function authenticate(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || '');
  if (config.authMode === 'firebase') {
    if (!token) return null;
    try {
      const decoded = await (await getAdminAuth()).verifyIdToken(token);
      if (config.ownerEmails.length && !config.ownerEmails.includes((decoded.email || '').toLowerCase())) return null;
      return { uid: decoded.uid, email: decoded.email };
    } catch { return null; }
  }
  if (config.authMode === 'key') return config.ownerKey && token && safeEqual(token, config.ownerKey) ? { uid: 'owner' } : null;
  return { uid: 'owner' };
}

export function requireAuth(req, res, next) {
  authenticate(req).then((user) => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  }).catch(next);
}
