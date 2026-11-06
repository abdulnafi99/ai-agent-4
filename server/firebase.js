// One shared firebase-admin app for the server (Realtime Database, Firestore,
// Auth token checks). Uses FIREBASE_SERVICE_ACCOUNT (inline JSON or a file
// path) or Google application default credentials.
import fs from 'node:fs';
import { config } from './config.js';

let appPromise = null;

export function firebaseApp() {
  appPromise ||= (async () => {
    const { initializeApp, getApps, cert, applicationDefault } = await import('firebase-admin/app');
    if (getApps().length) return getApps()[0];
    const sa = config.firebaseServiceAccount;
    const credential = sa
      ? cert(sa.trim().startsWith('{') ? JSON.parse(sa) : JSON.parse(fs.readFileSync(sa, 'utf8')))
      : applicationDefault();
    return initializeApp({
      credential,
      projectId: config.firebaseWebConfig?.projectId,
      databaseURL: config.firebaseDatabaseUrl || undefined,
    });
  })();
  return appPromise;
}

export async function firebaseDatabase() {
  const { getDatabase } = await import('firebase-admin/database');
  return getDatabase(await firebaseApp());
}

export async function firebaseFirestore() {
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(await firebaseApp());
}

export async function firebaseAuth() {
  const { getAuth } = await import('firebase-admin/auth');
  return getAuth(await firebaseApp());
}
