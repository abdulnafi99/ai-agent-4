// Central configuration. Every secret is read from the environment on the
// server only — nothing in this file is ever sent to the browser except the
// values explicitly whitelisted in `publicConfig()`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// Minimal .env loader (no dependency). Existing env vars win.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const env = process.env;

// The NAFI AI Office Firebase project's web config. It is public by design
// (it identifies the project; access is controlled by server credentials and
// security rules). Override with FIREBASE_WEB_CONFIG.
const DEFAULT_FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyA_EtZFKp9VFfJx1R6mRqHI1dmoPJBDvr0',
  authDomain: 'ai-agent-25973.firebaseapp.com',
  databaseURL: 'https://ai-agent-25973-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'ai-agent-25973',
  storageBucket: 'ai-agent-25973.firebasestorage.app',
  messagingSenderId: '979163573432',
  appId: '1:979163573432:web:fb771bb33b7c9d0200d84d',
  measurementId: 'G-KG1FBFL07N',
};
const firebaseWebConfig = env.FIREBASE_WEB_CONFIG ? JSON.parse(env.FIREBASE_WEB_CONFIG) : DEFAULT_FIREBASE_WEB_CONFIG;
const hasFirebaseCredentials = Boolean(env.FIREBASE_SERVICE_ACCOUNT || env.GOOGLE_APPLICATION_CREDENTIALS);
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

function detectProvider() {
  if (env.AI_PROVIDER) return env.AI_PROVIDER.toLowerCase();
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.GEMINI_API_KEY) return 'gemini';
  return 'demo';
}

export const config = {
  port: Number(env.PORT || 8080),
  provider: detectProvider(),
  models: {
    anthropic: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    openai: env.OPENAI_MODEL || 'gpt-5-mini',
    gemini: env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  // Optional per-agent model overrides, e.g. AGENT_MODEL_RESEARCH=claude-sonnet-5-5
  agentModels: {
    ceo: env.AGENT_MODEL_CEO,
    research: env.AGENT_MODEL_RESEARCH,
    development: env.AGENT_MODEL_DEVELOPMENT,
    social: env.AGENT_MODEL_SOCIAL,
    security: env.AGENT_MODEL_SECURITY,
  },
  // Optional per-agent AI provider, e.g. AGENT_PROVIDER_RESEARCH=gemini.
  // Agents without one use the default provider above.
  agentProviders: {
    ceo: env.AGENT_PROVIDER_CEO?.toLowerCase(),
    research: env.AGENT_PROVIDER_RESEARCH?.toLowerCase(),
    development: env.AGENT_PROVIDER_DEVELOPMENT?.toLowerCase(),
    social: env.AGENT_PROVIDER_SOCIAL?.toLowerCase(),
    security: env.AGENT_PROVIDER_SECURITY?.toLowerCase(),
  },
  anthropicEffort: env.ANTHROPIC_EFFORT || 'medium',
  openaiBaseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',

  // "rtdb" (Firebase Realtime Database), "firestore" or "file". Defaults to the
  // Realtime Database whenever Firebase server credentials are configured.
  storage: (env.STORAGE || (hasFirebaseCredentials ? 'rtdb' : 'file')).toLowerCase(),
  firebaseDatabaseUrl: env.FIREBASE_DATABASE_URL || firebaseWebConfig.databaseURL || '',
  // Vercel's filesystem is read-only except /tmp (and /tmp is not durable).
  dataFile: env.DATA_FILE || (env.VERCEL ? '/tmp/nafi-office.json' : path.join(ROOT, 'data', 'office.json')),

  firebaseWebConfig,
  // Auth: AUTH_MODE = "key" | "firebase" | "none". By default a shared
  // OWNER_ACCESS_KEY wins; Firebase Auth is used when FIREBASE_WEB_CONFIG is
  // set explicitly and no key is; otherwise the office runs open (dev only).
  authMode: (env.AUTH_MODE || (env.OWNER_ACCESS_KEY ? 'key' : env.FIREBASE_WEB_CONFIG ? 'firebase' : 'none')).toLowerCase(),
  analytics: env.FIREBASE_ANALYTICS !== 'false',
  firebaseServiceAccount: env.FIREBASE_SERVICE_ACCOUNT || null,
  ownerEmails: list(env.OWNER_EMAILS).map((e) => e.toLowerCase()),
  ownerKey: env.OWNER_ACCESS_KEY || '',

  // Safety rails for autonomous operation.
  maxTurnsPerChain: Number(env.MAX_TURNS_PER_CHAIN || 24),
  maxConcurrentAgents: Number(env.MAX_CONCURRENT_AGENTS || 2),
  turnDelayMs: Number(env.TURN_DELAY_MS || 900),
};

export const PROVIDERS = ['anthropic', 'openai', 'gemini'];

/** Providers whose API key is configured on the server. */
export function availableProviders() {
  return PROVIDERS.filter((p) => (p === 'anthropic' ? env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN : p === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY));
}

export function publicConfig() {
  const usesAi = config.provider !== 'demo' || Object.values(config.agentProviders).some(Boolean);
  return {
    provider: config.provider,
    demo: !usesAi,
    available: availableProviders(),
    auth: config.authMode,
    firebase: config.firebaseWebConfig, // Firebase web config is public by design
    analytics: config.analytics && Boolean(config.firebaseWebConfig?.measurementId),
    storage: config.storage,
  };
}
