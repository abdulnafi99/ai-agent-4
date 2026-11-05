// Client-side mirror of the shared workspace, kept in sync by the SSE stream.
const listeners = new Map();

export const state = {
  agents: [], tasks: [], projects: [], approvals: [], meetings: [], messages: [], activity: [], documents: [],
  settings: null, summary: {}, profiles: {}, config: {},
};

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, payload) {
  listeners.get(evt)?.forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
  if (evt !== '*') listeners.get('*')?.forEach((fn) => fn(evt, payload));
}

export function load(snapshot) {
  Object.assign(state, snapshot);
  if (snapshot.settings === undefined) state.settings = null;
  emit('loaded', state);
}

const MAX = { messages: 600, activity: 400 };

export function applyEvent({ type, col, doc }) {
  if (type === 'summary') { state.summary = doc; emit('summary', doc); return; }
  if (type === 'reset') { location.reload(); return; }
  if (col === 'settings') { if (doc.id === 'system') state.settings = doc; emit('settings', doc); return; }
  const list = state[col];
  if (!list) return;
  const i = list.findIndex((d) => d.id === doc.id);
  const prev = i >= 0 ? { ...list[i] } : null;
  if (i >= 0) list[i] = { ...list[i], ...doc }; else list.push(doc);
  if (MAX[col] && list.length > MAX[col]) list.splice(0, list.length - MAX[col]);
  emit(col, { type, doc: i >= 0 ? list[i] : doc, prev });
  emit('change', { col, type, doc });
}

export const agentById = (id) => state.agents.find((a) => a.id === id);
export const OPEN = new Set(['queued', 'in_progress', 'review']);
export function computeSummary() {
  return {
    online: state.agents.length,
    activeTasks: state.tasks.filter((t) => OPEN.has(t.status)).length,
    completedProjects: state.projects.filter((p) => p.status === 'completed').length,
    pendingApprovals: state.approvals.filter((a) => a.status === 'pending').length,
    meetings: state.meetings.filter((m) => m.status !== 'completed').length,
  };
}
