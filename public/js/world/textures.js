// Procedural canvas textures: live computer screens, boards, faces, windows.
// Screens redraw at a low frame rate and reflect the owning agent's status.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const rnd = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

// ---------------------------------------------------------------- screens
export class Screen {
  constructor(kind, accent = '#10b981', w = 256, h = 160) {
    this.kind = kind; this.accent = accent;
    this.c = canvas(w, h); this.ctx = this.c.getContext('2d');
    this.texture = makeTex(this.c);
    this.status = 'idle';
    this.seed = Math.floor(Math.random() * 1e6) + 1;
    this.draw(0);
  }
  draw(t) {
    const { ctx, c } = this; const W = c.width; const H = c.height;
    const active = ['working', 'thinking', 'talking', 'completed'].includes(this.status);
    ctx.fillStyle = '#04110c'; ctx.fillRect(0, 0, W, H);
    if (!active && this.kind !== 'wall') { this.screensaver(t); this.texture.needsUpdate = true; return; }
    (this[this.kind] || this.dashboard).call(this, t, W, H);
    if (this.status === 'error') {
      ctx.fillStyle = 'rgba(248,113,113,.85)'; ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('⚠ ERROR', 8, H - 6);
    }
    this.texture.needsUpdate = true;
  }
  screensaver(t) {
    const { ctx, c } = this; const W = c.width; const H = c.height;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#051a12'); g.addColorStop(1, '#0a0f0d'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const x = W / 2 + Math.sin(t * 0.4 + this.seed) * W * 0.25; const y = H / 2 + Math.cos(t * 0.33 + this.seed) * H * 0.2;
    ctx.fillStyle = this.accent; ctx.globalAlpha = 0.9; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('NAFI', x, y); ctx.globalAlpha = 0.5; ctx.font = '10px sans-serif'; ctx.fillText('AI OFFICE', x, y + 14);
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  code(t, W, H) {
    const { ctx } = this; const r = rnd(this.seed); const lh = 11; const scroll = (t * 26) % lh; const start = Math.floor(t * 26 / lh);
    const colors = ['#c084fc', '#34d399', '#7dd3fc', '#fbbf24', '#f9a8d4', '#e5e7eb'];
    ctx.fillStyle = '#0b0b16'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#151528'; ctx.fillRect(0, 0, 26, H);
    for (let i = 0; i < H / lh + 2; i++) {
      const ln = start + i; const rr = rnd(this.seed + ln * 97);
      const indent = Math.floor(rr() * 4) * 10; let x = 32 + indent; const y = i * lh - scroll + 8;
      ctx.fillStyle = '#4b4b6b'; ctx.fillRect(6, y, 12, 4);
      const tokens = 1 + Math.floor(rr() * 5);
      for (let k = 0; k < tokens; k++) { const w = 10 + rr() * 40; ctx.fillStyle = colors[Math.floor(rr() * colors.length)]; ctx.fillRect(x, y, w, 5); x += w + 6; if (x > W - 10) break; }
    }
    r();
    ctx.fillStyle = this.accent; if (Math.floor(t * 2) % 2) ctx.fillRect(40, H - 14, 7, 9);
  }
  chart(t, W, H) {
    const { ctx } = this;
    ctx.fillStyle = '#061018'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(125,211,252,.15)'; ctx.lineWidth = 1;
    for (let y = 20; y < H; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let x = 0; x <= W; x += 6) { const y = H * 0.55 + Math.sin(x * 0.04 + t * 1.3 + this.seed) * 22 + Math.sin(x * 0.11 + t * 0.6) * 9; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    for (let i = 0; i < 8; i++) { const h = 14 + Math.abs(Math.sin(i * 1.7 + t * 0.9)) * 36; ctx.fillStyle = i % 3 ? 'rgba(52,211,153,.75)' : 'rgba(56,189,248,.8)'; ctx.fillRect(10 + i * 18, H - 8 - h, 11, h); }
    ctx.fillStyle = '#e0f2fe'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('MARKET INSIGHTS', 10, 15);
  }
  social(t, W, H) {
    const { ctx } = this;
    ctx.fillStyle = '#16060f'; ctx.fillRect(0, 0, W, H);
    const off = (t * 18) % 70;
    for (let i = -1; i < 4; i++) {
      const y = i * 70 - off + 10;
      ctx.fillStyle = '#2a0f1f'; ctx.fillRect(10, y, W - 20, 60);
      ctx.fillStyle = ['#f472b6', '#fb923c', '#a78bfa', '#34d399'][(i + 8 + Math.floor(t * 18 / 70)) % 4]; ctx.fillRect(16, y + 6, 48, 48);
      ctx.fillStyle = '#fbcfe8'; ctx.fillRect(72, y + 10, 90, 6); ctx.fillStyle = '#9d5a7c'; ctx.fillRect(72, y + 22, 120, 5); ctx.fillRect(72, y + 32, 70, 5);
      ctx.fillStyle = '#f472b6'; ctx.font = '12px sans-serif'; ctx.fillText(`♥ ${(1200 + Math.floor(t * 7) + i * 311) % 9999}`, 72, y + 52);
    }
  }
  security(t, W, H) {
    const { ctx } = this;
    ctx.fillStyle = '#0d0806'; ctx.fillRect(0, 0, W, H);
    // radar sweep
    const cx = W * 0.3; const cy = H * 0.55; const r = Math.min(W, H) * 0.36;
    ctx.strokeStyle = 'rgba(251,146,60,.35)'; ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, (r * k) / 3, 0, Math.PI * 2); ctx.stroke(); }
    const ang = t * 1.6;
    ctx.fillStyle = 'rgba(251,146,60,.25)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, ang, ang + 0.6); ctx.closePath(); ctx.fill();
    const rr = rnd(this.seed);
    for (let i = 0; i < 6; i++) { const a = rr() * 6.28; const d = rr() * r; ctx.fillStyle = i === 0 && Math.floor(t * 2) % 2 ? '#ef4444' : '#22c55e'; ctx.fillRect(cx + Math.cos(a) * d - 2, cy + Math.sin(a) * d - 2, 4, 4); }
    // log lines
    const lines = ['FW  allow 443/tcp', 'IDS scan blocked', 'AUTH mfa ok', 'WAF rule 942100', 'TLS 1.3 ok', 'IDS anomaly score 0.12'];
    ctx.font = '10px monospace';
    for (let i = 0; i < 7; i++) { const ln = lines[(Math.floor(t * 1.5) + i) % lines.length]; ctx.fillStyle = ln.includes('blocked') ? '#fb923c' : '#86efac'; ctx.fillText(ln, W * 0.58, 22 + i * 15); }
    ctx.fillStyle = '#fed7aa'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('THREAT MONITOR', 10, 15);
  }
  dashboard(t, W, H) {
    const { ctx } = this;
    ctx.fillStyle = '#04120d'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a7f3d0'; ctx.font = 'bold 12px sans-serif'; ctx.fillText('EXECUTIVE DASHBOARD', 10, 16);
    const kpis = [['Revenue', '+12%'], ['Tasks', `${(Math.floor(t / 3) % 9) + 3}`], ['Team', '4/4']];
    kpis.forEach(([k, v], i) => { const x = 10 + i * ((W - 20) / 3); ctx.fillStyle = '#0b2a1f'; ctx.fillRect(x, 26, (W - 20) / 3 - 6, 40); ctx.fillStyle = '#6ee7b7'; ctx.font = '10px sans-serif'; ctx.fillText(k, x + 6, 40); ctx.fillStyle = '#ecfdf5'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(v, x + 6, 60); });
    ctx.strokeStyle = this.accent; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = 10; x < W - 10; x += 5) { const y = H - 30 - (x / W) * 40 - Math.sin(x * 0.08 + t) * 6; x === 10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  wall(t, W, H) { (this.sub ? this[this.sub] : this.dashboard).call(this, t, W, H); }
}

// ---------------------------------------------------------------- boards
export function boardTexture(kind, accent) {
  const c = canvas(512, 256); const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f7f5'; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#1f2937'; ctx.font = 'bold 22px sans-serif';
  const titles = { research: 'RESEARCH BOARD', development: 'SPRINT BOARD', social: 'CONTENT CALENDAR', ceo: 'STRATEGY 2026' };
  ctx.fillText(titles[kind] || 'BOARD', 18, 32);
  const r = rnd(kind.length * 991);
  const notes = ['#fde68a', '#a7f3d0', '#bfdbfe', '#fbcfe8', '#ddd6fe'];
  if (kind === 'development') {
    ['TODO', 'DOING', 'REVIEW', 'DONE'].forEach((col, i) => {
      ctx.fillStyle = '#6b7280'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(col, 18 + i * 124, 58);
      for (let k = 0; k < 3; k++) { ctx.fillStyle = notes[(i + k) % 5]; ctx.fillRect(18 + i * 124, 68 + k * 58, 106, 48); ctx.fillStyle = '#374151'; ctx.fillRect(26 + i * 124, 80 + k * 58, 70 * r() + 20, 5); ctx.fillRect(26 + i * 124, 92 + k * 58, 50 * r() + 20, 5); }
    });
  } else if (kind === 'social') {
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    days.forEach((d, i) => { ctx.fillStyle = '#6b7280'; ctx.font = 'bold 12px sans-serif'; ctx.fillText(d, 22 + i * 70, 60); ctx.strokeStyle = '#d1d5db'; ctx.strokeRect(16 + i * 70, 66, 64, 170); if (r() > 0.25) { ctx.fillStyle = notes[i % 5]; ctx.fillRect(20 + i * 70, 72 + r() * 90, 56, 44); } });
  } else {
    for (let i = 0; i < 9; i++) { ctx.fillStyle = notes[i % 5]; const x = 18 + (i % 5) * 98; const y = 52 + Math.floor(i / 5) * 100; ctx.save(); ctx.translate(x + 40, y + 40); ctx.rotate((r() - 0.5) * 0.12); ctx.fillRect(-40, -40, 84, 80); ctx.fillStyle = '#374151'; ctx.fillRect(-32, -26, 60, 5); ctx.fillRect(-32, -14, 44, 5); ctx.restore(); }
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(100, 140); ctx.bezierCurveTo(200, 100, 260, 200, 400, 150); ctx.stroke();
  }
  return makeTex(c);
}

export function signTexture(text, sub, accent = '#34d399') {
  const c = canvas(512, 128); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = accent; ctx.font = 'bold 54px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 66);
  if (sub) { ctx.fillStyle = '#d1fae5'; ctx.font = '600 22px sans-serif'; ctx.fillText(sub, 256, 104); }
  return makeTex(c);
}

// Framed poster with bold lines of text, e.g. "DO IT NOW!".
export function posterTexture(lines, bg = '#d98463', fg = '#fff7ed') {
  const c = canvas(256, 320); const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f2125'; ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = bg; ctx.fillRect(14, 14, 228, 292);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px "Space Grotesk", sans-serif';
  const top = 160 - ((lines.length - 1) * 46) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 128, top + i * 46));
  return makeTex(c);
}

