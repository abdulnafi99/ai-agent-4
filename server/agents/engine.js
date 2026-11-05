// The orchestration engine: per-agent inboxes, a shared message bus, a
// central task manager, meetings, approvals and the CEO delegation chain.
// Every agent turn is a real inference call with the agent's own system prompt
// plus the shared workspace state; the model's JSON actions are applied to the
// shared store, which in turn wakes up other agents.
import { store, uid } from '../store.js';
import { config } from '../config.js';
import { AGENTS, AGENT_IDS, SHARED_PROTOCOL } from './definitions.js';
import { generate, modelFor } from '../ai/providers.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) + ' …[truncated]' : s || '');
const fmtTime = (t) => new Date(t).toISOString().slice(11, 16);
const nameOf = (id) => (id === 'owner' ? 'Owner (human)' : AGENTS[id]?.name || id);
const OPEN = new Set(['queued', 'in_progress', 'review']);

export class Engine {
  constructor() {
    this.inbox = new Map(AGENT_IDS.map((id) => [id, []]));
    this.busy = new Set();
    this.inMeeting = new Set();
    this.chainTurns = new Map();
    this.failures = new Map();
    this.lastStandup = Date.now();
  }

  // ---------------------------------------------------------------- setup
  init() {
    for (const id of AGENT_IDS) {
      const a = AGENTS[id];
      const existing = store.get('agents', id);
      store.upsert('agents', {
        id, name: a.name, title: a.title, department: a.department, color: a.color,
        personality: a.personality, responsibilities: a.responsibilities,
        status: 'idle', currentTaskId: null, thought: '',
        stats: existing?.stats || { turns: 0, tokensIn: 0, tokensOut: 0, tasksCompleted: 0, messagesSent: 0, errors: 0, totalLatency: 0 },
      });
    }
    if (!store.get('settings', 'system')) {
      store.insert('settings', { id: 'system', paused: false, standupMinutes: 0, agents: {} });
    }
    // Resume work interrupted by a restart.
    for (const t of store.list('tasks', (t) => OPEN.has(t.status))) {
      store.update('tasks', t.id, { status: 'queued' });
      this.enqueue(t.assignedTo, { kind: 'task', id: t.id, chainId: t.chainId || uid('chain') });
    }
    for (const m of store.list('meetings', (m) => m.status !== 'completed')) {
      store.update('meetings', m.id, { status: 'completed', summary: m.summary || 'Meeting interrupted by a system restart.' });
    }
    this.timer = setInterval(() => this.tick(), 350);
  }

  get settings() { return store.get('settings', 'system'); }
  agentSettings(id) { return this.settings?.agents?.[id] || {}; }

  log(agentId, type, text, meta = {}) {
    return store.insert('activity', { agentId, type, text, ...meta });
  }

  setState(agentId, patch) { store.update('agents', agentId, patch); }

  bumpStats(agentId, delta) {
    const a = store.get('agents', agentId);
    const stats = { ...a.stats };
    for (const [k, v] of Object.entries(delta)) stats[k] = (stats[k] || 0) + v;
    store.update('agents', agentId, { stats });
  }

  enqueue(agentId, trigger) {
    if (!this.inbox.has(agentId)) return;
    const q = this.inbox.get(agentId);
    if (!q.some((t) => t.kind === trigger.kind && t.id === trigger.id)) q.push(trigger);
  }

  // ------------------------------------------------------------- owner API
  ownerMessage(text, to = 'ceo') {
    if (!AGENTS[to]) throw new Error('Unknown agent');
    const chainId = uid('chain');
    const msg = store.insert('messages', { from: 'owner', to, kind: 'command', channel: 'direct', content: text, chainId });
    this.log('owner', 'command', `Owner → ${nameOf(to)}: ${clip(text, 140)}`);
    this.enqueue(to, { kind: 'message', id: msg.id, chainId });
    return msg;
  }

  ownerTask({ to, title, description }) {
    const chainId = uid('chain');
    return this.createTask({ from: 'owner', to, title, description, chainId, projectId: null });
  }

