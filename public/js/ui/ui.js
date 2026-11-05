// Interface layer: navigation, side panel views, CEO command center,
// live feed, notifications and dialogs. Panels refresh only their live
// regions so forms are never wiped while the owner is typing.
import { state, on, agentById, OPEN, computeSummary } from '../state.js';
import { api } from '../api.js';
import { markdown, esc } from './markdown.js';

const $ = (s, el = document) => el.querySelector(s);
const nameOf = (id) => (id === 'owner' ? 'You' : id === 'all' ? 'Everyone' : id === 'system' ? 'System' : agentById(id)?.name || id);
const short = (id) => (id === 'owner' ? 'YOU' : id === 'system' ? 'SYS' : { ceo: 'CEO', research: 'RES', development: 'DEV', social: 'SOC', security: 'SEC' }[id] || '?');
const colorOf = (id) => (id === 'owner' ? '#e5e7eb' : id === 'system' ? '#f59e0b' : agentById(id)?.color || '#94a3b8');
const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(t).toLocaleDateString(); };
const pill = (status) => `<span class="status-pill ${esc(status)}">${esc(String(status).replace('_', ' '))}</span>`;
const progress = (p) => `<div class="progress" role="progressbar" aria-valuenow="${p || 0}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p || 0}%"></i></div>`;
const avatar = (id, cls = 'av') => `<div class="${cls}" style="background:${colorOf(id)}">${short(id)}</div>`;
const empty = (t) => `<div class="empty">${esc(t)}</div>`;

let world = null;
let current = { view: 'office', arg: null, local: {} };

