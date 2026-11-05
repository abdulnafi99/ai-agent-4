// Persistent store for messages, tasks, projects, meetings, approvals and
// activity. Data lives in memory for fast reads and is written through to a
// persistence driver: a local JSON file (default) or Firebase Firestore.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

export const COLLECTIONS = ['messages', 'tasks', 'projects', 'activity', 'approvals', 'meetings', 'documents', 'agents', 'settings'];
// Keep long-lived history bounded in memory; older items stay in Firestore.
const LIMITS = { messages: 2000, activity: 1500, documents: 500, meetings: 200 };

export const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

class FileDriver {
  constructor(file) { this.file = file; this.timer = null; }
  async load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; }
  }
  schedule(getData) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(getData()));
      fs.renameSync(tmp, this.file);
    }, 400);
  }
  write(_col, _doc, getData) { this.schedule(getData); }
  remove(_col, _id, getData) { this.schedule(getData); }
  async clear() { try { fs.unlinkSync(this.file); } catch {} }
}

class FirestoreDriver {
  async init() {
    const admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) {
      const sa = config.firebaseServiceAccount;
      const credential = sa
        ? admin.credential.cert(sa.trim().startsWith('{') ? JSON.parse(sa) : JSON.parse(fs.readFileSync(sa, 'utf8')))
        : admin.credential.applicationDefault();
      admin.initializeApp({ credential });
    }
    this.db = admin.firestore();
    this.root = this.db.collection('nafiOffice').doc('workspace');
  }
  async load() {
    await this.init();
    const out = {};
    for (const col of COLLECTIONS) {
      let q = this.root.collection(col);
      if (LIMITS[col]) q = q.orderBy('createdAt', 'desc').limit(LIMITS[col]);
      const snap = await q.get();
      out[col] = snap.docs.map((d) => d.data()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }
    return out;
  }
  write(col, doc) {
    this.root.collection(col).doc(doc.id).set(doc).catch((e) => console.error('[firestore] write failed', e.message));
  }
  remove(col, id) {
    this.root.collection(col).doc(id).delete().catch(() => {});
  }
  async clear() {
    for (const col of COLLECTIONS) {
      const snap = await this.root.collection(col).get();
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

class Store {
  constructor() {
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
    this.listeners = new Set();
  }
  async init() {
    this.driver = config.storage === 'firestore' ? new FirestoreDriver() : new FileDriver(config.dataFile);
    try {
      const loaded = await this.driver.load();
      for (const c of COLLECTIONS) if (Array.isArray(loaded[c])) this.data[c] = loaded[c];
    } catch (e) {
      console.error(`[store] ${config.storage} unavailable (${e.message}); falling back to local file`);
      this.driver = new FileDriver(config.dataFile);
      const loaded = await this.driver.load();
      for (const c of COLLECTIONS) if (Array.isArray(loaded[c])) this.data[c] = loaded[c];
    }
  }
  snapshot() { return this.data; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, col, doc) { for (const fn of this.listeners) fn({ type, col, doc }); }

  list(col, filter) { return filter ? this.data[col].filter(filter) : this.data[col]; }
  get(col, id) { return this.data[col].find((d) => d.id === id); }

  insert(col, doc) {
    const now = Date.now();
    const full = { id: doc.id || uid(col.slice(0, 3)), createdAt: now, updatedAt: now, ...doc };
    this.data[col].push(full);
    const limit = LIMITS[col];
    if (limit && this.data[col].length > limit) this.data[col].splice(0, this.data[col].length - limit);
    this.driver.write(col, full, () => this.data);
    this.emit('insert', col, full);
    return full;
  }
  update(col, id, patch) {
    const doc = this.get(col, id);
    if (!doc) return null;
    Object.assign(doc, patch, { updatedAt: Date.now() });
    this.driver.write(col, doc, () => this.data);
    this.emit('update', col, doc);
    return doc;
  }
  upsert(col, doc) { return this.get(col, doc.id) ? this.update(col, doc.id, doc) : this.insert(col, doc); }
  async reset() {
    await this.driver.clear();
    for (const c of COLLECTIONS) this.data[c] = [];
    this.emit('reset', null, null);
  }
}

export const store = new Store();