  decideApproval(id, decision, note = '') {
    const ap = store.get('approvals', id);
    if (!ap || ap.status !== 'pending') throw new Error('Approval not pending');
    const status = decision === 'approve' ? 'approved' : 'rejected';
    store.update('approvals', id, { status, note, decidedAt: Date.now() });
    const chainId = ap.chainId || uid('chain');
    this.chainTurns.set(chainId, 0); // owner input grants a fresh turn budget
    const msg = store.insert('messages', {
      from: 'owner', to: ap.requestedBy, kind: 'approval', channel: 'direct', chainId, projectId: ap.projectId,
      content: `Decision on "${ap.title}": ${status.toUpperCase()}${note ? ` — ${note}` : ''}`,
    });
    this.log('owner', 'approval', `Owner ${status} "${ap.title}"`);
    this.enqueue(ap.requestedBy, { kind: 'message', id: msg.id, chainId });
    return ap;
  }

  cancelTask(id) {
    const t = store.get('tasks', id);
    if (!t) throw new Error('Task not found');
    store.update('tasks', id, { status: 'cancelled' });
    for (const q of this.inbox.values()) {
      const i = q.findIndex((x) => x.kind === 'task' && x.id === id);
      if (i >= 0) q.splice(i, 1);
    }
    this.log('owner', 'task', `Task cancelled: ${t.title}`);
    this.refreshProject(t.projectId);
  }

  updateSettings(patch) {
    const cur = this.settings;
    const next = { ...cur };
    if (typeof patch.paused === 'boolean') next.paused = patch.paused;
    if (Number.isFinite(patch.standupMinutes)) next.standupMinutes = Math.max(0, Math.min(1440, patch.standupMinutes));
    if (patch.agents && typeof patch.agents === 'object') {
      next.agents = { ...cur.agents };
      for (const [id, s] of Object.entries(patch.agents)) {
        if (!AGENTS[id]) continue;
        next.agents[id] = {
          model: String(s.model || '').slice(0, 80),
          effort: ['', 'low', 'medium', 'high', 'xhigh', 'max'].includes(s.effort) ? s.effort : '',
          extra: String(s.extra || '').slice(0, 2000),
        };
      }
    }
    store.update('settings', 'system', next);
    this.lastStandup = Date.now();
    return store.get('settings', 'system');
  }

  // ---------------------------------------------------------- scheduling
  tick() {
    const s = this.settings;
    if (!s || s.paused) return;
    if (s.standupMinutes > 0 && Date.now() - this.lastStandup > s.standupMinutes * 60000 && this.inMeeting.size === 0) {
      this.lastStandup = Date.now();
      this.startMeeting({ topic: 'Daily stand-up: progress, blockers and priorities', participants: AGENT_IDS, by: 'ceo' });
    }
    for (const id of AGENT_IDS) {
      if (this.busy.size >= config.maxConcurrentAgents) return;
      if (this.busy.has(id) || this.inMeeting.has(id)) continue;
      if (this.inbox.get(id).length) this.runTurn(id);
    }
  }

  chainAllowed(chainId) {
    const n = this.chainTurns.get(chainId) || 0;
    if (n >= config.maxTurnsPerChain) return false;
    this.chainTurns.set(chainId, n + 1);
    return true;
  }

  // ------------------------------------------------------------- a turn
  async runTurn(agentId) {
    this.busy.add(agentId);
    const triggers = this.inbox.get(agentId).splice(0);
    const chainId = triggers[triggers.length - 1].chainId;
    try {
      if (!this.chainAllowed(chainId)) {
        this.log('system', 'limit', `Turn budget reached for a work chain (${config.maxTurnsPerChain} turns). Send a new instruction to continue.`);
        store.insert('messages', { from: 'system', to: 'owner', kind: 'system', channel: 'direct', chainId,
          content: `Autonomy limit reached for this chain (${config.maxTurnsPerChain} agent turns). ${nameOf(agentId)} paused this thread — send a new instruction to continue.` });
        return;
      }
      const events = this.resolveTriggers(agentId, triggers);
      if (!events.length) return;
      const taskEvents = events.filter((e) => e.kind === 'task');
      for (const e of taskEvents) {
        store.update('tasks', e.task.id, { status: 'in_progress', startedAt: e.task.startedAt || Date.now(), progress: Math.max(e.task.progress || 0, 10) });
      }
      const projectId = events.map((e) => e.projectId).filter(Boolean).pop() || null;
      this.setState(agentId, {
        status: taskEvents.length ? 'working' : 'thinking',
        currentTaskId: taskEvents[0]?.task.id || store.get('agents', agentId).currentTaskId,
        thought: taskEvents.length ? `Working on “${taskEvents[0].task.title}”` : 'Reading new messages…',
      });
      const result = await this.infer(agentId, { mode: 'inbox', events });
      await this.apply(agentId, result.json, { events, chainId, projectId });
      this.failures.delete(agentId);
    } catch (err) {
      this.handleError(agentId, err, triggers);
    } finally {
      this.busy.delete(agentId);
    }
  }