// ======================================================================
// Views: render(arg, local) -> shell HTML with data-live regions;
//        live(arg, local)   -> { region: html }
// ======================================================================
const views = {
  agents: {
    title: () => 'AI Employees',
    render: () => '<div data-live="list"></div>',
    live: () => ({
      list: state.agents.map((a) => {
        const task = state.tasks.find((t) => t.id === a.currentTaskId);
        return `<div class="card clickable" data-action="agent" data-id="${a.id}">
          <div class="agent-head">${avatar(a.id, 'avatar-badge')}<div style="flex:1;min-width:0"><h3>${esc(a.name)}</h3><div class="meta">${esc(a.title)} · ${esc(a.department)}</div><div class="meta">AI: ${esc(aiOf(a.id))}</div></div>${pill(a.status)}</div>
          ${task ? `<div class="meta" style="margin-top:8px">Working on: ${esc(task.title)}</div>${progress(task.progress)}` : ''}
          ${a.thought && a.status !== 'idle' ? `<div class="thought">${esc(a.thought)}</div>` : ''}
          <div class="meta" style="margin-top:6px">${a.stats.tasksCompleted} tasks done · ${a.stats.messagesSent} messages · ${a.stats.turns} AI turns</div>
        </div>`;
      }).join(''),
    }),
  },

  agent: {
    title: (id) => agentById(id)?.department || 'Agent',
    render: (id) => {
      const p = state.profiles[id] || {};
      return `<div data-live="head"></div>
        <div class="form-row" style="margin:12px 0">
          <button class="btn sm" data-action="follow" data-id="${id}">◎ Follow</button>
          <button class="btn sm" data-action="desk" data-id="${id}">Desk tasks</button>
          <button class="btn sm" data-action="computer" data-id="${id}">Workspace</button>
        </div>
        <div class="section-title">Personality</div><p class="muted" style="margin:0">${esc(p.personality || '')}</p>
        <div class="section-title">Responsibilities</div><div class="tag-list">${(p.responsibilities || []).map((r) => `<span>${esc(r)}</span>`).join('')}</div>
        <div class="section-title">Performance</div><div data-live="stats"></div>
        <div class="section-title">Direct message</div>
        <form data-form="dm" data-id="${id}"><textarea name="text" rows="2" placeholder="${id === 'ceo' ? 'Give the CEO an instruction…' : `Message ${esc(agentById(id)?.name || id)} directly…`}" required maxlength="4000"></textarea><button class="btn primary sm" style="margin-top:6px">Send</button></form>
        <div class="section-title">Recent conversation</div><div data-live="msgs"></div>
        <div class="section-title">Activity log</div><div data-live="activity"></div>`;
    },
    live: (id) => {
      const a = agentById(id); if (!a) return {};
      const task = state.tasks.find((t) => t.id === a.currentTaskId);
      const s = a.stats;
      return {
        head: `<div class="agent-head">${avatar(id, 'avatar-badge')}<div style="flex:1"><h3 style="margin:0">${esc(a.name)}</h3><div class="meta">${esc(a.title)}</div><div class="meta">AI: ${esc(aiOf(id))}</div></div>${pill(a.status)}</div>
          ${a.thought && a.status !== 'idle' ? `<div class="thought">${esc(a.thought)}</div>` : ''}
          ${task ? `<div class="card"><div class="meta">Current task</div><h3>${esc(task.title)}</h3>${progress(task.progress)}</div>` : ''}`,
        stats: `<div class="kv">
          <div><b>${s.tasksCompleted}</b><small>Tasks completed</small></div><div><b>${s.messagesSent}</b><small>Messages sent</small></div>
          <div><b>${s.turns}</b><small>AI turns</small></div><div><b>${s.turns ? Math.round(s.totalLatency / s.turns / 100) / 10 : 0}s</b><small>Avg response</small></div>
          <div><b>${fmtNum(s.tokensIn + s.tokensOut)}</b><small>Tokens used</small></div><div><b>${s.errors}</b><small>Errors</small></div></div>`,
        msgs: messageList(state.messages.filter((m) => m.from === id || m.to === id).slice(-12)) || empty('No messages yet.'),
        activity: activityList(state.activity.filter((x) => x.agentId === id).slice(-15).reverse()) || empty('No activity yet.'),
      };
    },
  },

  tasks: {
    title: (agent) => (agent ? `${agentById(agent)?.name || agent} · Tasks` : 'Task Manager'),
    render: (agent, local) => `
      <div class="tabs" data-tabs="filter">${['active', 'completed', 'all'].map((f) => `<button data-action="filter" data-id="${f}" class="${(local.filter || 'active') === f ? 'active' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
      <details class="card"><summary style="cursor:pointer;font-weight:600">＋ New task</summary>
        <form data-form="task">
          <label>Assign to</label><select name="to">${state.agents.map((a) => `<option value="${a.id}" ${a.id === agent ? 'selected' : ''}>${esc(a.name)} — ${esc(a.title)}</option>`).join('')}</select>
          <label>Title</label><input name="title" required maxlength="140" style="width:100%">
          <label>Brief</label><textarea name="description" required maxlength="8000" placeholder="Goal, context, expected deliverable…"></textarea>
          <button class="btn primary sm" style="margin-top:8px">Assign task</button>
        </form></details>
      <div data-live="list"></div>`,
    live: (agent, local) => {
      const f = local.filter || 'active';
      let list = state.tasks.filter((t) => !agent || t.assignedTo === agent);
      list = f === 'active' ? list.filter((t) => OPEN.has(t.status)) : f === 'completed' ? list.filter((t) => t.status === 'completed') : list;
      list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      return { list: list.map(taskCard).join('') || empty(f === 'active' ? 'No active tasks. Instruct the CEO to get the team working.' : 'No tasks here yet.') };
    },
  },

  computer: {
    title: (id) => `${agentById(id)?.name?.split(' ').slice(-1)[0] || id}'s workspace`,
    render: () => '<div data-live="screen"></div><div class="section-title">Documents</div><div data-live="docs"></div><div class="section-title">Latest deliverable</div><div data-live="latest"></div>',
    live: (id) => {
      const a = agentById(id);
      const task = state.tasks.find((t) => t.id === a?.currentTaskId);
      const docs = state.documents.filter((d) => d.author === id).slice().reverse();
      const latest = state.tasks.filter((t) => t.assignedTo === id && t.status === 'completed').sort((x, y) => y.completedAt - x.completedAt)[0];
      return {
        screen: `<div class="screen-mock">${esc(`> ${a?.name} — ${a?.status?.toUpperCase()}\n`)}${task ? esc(`> task: ${task.title} (${task.progress}%)\n`) : '> no active task\n'}${a?.thought ? esc(`> ${a.thought}`) : ''}${a?.status === 'working' || a?.status === 'thinking' ? '<span class="live-dot" style="display:inline-block;margin-left:6px"></span>' : ''}</div>`,
        docs: docs.map(docCard).join('') || empty('No documents yet.'),
        latest: latest ? `<div class="card"><h3>${esc(latest.title)}</h3>${markdown(latest.result || '')}</div>` : empty('Nothing delivered yet.'),
      };
    },
  },

  comms: {
    title: () => 'Communication',
    render: (_a, local) => `
      <div class="form-row" style="margin-bottom:10px"><button class="btn sm" data-action="meeting-dialog">Start AI meeting</button></div>
      <div class="tabs">${[['all', 'All'], ['agents', 'Agent ↔ Agent'], ['owner', 'With you'], ['meetings', 'Meetings']].map(([k, l]) => `<button data-action="filter" data-id="${k}" class="${(local.filter || 'all') === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div data-live="list"></div>`,
    live: (_a, local) => {
      const f = local.filter || 'all';
      if (f === 'meetings') {
        const ms = [...state.meetings].reverse();
        return { list: ms.map((m) => `<div class="card"><div class="meta">${pill(m.status)} ${ago(m.createdAt)} · ${m.participants.map(nameOf).join(', ')}</div><h3 style="margin-top:6px">${esc(m.topic)}</h3>
          ${m.transcript.map((x) => `<div class="msg">${avatar(x.agentId)}<div class="body"><div class="who"><b>${esc(nameOf(x.agentId))}</b><time>${time(x.ts)}</time></div><div class="bubble">${markdown(x.text)}</div></div></div>`).join('')}
          ${m.summary ? `<div class="thought">${esc(m.summary)}</div>` : ''}</div>`).join('') || empty('No meetings yet. Click the glass meeting room or start one here.') };
      }
      let msgs = state.messages;
      if (f === 'agents') msgs = msgs.filter((m) => m.from !== 'owner' && m.to !== 'owner' && m.from !== 'system');
      if (f === 'owner') msgs = msgs.filter((m) => m.from === 'owner' || m.to === 'owner');
      return { list: messageList(msgs.slice(-80)) || empty('No conversations yet. Send the CEO an instruction below.') };
    },
    scrollBottom: true,
  },

  projects: {
    title: () => 'Projects',
    render: () => '<div data-live="approvals"></div><div class="section-title">Active</div><div data-live="active"></div><div class="section-title">Completed</div><div data-live="done"></div>',
    live: () => {
      const pending = state.approvals.filter((a) => a.status === 'pending');
      const proj = (p) => {
        const tasks = state.tasks.filter((t) => t.projectId === p.id);
        const docs = state.documents.filter((d) => d.projectId === p.id);
        return `<div class="card"><div class="meta">${pill(p.status)} started ${ago(p.createdAt)}</div><h3 style="margin-top:6px">${esc(p.name)}</h3>
          <p class="muted" style="margin:4px 0;font-size:12.5px">${esc((p.description || '').slice(0, 220))}</p>${progress(p.progress)}
          ${tasks.length ? `<div class="section-title">Tasks</div>${tasks.map((t) => `<div class="meta" style="margin-bottom:4px">${pill(t.status)} ${esc(t.title)} → ${esc(nameOf(t.assignedTo))}</div>`).join('')}` : ''}
          ${docs.length ? `<div class="section-title">Documents</div>${docs.map(docCard).join('')}` : ''}
          ${p.summary ? `<div class="section-title">Executive summary</div>${markdown(p.summary)}` : ''}</div>`;
      };
      return {
        approvals: pending.length ? `<div class="section-title">Pending approvals</div>${pending.map(approvalCard).join('')}` : '',
        active: state.projects.filter((p) => p.status === 'active').reverse().map(proj).join('') || empty('No active projects. Try “CEO, create a new website project”.'),
        done: state.projects.filter((p) => p.status === 'completed').reverse().map(proj).join('') || empty('None yet.'),
      };
    },
  },

  analytics: {
    title: () => 'Analytics',
    render: () => '<div data-live="totals"></div><div data-live="charts"></div><div class="section-title">Activity log</div><div data-live="log"></div>',
    live: () => {
      const tasks = state.tasks;
      const done = tasks.filter((t) => t.status === 'completed');
      const avgMin = done.length ? done.reduce((s, t) => s + ((t.completedAt || t.updatedAt) - t.createdAt), 0) / done.length / 60000 : 0;
      const tokens = state.agents.reduce((s, a) => s + a.stats.tokensIn + a.stats.tokensOut, 0);
      const metric = (title, fn, fmt = (v) => v) => {
        const vals = state.agents.map((a) => ({ a, v: fn(a) }));
        const max = Math.max(1, ...vals.map((x) => x.v));
        return `<div class="section-title">${title}</div><div class="chart" role="table" aria-label="${title}">${vals.map(({ a, v }) => `<div class="bar-row" role="row" title="${esc(a.name)}: ${fmt(v)}"><span class="name" role="cell">${esc(a.name.split(' ').slice(-1)[0])}</span><span class="track"><span class="fill" style="width:${(v / max) * 100}%"></span></span><span class="val" role="cell">${fmt(v)}</span></div>`).join('')}</div>`;
      };
      return {
        totals: `<div class="kv"><div><b>${tasks.length}</b><small>Total tasks</small></div><div><b>${tasks.length ? Math.round((done.length / tasks.length) * 100) : 0}%</b><small>Completion rate</small></div>
          <div><b>${avgMin.toFixed(1)}m</b><small>Avg task time</small></div><div><b>${state.messages.length}</b><small>Messages</small></div>
          <div><b>${state.meetings.length}</b><small>Meetings</small></div><div><b>${fmtNum(tokens)}</b><small>Tokens</small></div></div>`,
        charts: metric('Tasks completed', (a) => a.stats.tasksCompleted)
          + metric('Messages sent', (a) => a.stats.messagesSent)
          + metric('AI turns', (a) => a.stats.turns)
          + metric('Avg response time (s)', (a) => (a.stats.turns ? Math.round(a.stats.totalLatency / a.stats.turns / 100) / 10 : 0), (v) => `${v}s`),
        log: activityList(state.activity.slice(-60).reverse()) || empty('No activity yet.'),
      };
    },
  },

  settings: {
    title: () => 'Settings',
    render: () => {
      const s = state.settings || { agents: {} };
      const c = state.config;
      const q = (() => { try { return localStorage.getItem('nafi.quality') || 'auto'; } catch { return 'auto'; } })();
      return `
      <div class="section-title">AI provider</div>
      <div class="card"><div class="meta">Default provider</div><h3>${esc(PROVIDER_LABEL[c.provider] || c.provider)}${c.demo ? ' <span class="badge warn">Demo mode</span>' : ' <span class="badge ok">Live inference</span>'}</h3>
        <div class="meta">Storage: ${esc(c.storage)} · Auth: ${esc(c.auth)} · Keys set: ${esc((c.available || []).map((p) => PROVIDER_LABEL[p]).join(', ') || 'none')}</div>
        ${state.agents.map((a) => `<div class="meta" style="margin-top:4px"><b style="color:var(--text)">${esc(a.name)}</b> → ${esc(aiOf(a.id))}</div>`).join('')}
        <p class="muted" style="font-size:12px;margin:8px 0 0">API keys are configured on the server and never sent to the browser. Each agent can use a different AI below; that provider's key must be set on the server.</p></div>
      <div class="section-title">Autonomy</div>
      <div class="card">
        <div class="toggle"><span>Agents running</span><button class="btn sm" data-action="pause">${s.paused ? '▶ Resume' : '⏸ Pause'}</button></div>
        <label>Automatic stand-up meeting every (minutes, 0 = off)</label><input type="number" min="0" max="1440" id="set-standup" value="${s.standupMinutes || 0}">
      </div>
      <div class="section-title">Agent configuration</div>
      ${state.agents.map((a) => { const o = s.agents?.[a.id] || {}; return `<details class="card"><summary style="cursor:pointer"><b>${esc(a.name)}</b> <span class="muted">· ${esc(a.title)}</span></summary>
        <label>AI provider</label><select data-agent="${a.id}" data-k="provider" style="width:100%">${[['', 'Server default'], ['anthropic', 'Claude (Anthropic)'], ['openai', 'ChatGPT (OpenAI)'], ['gemini', 'Gemini (Google)']].map(([v, l]) => `<option value="${v}" ${(o.provider || '') === v ? 'selected' : ''}>${l}${v && !(c.available || []).includes(v) ? ' — key not set' : ''}</option>`).join('')}</select>
        <div class="form-row"><div><label>Model override</label><input data-agent="${a.id}" data-k="model" value="${esc(o.model || '')}" placeholder="provider default" style="width:100%"></div>
        <div><label>Effort (Claude)</label><select data-agent="${a.id}" data-k="effort">${['', 'low', 'medium', 'high', 'xhigh', 'max'].map((e) => `<option value="${e}" ${o.effort === e ? 'selected' : ''}>${e || 'default'}</option>`).join('')}</select></div></div>
        <label>Extra instructions</label><textarea data-agent="${a.id}" data-k="extra" rows="3" placeholder="e.g. Always answer in Bahasa Malaysia and English.">${esc(o.extra || '')}</textarea></details>`; }).join('')}
      <button class="btn primary" data-action="save-settings" style="width:100%;margin-top:6px">Save AI settings</button>
      <div class="section-title">Graphics</div>
      <div class="card">
        <label>Rendering quality</label><select id="set-quality">${['auto', 'high', 'medium', 'low'].map((x) => `<option ${q === x ? 'selected' : ''} value="${x}">${x === 'low' ? 'low (simplified, for older devices)' : x}</option>`).join('')}</select>
        <label>Lighting</label><select id="set-daymode">${[['auto', 'Follow local time'], ['day', 'Day'], ['night', 'Night'], ['cycle', 'Day/night cycle']].map(([v, l]) => `<option value="${v}" ${world?.dayMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <p class="muted" style="font-size:12px">Current frame rate: <span data-live="fps"></span></p>
      </div>
      <div class="section-title">Danger zone</div>
      <button class="btn danger" data-action="reset" style="width:100%">Reset workspace (delete all history)</button>`;
    },
    live: () => ({ fps: world?.fps ? `${world.fps} fps` : 'measuring…' }),
  },
};

const PROVIDER_LABEL = { anthropic: 'Claude', openai: 'ChatGPT', gemini: 'Gemini', demo: 'Demo' };
function aiOf(id) {
  const ai = state.summary.ai?.[id];
  return ai ? `${PROVIDER_LABEL[ai.provider] || ai.provider} · ${ai.model}` : '—';
}

function fmtNum(n) { return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n || 0); }

function messageList(msgs) {
  return msgs.map((m) => {
    const long = (m.content || '').length > 420;
    const kind = { task: 'task', report: 'report', help: 'help', escalation: 'escalation', approval: 'decision', command: 'instruction', meeting: 'meeting', system: 'system' }[m.kind] || '';
    return `<div class="msg kind-${esc(m.kind)}">${avatar(m.from)}<div class="body"><div class="who"><b>${esc(nameOf(m.from))}</b> → ${esc(nameOf(m.to))}${kind ? `<span class="kind-label">${kind}</span>` : ''}<time>${time(m.createdAt)}</time></div>
      <div class="bubble"><div class="${long ? 'collapsible' : ''}">${markdown(m.content)}</div>${long ? '<button class="more-btn" data-action="expand">Show more</button>' : ''}</div></div></div>`;
  }).join('');
}

function activityList(items) {
  if (!items.length) return '';
  return `<ul class="activity">${items.map((x) => `<li class="${x.type === 'error' ? 'error' : ''}"><time>${time(x.createdAt)}</time><span>${esc(x.text)}</span></li>`).join('')}</ul>`;
}

function taskCard(t) {
  return `<div class="card"><div class="meta">${pill(t.status)} ${esc(nameOf(t.assignedBy))} → <b style="color:var(--text)">${esc(nameOf(t.assignedTo))}</b> · ${ago(t.createdAt)}</div>
    <h3 style="margin-top:6px">${esc(t.title)}</h3>${progress(t.progress)}
    <div class="meta" style="margin-top:6px">${t.progress || 0}% ${t.lastNote ? `· ${esc(t.lastNote)}` : ''}</div>
    <details style="margin-top:6px"><summary class="meta" style="cursor:pointer">Details</summary><div style="font-size:12.5px">${markdown(t.description || '')}</div>
    ${t.result ? `<div class="section-title">Result</div>${markdown(t.result)}` : ''}</details>
    ${OPEN.has(t.status) ? `<button class="btn sm danger" style="margin-top:8px" data-action="cancel-task" data-id="${t.id}">Cancel</button>` : ''}</div>`;
}

function docCard(d) {
  return `<div class="card clickable" data-action="doc" data-id="${d.id}"><div class="meta">${esc(d.type || 'document')} · ${esc(nameOf(d.author))} · ${ago(d.createdAt)}</div><h3 style="margin-top:4px;font-size:13px">${esc(d.title)}</h3></div>`;
}

function approvalCard(a) {
  return `<div class="approval"><b>${esc(a.title)}</b><div class="muted">${esc((a.content || '').slice(0, 260))}</div>
    <div class="row"><button class="btn sm primary" data-action="approve" data-id="${a.id}">Approve</button><button class="btn sm" data-action="reject" data-id="${a.id}">Reject</button></div></div>`;
}

// ======================================================================
// Panel management
// ======================================================================
export function openView(view, arg = null) {
  if (view === 'office') return closePanel();
  current = { view, arg, local: current.view === view && current.arg === arg ? current.local : {} };
  const v = views[view];
  $('#panel-title').textContent = v.title(arg);
  $('#panel-body').innerHTML = v.render(arg, current.local);
  fillLive(true);
  $('#panel').classList.add('open');
  document.body.classList.add('panel-open');
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === (['agent', 'computer'].includes(view) ? 'agents' : view)));
  if (v.scrollBottom) requestAnimationFrame(() => { const b = $('#panel-body'); b.scrollTop = b.scrollHeight; });
}

function closePanel() {
  current = { view: 'office', arg: null, local: {} };
  $('#panel').classList.remove('open');
  document.body.classList.remove('panel-open');
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === 'office'));
  world?.followAgent(null);
}

function fillLive(force = false) {
  const v = views[current.view];
  if (!v?.live) return;
  const body = $('#panel-body');
  const nearBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
  const regions = v.live(current.arg, current.local);
  for (const [k, html] of Object.entries(regions)) {
    const el = body.querySelector(`[data-live="${k}"]`);
    if (!el) continue;
    // keep expanded/collapsed details state where possible
    const openDetails = [...el.querySelectorAll('details[open]')].map((d) => d.parentElement?.querySelector('h3')?.textContent);
    if (force || el._html !== html) {
      el.innerHTML = html; el._html = html;
      el.querySelectorAll('details').forEach((d) => { if (openDetails.includes(d.parentElement?.querySelector('h3')?.textContent)) d.open = true; });
    }
  }
  if (v.scrollBottom && nearBottom) body.scrollTop = body.scrollHeight;
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { fillLive(); renderMetrics(); }, 200);
}

// ======================================================================
// Dialogs
// ======================================================================
export function modal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); }

export function openMeetingDialog() {
  modal('Start an AI team meeting', `<form data-form="meeting">
    <label>Topic</label><input name="topic" required maxlength="200" style="width:100%" value="Weekly sync: priorities, blockers and next steps">
    <label>Participants</label>${state.agents.map((a) => `<label style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" name="p" value="${a.id}" checked ${a.id === 'ceo' ? 'disabled' : ''}> ${esc(a.name)} <span class="muted">· ${esc(a.title)}</span></label>`).join('')}
    <p class="muted" style="font-size:12px">Agents walk to the glass meeting room and discuss the topic in turns with real AI inference. The CEO closes with a summary and follow-up tasks.</p>
    <button class="btn primary" style="width:100%">Start meeting</button></form>`);
}

async function openDocument(id) {
  modal('Loading…', '<div class="empty">Loading document…</div>');
  try {
    const d = await api(`/documents/${id}`);
    modal(d.title, `<div class="meta" style="margin-bottom:10px">${esc(d.type)} · by ${esc(nameOf(d.author))} · ${new Date(d.createdAt).toLocaleString()}</div>${markdown(d.content)}`);
  } catch (e) { modal('Error', empty(e.message)); }
}

// ======================================================================
// Toasts, metrics, feed, command bar
// ======================================================================
export function toast(text, color = '#10b981', ms = 4500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="t-dot" style="background:${color}"></span><span>${esc(text)}</span>`;
  $('#toasts').appendChild(el);
  const all = $('#toasts').children; if (all.length > 4) all[0].remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

function renderMetrics() {
  const s = computeSummary();
  $('#m-online').textContent = s.online; $('#m-tasks').textContent = s.activeTasks;
  $('#m-projects').textContent = s.completedProjects; $('#m-approvals').textContent = s.pendingApprovals; $('#m-meetings').textContent = s.meetings;
  const chips = state.agents.map((a) => {
    const task = state.tasks.find((t) => t.id === a.currentTaskId);
    return `<button class="agent-chip" data-action="agent" data-id="${a.id}"><span class="dot" style="background:${a.color}"></span><span class="info"><b>${esc(a.name)}</b><small>${esc(task ? task.title : a.title)}</small></span>${pill(a.status)}</button>`;
  }).join('');
  if ($('#agent-chips')._html !== chips) { $('#agent-chips').innerHTML = chips; $('#agent-chips')._html = chips; }
  const pending = state.approvals.filter((a) => a.status === 'pending');
  const ap = pending.length ? `<div class="metrics-head" style="color:var(--warn)">Pending approval</div>${pending.slice(-2).map(approvalCard).join('')}` : '';
  if ($('#approvals-box')._html !== ap) { $('#approvals-box').innerHTML = ap; $('#approvals-box')._html = ap; }
}

function renderFeed() {
  const items = state.messages.filter((m) => m.kind !== 'task').slice(-4).reverse();
  $('#feed-list').innerHTML = items.map((m) => `<li data-action="comms"><b>${esc(nameOf(m.from).split(' ').slice(-1)[0])}</b> <span class="arrow">→</span> <b>${esc(nameOf(m.to).split(' ').slice(-1)[0])}</b>: ${esc((m.content || '').replace(/[#*`|]/g, '').slice(0, 90))}${m.content.length > 90 ? '…' : ''}</li>`).join('') || '<li>Waiting for the team to start talking…</li>';
}

function showCeoReply(m) {
  const el = $('#ceo-reply');
  el.innerHTML = `<b>${esc(agentById('ceo')?.name || 'CEO')}:</b> ${esc(m.content.replace(/[#*`]/g, '').slice(0, 400))}`;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 20000);
}

// ======================================================================
// Event wiring
// ======================================================================
async function handleAction(action, id, el) {
  try {
    switch (action) {
      case 'agent': openView('agent', id); world.focus(id); break;
      case 'desk': openView('tasks', id); break;
      case 'computer': openView('computer', id); break;
      case 'follow': world.followAgent(id); toast(`Camera following ${nameOf(id)}`); break;
      case 'doc': openDocument(id); break;
      case 'comms': openView('comms'); break;
      case 'filter': current.local.filter = id; openView(current.view, current.arg); break;
      case 'expand': { const c = el.previousElementSibling; c.classList.toggle('expanded'); el.textContent = c.classList.contains('expanded') ? 'Show less' : 'Show more'; break; }
      case 'cancel-task': await api(`/tasks/${id}/cancel`, { method: 'POST' }); toast('Task cancelled', '#f59e0b'); break;
      case 'approve': case 'reject': await api(`/approvals/${id}`, { method: 'POST', body: { decision: action } }); toast(action === 'approve' ? 'Approved — CEO notified' : 'Rejected — CEO notified', action === 'approve' ? '#10b981' : '#f59e0b'); break;
      case 'meeting-dialog': openMeetingDialog(); break;
      case 'pause': await api('/settings', { method: 'PUT', body: { paused: !state.settings?.paused } }); openView('settings'); break;
      case 'save-settings': {
        const agents = {};
        document.querySelectorAll('[data-agent]').forEach((f) => { (agents[f.dataset.agent] ||= {})[f.dataset.k] = f.value; });
        await api('/settings', { method: 'PUT', body: { agents, standupMinutes: Number($('#set-standup').value) || 0 } });
        toast('Settings saved');
        break;
      }
      case 'reset':
        if (confirm('Delete all tasks, messages, projects and history? This cannot be undone.')) await api('/reset', { method: 'POST' });
        break;
      default:
    }
  } catch (e) { toast(e.message, '#f87171'); }
}

async function handleForm(form) {
  const kind = form.dataset.form;
  const data = new FormData(form);
  const btn = form.querySelector('button'); if (btn) btn.disabled = true;
  try {
    if (kind === 'dm') {
      await api(form.dataset.id === 'ceo' ? '/command' : `/agents/${form.dataset.id}/message`, { method: 'POST', body: { text: data.get('text') } });
      form.reset(); toast(`Message sent to ${nameOf(form.dataset.id)}`);
    } else if (kind === 'task') {
      await api('/tasks', { method: 'POST', body: { to: data.get('to'), title: data.get('title'), description: data.get('description') } });
      form.reset(); form.closest('details').open = false; toast('Task assigned');
    } else if (kind === 'meeting') {
      const participants = ['ceo', ...data.getAll('p')];
      await api('/meetings', { method: 'POST', body: { topic: data.get('topic'), participants } });
      closeModal(); toast('Meeting called — agents are heading to the meeting room', '#a78bfa');
      world.focus('meeting');
    }
  } catch (e) { toast(e.message, '#f87171'); } finally { if (btn) btn.disabled = false; }
}

export function initUI(w) {
  world = w;
  // navigation
  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => openView(b.dataset.view)));
  $('#panel-close').addEventListener('click', closePanel);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) closeModal(); else closePanel(); } });
  $('#metrics-toggle').addEventListener('click', () => { const m = $('#metrics'); m.classList.toggle('collapsed'); $('#metrics-toggle').textContent = m.classList.contains('collapsed') ? '+' : '–'; });
  if (window.innerWidth < 760) { $('#metrics').classList.add('collapsed'); $('#metrics-toggle').textContent = '+'; }
  $('#btn-menu').addEventListener('click', () => openView('agents'));
  $('#btn-daynight').addEventListener('click', () => {
    const next = world.day > 0.5 ? 'night' : 'day';
    world.setDayMode(next); toast(next === 'night' ? 'Night mode — office lights on' : 'Day mode', '#a7f3d0', 2000);
  });
  document.querySelectorAll('#dept-jump button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#dept-jump button').forEach((x) => x.classList.toggle('active', x === b));
    world.focus(b.dataset.dept);
    if (b.dataset.dept !== 'overview' && b.dataset.dept !== 'meeting') openView('agent', b.dataset.dept);
  }));

  // delegated clicks & forms (panel, modal, metrics, feed)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el && !el.closest('#nav')) { e.preventDefault(); handleAction(el.dataset.action, el.dataset.id, el); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-form]');
    if (f) { e.preventDefault(); handleForm(f); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'set-quality') {
      try { localStorage.setItem('nafi.quality', e.target.value); } catch {}
      toast('Reloading with new graphics quality…', '#a7f3d0', 1500); setTimeout(() => location.reload(), 900);
    }
    if (e.target.id === 'set-daymode') world.setDayMode(e.target.value);
  });

  // CEO command center
  const input = $('#command-input');
  $('#command').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim(); if (!text) return;
    input.value = ''; input.disabled = true;
    try {
      await api('/command', { method: 'POST', body: { text } });
      toast('Instruction sent to the CEO', '#10b981', 2500);
    } catch (err) { toast(err.message, '#f87171'); input.value = text; } finally { input.disabled = false; input.focus(); }
  });
  document.querySelectorAll('.suggestions button').forEach((b) => b.addEventListener('click', () => { input.value = b.textContent; input.focus(); }));

  // state subscriptions
  on('change', scheduleRefresh);
  on('settings', scheduleRefresh);
  on('messages', ({ type, doc }) => {
    if (type !== 'insert') return;
    renderFeed();
    if (doc.from === 'ceo' && doc.to === 'owner') showCeoReply(doc);
    if (doc.to === 'owner' && doc.from !== 'ceo') toast(`${nameOf(doc.from)}: ${doc.content.slice(0, 120)}`, colorOf(doc.from), 7000);
  });
  on('tasks', ({ type, doc, prev }) => {
    if (type === 'insert') toast(`${nameOf(doc.assignedBy)} assigned “${doc.title}” to ${nameOf(doc.assignedTo)}`, '#38bdf8');
    else if (doc.status === 'completed' && prev?.status !== 'completed') toast(`${nameOf(doc.assignedTo)} completed “${doc.title}”`, '#facc15');
    else if (doc.status === 'failed' && prev?.status !== 'failed') toast(`Task failed: ${doc.title}`, '#f87171');
  });
  on('projects', ({ type, doc, prev }) => {
    if (type === 'insert') toast(`New project: ${doc.name}`, '#10b981');
    else if (doc.status === 'completed' && prev?.status !== 'completed') toast(`🎉 Project completed: ${doc.name}`, '#facc15', 7000);
  });
  on('approvals', ({ type, doc }) => { if (type === 'insert') toast(`CEO requests your approval: ${doc.title}`, '#f59e0b', 8000); });
  on('meetings', ({ type, doc, prev }) => {
    if (type === 'insert') toast(`Meeting: ${doc.topic}`, '#a78bfa');
    else if (doc.status === 'completed' && prev?.status !== 'completed') toast('Meeting finished — minutes filed in Projects', '#a78bfa');
  });
  on('activity', ({ type, doc }) => { if (type === 'insert' && doc.type === 'error') toast(doc.text, '#f87171', 6000); });

  renderMetrics();
  renderFeed();
  setInterval(() => { if (current.view === 'settings') fillLive(); }, 3000);
}
