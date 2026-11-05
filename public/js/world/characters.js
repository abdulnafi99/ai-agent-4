// Stylised blocky 3D characters (rounded, toy-like proportions) with
// procedural animation states: idle, working (typing), thinking, talking,
// walking, meeting (seated), completed (celebrating) and error (warning).
// Each agent's outfit and props follow the owner's character designs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { faceTextures, badgeTexture } from './textures.js';

const SKIN = '#f1c9a3';
const STYLES = {
  // Navy suit, white shirt, purple tie, slick dark hair, CEO badge, arms crossed.
  ceo: { skin: SKIN, shirt: '#1f2a44', sleeve: '#1f2a44', pants: '#1f2a44', shoes: '#16181d', hair: '#22252b', badge: 'CEO', face: { smirk: true } },
  // Glasses, white shirt, green sweater vest, striped tie, brown trousers, book and magnifier.
  research: { skin: SKIN, shirt: '#2f5d3c', sleeve: '#f5f5f2', pants: '#6b4e37', shoes: '#5a3b26', hair: '#1c1d21', badge: 'RESEARCH', face: { grin: true } },
  // Blue hoodie, headphones round the neck, dark jeans, laptop.
  development: { skin: SKIN, shirt: '#3c5f9e', sleeve: '#3c5f9e', pants: '#283246', shoes: '#15171b', hair: '#8a4a26', badge: 'DEVELOPER', face: { smirk: true } },
  // Orange blazer over white shirt, navy trousers, white trainers, megaphone.
  social: { skin: SKIN, shirt: '#e2793a', sleeve: '#e2793a', pants: '#25304a', shoes: '#f4f4f2', hair: '#6b3a1e', badge: 'MARKETING', face: { happy: true, grin: true } },
  // Pink blouse with white collar, dark skirt, hair bun with pink bow, clipboard and bell.
  security: { skin: SKIN, shirt: '#e8a3b8', sleeve: '#e8a3b8', pants: SKIN, shoes: '#16181d', hair: '#7a4a2a', badge: 'SECURITY', skirt: '#2f3540', socks: '#f4f4f2', face: { lashes: true } },
};

const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));