  async infer(agentId, ctx) {
    const s = this.agentSettings(agentId);
    const system = `${AGENTS[agentId].prompt}\n${s.extra ? `\nAdditional instructions from the owner:\n${s.extra}\n` : ''}${SHARED_PROTOCOL}`;
    const prompt = this.buildPrompt(agentId, ctx);
    const res = await generate({
      agentId, system, prompt, model: s.model || undefined, effort: s.effort || undefined,
      context: { ...ctx, agentId, state: this.stateFor(agentId) },
    });
    const json = normalise(res.json);
    this.bumpStats(agentId, { turns: 1, tokensIn: res.usage.in, tokensOut: res.usage.out, totalLatency: res.latencyMs });
    this.log(agentId, 'inference', `${nameOf(agentId)} completed a turn (${res.model}, ${res.latencyMs} ms)`, {
      model: res.model, latencyMs: res.latencyMs, tokensIn: res.usage.in, tokensOut: res.usage.out,
    });
    if (json.thought) this.setState(agentId, { thought: clip(json.thought, 240) });
    return { ...res, json };
  }

  resolveTriggers(agentId, triggers) {
    const events = [];
    for (const t of triggers) {
      if (t.kind === 'message') {
        const m = store.get('messages', t.id);
        if (m) events.push({ kind: 'message', message: m, projectId: m.projectId });
      } else if (t.kind === 'task') {
        const task = store.get('tasks', t.id);
        if (task && OPEN.has(task.status) && task.assignedTo === agentId) events.push({ kind: 'task', task, projectId: task.projectId });
      }
    }
    return events;
  }

  stateFor(agentId) {
    const tasks = store.list('tasks');
    return {
      myTasks: tasks.filter((t) => t.assignedTo === agentId && OPEN.has(t.status)),
      delegated: tasks.filter((t) => t.assignedBy === agentId && OPEN.has(t.status)),
      recentlyDone: tasks.filter((t) => t.assignedBy === agentId && t.status === 'completed').slice(-6),
      projects: store.list('projects', (p) => p.status === 'active'),
      approvals: store.list('approvals', (a) => a.status === 'pending'),
    };
  }

