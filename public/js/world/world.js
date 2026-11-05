// The living 3D world: renderer, camera, lighting, day/night, quality modes,
// picking, and the "director" that turns real agent status into behaviour —
// walking to desks, typing, meetings, wandering, message orbs and bubbles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Office, ROOMS, DESKS, DOORS, MEETING_SEATS, AMBIENT_SPOTS, FOCUS } from './office.js';

function roomAt(x, z) {
  for (const [id, r] of Object.entries(ROOMS)) {
    if (id !== 'lobby' && x > r.x[0] && x < r.x[1] && z > r.z[0] && z < r.z[1]) return id;
  }
  return 'corridor';
}
import { Avatar } from './characters.js';

const AGENT_IDS = Object.keys(DESKS);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Path around an agent's desk: behind the chair -> desk side -> in front of desk.
function deskAisle(id) {
  const d = DESKS[id]; const fwd = d.heading === 0 ? 1 : -1; const deskZ = d.z + fwd * 0.95;
  const side = d.x + 2.1;
  return [{ x: d.x, z: d.z - fwd * 0.45 }, { x: side, z: d.z - fwd * 0.45 }, { x: side, z: deskZ + fwd * 0.9 }];
}

export function detectQuality() {
  const saved = (() => { try { return localStorage.getItem('nafi.quality'); } catch { return null; } })();
  if (saved && saved !== 'auto') return saved;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPod/i.test(ua);
  const tablet = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const mem = navigator.deviceMemory || 8; const cores = navigator.hardwareConcurrency || 8;
  if ((mobile && !tablet) || mem <= 3 || cores <= 4) return 'low';
  if (tablet || mem <= 4) return 'medium';
  return 'high';
}

export class World {
  constructor(container, overlay, { onPick, getAgent, quality }) {
    this.container = container;
    this.overlay = overlay;
    this.onPick = onPick;
    this.getAgent = getAgent;
    this.quality = quality;
    this.clock = new THREE.Clock();
    this.dayMode = (() => { try { return localStorage.getItem('nafi.daymode') || 'auto'; } catch { return 'auto'; } })();
    this.day = 1; this.dayTarget = 1;
    this.orbs = [];
    this.actors = {};
    this.follow = null;
    this.fpsSamples = [];
    this.meeting = null;
    this.initRenderer();
    this.initScene();
    this.office = new Office(this.scene, quality);
    this.initAvatars();
    this.initOverlay();
    this.initInput();
    this.applyDayMode();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------- setup
  initRenderer() {
    const q = this.quality;
    const r = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: q === 'low' ? 'low-power' : 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = q !== 'low';
    r.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.container.appendChild(r.domElement);
    this.renderer = r;
  }

  initScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color('#0b1110');
    s.fog = new THREE.Fog('#0b1110', 60, 130);
    this.scene = s;
    if (this.quality !== 'low') {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      s.environmentIntensity = 0.35;
    }
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
    this.camera.position.set(0, 70, 85);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 70;
    this.controls.target.set(0, 0, 0);
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener('start', () => { this.flight = null; });

    this.hemi = new THREE.HemisphereLight('#dff7ff', '#2a2f2c', 0.9);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    this.sun.position.set(18, 30, 14);
    if (this.quality !== 'low') {
      this.sun.castShadow = true;
      const size = this.quality === 'high' ? 2048 : 1024;
      this.sun.shadow.mapSize.set(size, size);
      Object.assign(this.sun.shadow.camera, { left: -28, right: 28, top: 22, bottom: -22, near: 1, far: 80 });
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.03;
    }
    s.add(this.sun);
    this.ambient = new THREE.AmbientLight('#9fb7ae', 0.25);
    s.add(this.ambient);
  }

  initAvatars() {
    for (const id of AGENT_IDS) {
      const av = new Avatar(id, this.quality);
      this.scene.add(av.root);
      const desk = DESKS[id];
      av.sitAt(desk);
      av.root.rotation.y = desk.heading;
      this.actors[id] = {
        id, avatar: av, room: desk.room, location: 'desk', busyUntil: 0,
        nextWander: performance.now() / 1000 + 8 + Math.random() * 25,
        status: 'idle', bubble: null, bubbleUntil: 0, icon: '', iconUntil: 0,
      };
    }
  }