export class Avatar {
  constructor(id, quality) {
    this.id = id;
    const s = STYLES[id];
    this.style = s;
    this.root = new THREE.Group();
    this.root.userData.click = { type: 'agent', id };
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.props = [];
    const shadows = quality !== 'low';
    const part = (geo, mat, parent, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadows;
      mesh.userData.click = { type: 'agent', id };
      parent.add(mesh);
      return mesh;
    };
    this.part = part;
    const skin = m(s.skin);

    // legs (pivot at hip)
    this.legL = new THREE.Group(); this.legL.position.set(-0.15, 0.78, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.15, 0.78, 0);
    for (const leg of [this.legL, this.legR]) {
      part(rbox(0.27, 0.62, 0.29, 0.05), m(s.pants), leg, 0, -0.31, 0);
      if (s.socks) part(rbox(0.28, 0.1, 0.3, 0.03), m(s.socks), leg, 0, -0.6, 0);
      part(rbox(0.29, 0.13, 0.38, 0.05), m(s.shoes, { roughness: 0.35 }), leg, 0, -0.71, 0.04);
      this.body.add(leg);
    }
    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.78; this.body.add(this.torso);
    part(rbox(0.66, 0.74, 0.36, 0.08), m(s.shirt), this.torso, 0, 0.37, 0);
    if (s.skirt) part(rbox(0.7, 0.34, 0.4, 0.06), m(s.skirt), this.torso, 0, -0.06, 0);
    // arms (pivot at shoulder)
    this.armL = new THREE.Group(); this.armL.position.set(-0.44, 0.68, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.44, 0.68, 0);
    for (const arm of [this.armL, this.armR]) {
      part(rbox(0.22, 0.52, 0.24, 0.07), m(s.sleeve), arm, 0, -0.22, 0);
      part(rbox(0.2, 0.2, 0.22, 0.07), skin, arm, 0, -0.57, 0);
      this.torso.add(arm);
    }
    // head: rounded block with a painted face on the front
    this.head = new THREE.Group(); this.head.position.y = 0.76; this.torso.add(this.head);
    this.faces = faceTextures(s.skin, s.face);
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faces.normal, roughness: 0.6 });
    const headMats = [skin, skin, skin, skin, this.faceMat, skin];
    part(rbox(0.54, 0.54, 0.52, 0.12), headMats, this.head, 0, 0.28, 0);
    part(rbox(0.22, 0.1, 0.22, 0.03), skin, this.torso, 0, 0.77, 0); // neck
    // name badge
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.07), new THREE.MeshBasicMaterial({ map: badgeTexture(s.badge), toneMapped: false }));
    badge.position.set(0.17, 0.6, 0.185); badge.userData.click = { type: 'agent', id }; this.torso.add(badge);
    this.accessorize(part, skin);

    // status indicator ring under the feet
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), new THREE.MeshBasicMaterial({ color: '#10b981', transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.07;
    this.root.add(this.ring);

    // state
    this.path = [];
    this.speed = 2.8;
    this.seated = false;
    this.seat = null;
    this.anim = 'idle';
    this.walkPhase = 0;
    this.heading = 0;
    this.talkUntil = 0;
    this.celebrateUntil = 0;
    this.blinkAt = 2 + Math.random() * 3;
    this.bounce = 0;
  }

  // Hand-held props are shown when standing and hidden at the desk.
  prop(mesh) { this.props.push(mesh); return mesh; }

  accessorize(part, skin) {
    const s = this.style; const hair = m(s.hair, { roughness: 0.5 }); const h = this.head;
    const white = m('#f7f7f5');
    if (this.id === 'ceo') {
      // slick swept-back hair with a little volume on top
      part(rbox(0.58, 0.16, 0.56, 0.06), hair, h, 0, 0.6, -0.01);
      part(rbox(0.5, 0.12, 0.3, 0.05), hair, h, 0.02, 0.7, 0.04);
      part(rbox(0.58, 0.34, 0.1, 0.04), hair, h, 0, 0.42, -0.25);
      // shirt, lapels, purple tie, pocket line
      part(rbox(0.22, 0.42, 0.02, 0.01), white, this.torso, 0, 0.53, 0.182);
      part(rbox(0.08, 0.4, 0.02, 0.01), m('#6c5bc4'), this.torso, 0, 0.5, 0.195);
      for (const x of [-0.13, 0.13]) { const lap = part(rbox(0.1, 0.36, 0.02, 0.01), m('#18213a'), this.torso, x, 0.55, 0.19); lap.rotation.z = x > 0 ? 0.25 : -0.25; }
      for (let i = 0; i < 2; i++) part(new THREE.SphereGeometry(0.018, 6, 6), m('#0f1424'), this.torso, -0.05, 0.22 - i * 0.1, 0.19);
    } else if (this.id === 'research') {
      // neat dark hair with a side part
      part(rbox(0.58, 0.18, 0.56, 0.07), hair, h, 0, 0.6, -0.01);
      part(rbox(0.36, 0.12, 0.2, 0.05), hair, h, -0.1, 0.62, 0.2);
      part(rbox(0.58, 0.3, 0.1, 0.04), hair, h, 0, 0.44, -0.25);
      // 3D glasses frames
      const frame = m('#141518', { roughness: 0.3 });
      for (const x of [-0.12, 0.12]) { const g = part(new THREE.TorusGeometry(0.075, 0.014, 6, 16), frame, h, x, 0.3, 0.27); g.scale.y = 0.85; }
      part(rbox(0.07, 0.015, 0.015, 0.005), frame, h, 0, 0.31, 0.27);
      // collar and green striped tie
      part(rbox(0.26, 0.08, 0.02, 0.01), white, this.torso, 0, 0.7, 0.182);
      part(rbox(0.08, 0.3, 0.02, 0.01), m('#3f7a52'), this.torso, 0, 0.56, 0.19);
      // V-neck of the vest
      for (const x of [-0.06, 0.06]) { const v = part(rbox(0.04, 0.2, 0.02, 0.01), m('#24492f'), this.torso, x, 0.62, 0.188); v.rotation.z = x > 0 ? 0.5 : -0.5; }
      // book (left hand) and magnifying glass (right hand)
      const book = this.prop(part(rbox(0.3, 0.38, 0.07, 0.02), m('#2f5d3c'), this.armL, 0.05, -0.62, 0.16));
      part(rbox(0.28, 0.36, 0.02, 0.01), m('#f1ead8'), book, 0, 0, 0.04);
      const mag = this.prop(new THREE.Group()); mag.position.set(0, -0.66, 0.1); this.armR.add(mag);
      part(rbox(0.04, 0.2, 0.04, 0.015), m('#3a3a3a'), mag, 0, -0.02, 0);
      part(new THREE.TorusGeometry(0.1, 0.018, 8, 20), m('#9aa0a6', { metalness: 0.8, roughness: 0.25 }), mag, 0, 0.16, 0);
      part(new THREE.CircleGeometry(0.09, 20), new THREE.MeshStandardMaterial({ color: '#dff3ff', transparent: true, opacity: 0.45, roughness: 0.05 }), mag, 0, 0.16, 0);
    } else if (this.id === 'development') {
      // spiky brown hair
      part(rbox(0.58, 0.14, 0.56, 0.06), hair, h, 0, 0.58, -0.01);
      for (let i = 0; i < 6; i++) { const sp = part(rbox(0.15, 0.2, 0.15, 0.04), hair, h, -0.2 + i * 0.08, 0.68 + (i % 2) * 0.05, -0.04 + (i % 3) * 0.08); sp.rotation.z = (i - 2.5) * 0.18; sp.rotation.x = -0.2; }
      part(rbox(0.58, 0.28, 0.1, 0.04), hair, h, 0, 0.44, -0.25);
      // hood, drawstrings, pocket
      part(rbox(0.56, 0.2, 0.14, 0.05), m('#33528a'), this.torso, 0, 0.68, -0.18);
      for (const x of [-0.08, 0.08]) part(rbox(0.02, 0.22, 0.02, 0.005), white, this.torso, x, 0.56, 0.19);
      part(rbox(0.4, 0.14, 0.02, 0.02), m('#33528a'), this.torso, 0, 0.14, 0.185);
      // headphones resting round the neck
      const band = part(new THREE.TorusGeometry(0.24, 0.03, 6, 20, Math.PI), m('#2a2d33'), this.torso, 0, 0.76, 0.02);
      band.rotation.x = Math.PI / 2; band.rotation.z = Math.PI;
      for (const x of [-0.24, 0.24]) { const cup = part(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14), m('#3a3e46'), this.torso, x, 0.76, 0.06); cup.rotation.z = Math.PI / 2; }
      // laptop held in front (base in hands, screen tilted up)
      const lap = this.prop(new THREE.Group()); lap.position.set(0.44, -0.62, 0.06); lap.rotation.x = 1.1; this.armL.add(lap);
      part(rbox(0.48, 0.03, 0.32, 0.01), m('#c7ccd3', { metalness: 0.6, roughness: 0.3 }), lap, 0, 0, 0);
      const scr = part(rbox(0.48, 0.3, 0.02, 0.01), m('#c7ccd3', { metalness: 0.6, roughness: 0.3 }), lap, 0, 0.15, -0.16); scr.rotation.x = -0.35;
      part(new THREE.PlaneGeometry(0.42, 0.25), new THREE.MeshBasicMaterial({ color: '#1e293b' }), scr, 0, 0, 0.012);
    } else if (this.id === 'social') {
      // tousled brown hair falling to the jaw
      part(rbox(0.6, 0.16, 0.58, 0.06), hair, h, 0, 0.6, -0.01);
      for (let i = 0; i < 5; i++) { const sp = part(rbox(0.14, 0.18, 0.14, 0.04), hair, h, -0.2 + i * 0.1, 0.7, 0.02 + (i % 2) * 0.06); sp.rotation.z = (i - 2) * 0.25; }
      for (const x of [-0.3, 0.3]) part(rbox(0.08, 0.42, 0.42, 0.04), hair, h, x, 0.36, -0.02);
      part(rbox(0.6, 0.44, 0.1, 0.04), hair, h, 0, 0.36, -0.26);
      // white shirt opening, lapels, belt
      part(rbox(0.2, 0.5, 0.02, 0.01), white, this.torso, 0, 0.48, 0.182);
      for (const x of [-0.12, 0.12]) { const lap = part(rbox(0.09, 0.36, 0.02, 0.01), m('#c9652b'), this.torso, x, 0.55, 0.19); lap.rotation.z = x > 0 ? 0.3 : -0.3; }
      part(rbox(0.66, 0.06, 0.37, 0.02), m('#1a1a1a'), this.torso, 0, 0.03, 0);
      part(rbox(0.08, 0.06, 0.02, 0.01), m('#d4a52c', { metalness: 0.8 }), this.torso, 0, 0.03, 0.19);
      // megaphone in the right hand
      const mega = this.prop(new THREE.Group()); mega.position.set(0, -0.68, 0.12); this.armR.add(mega);
      const cone = part(new THREE.CylinderGeometry(0.16, 0.06, 0.32, 16, 1, true), m('#f2f2f0', { side: THREE.DoubleSide }), mega, 0, 0.06, 0.16);
      cone.rotation.x = Math.PI / 2;
      part(new THREE.TorusGeometry(0.16, 0.025, 6, 20), m('#e2793a'), mega, 0, 0.06, 0.32);
      part(rbox(0.07, 0.16, 0.07, 0.02), m('#e2793a'), mega, 0, -0.06, 0);
    } else if (this.id === 'security') {
      // brown hair pulled into a high bun with a pink bow
      part(rbox(0.6, 0.18, 0.58, 0.07), hair, h, 0, 0.6, -0.01);
      for (const x of [-0.29, 0.29]) part(rbox(0.06, 0.3, 0.44, 0.03), hair, h, x, 0.44, -0.03);
      part(rbox(0.58, 0.32, 0.1, 0.04), hair, h, 0, 0.44, -0.26);
      part(new THREE.SphereGeometry(0.17, 12, 10), hair, h, 0, 0.78, -0.08);
      const bow = m('#f08cb0');
      for (const x of [-0.1, 0.1]) { const b = part(rbox(0.13, 0.1, 0.05, 0.02), bow, h, x, 0.76, 0.08); b.rotation.z = x > 0 ? -0.3 : 0.3; }
      part(new THREE.SphereGeometry(0.035, 8, 8), bow, h, 0, 0.76, 0.1);
      // white collar and blouse buttons
      for (const x of [-0.08, 0.08]) { const c = part(rbox(0.14, 0.08, 0.02, 0.01), white, this.torso, x, 0.71, 0.185); c.rotation.z = x > 0 ? -0.35 : 0.35; }
      for (let i = 0; i < 3; i++) part(new THREE.SphereGeometry(0.015, 6, 6), white, this.torso, 0, 0.58 - i * 0.12, 0.185);
      // clipboard (left hand) and service bell (right hand)
      const clip = this.prop(part(rbox(0.28, 0.38, 0.03, 0.02), m('#b98c5a'), this.armL, 0.05, -0.64, 0.16));
      part(rbox(0.24, 0.3, 0.01, 0.005), white, clip, 0, -0.02, 0.02);
      part(rbox(0.1, 0.04, 0.03, 0.01), m('#9aa0a6', { metalness: 0.8 }), clip, 0, 0.18, 0.02);
      const bell = this.prop(new THREE.Group()); bell.position.set(0, -0.7, 0.1); this.armR.add(bell);
      part(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 16), m('#1f1f22'), bell, 0, 0, 0);
      part(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), m('#d9dde1', { metalness: 0.9, roughness: 0.2 }), bell, 0, 0.015, 0);
    }
  }

  // ---------------------------------------------------------- movement
  walkTo(points, onArrive) {
    this.standUp();
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.onArrive = onArrive;
  }
  get walking() { return this.path.length > 0; }

  sitAt(seat) {
    this.seat = seat;
    this.seated = true;
    this.root.position.set(seat.x, 0, seat.z);
    this.heading = seat.heading;
  }
  standUp() { this.seated = false; }

  faceTowards(x, z) { this.heading = Math.atan2(x - this.root.position.x, z - this.root.position.z); }

  talk(seconds = 5) { this.talkUntil = performance.now() / 1000 + seconds; }
  celebrate(seconds = 3) { this.celebrateUntil = performance.now() / 1000 + seconds; }
  notify() { this.bounce = 1; }

  // ---------------------------------------------------------- per frame
  update(dt, t, status) {
    const p = this.root.position;
    // follow path
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - p.x; const dz = target.z - p.z; const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        this.path.shift();
        if (!this.path.length) { const cb = this.onArrive; this.onArrive = null; cb?.(); }
      } else {
        const step = Math.min(dist, this.speed * dt);
        p.x += (dx / dist) * step; p.z += (dz / dist) * step;
        this.heading = Math.atan2(dx, dz);
      }
    }
    // smooth heading
    let diff = this.heading - this.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.root.rotation.y += diff * Math.min(1, dt * 8);

    const walking = this.path.length > 0;
    const talking = t < this.talkUntil || status === 'talking';
    const celebrating = t < this.celebrateUntil || status === 'completed';
    const T = { legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: 0.06, armRz: -0.06, headY: 0, headX: 0, headZ: 0, bodyY: 0, torsoX: 0 };

    if (walking) {
      this.walkPhase += dt * this.speed * 4.2;
      const sw = Math.sin(this.walkPhase);
      T.legL = sw * 0.65; T.legR = -sw * 0.65; T.armLx = -sw * 0.55; T.armRx = sw * 0.55;
      T.bodyY = Math.abs(Math.cos(this.walkPhase)) * 0.06;
    } else if (this.seated) {
      T.legL = T.legR = -1.5; T.bodyY = -0.26;
      if (status === 'working') {
        T.armLx = -1.2 + Math.sin(t * 17) * 0.09; T.armRx = -1.2 + Math.sin(t * 17 + 1.6) * 0.09; T.armLz = 0.2; T.armRz = -0.2;
        T.headX = 0.12 + Math.sin(t * 2) * 0.03; T.torsoX = 0.08;
      } else if (status === 'thinking') {
        T.armRx = -2.3; T.armRz = 0.55; T.armLx = -0.9; T.headZ = 0.14; T.headX = -0.15 + Math.sin(t * 1.4) * 0.04;
      } else if (status === 'error') {
        T.armLx = T.armRx = -2.6; T.armLz = 0.6; T.armRz = -0.6; T.headY = Math.sin(t * 9) * 0.3;
      } else {
        T.armLx = T.armRx = -0.55;
        T.headY = Math.sin(t * 0.5 + this.id.length) * 0.35;
      }
    } else {
      // standing idle
      T.headY = Math.sin(t * 0.45 + this.id.length) * 0.4;
      T.armLx = Math.sin(t * 1.1) * 0.05; T.armRx = -Math.sin(t * 1.1) * 0.05;
      const pose = {
        ceo: () => { T.armLx = -1.35; T.armRx = -1.2; T.armLz = 0.85; T.armRz = -0.85; }, // arms crossed
        research: () => { T.armLx = -1.0; T.armLz = 0.15; T.armRx = -0.9; T.armRz = -0.1; T.headX = 0.12; },
        development: () => { T.armLx = -1.1; T.armRx = -1.1; T.armLz = 0.05; T.armRz = -0.05; T.headX = 0.25; },
        social: () => { T.armRx = -2.2 + Math.sin(t * 2) * 0.1; T.armRz = -0.2; T.armLx = -0.2; },
        security: () => { T.armLx = -0.9; T.armLz = 0.15; T.armRx = -0.7; T.armRz = -0.1; },
      }[this.id];
      pose?.();
      if (status === 'thinking') { T.armRx = -2.3; T.armRz = 0.55; T.headZ = 0.14; }
      if (status === 'error') { T.headY = Math.sin(t * 9) * 0.3; T.armLx = T.armRx = -0.3; }
    }
    if (talking && !walking) {
      T.armRx = (this.seated ? -0.9 : -0.6) + Math.sin(t * 3.2) * 0.35; T.armRz = -0.25;
      if (!this.seated) T.armLx = -0.3 + Math.sin(t * 2.6 + 1) * 0.2;
      T.headX = Math.sin(t * 6) * 0.06;
    }
    if (celebrating && !walking) {
      T.armLx = T.armRx = -2.9; T.armLz = 0.35 + Math.sin(t * 10) * 0.2; T.armRz = -0.35 - Math.sin(t * 10) * 0.2;
      T.bodyY += Math.abs(Math.sin(t * 7)) * (this.seated ? 0.06 : 0.35);
    }
    if (this.bounce > 0) { this.bounce = Math.max(0, this.bounce - dt * 1.6); T.bodyY += Math.sin(this.bounce * Math.PI * 3) * 0.12 * this.bounce; }

    // props in hand only while standing (not typing at the desk or walking fast)
    const showProps = !this.seated;
    for (const p of this.props) p.visible = showProps;

    const k = 12;
    this.legL.rotation.x = damp(this.legL.rotation.x, T.legL, k, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, T.legR, k, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, T.armLx, k, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, T.armRx, k, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, T.armLz, k, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, T.armRz, k, dt);
    this.head.rotation.y = damp(this.head.rotation.y, T.headY, 6, dt);
    this.head.rotation.x = damp(this.head.rotation.x, T.headX, 8, dt);
    this.head.rotation.z = damp(this.head.rotation.z, T.headZ, 8, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, T.torsoX, 8, dt);
    this.body.position.y = damp(this.body.position.y, T.bodyY, 14, dt);
    // breathing
    this.torso.scale.y = 1 + Math.sin(t * 2.2 + this.id.length) * 0.012;
    // seated: shift body back so thighs rest on the seat
    this.body.position.z = damp(this.body.position.z, this.seated && !walking ? -0.12 : 0, 10, dt);

    // face: talking mouth + blinking
    let face = this.faces.normal;
    if (talking && Math.floor(t * 9) % 2 === 0) face = this.faces.talk;
    if (t > this.blinkAt) { face = this.faces.blink; if (t > this.blinkAt + 0.13) this.blinkAt = t + 2.5 + Math.random() * 3.5; }
    if (this.faceMat.map !== face) { this.faceMat.map = face; this.faceMat.needsUpdate = true; }

    // status ring
    const ringColor = { working: '#38bdf8', thinking: '#7dd3fc', talking: '#34d399', meeting: '#a78bfa', completed: '#facc15', error: '#f87171' }[status];
    this.ring.material.opacity = damp(this.ring.material.opacity, ringColor ? 0.75 : 0, 6, dt);
    if (ringColor) this.ring.material.color.set(ringColor);
    this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
  }

  headWorldPosition(v) {
    return this.head.getWorldPosition(v).add(new THREE.Vector3(0, 0.75, 0));
  }
}