  buildPrompt(agentId, ctx) {
    const st = this.stateFor(agentId);
    const L = [];
    L.push(`# Workspace state — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
    L.push('## Team');
    for (const a of store.list('agents')) L.push(`- ${a.id}: ${a.name}, ${a.title} — currently ${a.status}`);
    L.push('## Active projects');
    L.push(st.projects.length ? st.projects.map((p) => `- [${p.id}] "${p.name}" — ${p.progress || 0}% — ${clip(p.description, 200)}`).join('\n') : '- none');
    L.push('## Your open tasks');
    L.push(st.myTasks.length ? st.myTasks.map((t) => `- [${t.id}] "${t.title}" from ${t.assignedBy} — ${t.status} ${t.progress || 0}%`).join('\n') : '- none');
    if (agentId === 'ceo' || st.delegated.length) {
      L.push('## Work you delegated (open)');
      L.push(st.delegated.length ? st.delegated.map((t) => `- [${t.id}] "${t.title}" → ${t.assignedTo} — ${t.status} ${t.progress || 0}%`).join('\n') : '- none');
      if (st.recentlyDone.length) {
        L.push('## Recently delivered to you');
        L.push(st.recentlyDone.map((t) => `- [${t.id}] "${t.title}" by ${t.assignedTo} — completed`).join('\n'));
      }
    }
    if (agentId === 'ceo' && st.approvals.length) {
      L.push('## Pending owner approvals');
      L.push(st.approvals.map((a) => `- "${a.title}" (waiting for owner)`).join('\n'));
    }
    const recent = store.list('messages', (m) => (m.from === agentId || m.to === agentId || m.to === 'all') && m.channel !== 'meeting').slice(-14);
    L.push('## Recent conversation involving you (oldest first)');
    L.push(recent.length ? recent.map((m) => `- ${fmtTime(m.createdAt)} ${m.from} → ${m.to}: ${clip(m.content, 500).replace(/\n+/g, ' ')}`).join('\n') : '- none');

    if (ctx.mode === 'inbox') {
      L.push('\n# New events for you');
      ctx.events.forEach((e, i) => {
        if (e.kind === 'message') {
          const m = e.message;
          const label = { command: 'INSTRUCTION', report: 'REPORT', help: 'HELP REQUEST', escalation: 'ESCALATION', approval: 'APPROVAL DECISION' }[m.kind] || 'MESSAGE';
          L.push(`${i + 1}. ${label} from ${m.from} (${nameOf(m.from)})${m.taskId ? ` about task [${m.taskId}]` : ''}:\n${clip(m.content, 9000)}`);
        } else {
          const t = e.task;
          L.push(`${i + 1}. TASK ASSIGNED to you [${t.id}] by ${t.assignedBy}${t.projectId ? ` (project ${t.projectId})` : ''}\nTitle: ${t.title}\nBrief:\n${clip(t.description, 6000)}\nComplete it now with complete_task (task_id "${t.id}") containing the full deliverable.`);
        }
      });
    } else if (ctx.mode === 'meeting' || ctx.mode === 'meeting-summary') {
      const m = ctx.meeting;
      L.push(`\n# You are in a team meeting\nTopic: ${m.topic}\nParticipants: ${m.participants.join(', ')}`);
      L.push('## Transcript so far');
      L.push(m.transcript.length ? m.transcript.map((x) => `${x.agentId}: ${clip(x.text, 1200)}`).join('\n') : '(you speak first)');
      L.push(ctx.mode === 'meeting'
        ? '\nGive your contribution in "reply" (2-5 sentences, in character, building on what others said). Only add actions if a concrete follow-up is clearly needed.'
        : '\nAs CEO, close the meeting: put a concise summary with decisions and owners in "reply", and use assign_task for each agreed follow-up.');
    }
    L.push('\nRespond with the JSON object now.');
    return L.join('\n');
  }

