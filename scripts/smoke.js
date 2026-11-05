// End-to-end smoke test in demo mode: owner -> CEO -> Research -> CEO ->
// Development -> CEO -> Social -> CEO completes the project.
import os from 'node:os';
import path from 'node:path';
process.env.AI_PROVIDER = 'demo';
process.env.STORAGE = 'file';
process.env.DATA_FILE = path.join(os.tmpdir(), `nafi-smoke-${Date.now()}.json`);
process.env.TURN_DELAY_MS = '50';
process.env.OWNER_ACCESS_KEY = '';
const { default: app } = await import('../server/index.js');
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
await post('/command', { text: 'CEO, create a new website project for a Malaysian bakery.' });
const deadline = Date.now() + 90000;
let state;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 1000));
  state = await fetch(base + '/state').then((r) => r.json());
  if (state.projects.some((p) => p.status === 'completed')) break;
}
const ok = state.projects.some((p) => p.status === 'completed');
console.log(`tasks: ${state.tasks.map((t) => `${t.assignedTo}:${t.status}`).join(', ')}`);
console.log(`messages: ${state.messages.length}, approvals: ${state.approvals.length}`);
console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
server.close();
process.exit(ok ? 0 : 1);
