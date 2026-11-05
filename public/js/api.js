// REST + Server-Sent Events client. Holds the auth token (Firebase ID token
// or owner access key). No secret API keys ever live in the browser.
let token = '';
let tokenProvider = null;

export function setToken(t) { token = t || ''; }
export function setTokenProvider(fn) { tokenProvider = fn; }

async function currentToken() {
  if (tokenProvider) token = await tokenProvider();
  return token;
}

export async function api(path, { method = 'GET', body } = {}) {
  const t = await currentToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export async function getConfig() {
  return (await fetch('/api/config')).json();
}

/** Opens the live stream. `onEvent` receives {type, col, doc}. Reconnects automatically. */
export async function connectStream(onEvent, onStatus) {
  let es;
  const open = async () => {
    const t = await currentToken();
    es = new EventSource(`/api/stream${t ? `?token=${encodeURIComponent(t)}` : ''}`);
    es.onopen = () => onStatus?.('live');
    es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
    es.addEventListener('ping', (e) => { try { onEvent({ type: 'summary', doc: JSON.parse(e.data) }); } catch {} });
    es.onerror = () => {
      onStatus?.('reconnecting');
      if (es.readyState === EventSource.CLOSED) { setTimeout(open, 3000); }
    };
  };
  await open();
  return () => es?.close();
}