// Wide wall lettering on a transparent background.
export function letteringTexture(text, color = '#ffffff', size = 64) {
  const c = canvas(1024, 128); const ctx = c.getContext('2d');
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${size}px "Space Grotesk", sans-serif`;
  ctx.fillText(text, 512, 66);
  return makeTex(c);
}

export function cityTexture() {
  const c = canvas(256, 128); const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#0b1220'); g.addColorStop(1, '#162238');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
  const r = rnd(42);
  for (let x = 0; x < 256;) {
    const w = 10 + r() * 22; const h = 30 + r() * 80; ctx.fillStyle = '#0a0f1a'; ctx.fillRect(x, 128 - h, w, h);
    for (let wy = 128 - h + 4; wy < 124; wy += 7) for (let wx = x + 2; wx < x + w - 3; wx += 5) if (r() > 0.55) { ctx.fillStyle = r() > 0.8 ? '#fde68a' : '#fbbf24'; ctx.fillRect(wx, wy, 2, 3); }
    x += w + 2;
  }
  return makeTex(c);
}

// ---------------------------------------------------------------- faces
// Toy-style faces: dark oval eyes with a highlight, simple brows and mouth.
export function faceTextures(skin, { glasses = false, lashes = false, beard = false, smirk = false, grin = false, happy = false } = {}) {
  const make = (mode) => {
    const c = canvas(128, 128); const ctx = c.getContext('2d');
    ctx.fillStyle = skin; ctx.fillRect(0, 0, 128, 128);
    const ink = '#2a1c16';
    // eyes
    ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.lineCap = 'round';
    if (mode === 'blink' || (happy && mode !== 'talk')) {
      ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.arc(43, 62, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(85, 62, 9, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.ellipse(43, 58, 7.5, 10, 0, 0, Math.PI * 2); ctx.ellipse(85, 58, 7.5, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(45.5, 54, 2.8, 0, 7); ctx.arc(87.5, 54, 2.8, 0, 7); ctx.fill();
    }
    if (lashes && mode !== 'blink') {
      ctx.lineWidth = 2.5;
      for (const [x, d] of [[35, -1], [93, 1]]) { ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x + d * 5, 45); ctx.moveTo(x + d * 2, 54); ctx.lineTo(x + d * 8, 51); ctx.stroke(); }
    }
    // brows
    ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(33, 40); ctx.quadraticCurveTo(43, 35, 53, 40); ctx.moveTo(75, 40); ctx.quadraticCurveTo(85, 35, 95, 40); ctx.stroke();
    // blush
    ctx.fillStyle = 'rgba(240,120,130,.22)'; ctx.beginPath(); ctx.arc(29, 78, 8, 0, 7); ctx.arc(99, 78, 8, 0, 7); ctx.fill();
    // mouth
    ctx.strokeStyle = '#5b2b22'; ctx.fillStyle = '#5b2b22'; ctx.lineWidth = 4;
    if (mode === 'talk' || grin) {
      ctx.beginPath(); ctx.moveTo(48, 80); ctx.quadraticCurveTo(64, 82, 80, 80); ctx.quadraticCurveTo(64, mode === 'talk' ? 104 : 98, 48, 80); ctx.fill();
      ctx.fillStyle = '#e98a8a'; ctx.beginPath(); ctx.ellipse(64, 91, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else if (smirk) {
      ctx.beginPath(); ctx.moveTo(48, 82); ctx.quadraticCurveTo(66, 94, 82, 78); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(64, 76, 15, 0.22 * Math.PI, 0.78 * Math.PI); ctx.stroke();
    }
    if (beard) { ctx.fillStyle = 'rgba(40,28,22,.3)'; ctx.beginPath(); ctx.ellipse(64, 104, 30, 16, 0, 0, Math.PI); ctx.fill(); }
    if (glasses) { ctx.strokeStyle = '#141518'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(43, 58, 15, 0, 7); ctx.moveTo(100, 58); ctx.arc(85, 58, 15, 0, 7); ctx.moveTo(58, 56); ctx.lineTo(70, 56); ctx.stroke(); }
    return makeTex(c);
  };
  return { normal: make('normal'), talk: make('talk'), blink: make('blink') };
}

// Small name badge, e.g. "CEO", "RESEARCH".
export function badgeTexture(text) {
  const c = canvas(192, 64); const ctx = c.getContext('2d');
  ctx.fillStyle = '#f7f7f5'; ctx.fillRect(0, 0, 192, 64);
  ctx.fillStyle = '#2f6fd1'; ctx.fillRect(0, 0, 192, 12);
  ctx.fillStyle = '#16181d'; ctx.font = `bold ${text.length > 8 ? 26 : 32}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 96, 40);
  return makeTex(c);
}