  // --------------------------------------------------------- apply actions
  async apply(agentId, json, { events, chainId, projectId, meetingId }) {
    const replyTo = pickReplyTarget(events);
    if (json.reply && !meetingId && replyTo) {
      this.setState(agentId, { status: 'talking' });
      this.sendMessage({ from: agentId, to: replyTo.to, content: json.reply, kind: 'chat', chainId, projectId, taskId: replyTo.taskId, wake: false });
    }
    let completed = false;
    let pid = projectId;
    for (const a of json.actions) {
      try {
        switch (a.type) {
          case 'create_project': {
            if (agentId !== 'ceo') break;
            const p = store.insert('projects', { name: a.title || 'Untitled project', description: a.content, status: 'active', progress: 0, owner: 'ceo', chainId });
            pid = p.id;
            this.log(agentId, 'project', `New project: ${p.name}`);
            break;
          }
          case 'assign_task':
            if (AGENTS[a.to] && a.to !== agentId) this.createTask({ from: agentId, to: a.to, title: a.title, description: a.content, chainId, projectId: pid });
            break;
          case 'message':
            if (a.to === 'owner' || (AGENTS[a.to] && a.to !== agentId)) this.sendMessage({ from: agentId, to: a.to, content: a.content, kind: 'chat', chainId, projectId: pid });
            break;
          case 'request_help':
            if (AGENTS[a.to] && a.to !== agentId) this.sendMessage({ from: agentId, to: a.to, content: a.content, kind: 'help', chainId, projectId: pid });
            break;
          case 'escalate':
            if (agentId !== 'ceo') {
              this.sendMessage({ from: agentId, to: 'ceo', content: a.content, kind: 'escalation', chainId, projectId: pid });
              this.log(agentId, 'escalation', `${nameOf(agentId)} escalated: ${clip(a.content, 120)}`);
            } else {
              this.sendMessage({ from: agentId, to: 'owner', content: a.content, kind: 'escalation', chainId, projectId: pid });
            }
            break;
          case 'progress': {
            const t = this.ownTask(agentId, a.task_id, events);
            if (t) {
              store.update('tasks', t.id, { progress: Math.max(1, Math.min(99, a.percent || t.progress)), lastNote: a.content });
              this.log(agentId, 'progress', `${nameOf(agentId)}: ${t.title} — ${a.percent}%${a.content ? ` (${clip(a.content, 80)})` : ''}`);
              this.refreshProject(t.projectId);
            }
            break;
          }
          case 'complete_task': {
            const t = this.ownTask(agentId, a.task_id, events);
            if (t) { this.completeTask(agentId, t, a.content, chainId); completed = true; }
            break;
          }
          case 'fail_task': {
            const t = this.ownTask(agentId, a.task_id, events);
            if (t) {
              store.update('tasks', t.id, { status: 'failed', result: a.content });
              this.sendMessage({ from: agentId, to: t.assignedBy, content: `I could not complete "${t.title}": ${a.content}`, kind: 'escalation', chainId, projectId: t.projectId, taskId: t.id });
              this.refreshProject(t.projectId);
            }
            break;
          }
          case 'call_meeting':
            if (agentId === 'ceo' && !meetingId) {
              const participants = [...new Set(['ceo', ...(a.participants || []).filter((p) => AGENTS[p])])];
              setTimeout(() => this.startMeeting({ topic: a.title || 'Team sync', participants, by: 'ceo', chainId }), 50);
            }
            break;
          case 'complete_project': {
            if (agentId !== 'ceo') break;
            const p = store.get('projects', a.task_id) || (pid && store.get('projects', pid));
            if (p && p.status !== 'completed') {
              store.update('projects', p.id, { status: 'completed', progress: 100, summary: a.content, completedAt: Date.now() });
              store.insert('documents', { title: `Executive summary — ${p.name}`, author: 'ceo', projectId: p.id, content: a.content, type: 'summary' });
              this.log(agentId, 'project', `Project completed: ${p.name}`);
              completed = true;
            }
            break;
          }
          case 'request_approval':
            if (agentId === 'ceo') {
              store.insert('approvals', { title: a.title || 'Decision', content: a.content, requestedBy: 'ceo', status: 'pending', chainId, projectId: pid });
              this.log(agentId, 'approval', `Approval requested: ${a.title}`);
            }
            break;
          default:
        }
      } catch (e) {
        console.error('[engine] action failed', a.type, e.message);
      }
    }
    // Any task the agent was given but neither completed nor reported on is
    // left in progress; nudge once so work does not stall silently.
    for (const e of events.filter((x) => x.kind === 'task')) {
      const t = store.get('tasks', e.task.id);
      if (t && t.status === 'in_progress' && !json.actions.some((a) => a.task_id === t.id)) {
        const nudges = (t.nudges || 0) + 1;
        store.update('tasks', t.id, { nudges });
        if (nudges <= 1) this.enqueue(agentId, { kind: 'task', id: t.id, chainId });
      }
    }
    if (!meetingId) {
      await sleep(config.turnDelayMs);
      this.setState(agentId, { status: completed ? 'completed' : (json.reply ? 'talking' : 'idle') });
      setTimeout(() => {
        const a = store.get('agents', agentId);
        if (a && ['completed', 'talking'].includes(a.status) && !this.busy.has(agentId) && !this.inMeeting.has(agentId)) {
          this.setState(agentId, { status: 'idle', currentTaskId: this.stateFor(agentId).myTasks[0]?.id || null });
        }
      }, completed ? 4500 : 3500);
    }
  }

  ownTask(agentId, taskId, events) {
    let t = taskId && store.get('tasks', taskId);
    if (!t) t = events.find((e) => e.kind === 'task')?.task; // tolerate slightly wrong ids
    return t && t.assignedTo === agentId && OPEN.has(store.get('tasks', t.id).status) ? store.get('tasks', t.id) : null;
  }

  sendMessage({ from, to, content, kind, chainId, projectId, taskId, wake = true, channel = 'direct', meetingId }) {
    if (!content) return null;
    const msg = store.insert('messages', { from, to, content, kind, channel, chainId, projectId: projectId || null, taskId: taskId || null, meetingId: meetingId || null });
    if (AGENTS[from]) this.bumpStats(from, { messagesSent: 1 });
    if (wake && AGENTS[to]) this.enqueue(to, { kind: 'message', id: msg.id, chainId });
    return msg;
  }

