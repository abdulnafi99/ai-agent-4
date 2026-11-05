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
    openai: env.OPENAI_MODEL || 'gpt-4o-mini',
    gemini: env.GEMINI_MODEL || 'gemini-2.0-flash',
  },
  // Optional per-agent model overrides, e.g. AGENT_MODEL_RESEARCH=claude-sonnet-5-5
  agentModels: {
    ceo: env.AGENT_MODEL_CEO,
    research: env.AGENT_MODEL_RESEARCH,
    development: env.AGENT_MODEL_DEVELOPMENT,
    social: env.AGENT_MODEL_SOCIAL,
  },
  anthropicEffort: env.ANTHROPIC_EFFORT || 'medium',
  openaiBaseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',

  storage: env.STORAGE || (env.FIREBASE_SERVICE_ACCOUNT || env.GOOGLE_APPLICATION_CREDENTIALS ? 'firestore' : 'file'),
  dataFile: env.DATA_FILE || path.join(ROOT, 'data', 'office.json'),

  // Auth: Firebase Auth when FIREBASE_WEB_CONFIG is set, otherwise an
  // optional shared owner key. With neither, the office runs open (dev).
  firebaseWebConfig: env.FIREBASE_WEB_CONFIG ? JSON.parse(env.FIREBASE_WEB_CONFIG) : null,
  firebaseServiceAccount: env.FIREBASE_SERVICE_ACCOUNT || null,
  ownerEmails: list(env.OWNER_EMAILS).map((e) => e.toLowerCase()),
  ownerKey: env.OWNER_ACCESS_KEY || '',

  // Safety rails for autonomous operation.
  maxTurnsPerChain: Number(env.MAX_TURNS_PER_CHAIN || 24),
  maxConcurrentAgents: Number(env.MAX_CONCURRENT_AGENTS || 2),
  turnDelayMs: Number(env.TURN_DELAY_MS || 900),
};

export function publicConfig() {
  return {
    provider: config.provider,
    demo: config.provider === 'demo',
    auth: config.firebaseWebConfig ? 'firebase' : config.ownerKey ? 'key' : 'none',
    firebase: config.firebaseWebConfig, // Firebase web config is public by design
    storage: config.storage,
  };
}