  initOverlay() {
    this.tags = {};
    for (const id of AGENT_IDS) {
      const el = document.createElement('div');
      el.className = 'tag3d';
      this.overlay.appendChild(el);
      const bubble = document.createElement('div');
      bubble.className = 'bubble3d hidden';
      this.overlay.appendChild(bubble);
      this.tags[id] = { el, bubble, lastHtml: '' };
    }
    this.roomTags = this.office.roomLabels.map((r) => {
      const el = document.createElement('div');
      el.className = 'room-label'; el.textContent = r.text;
      this.overlay.appendChild(el);
      return { el, pos: r.pos };
    });
  }

  initInput() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down = null;
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const targets = [...Object.values(this.actors).map((a) => a.avatar.root), ...this.office.clickables];
      const hit = ray.intersectObjects(targets, true)[0];
      if (!hit) return null;
      let o = hit.object;
      while (o && !o.userData.click) o = o.parent;
      return o ? o.userData.click : null;
    };
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < 7 && performance.now() - down.t < 600) {
        const hit = pick(e);
        if (hit) this.onPick(hit);
      }
      down = null;
    });
    let hoverT = 0;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || down) return;
      const now = performance.now(); if (now - hoverT < 80) return; hoverT = now;
      el.style.cursor = pick(e) ? 'pointer' : 'grab';
    });
    // keyboard panning
    this.keys = new Set();
    window.addEventListener('keydown', (e) => { if (!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
  }

  resize() {
    const w = window.innerWidth; const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 60 : 45;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- camera
  intro() {
    const f = FOCUS.overview;
    const narrow = window.innerWidth < window.innerHeight;
    this.flyTo(narrow ? [16, 40, 46] : f.pos, f.target, 3.6);
  }
  flyTo(pos, target, dur = 1.3) {
    this.follow = null;
    this.flight = {
      t: 0, dur,
      fromPos: this.camera.position.clone(), toPos: new THREE.Vector3(...pos),
      fromTarget: this.controls.target.clone(), toTarget: new THREE.Vector3(...target),
    };
  }
  focus(name) {
    const f = FOCUS[name] || FOCUS.overview;
    this.flyTo(f.pos, f.target);
  }
  followAgent(id) {
    this.flight = null;
    this.follow = id;
  }

  // ---------------------------------------------------------- day / night
  setDayMode(mode) {
    this.dayMode = mode;
    try { localStorage.setItem('nafi.daymode', mode); } catch {}
    this.applyDayMode();
  }
  applyDayMode() {
    if (this.dayMode === 'day') this.dayTarget = 1;
    else if (this.dayMode === 'night') this.dayTarget = 0;
    else if (this.dayMode === 'auto') { const h = new Date().getHours() + new Date().getMinutes() / 60; this.dayTarget = h >= 7 && h < 19 ? 1 : (h >= 6 && h < 7) ? h - 6 : (h >= 19 && h < 20) ? 20 - h : 0; }
  }
  updateDaylight(dt, t) {
    if (this.dayMode === 'cycle') this.dayTarget = (Math.sin(t * 0.06) + 1) / 2;
    else if (this.dayMode === 'auto' && Math.floor(t) % 60 === 0) this.applyDayMode();
    const prev = this.day;
    this.day += (this.dayTarget - this.day) * Math.min(1, dt * 1.2);
    if (Math.abs(prev - this.day) < 1e-4 && this._dayApplied) return;
    this._dayApplied = true;
    const d = this.day;
    const sky = new THREE.Color('#06090f').lerp(new THREE.Color('#a3aebb'), d);
    this.scene.background.copy(sky);
    this.scene.fog.color.copy(sky);
    this.hemi.intensity = 0.55 + d * 0.45;
    this.sun.intensity = 0.25 + d * 2.0;
    this.sun.color.set(d > 0.5 ? '#fff4e0' : '#9db4ff');
    this.sun.position.set(18 - (1 - d) * 30, 30, 14);
    this.ambient.intensity = 0.35 + d * 0.0;
    this.renderer.toneMappingExposure = 0.95 + d * 0.15;
    this.office.setDaylight(d);
  }

  // ---------------------------------------------------------- director
  status(id) { return this.actors[id]?.status || 'idle'; }

  routeTo(actor, room, target) {
    const av = actor.avatar;
    const pts = [];
    const p = av.root.position;
    const cur = roomAt(p.x, p.z);
    const corridor = (x) => ({ x, z: 0 });
    const via = (r) => {
      const d = DOORS[r]; if (!d) return null;
      const north = d.z < 0; // door on a top room (rooms extend to -z)
      return { inside: { x: d.x, z: d.z + (north ? -1.3 : 1.3) }, outside: { x: d.x, z: d.z + (north ? 1.3 : -1.3) } };
    };
    if (cur !== room) {
      const a = via(cur);
      if (a) { pts.push(a.inside, a.outside, corridor(a.outside.x)); } else pts.push(corridor(p.x));
      const b = via(room);
      if (b) pts.push(corridor(b.outside.x), b.outside, b.inside);
      else pts.push(corridor(target.x));
    } else if (room === 'corridor') {
      pts.push(corridor(p.x), corridor(target.x));
    }
    pts.push(target);
    actor.room = room;
    return pts;
  }

  // Step out from behind the desk before walking anywhere.
  exitDesk(actor) {
    const av = actor.avatar; const d = DESKS[actor.id];
    if (!av.seated || Math.hypot(av.root.position.x - d.x, av.root.position.z - d.z) > 0.3) return [];
    const pts = deskAisle(actor.id);
    av.root.position.set(d.x, 0, d.z);
    return pts;
  }

  goToDesk(actor, then) {
    const desk = DESKS[actor.id];
    const av = actor.avatar;
    if (actor.location === 'desk' && av.seated && !av.walking) { then?.(); return; }
    if (actor.location === 'to-desk') return;
    actor.location = 'to-desk';
    const around = deskAisle(actor.id).reverse();
    av.walkTo(this.routeTo(actor, desk.room, around[0]).concat(around.slice(1), [{ x: desk.x, z: desk.z }]), () => {
      av.sitAt(desk);
      actor.location = 'desk';
      then?.();
    });
  }

  goToMeeting(actor, seatIndex) {
    if (actor.location === 'meeting' || actor.location === 'to-meeting') return;
    const seat = MEETING_SEATS[seatIndex % MEETING_SEATS.length];
    actor.location = 'to-meeting';
    const av = actor.avatar;
    // Walk around the table rather than through it.
    let approach;
    if (seat.heading === 0) approach = [{ x: -6.4, z: -8.1 }, { x: -6.4, z: -14.5 }, { x: seat.x, z: -14.5 }];
    else if (seat.heading === Math.PI) approach = [{ x: seat.x, z: -7.9 }];
    else approach = [{ x: seat.x + (seat.x < -3 ? -0.9 : 0.9), z: -8.1 }, { x: seat.x + (seat.x < -3 ? -0.9 : 0.9), z: seat.z }];
    const route = this.exitDesk(actor).concat(this.routeTo(actor, 'meeting', approach[0])).concat(approach.slice(1), [{ x: seat.x, z: seat.z }]);
    av.walkTo(route, () => {
      av.sitAt(seat);
      actor.location = 'meeting';
    });
  }

  wander(actor) {
    const spot = AMBIENT_SPOTS[Math.floor(Math.random() * AMBIENT_SPOTS.length)];
    actor.location = 'wander';
    const av = actor.avatar;
    av.walkTo(this.exitDesk(actor).concat(this.routeTo(actor, 'corridor', spot)), () => {
      av.heading = spot.heading;
      actor.location = 'ambient';
      actor.busyUntil = performance.now() / 1000 + 5 + Math.random() * 7;
    });
  }

  setMeeting(meeting) {
    this.meeting = meeting && meeting.status !== 'completed' ? meeting : null;
  }

  /** Called whenever an agent's server-side status changes. */
  onAgentStatus(id, status, prevStatus) {
    const actor = this.actors[id]; if (!actor) return;
    actor.status = status;
    if (status === 'completed' && prevStatus !== 'completed') { actor.avatar.celebrate(3.5); this.icon(id, '✅', 3.5); }
    if (status === 'error') this.icon(id, '!', 8, true);
  }

  /** Visualise a message travelling between agents. */
  onMessage(msg) {
    const from = this.actors[msg.from];
    const to = this.actors[msg.to];
    if (from) {
      const label = msg.kind === 'task' ? 'Assigning task' : msg.kind === 'report' ? 'Report' : msg.kind === 'meeting' ? 'Meeting' : msg.to === 'owner' ? 'To owner' : msg.to && msg.to !== 'all' ? `To ${msg.to}` : '';
      this.say(msg.from, msg.content, label, msg.kind === 'meeting' ? 9 : 7);
    }
    if (to && from && msg.from !== msg.to) this.orb(msg.from, msg.to, msg.kind);
    else if (to && msg.from === 'owner') { this.icon(msg.to, '📩', 4); to.avatar.notify(); }
  }

  say(id, text, label, seconds = 7) {
    const actor = this.actors[id]; if (!actor) return;
    const clean = String(text || '').replace(/[#*_`>|]/g, '').replace(/\s+/g, ' ').trim();
    actor.bubble = { text: clean.length > 150 ? clean.slice(0, 147) + '…' : clean, label, thought: false };
    actor.bubbleUntil = performance.now() / 1000 + seconds;
    actor.avatar.talk(Math.min(seconds, 5));
  }

  icon(id, icon, seconds, err = false) {
    const a = this.actors[id]; if (!a) return;
    a.icon = icon; a.iconErr = err; a.iconUntil = performance.now() / 1000 + seconds;
  }

  orb(fromId, toId, kind) {
    const a = this.actors[fromId].avatar; const b = this.actors[toId].avatar;
    const color = kind === 'task' ? '#38bdf8' : kind === 'report' ? '#facc15' : kind === 'escalation' ? '#f87171' : '#34d399';
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, toneMapped: false }));
    mesh.add(glow);
    this.scene.add(mesh);
    const start = a.headWorldPosition(new THREE.Vector3());
    this.orbs.push({ mesh, a, b, start, t: 0, dur: Math.max(1.1, start.distanceTo(b.root.position) / 14), toId, kind });
  }

  updateDirector(dt, t) {
    const meetingActive = this.meeting && ['gathering', 'active'].includes(this.meeting.status);
    for (const actor of Object.values(this.actors)) {
      const st = actor.status;
      const av = actor.avatar;
      const inMeeting = meetingActive && this.meeting.participants.includes(actor.id) && (st === 'meeting' || st === 'talking' || st === 'thinking');
      if (inMeeting) {
        this.goToMeeting(actor, this.meeting.participants.indexOf(actor.id));
        continue;
      }
      if (actor.location === 'meeting' || actor.location === 'to-meeting') { actor.location = 'leaving'; this.goToDesk(actor); }
      if (['working', 'thinking', 'talking', 'error', 'completed'].includes(st)) {
        if (actor.location !== 'desk' && actor.location !== 'to-desk') this.goToDesk(actor);
        continue;
      }
      // idle behaviour: occasionally wander, then return
      if (actor.location === 'desk' && t > actor.nextWander) {
        actor.nextWander = t + 25 + Math.random() * 40;
        if (Math.random() < 0.6) this.wander(actor);
      } else if (actor.location === 'ambient' && t > actor.busyUntil) {
        this.goToDesk(actor);
      }
      if (actor.location === 'ambient' && av.id === 'ceo' && Math.random() < 0.002) av.talk(2);
    }
    // orbs
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt / o.dur;
      const end = o.b.headWorldPosition(new THREE.Vector3());
      const k = Math.min(1, o.t);
      const pos = o.start.clone().lerp(end, ease(k));
      pos.y += Math.sin(k * Math.PI) * 4;
      o.mesh.position.copy(pos);
      o.mesh.scale.setScalar(1 + Math.sin(t * 20) * 0.15);
      if (o.t >= 1) {
        this.scene.remove(o.mesh);
        o.mesh.geometry.dispose();
        this.orbs.splice(i, 1);
        o.b.notify();
        this.icon(o.toId, o.kind === 'task' ? '📋' : o.kind === 'report' ? '📄' : o.kind === 'escalation' ? '⚠️' : '💬', 3.5);
      }
    }
  }

  // ---------------------------------------------------------- overlay
  updateOverlay(t) {
    const w = window.innerWidth; const h = window.innerHeight;
    const v = new THREE.Vector3();
    const project = (vec) => { vec.project(this.camera); return { x: (vec.x * 0.5 + 0.5) * w, y: (-vec.y * 0.5 + 0.5) * h, behind: vec.z > 1 }; };
    const camDist = this.camera.position.distanceTo(this.controls.target);
    for (const [id, actor] of Object.entries(this.actors)) {
      const tag = this.tags[id];
      const agent = this.getAgent(id);
      actor.avatar.headWorldPosition(v);
      const p = project(v);
      const off = p.behind || p.x < -50 || p.x > w + 50 || p.y < -50 || p.y > h + 50;
      tag.el.style.display = off ? 'none' : '';
      if (!off) {
        tag.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
        const icon = t < actor.iconUntil ? `<span class="icon ${actor.iconErr ? 'err' : ''}">${esc(actor.icon)}</span>` : actor.status === 'error' ? '<span class="icon err">!</span>' : '';
        const html = `${icon}<span class="name"><i style="background:${agent?.color || '#10b981'}"></i>${esc(agent?.name?.split(' ').slice(-1)[0] || id)}${camDist < 40 ? ` · ${esc(actor.status)}` : ''}</span>`;
        if (html !== tag.lastHtml) { tag.el.innerHTML = html; tag.lastHtml = html; }
      }
      // speech > thought bubble
      let b = null;
      if (t < actor.bubbleUntil && actor.bubble) b = actor.bubble;
      else if ((actor.status === 'thinking' || actor.status === 'working') && agent?.thought && camDist < 55) b = { text: agent.thought, label: actor.status === 'working' ? 'Working' : 'Thinking…', thought: true };
      if (b && !off) {
        tag.bubble.classList.remove('hidden');
        tag.bubble.classList.toggle('thought', !!b.thought);
        const html = `${b.label ? `<b>${esc(b.label)}</b>` : ''}${esc(b.text)}`;
        if (tag.bubble._html !== html) { tag.bubble.innerHTML = html; tag.bubble._html = html; }
        tag.bubble.style.transform = `translate(${p.x}px, ${p.y - 30}px) translate(-50%, -100%)`;
      } else tag.bubble.classList.add('hidden');
    }
    for (const r of this.roomTags) {
      const p = project(r.pos.clone());
      r.el.style.display = p.behind || camDist > 62 ? 'none' : '';
      r.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
  }

  // ---------------------------------------------------------- loop
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = performance.now() / 1000;
    // camera flight / follow / keys
    if (this.flight) {
      const f = this.flight; f.t += dt / f.dur; const k = ease(Math.min(1, f.t));
      this.camera.position.lerpVectors(f.fromPos, f.toPos, k);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.t >= 1) this.flight = null;
    } else if (this.follow) {
      const p = this.actors[this.follow].avatar.root.position;
      const delta = new THREE.Vector3(p.x, 0.8, p.z).sub(this.controls.target).multiplyScalar(Math.min(1, dt * 3));
      this.controls.target.add(delta); this.camera.position.add(delta);
    }
    if (this.keys.size) {
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const mv = new THREE.Vector3();
      if (this.keys.has('w') || this.keys.has('arrowup')) mv.add(fwd);
      if (this.keys.has('s') || this.keys.has('arrowdown')) mv.sub(fwd);
      if (this.keys.has('d') || this.keys.has('arrowright')) mv.add(right);
      if (this.keys.has('a') || this.keys.has('arrowleft')) mv.sub(right);
      if (mv.lengthSq()) { mv.normalize().multiplyScalar(dt * 14); this.controls.target.add(mv); this.camera.position.add(mv); this.follow = null; }
    }
    const tg = this.controls.target;
    tg.x = THREE.MathUtils.clamp(tg.x, -24, 24); tg.z = THREE.MathUtils.clamp(tg.z, -18, 18); tg.y = THREE.MathUtils.clamp(tg.y, 0, 3);
    this.controls.update();

    this.updateDaylight(dt, t);
    this.updateDirector(dt, t);
    const avatars = Object.values(this.actors).map((a) => a.avatar);
    for (const a of Object.values(this.actors)) a.avatar.update(dt, t, a.avatar.walking ? 'walking' : a.status);
    this.office.update(dt, t, avatars, (id) => this.status(id), this.quality === 'low');
    if (this.office.meetingHolo) this.office.meetingHolo.material.color.set(this.meeting ? '#a78bfa' : '#34d399');
    this.renderer.render(this.scene, this.camera);
    this.updateOverlay(t);
    this.monitorFps(dt);
  }

  monitorFps(dt) {
    this.fpsSamples.push(dt);
    if (this.fpsSamples.length < 180) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    this.fps = Math.round(1 / avg);
    if (this.fps < 26 && this.quality !== 'low' && !this.autoDowngraded) {
      this.autoDowngraded = true;
      // Lighter rendering without a reload: drop pixel ratio and shadows.
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.sun.castShadow = false;
      this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      this.onDowngrade?.(this.fps);
    }
  }
}
