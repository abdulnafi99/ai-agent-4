// Stylised blocky 3D characters with procedural animation states:
// idle, working (typing), thinking, talking, walking, meeting (seated),
// completed (celebrating) and error (warning).
import * as THREE from 'three';
import { faceTextures } from './textures.js';

const STYLES = {
  ceo: { skin: '#d9a37a', shirt: '#1f2a44', pants: '#1c1f24', shoes: '#0b0b0b', hair: '#1a1410', face: { beard: true } },
  research: { skin: '#b97a56', shirt: '#f8fafc', pants: '#334155', shoes: '#1e293b', hair: '#2b1d16', face: { glasses: true, lashes: true } },
  development: { skin: '#f1c7a0', shirt: '#6d28d9', pants: '#1e3a8a', shoes: '#f5f5f5', hair: '#3b2a1e', face: {} },
  security: { skin: '#c99068', shirt: '#1c1917', pants: '#292524', shoes: '#0c0a09', hair: '#1a120c', face: { lashes: true } },
  social: { skin: '#e0ac85', shirt: '#db2777', pants: '#f5f5f4', shoes: '#be185d', hair: '#5a2d1a', face: { lashes: true } },
};

const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...o });
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

export class Avatar {
  constructor(id, quality) {
    this.id = id;
    const s = STYLES[id];
    this.style = s;
    this.root = new THREE.Group();
    this.root.userData.click = { type: 'agent', id };
    this.body = new THREE.Group();
    this.root.add(this.body);
    const shadows = quality !== 'low';
    const part = (geo, mat, parent, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadows;
      mesh.userData.click = { type: 'agent', id };
      parent.add(mesh);
      return mesh;
    };
    const skin = m(s.skin);

    // legs (pivot at hip)
    this.legL = new THREE.Group(); this.legL.position.set(-0.15, 0.78, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.15, 0.78, 0);
    for (const leg of [this.legL, this.legR]) {
      part(new THREE.BoxGeometry(0.26, 0.66, 0.28), m(s.pants), leg, 0, -0.33, 0);
      part(new THREE.BoxGeometry(0.28, 0.12, 0.36), m(s.shoes), leg, 0, -0.72, 0.04);
      this.body.add(leg);
    }
    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.78; this.body.add(this.torso);
    part(new THREE.BoxGeometry(0.64, 0.72, 0.34), m(s.shirt), this.torso, 0, 0.36, 0);
    // arms (pivot at shoulder)
    this.armL = new THREE.Group(); this.armL.position.set(-0.43, 0.68, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.43, 0.68, 0);
    for (const arm of [this.armL, this.armR]) {
      part(new THREE.BoxGeometry(0.21, 0.5, 0.23), m(id === 'research' ? '#f8fafc' : s.shirt), arm, 0, -0.22, 0);
      part(new THREE.BoxGeometry(0.19, 0.2, 0.21), skin, arm, 0, -0.56, 0);
      this.torso.add(arm);
    }
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.74; this.torso.add(this.head);
    this.faces = faceTextures(s.skin, s.face);
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faces.normal, roughness: 0.7 });
    const headMats = [skin, skin, skin, skin, this.faceMat, skin];
    part(new THREE.BoxGeometry(0.5, 0.5, 0.48), headMats, this.head, 0, 0.27, 0);
    part(new THREE.BoxGeometry(0.2, 0.1, 0.2), skin, this.torso, 0, 0.76, 0); // neck
    this.accessorize(part);

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

  accessorize(part) {
    const s = this.style; const hair = m(s.hair); const h = this.head;
    if (this.id === 'ceo') {
      part(new THREE.BoxGeometry(0.54, 0.14, 0.52), hair, h, 0, 0.57, -0.01);
      part(new THREE.BoxGeometry(0.54, 0.3, 0.1), hair, h, 0, 0.42, -0.24);
      part(new THREE.BoxGeometry(0.1, 0.5, 0.02), m('#10b981', { emissive: '#065f46', emissiveIntensity: 0.3 }), this.torso, 0, 0.42, 0.18); // tie
      part(new THREE.BoxGeometry(0.3, 0.12, 0.02), m('#f8fafc'), this.torso, 0, 0.66, 0.175); // collar
      part(new THREE.BoxGeometry(0.06, 0.06, 0.02), m('#fbbf24', { metalness: 0.9 }), this.torso, -0.2, 0.55, 0.18); // pin
    } else if (this.id === 'research') {
      part(new THREE.BoxGeometry(0.54, 0.16, 0.52), hair, h, 0, 0.57, -0.01);
      part(new THREE.BoxGeometry(0.54, 0.4, 0.12), hair, h, 0, 0.36, -0.22);
      part(new THREE.SphereGeometry(0.15, 10, 8), hair, h, 0, 0.62, -0.25); // bun
      part(new THREE.BoxGeometry(0.66, 0.36, 0.36), m('#f8fafc'), this.torso, 0, 0.0, 0); // coat tails
      part(new THREE.BoxGeometry(0.12, 0.4, 0.02), m('#38bdf8'), this.torso, 0, 0.42, 0.176); // blouse
      part(new THREE.BoxGeometry(0.12, 0.03, 0.02), m('#111827'), this.torso, 0.18, 0.56, 0.18); // pen
    } else if (this.id === 'development') {
      for (let i = 0; i < 5; i++) part(new THREE.BoxGeometry(0.16, 0.12, 0.16), hair, h, -0.2 + i * 0.1, 0.56 + (i % 2) * 0.04, -0.05 + (i % 3) * 0.06);
      part(new THREE.BoxGeometry(0.54, 0.12, 0.5), hair, h, 0, 0.54, -0.02);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20, Math.PI), m('#111827'));
      band.position.set(0, 0.3, 0); band.rotation.z = 0; h.add(band);
      for (const x of [-0.29, 0.29]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12), m('#a78bfa', { emissive: '#7c3aed', emissiveIntensity: 0.4 }));
        cup.rotation.z = Math.PI / 2; cup.position.set(x, 0.27, 0); h.add(cup);
      }
      part(new THREE.BoxGeometry(0.5, 0.22, 0.12), m('#5b21b6'), this.torso, 0, 0.62, -0.2); // hood
      part(new THREE.BoxGeometry(0.3, 0.12, 0.02), m('#ede9fe'), this.torso, 0, 0.3, 0.176); // logo
    } else if (this.id === 'security') {
      part(new THREE.BoxGeometry(0.56, 0.14, 0.54), hair, h, 0, 0.56, -0.01);
      part(new THREE.BoxGeometry(0.56, 0.42, 0.12), hair, h, 0, 0.34, -0.23);
      part(new THREE.BoxGeometry(0.14, 0.42, 0.14), hair, h, 0, 0.12, -0.32); // ponytail
      // headset with boom mic
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 20, Math.PI), m('#0c0a09'));
      band.position.set(0, 0.3, 0); h.add(band);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 12), m('#fb923c', { emissive: '#c2410c', emissiveIntensity: 0.4 }));
      cup.rotation.z = Math.PI / 2; cup.position.set(0.29, 0.27, 0); h.add(cup);
      part(new THREE.BoxGeometry(0.03, 0.03, 0.22), m('#0c0a09'), h, 0.27, 0.15, 0.12);
      // jacket trim and badge
      part(new THREE.BoxGeometry(0.06, 0.66, 0.02), m('#fb923c'), this.torso, -0.13, 0.36, 0.176);
      part(new THREE.BoxGeometry(0.06, 0.66, 0.02), m('#fb923c'), this.torso, 0.13, 0.36, 0.176);
      part(new THREE.BoxGeometry(0.12, 0.08, 0.02), m('#fde68a', { metalness: 0.6 }), this.torso, -0.22, 0.56, 0.18);
    } else if (this.id === 'social') {
      part(new THREE.BoxGeometry(0.56, 0.14, 0.54), hair, h, 0, 0.56, -0.01);
      part(new THREE.BoxGeometry(0.58, 0.62, 0.14), hair, h, 0, 0.22, -0.23);
      const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), m('#111827'));
      beret.position.set(0.04, 0.66, 0); beret.rotation.z = -0.18; h.add(beret);
      this.phone = part(new THREE.BoxGeometry(0.1, 0.18, 0.02), m('#0f172a', { emissive: '#f472b6', emissiveIntensity: 0.3 }), this.armR, 0, -0.66, 0.12);
      part(new THREE.BoxGeometry(0.66, 0.06, 0.36), m('#fbcfe8'), this.torso, 0, 0.1, 0);
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
      if (this.id === 'social') { T.armRx = -1.25; T.armRz = 0.25; T.headX = 0.2; } // checking phone
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