  createTask({ from, to, title, description, chainId, projectId }) {
    const task = store.insert('tasks', {
      title: clip(title || 'Untitled task', 140), description: description || '', assignedBy: from, assignedTo: to,
      status: 'queued', progress: 0, chainId, projectId: projectId || null, result: null,
    });
    this.sendMessage({ from, to, kind: 'task', content: `New task: ${task.title}\n\n${description || ''}`, chainId, projectId, taskId: task.id, wake: false });
    this.log(from, 'task', `${nameOf(from)} assigned “${task.title}” to ${nameOf(to)}`, { taskId: task.id });
    this.enqueue(to, { kind: 'task', id: task.id, chainId });
    this.refreshProject(projectId);
    return task;
  }

  completeTask(agentId, task, content, chainId) {
    const doc = store.insert('documents', { title: task.title, author: agentId, taskId: task.id, projectId: task.projectId, content, type: 'deliverable' });
    store.update('tasks', task.id, { status: 'completed', progress: 100, result: content, documentId: doc.id, completedAt: Date.now() });
    this.bumpStats(agentId, { tasksCompleted: 1 });
    this.log(agentId, 'complete', `${nameOf(agentId)} completed “${task.title}”`, { taskId: task.id });
    this.sendMessage({
      from: agentId, to: task.assignedBy, kind: 'report', taskId: task.id, projectId: task.projectId, chainId,
      content: `Completed task "${task.title}" [${task.id}].\n\n${content}`,
    });
    this.refreshProject(task.projectId);
  }

