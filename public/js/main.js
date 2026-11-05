// NAFI AI OFFICE — client bootstrap.
import { api, getConfig, connectStream, setToken, setTokenProvider } from './api.js';
import { state, load, applyEvent, on, agentById } from './state.js';
import { World, detectQuality } from './world/world.js';
import { initUI, openView, openMeetingDialog, toast } from './ui/ui.js';

const $ = (s) => document.querySelector(s);
const loaderText = (t) => { $('#loader-text').textContent = t; };

async function authenticate(config) {
  if (config.auth === 'none') return;
  const login = $('#login');
  const fields = $('#login-fields');
  const err = $('#login-error');

  if (config.auth === 'key') {
    const saved = (() => { try { return localStorage.getItem('nafi.key'); } catch { return null; } })();
    if (saved) {
      setToken(saved);
      try { await api('/state'); return; } catch { setToken(''); }
    }
    fields.innerHTML = '<input type="password" id="key" placeholder="Owner access key" autocomplete="current-password" required><button class="btn primary">Enter office</button>';
    login.classList.remove('hidden');
    $('#loader').classList.add('fade');
    return new Promise((resolve) => {
      $('#login-form').onsubmit = async (e) => {
        e.preventDefault();
        setToken($('#key').value);
        try { await api('/state'); try { localStorage.setItem('nafi.key', $('#key').value); } catch {} login.classList.add('hidden'); $('#loader').classList.remove('fade'); resolve(); }
        catch { err.textContent = 'Invalid access key.'; }
      };
    });
  }

  // Firebase Authentication
  const v = '10.14.1';
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
  const fa = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-auth.js`);
  const app = initializeApp(config.firebase);
  const auth = fa.getAuth(app);
  setTokenProvider(async () => (auth.currentUser ? auth.currentUser.getIdToken() : ''));
  return new Promise((resolve) => {
    fa.onAuthStateChanged(auth, async (user) => {
      if (user) {
        try { await api('/state'); login.classList.add('hidden'); $('#loader').classList.remove('fade'); resolve(); }
        catch { err.textContent = 'This account is not authorised as the office owner.'; await fa.signOut(auth); }
        return;
      }
      fields.innerHTML = `<button type="button" class="btn primary" id="google">Continue with Google</button>
        <input type="email" id="email" placeholder="Email" autocomplete="email"><input type="password" id="pass" placeholder="Password" autocomplete="current-password">
        <button class="btn">Sign in with email</button>`;
      login.classList.remove('hidden');
      $('#loader').classList.add('fade');
      $('#google').onclick = () => fa.signInWithPopup(auth, new fa.GoogleAuthProvider()).catch((e) => { err.textContent = e.message; });
      $('#login-form').onsubmit = (e) => {
        e.preventDefault();
        fa.signInWithEmailAndPassword(auth, $('#email').value, $('#pass').value).catch((e2) => { err.textContent = e2.message; });
      };
    });
  });
}

async function start() {
  const config = await getConfig();
  state.config = config;
  const badge = $('#provider-badge');
  badge.textContent = config.demo ? 'DEMO MODE' : `LIVE · ${config.provider.toUpperCase()}`;
  badge.className = `badge ${config.demo ? 'warn' : 'ok'}`;
  badge.title = config.demo ? 'No AI provider key configured on the server: agents use templated demo responses. Set ANTHROPIC_API_KEY for real inference.' : 'Agents run real AI inference';

  await authenticate(config);
  loaderText('Loading workspace…');
  load(await api('/state'));

  loaderText('Building the office…');
  const quality = detectQuality();
  const world = new World($('#scene'), $('#overlay'), {
    quality,
    getAgent: (id) => agentById(id),
    onPick: (hit) => {
      if (hit.type === 'agent') { openView('agent', hit.id); world.focus(hit.id); }
      else if (hit.type === 'desk') openView('tasks', hit.id);
      else if (hit.type === 'computer') openView('computer', hit.id);
      else if (hit.type === 'meeting') { world.focus('meeting'); openMeetingDialog(); }
      else if (hit.type === 'department') { world.focus(hit.id); openView('agent', hit.id); }
    },
  });
  world.onDowngrade = (fps) => toast(`Low frame rate (${fps} fps) — switched to lighter rendering. Change it in Settings.`, '#f59e0b', 6000);
  window.__world = world;

  // mirror server state into the world
  for (const a of state.agents) world.onAgentStatus(a.id, a.status, 'idle');
  world.setMeeting(state.meetings.filter((m) => m.status !== 'completed').pop());
  on('agents', ({ doc, prev }) => { if (!prev || prev.status !== doc.status) world.onAgentStatus(doc.id, doc.status, prev?.status); });
  on('messages', ({ type, doc }) => { if (type === 'insert') world.onMessage(doc); });
  on('meetings', ({ doc }) => world.setMeeting(doc.status === 'completed' ? null : doc));

  initUI(world);
  await connectStream(applyEvent, (s) => { if (s === 'reconnecting') toast('Connection lost — reconnecting…', '#f59e0b', 2500); });

  // Re-sync after a reconnect so nothing is missed.
  let syncing = false;
  window.addEventListener('online', async () => { if (syncing) return; syncing = true; try { load(await api('/state')); } finally { syncing = false; } });

  setTimeout(() => {
    $('#loader').classList.add('fade');
    world.intro();
    setTimeout(() => $('#hint').classList.add('gone'), 9000);
    if (config.demo) setTimeout(() => toast('Demo mode: no AI key on the server, so agents use templated replies. Add ANTHROPIC_API_KEY for real AI.', '#f59e0b', 9000), 3800);
  }, 400);
}

start().catch((e) => {
  console.error(e);
  loaderText(`Could not start: ${e.message}`);
});
