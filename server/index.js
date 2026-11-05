// NAFI AI OFFICE — HTTP server: static frontend, REST API and a Server-Sent
// Events stream that pushes every change in the shared workspace to browsers.
import express from 'express';
import path from 'node:path';
import { config, publicConfig, ROOT } from './config.js';
import { store } from './store.js';
import { engine } from './agents/engine.js';
import { requireAuth } from './auth.js';
import { AGENTS } from './agents/definitions.js';

export async function createApp() {
  await store.init();
  engine.init();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/config', (_req, res) => res.json(publicConfig()));

  const api = express.Router();
  api.use(requireAuth);

  api.get('/state', (_req, res) => {
    const d = store.snapshot();
    res.json({
      agents: d.agents, tasks: d.tasks, projects: d.projects, approvals: d.approvals, meetings: d.meetings.slice(-30),
      messages: d.messages.slice(-400), activity: d.activity.slice(-300),
      documents: d.documents.map(({ content, ...rest }) => ({ ...rest, preview: (content || '').slice(0, 240) })),
      settings: d.settings.find((s) => s.id === 'system'), summary: engine.summary(), profiles: AGENTS,
    });
  });

  api.get('/documents/:id', (req, res) => {
    const doc = store.get('documents', req.params.id);
    doc ? res.json(doc) : res.status(404).json({ error: 'Not found' });
  });

  const text = (v, max = 8000) => {
    const s = String(v ?? '').trim();
    if (!s) throw Object.assign(new Error('Text is required'), { status: 400 });
    return s.slice(0, max);
  };

  api.post('/command', (req, res) => res.json(engine.ownerMessage(text(req.body.text), 'ceo')));
  api.post('/agents/:id/message', (req, res) => res.json(engine.ownerMessage(text(req.body.text), req.params.id)));
  api.post('/tasks', (req, res) => {
    if (!AGENTS[req.body.to]) return res.status(400).json({ error: 'Unknown agent' });
    res.json(engine.ownerTask({ to: req.body.to, title: text(req.body.title, 140), description: text(req.body.description) }));
  });
  api.post('/tasks/:id/cancel', (req, res) => { engine.cancelTask(req.params.id); res.json({ ok: true }); });
  api.post('/meetings', async (req, res) => {
    const participants = Array.isArray(req.body.participants) ? req.body.participants : Object.keys(AGENTS);
    res.json(await engine.startMeeting({ topic: text(req.body.topic, 200), participants, by: 'owner' }));
  });
  api.post('/approvals/:id', (req, res) => res.json(engine.decideApproval(req.params.id, req.body.decision, String(req.body.note || '').slice(0, 500))));
  api.put('/settings', (req, res) => res.json(engine.updateSettings(req.body || {})));
  api.post('/reset', async (_req, res) => {
    await store.reset();
    engine.inbox.forEach((q) => q.splice(0));
    engine.init();
    res.json({ ok: true });
  });

  // Live updates via SSE.
  api.get('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const send = (evt) => {
      let doc = evt.doc;
      if (evt.col === 'documents' && doc) doc = { ...doc, preview: (doc.content || '').slice(0, 240), content: undefined };
      res.write(`data: ${JSON.stringify({ type: evt.type, col: evt.col, doc })}\n\n`);
    };
    const off = store.onChange(send);
    const ping = setInterval(() => res.write(`event: ping\ndata: ${JSON.stringify(engine.summary())}\n\n`), 15000);
    req.on('close', () => { off(); clearInterval(ping); });
  });

  app.use('/api', api);
  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '1h' }));

  app.use((err, _req, res, _next) => {
    res.status(err.status || 400).json({ error: err.message || 'Request failed' });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'server', 'index.js')) {
  const app = await createApp();
  app.listen(config.port, () => {
    console.log(`\n  NAFI AI OFFICE running at http://localhost:${config.port}`);
    console.log(`  AI provider: ${config.provider}${config.provider === 'demo' ? ' (set ANTHROPIC_API_KEY for real inference)' : ''}`);
    console.log(`  Storage: ${config.storage}\n`);
  });
}