  refreshProject(projectId) {
    if (!projectId) return;
    const p = store.get('projects', projectId);
    if (!p || p.status === 'completed') return;
    const tasks = store.list('tasks', (t) => t.projectId === projectId && t.status !== 'cancelled');
    const progress = tasks.length ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / tasks.length) : 0;
    store.update('projects', projectId, { progress: Math.min(99, progress), taskCount: tasks.length });
  }

  handleError(agentId, err, triggers) {
    console.error(`[engine] ${agentId} turn failed:`, err.message);
    const n = (this.failures.get(agentId) || 0) + 1;
    this.failures.set(agentId, n);
    this.bumpStats(agentId, { errors: 1 });
    this.setState(agentId, { status: 'error', thought: clip(err.message, 200) });
    this.log(agentId, 'error', `${nameOf(agentId)} hit an error: ${clip(err.message, 160)}`);
    if (n < 3) {
      // Retry with backoff.
      setTimeout(() => triggers.forEach((t) => this.enqueue(agentId, t)), 4000 * n);
    } else {
      this.failures.delete(agentId);
      store.insert('messages', { from: 'system', to: 'owner', kind: 'system', channel: 'direct',
        content: `${nameOf(agentId)} failed 3 times in a row: ${clip(err.message, 300)}. Check Settings → AI provider.` });
      for (const t of triggers) if (t.kind === 'task') store.update('tasks', t.id, { status: 'failed', result: err.message });
    }
    setTimeout(() => { if (store.get('agents', agentId).status === 'error') this.setState(agentId, { status: 'idle' }); }, 8000);
  }

  // -------------------------------------------------------------- meetings
  async startMeeting({ topic, participants, by = 'owner', chainId = uid('chain') }) {
    const parts = [...new Set(['ceo', ...participants.filter((p) => AGENTS[p])])];
    if (parts.some((p) => this.inMeeting.has(p))) throw new Error('Some participants are already in a meeting');
    const meeting = store.insert('meetings', { topic: clip(topic, 200), participants: parts, calledBy: by, status: 'gathering', transcript: [], summary: '' });
    parts.forEach((p) => this.inMeeting.add(p));
    this.log(by, 'meeting', `Meeting called: ${meeting.topic}`, { meetingId: meeting.id });
    this.run(meeting.id, chainId).catch((e) => console.error('[meeting]', e));
    return meeting;
  }

  async run(meetingId, chainId) {
    let meeting = store.get('meetings', meetingId);
    const parts = meeting.participants;
    try {
      // Wait for agents to finish what they are doing, then walk to the meeting room.
      for (let i = 0; i < 120 && parts.some((p) => this.busy.has(p)); i++) await sleep(500);
      parts.forEach((p) => this.setState(p, { status: 'meeting', thought: `Meeting: ${meeting.topic}` }));
      await sleep(7000); // let avatars walk to the meeting room
      store.update('meetings', meetingId, { status: 'active', startedAt: Date.now() });
      const rounds = 2;
      for (let r = 0; r < rounds; r++) {
        for (const p of parts) {
          while (this.settings.paused) await sleep(1000);
          meeting = store.get('meetings', meetingId);
          this.setState(p, { status: 'talking' });
          const res = await this.infer(p, { mode: 'meeting', meeting });
          if (res.json.reply) this.addToTranscript(meetingId, p, res.json.reply, chainId);
          await this.apply(p, { ...res.json, actions: res.json.actions.filter((a) => a.type !== 'call_meeting' && a.type !== 'assign_task') }, { events: [], chainId, meetingId });
          this.setState(p, { status: 'meeting' });
          await sleep(config.turnDelayMs);
        }
      }
      meeting = store.get('meetings', meetingId);
      this.setState('ceo', { status: 'talking' });
      const res = await this.infer('ceo', { mode: 'meeting-summary', meeting });
      if (res.json.reply) this.addToTranscript(meetingId, 'ceo', res.json.reply, chainId);
      store.update('meetings', meetingId, { status: 'completed', summary: res.json.reply || 'Meeting concluded.', endedAt: Date.now() });
      store.insert('documents', { title: `Meeting minutes — ${meeting.topic}`, author: 'ceo', content: [
        `**Topic:** ${meeting.topic}`, `**Participants:** ${parts.map(nameOf).join(', ')}`, '', '## Transcript',
        ...store.get('meetings', meetingId).transcript.map((x) => `**${nameOf(x.agentId)}:** ${x.text}`), '', '## Summary', res.json.reply || '',
      ].join('\n'), type: 'minutes', meetingId });
      parts.forEach((p) => this.inMeeting.delete(p));
      await this.apply('ceo', { ...res.json, reply: '' }, { events: [], chainId, meetingId });
      this.log('ceo', 'meeting', `Meeting finished: ${meeting.topic}`, { meetingId });
    } catch (err) {
      store.update('meetings', meetingId, { status: 'completed', summary: `Meeting ended early: ${err.message}` });
      this.log('system', 'error', `Meeting failed: ${err.message}`);
    } finally {
      parts.forEach((p) => { this.inMeeting.delete(p); this.setState(p, { status: 'idle' }); });
    }
  }

  addToTranscript(meetingId, agentId, text, chainId) {
    const m = store.get('meetings', meetingId);
    store.update('meetings', meetingId, { transcript: [...m.transcript, { agentId, text, ts: Date.now() }] });
    this.sendMessage({ from: agentId, to: 'all', content: text, kind: 'meeting', channel: 'meeting', meetingId, chainId, wake: false });
  }

  summary() {
    const tasks = store.list('tasks');
    return {
      provider: modelFor('ceo'),
      online: AGENT_IDS.length,
      activeTasks: tasks.filter((t) => OPEN.has(t.status)).length,
      completedProjects: store.list('projects', (p) => p.status === 'completed').length,
      pendingApprovals: store.list('approvals', (a) => a.status === 'pending').length,
      meetings: store.list('meetings', (m) => m.status !== 'completed').length,
      queue: Object.fromEntries([...this.inbox].map(([k, v]) => [k, v.length])),
    };
  }
}

function pickReplyTarget(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === 'message' && e.message.from !== 'system') return { to: e.message.from, taskId: e.message.taskId };
    if (e.kind === 'task') return { to: e.task.assignedBy, taskId: e.task.id };
  }
  return null;
}

function normalise(json) {
  const out = { thought: String(json?.thought || ''), reply: String(json?.reply || ''), actions: [] };
  if (Array.isArray(json?.actions)) {
    for (const a of json.actions) {
      if (!a || typeof a.type !== 'string') continue;
      out.actions.push({
        type: a.type, to: String(a.to || '').toLowerCase().trim(), title: String(a.title || ''), content: String(a.content || ''),
        task_id: String(a.task_id || ''), percent: Number(a.percent) || 0, participants: Array.isArray(a.participants) ? a.participants.map(String) : [],
      });
    }
  }
  return out;
}

export const engine = new Engine();
