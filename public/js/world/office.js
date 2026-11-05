// Builds a two-storey office: a mezzanine with colourful private rooms
// (CEO, meeting room, Security) above an open ground floor (Development,
// reception, Creative, Research), joined by wooden bleacher stairs beside a
// big bookshelf wall. Everything is lightweight procedural geometry.
import * as THREE from 'three';
import { Screen, boardTexture, signTexture, cityTexture, posterTexture, letteringTexture } from './textures.js';

// ----------------------------------------------------------- layout data
export const LEVEL_Y = 3.2;        // height of the mezzanine floor
export const WALK_Z = -6.3;        // centre line of the mezzanine walkway
const MEZZ = { x: [-22, 9], z: [-16, -5] };

const PALETTE = {
  navy: '#56658f', terracotta: '#d98463', sage: '#8fae88', wood: '#d2a679', woodDark: '#a87449',
  floor: '#e4e1db', black: '#25282d', white: '#f3f1ec', beige: '#d8c7a4',
};

export const ROOMS = {
  ceo: { name: 'CEO Office', x: [-22, -8.5], z: [-16, -7.5], level: 1, floor: PALETTE.wood, wall: PALETTE.navy, accent: '#10b981' },
  meeting: { name: 'Meeting Room', x: [-8.5, 2.5], z: [-16, -7.5], level: 1, floor: PALETTE.wood, wall: PALETTE.sage, accent: '#34d399' },
  security: { name: 'Security Ops Centre', x: [2.5, 9], z: [-16, -7.5], level: 1, floor: PALETTE.wood, wall: PALETTE.terracotta, accent: '#fb923c' },
  research: { name: 'Research Lab', x: [9, 22], z: [-16, -5], level: 0, floor: PALETTE.floor, wall: PALETTE.navy, accent: '#38bdf8' },
  development: { name: 'Development Studio', x: [-22, -5], z: [5, 16], level: 0, floor: PALETTE.wood, wall: PALETTE.black, accent: '#a78bfa' },
  social: { name: 'Creative Studio', x: [5, 22], z: [5, 16], level: 0, floor: PALETTE.floor, wall: PALETTE.navy, accent: '#f472b6' },
  lobby: { name: 'Reception', x: [-5, 5], z: [5, 16], level: 0, floor: PALETTE.floor, accent: '#10b981' },
};

export const DOORS = {
  ceo: { x: -15, z: -7.5, y: LEVEL_Y },
  meeting: { x: -3, z: -7.5, y: LEVEL_Y },
  security: { x: 5.75, z: -7.5, y: LEVEL_Y },
  research: { x: 14, z: -5, y: 0 },
  development: { x: -13, z: 5, y: 0 },
  social: { x: 13, z: 5, y: 0 },
};

// Where each agent sits (heading: rotation.y, 0 faces +z).
export const DESKS = {
  ceo: { x: -15, z: -12.6, y: LEVEL_Y, heading: 0, room: 'ceo' },
  research: { x: 14, z: -11.6, y: 0, heading: 0, room: 'research' },
  security: { x: 5.75, z: -12.2, y: LEVEL_Y, heading: 0, room: 'security' },
  development: { x: -13, z: 10.6, y: 0, heading: Math.PI, room: 'development' },
  social: { x: 13, z: 10.6, y: 0, heading: Math.PI, room: 'social' },
};

export const TABLE = { x: -3, z: -12.2 };
export const MEETING_SEATS = [
  { x: -3, z: -14.8, heading: 0 },
  { x: -5.2, z: -12.2, heading: Math.PI / 2 },
  { x: -0.8, z: -12.2, heading: -Math.PI / 2 },
  { x: -5.2, z: -10.8, heading: Math.PI / 2 },
  { x: -0.8, z: -10.8, heading: -Math.PI / 2 },
  { x: -3, z: -9.6, heading: Math.PI },
].map((s) => ({ ...s, y: LEVEL_Y }));

// Wooden bleacher stairs from the ground-floor corridor up to the mezzanine walkway.
export const STAIR = { bottom: { x: 6.2, y: 0, z: -0.3 }, top: { x: 6.2, y: LEVEL_Y, z: -5.6 } };

export const AMBIENT_SPOTS = [
  { x: 3.3, z: 1.4, heading: Math.PI / 2, label: 'coffee' },
  { x: -20.2, z: -1.2, heading: -Math.PI / 2, label: 'elevator' },
  { x: -3.5, z: 1.8, heading: 0, label: 'cooler' },
  { x: -1, z: 7.2, heading: 0, label: 'reception' },
  { x: 18, z: -2.5, heading: 0, label: 'window' },
  { x: -8, z: 2.6, heading: Math.PI / 2, label: 'lounge' },
].map((s) => ({ ...s, y: 0 }));

export const FOCUS = {
  overview: { pos: [24, 31, 38], target: [0, 1.5, 0] },
  ceo: { pos: [-8, 16, 0], target: [-15, LEVEL_Y, -11.5] },
  meeting: { pos: [4, 16, -1], target: [-3, LEVEL_Y, -12] },
  security: { pos: [12, 16, -1], target: [5.75, LEVEL_Y, -11.5] },
  research: { pos: [21, 13, 3], target: [14, 0, -11] },
  development: { pos: [-7, 13, 23], target: [-13, 0, 10] },
  social: { pos: [19, 13, 23], target: [13, 0, 10] },
};

// ----------------------------------------------------------- helpers
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.03, ...opts }));
  return matCache.get(key);
}
const geoCache = new Map();
function boxGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

export class Office {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.ground = new THREE.Group();
    scene.add(this.ground);
    this.upper = new THREE.Group();
    this.upper.position.y = LEVEL_Y;
    this.ground.add(this.upper);
    this.root = this.ground;
    this.clickables = [];
    this.screens = [];
    this.doors = [];
    this.lamps = [];
    this.pointLights = [];
    this.spinners = [];
    this.leds = [];
    this.windowMats = [];
    this.roomLabels = [];
    this.build();
  }

  get levelY() { return this.root === this.upper ? LEVEL_Y : 0; }

  box(w, h, d, color, x, y, z, parent = this.root, opts) {
    const m = new THREE.Mesh(boxGeo(w, h, d), typeof color === 'string' ? mat(color, opts) : color);
    m.position.set(x, y, z);
    m.castShadow = this.quality !== 'low';
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  clickable(obj, data) {
    obj.userData.click = data;
    this.clickables.push(obj);
    return obj;
  }

  build() {
    this.buildShell();
    this.buildMezzanine();
    this.buildStairsAndShelves();
    this.buildResearch();
    this.buildDevelopment();
    this.buildSocial();
    this.buildLobby();
    this.buildElevator();
    // upper floor rooms are built inside the raised group
    this.root = this.upper;
    this.buildCEO();
    this.buildMeeting();
    this.buildSecurity();
    this.root = this.ground;
    this.buildSigns();
  }

  // ------------------------------------------------------- shell & floors
  buildShell() {
    const base = this.box(46, 0.4, 34, '#3a3d44', 0, -0.2, 0);
    base.castShadow = false;
    const corridor = this.box(44, 0.02, 32, mat(PALETTE.floor, { roughness: 0.8 }), 0, 0.01, 0);
    corridor.castShadow = false;
    for (const [id, r] of Object.entries(ROOMS)) {
      const w = r.x[1] - r.x[0]; const d = r.z[1] - r.z[0];
      const y = r.level ? LEVEL_Y : 0;
      const f = this.box(w - 0.1, 0.04, d - 0.1, mat(r.floor, { roughness: 0.6 }), (r.x[0] + r.x[1]) / 2, y + 0.03, (r.z[0] + r.z[1]) / 2);
      f.castShadow = false;
      if (id !== 'lobby') this.clickable(f, { type: id === 'meeting' ? 'meeting' : 'department', id });
      const labelZ = id.match(/development|social|lobby/) ? r.z[1] - 1 : r.z[0] + 1.1;
      this.roomLabels.push({ text: r.name, pos: new THREE.Vector3((r.x[0] + r.x[1]) / 2, y + 0.1, labelZ) });
    }
    // outer walls: tall at the back and left, low cut-away at the front and right
    const wall = mat('#ece8e0', { roughness: 0.9 });
    const cap = mat('#33363d', { roughness: 0.7 });
    const H = LEVEL_Y + 3.2;
    this.box(44.4, H, 0.3, wall, 0, H / 2, -16.15);
    this.box(0.3, H, 32.6, wall, -22.15, H / 2, 0);
    this.box(0.3, 1.1, 32.6, wall, 22.15, 0.55, 0);
    this.box(44.4, 1.1, 0.3, wall, 0, 0.55, 16.15);
    this.box(44.6, 0.14, 0.36, cap, 0, H + 0.07, -16.15);
    this.box(0.36, 0.14, 32.8, cap, -22.15, H + 0.07, 0);
    this.box(0.36, 0.14, 32.8, cap, 22.15, 1.17, 0);
    this.box(44.6, 0.14, 0.36, cap, 0, 1.17, 16.15);
    const city = cityTexture();
    for (const z of [9, 13]) {
      const wm = new THREE.MeshStandardMaterial({ color: '#b9d6e0', emissive: '#d6eef5', emissiveIntensity: 0.6, map: city, roughness: 0.1 });
      this.windowMats.push(wm);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 2.2), wm);
      w.rotation.y = Math.PI / 2; w.position.set(-21.99, 1.9, z); this.root.add(w);
    }
  }

  // ------------------------------------------------------- mezzanine slab, walkway, railing
  buildMezzanine() {
    const w = MEZZ.x[1] - MEZZ.x[0]; const d = MEZZ.z[1] - MEZZ.z[0];
    const cx = (MEZZ.x[0] + MEZZ.x[1]) / 2; const cz = (MEZZ.z[0] + MEZZ.z[1]) / 2;
    this.box(w, 0.3, d, '#2c2f35', cx, LEVEL_Y - 0.17, cz);
    const walk = this.box(w - 0.1, 0.04, 2.5, mat(PALETTE.wood, { roughness: 0.6 }), cx, LEVEL_Y + 0.02, -6.25);
    walk.castShadow = false;
    this.box(w, 0.32, 0.08, '#1f2227', cx, LEVEL_Y - 0.16, -5.02);
    for (const x of [-20, -14, -8, -2.2]) this.box(0.28, LEVEL_Y - 0.3, 0.28, PALETTE.black, x, (LEVEL_Y - 0.3) / 2, -5.3);
    // glass railing with black posts along the walkway edge (opening at the stairs)
    const railGlass = mat('#dfeee9', { transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false });
    for (const [x1, x2] of [[MEZZ.x[0], 3.85], [8.6, MEZZ.x[1]]]) {
      const len = x2 - x1; if (len <= 0.1) continue;
      const mx = (x1 + x2) / 2;
      const g = new THREE.Mesh(boxGeo(len, 0.9, 0.04), railGlass); g.position.set(mx, LEVEL_Y + 0.5, -5.1); g.renderOrder = 2; this.root.add(g);
      this.box(len, 0.05, 0.07, PALETTE.black, mx, LEVEL_Y + 0.97, -5.1);
      for (let x = x1; x <= x2 + 0.01; x += Math.max(len / Math.ceil(len / 1.5), 0.4)) this.box(0.05, 1, 0.05, PALETTE.black, x, LEVEL_Y + 0.5, -5.1);
    }
    // ground-floor lounge tucked under the mezzanine (black sofas)
    const sofa = mat('#2a2c31', { roughness: 0.8 });
    this.box(3, 0.45, 0.9, sofa, -17.5, 0.3, -9);
    this.box(3, 0.6, 0.25, sofa, -17.5, 0.6, -9.45);
    this.box(0.9, 0.45, 2.4, sofa, -19.4, 0.3, -7.9);
    this.box(1.2, 0.35, 0.8, mat('#3b3e45'), -17.4, 0.22, -7.6);
    this.roomLight(-12, -9, '#ffe9cf', 2.4);
  }

  buildStairsAndShelves() {
    const steps = 8; const rise = LEVEL_Y / steps; const run = (5.0 - 0.4) / steps;
    const cushion = [PALETTE.navy, PALETTE.terracotta, PALETTE.sage];
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1);
      const z = -0.4 - (i + 0.5) * run;
      this.box(4.7, top, run, mat(PALETTE.wood, { roughness: 0.55 }), 6.2, top / 2, z);
      if (i % 2 === 1) {
        const c = this.box(0.7, 0.08, run * 0.7, mat(cushion[(i >> 1) % 3], { roughness: 0.95 }), 4.6 + ((i * 3) % 2), top + 0.04, z);
        c.castShadow = false;
      }
    }
    this.plant(8.1, -3.2, 0.6); this.plant(4.3, -1.5, 0.6);
    const railLen = Math.hypot(4.6, LEVEL_Y);
    const rail = this.box(0.05, 0.05, railLen, PALETTE.black, 8.55, LEVEL_Y / 2 + 0.95, -2.7);
    rail.rotation.x = Math.atan2(LEVEL_Y, 4.6);
    // big bookshelf wall under the mezzanine edge, next to the stairs
    const shelf = new THREE.Group(); shelf.position.set(2.2, 0, -5.25); this.root.add(shelf);
    const wood = mat(PALETTE.woodDark, { roughness: 0.6 });
    const cols = 5; const rows = 4; const W = 3.2; const Hs = LEVEL_Y - 0.35;
    this.box(W, Hs, 0.45, mat('#c19468'), 0, Hs / 2, 0, shelf);
    for (let c = 0; c <= cols; c++) this.box(0.05, Hs, 0.5, wood, -W / 2 + (W / cols) * c, Hs / 2, 0.02, shelf);
    for (let r = 0; r <= rows; r++) this.box(W, 0.05, 0.5, wood, 0, (Hs / rows) * r, 0.02, shelf);
    const bookColors = [PALETTE.navy, PALETTE.terracotta, PALETTE.sage, '#f0e6d2', PALETTE.black];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if ((r + c) % 3 === 2) continue;
      for (let b = 0; b < 3; b++) this.box(0.1, 0.32 + ((b + r) % 2) * 0.08, 0.3, bookColors[(r * 2 + c + b) % 5], -W / 2 + (W / cols) * (c + 0.3) + b * 0.12, (Hs / rows) * r + 0.22, 0.05, shelf);
    }
    // decorative black metal staircase on the left
    const metal = mat(PALETTE.black, { metalness: 0.5, roughness: 0.4 });
    for (let i = 0; i < 10; i++) this.box(1.1, 0.05, 0.38, metal, -11, (i + 1) * (LEVEL_Y / 10), -1.2 - i * 0.38);
    const stringer = this.box(0.05, 0.12, Math.hypot(3.8, LEVEL_Y), metal, -10.42, LEVEL_Y / 2, -3.1);
    stringer.rotation.x = Math.atan2(LEVEL_Y, 3.8);
    const stringer2 = stringer.clone(); stringer2.position.x = -11.58; this.root.add(stringer2);
  }

  // ------------------------------------------------------- walls & doors
  wall(x1, z1, x2, z2, color, h = 2.9, t = 0.14) {
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.05) return null;
    const g = new THREE.Group();
    g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    g.rotation.y = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
    this.root.add(g);
    this.box(len, h, t, mat(color, { roughness: 0.9 }), 0, h / 2, 0, g);
    this.box(len, 0.08, t + 0.02, '#2b2e33', 0, h + 0.04, 0, g);
    return g;
  }

  glassWall(x1, z1, x2, z2, frameColor = PALETTE.black, h = 2.9) {
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.05) return;
    const g = new THREE.Group();
    g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    g.rotation.y = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
    this.root.add(g);
    const glass = new THREE.Mesh(boxGeo(len, h - 0.1, 0.04), mat('#d8ebe6', { transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    glass.position.y = h / 2; glass.renderOrder = 2; g.add(glass);
    const frame = mat(frameColor, { metalness: 0.3, roughness: 0.45 });
    this.box(len, 0.07, 0.08, frame, 0, 0.035, 0, g);
    this.box(len, 0.07, 0.08, frame, 0, h, 0, g);
    for (let p = -len / 2; p <= len / 2 + 0.01; p += Math.max(len / Math.ceil(len / 1.4), 0.4)) this.box(0.05, h, 0.07, frame, p, h / 2, 0, g);
  }

  frontWall(x1, x2, z, doorX, kind, color, h = 2.9) {
    if (kind === 'glass') { this.glassWall(x1, z, doorX - 1, z, color, h); this.glassWall(doorX + 1, z, x2, z, color, h); }
    else { this.wall(x1, z, doorX - 1, z, color, h); this.wall(doorX + 1, z, x2, z, color, h); }
  }

  slidingDoor(x, z, room, kind = 'glass') {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.root.add(g);
    const frameMat = mat(PALETTE.black, { metalness: 0.3, roughness: 0.4 });
    this.box(0.1, 2.9, 0.14, frameMat, -1.02, 1.45, 0, g);
    this.box(0.1, 2.9, 0.14, frameMat, 1.02, 1.45, 0, g);
    this.box(2.14, 0.2, 0.16, frameMat, 0, 2.85, 0, g);
    const panelMat = kind === 'wood'
      ? mat('#b98656', { roughness: 0.55 })
      : mat('#d8ebe6', { transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.3, depthWrite: false });
    const left = new THREE.Mesh(boxGeo(1, 2.7, 0.05), panelMat); left.position.set(-0.5, 1.35, 0.03);
    const right = new THREE.Mesh(boxGeo(1, 2.7, 0.05), panelMat); right.position.set(0.5, 1.35, -0.03);
    left.renderOrder = right.renderOrder = 2;
    g.add(left, right);
    this.doors.push({ x, z, y: this.levelY, left, right, open: 0, room });
  }

  // ------------------------------------------------------- furniture kit
  desk(x, z, w, d, rot, color = PALETTE.wood, parent = this.root, legColor = '#2f3339') {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
    this.box(w, 0.07, d, mat(color, { roughness: 0.45 }), 0, 0.82, 0, g);
    this.box(0.06, 0.8, d - 0.1, legColor, -w / 2 + 0.08, 0.41, 0, g);
    this.box(0.06, 0.8, d - 0.1, legColor, w / 2 - 0.08, 0.41, 0, g);
    this.box(w - 0.2, 0.4, 0.04, legColor, 0, 0.55, -d / 2 + 0.1, g);
    return g;
  }

  chair(x, z, rot, color = PALETTE.black, exec = false, parent = this.root) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
    this.box(0.6, 0.1, 0.56, color, 0, 0.48, 0, g);
    this.box(0.58, exec ? 1.0 : 0.62, 0.09, color, 0, exec ? 1.0 : 0.82, -0.27, g);
    if (exec) this.box(0.4, 0.2, 0.12, color, 0, 1.55, -0.27, g);
    this.box(0.06, 0.4, 0.06, '#9ca3af', 0, 0.24, 0, g, { metalness: 0.8, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 5), mat('#374151', { metalness: 0.6 }));
    base.position.y = 0.04; g.add(base);
    return g;
  }

  cafeChair(x, z, rot, color = PALETTE.terracotta, parent = this.root) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
    this.box(0.46, 0.06, 0.44, color, 0, 0.46, 0, g);
    this.box(0.46, 0.4, 0.05, color, 0, 0.7, -0.2, g);
    for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) this.box(0.03, 0.46, 0.03, PALETTE.black, lx, 0.23, lz, g);
    return g;
  }

  monitor(x, y, z, rot, w, h, screen, parent = this.root, agentId) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
    this.box(w + 0.06, h + 0.06, 0.04, '#111517', 0, h / 2 + 0.16, 0, g, { metalness: 0.5, roughness: 0.3 });
    const sm = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), sm);
    s.position.set(0, h / 2 + 0.16, 0.022); g.add(s);
    this.box(0.05, 0.16, 0.05, '#1f2937', 0, 0.08, -0.03, g);
    this.box(0.24, 0.015, 0.16, '#1f2937', 0, 0.007, -0.02, g);
    if (agentId) this.clickable(s, { type: 'computer', id: agentId });
    return g;
  }

  benchRow(x, z, len, rot) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; this.root.add(g);
    this.box(len, 0.06, 1.3, mat(PALETTE.wood, { roughness: 0.45 }), 0, 0.78, 0, g);
    this.box(len - 0.2, 0.3, 0.04, mat(PALETTE.navy), 0, 0.96, 0, g);
    for (const ex of [-len / 2 + 0.1, len / 2 - 0.1]) this.box(0.06, 0.76, 1.2, PALETTE.black, ex, 0.38, 0, g);
    const n = Math.max(2, Math.floor(len / 1.2));
    for (let i = 0; i < n; i++) {
      const px = -len / 2 + (i + 0.5) * (len / n);
      for (const side of [-1, 1]) {
        const mon = this.box(0.5, 0.32, 0.03, '#15181c', px, 1.04, side * 0.22, g);
        mon.castShadow = false;
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({ color: i % 2 ? '#dbeafe' : '#e2f5ec' }));
        scr.position.set(px, 1.04, side * 0.24); scr.rotation.y = side > 0 ? 0 : Math.PI; g.add(scr);
        const holder = new THREE.Group(); holder.position.set(px, 0, side * 0.95); g.add(holder);
        this.chair(0, 0, side > 0 ? Math.PI : 0, PALETTE.black, false, holder);
      }
    }
    return g;
  }

  plant(x, z, scale = 1, potColor = PALETTE.terracotta) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); this.root.add(g);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 10), mat(potColor, { roughness: 0.8 }));
    pot.position.y = 0.25; pot.castShadow = this.quality !== 'low'; g.add(pot);
    const leafMat = mat('#3f7d4f', { roughness: 0.8, flatShading: true });
    const leafMat2 = mat('#5a9a5f', { roughness: 0.8, flatShading: true });
    const n = this.quality === 'low' ? 2 : 5;
    for (let i = 0; i < n; i++) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + Math.random() * 0.14, 0), i % 2 ? leafMat : leafMat2);
      l.position.set((Math.random() - 0.5) * 0.35, 0.65 + i * 0.16, (Math.random() - 0.5) * 0.35);
      l.castShadow = this.quality !== 'low'; g.add(l);
    }
    this.spinners.push({ obj: g, type: 'sway', phase: Math.random() * 6 });
    return g;
  }

  pendant(x, z, color = '#fff3dc', y = 2.9) {
    const cord = this.box(0.02, 0.4, 0.02, '#111', x, y + 0.2, z); cord.castShadow = false;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.36, 0.26, 14, 1, true), mat('#25282d', { side: THREE.DoubleSide, metalness: 0.4 }));
    shade.position.set(x, y, z); this.root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
    bulb.position.set(x, y - 0.1, z); this.root.add(bulb);
    this.lamps.push(bulb.material);
  }

  roomLight(x, z, color, y = 3.0) {
    const l = new THREE.PointLight(color, 0, 15, 2);
    l.position.set(x, y, z);
    this.root.add(l);
    this.pointLights.push(l);
  }

  board(x, z, rot, kind, accent, w = 3.2, h = 1.6, y = 1.8) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; this.root.add(g);
    this.box(w + 0.1, h + 0.1, 0.05, '#e5e2db', 0, 0, 0, g);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: boardTexture(kind, accent), roughness: 0.7 }));
    p.position.z = 0.03; g.add(p);
    return g;
  }

  poster(x, y, z, rot, lines, bg) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.38), new THREE.MeshStandardMaterial({ map: posterTexture(lines, bg), roughness: 0.6 }));
    g.position.set(x, y, z); g.rotation.y = rot; this.root.add(g);
    return g;
  }

  lettering(text, x, y, z, rot, w = 6, color = '#ffffff') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), new THREE.MeshBasicMaterial({ map: letteringTexture(text, color), transparent: true }));
    m.position.set(x, y, z); m.rotation.y = rot; this.root.add(m);
    return m;
  }

  wallScreen(x, y, z, rot, w, h, kind, accent, agentId) {
    const scr = new Screen('wall', accent, 384, 216);
    scr.sub = kind;
    this.screens.push({ screen: scr, agentId, always: true });
    const g = this.monitor(x, y, z, rot, w, h, scr, this.root, agentId);
    g.children[2].visible = false; g.children[3].visible = false;
    return scr;
  }

  workstation(agentId, kind, accent, deskColor = PALETTE.wood, chairColor = PALETTE.black, exec = false) {
    const d = DESKS[agentId];
    const fwd = d.heading === 0 ? 1 : -1;
    const deskZ = d.z + fwd * 0.95;
    const desk = this.desk(d.x, deskZ, exec ? 3 : 2.4, 1.1, 0, deskColor);
    this.clickable(desk, { type: 'desk', id: agentId });
    desk.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'desk', id: agentId }; });
    const chair = this.chair(d.x, d.z - fwd * 0.05, d.heading, chairColor, exec);
    chair.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'desk', id: agentId }; });
    this.clickables.push(chair);
    const rot = d.heading + Math.PI;
    const mz = deskZ + fwd * 0.28;
    const count = exec ? 3 : kind === 'code' ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 0.78;
      const angle = (i - (count - 1) / 2) * -0.28 * fwd;
      const scr = new Screen(kind, accent);
      this.screens.push({ screen: scr, agentId });
      this.monitor(d.x + off, 0.86, mz - Math.abs(off) * 0.12 * fwd, rot + angle, 0.7, 0.42, scr, this.root, agentId);
    }
    this.box(0.5, 0.02, 0.16, '#111827', d.x, 0.87, deskZ - fwd * 0.22);
    this.box(0.07, 0.02, 0.1, '#111827', d.x + 0.4, 0.87, deskZ - fwd * 0.22);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 10), mat(accent));
    mug.position.set(d.x - 0.85, 0.91, deskZ - fwd * 0.1); this.root.add(mug);
  }

  // Coloured walls around a mezzanine room (back panel, sides, front with door).
  mezzRoomWalls(id, front = 'solid') {
    const r = ROOMS[id]; const c = r.wall; const i = 0.08;
    this.wall(r.x[0] + i, r.z[0] + 0.16, r.x[1] - i, r.z[0] + 0.16, c, 3.0, 0.06);
    if (r.x[0] > MEZZ.x[0] + 0.1) this.wall(r.x[0] + i, r.z[0], r.x[0] + i, r.z[1], c);
    else this.wall(r.x[0] + 0.16, r.z[0], r.x[0] + 0.16, r.z[1], c, 3.0, 0.06);
    this.wall(r.x[1] - i, r.z[0], r.x[1] - i, r.z[1], c);
    const d = DOORS[id];
    this.frontWall(r.x[0], r.x[1], r.z[1], d.x, front, front === 'glass' ? PALETTE.black : c);
    this.slidingDoor(d.x, d.z, id, front === 'glass' ? 'glass' : 'wood');
  }

  // ------------------------------------------------------- upper floor rooms
  buildCEO() {
    const a = ROOMS.ceo.accent;
    this.mezzRoomWalls('ceo');
    this.workstation('ceo', 'dashboard', a, '#8a5c38', '#1b1d21', true);
    this.wallScreen(-15, 0.9, -15.75, 0, 3.0, 1.5, 'dashboard', a, 'ceo');
    this.poster(-19.8, 1.75, -15.76, 0, ['DO IT', 'NOW!'], PALETTE.terracotta);
    this.poster(-10.8, 1.75, -15.76, 0, ['THINK', 'OUT OF', 'THE BOX'], PALETTE.terracotta);
    const sofa = mat('#2a2c31', { roughness: 0.8 });
    this.box(0.9, 0.45, 2.6, sofa, -21.2, 0.3, -10);
    this.box(0.25, 0.8, 2.6, sofa, -21.6, 0.6, -10);
    this.box(2.2, 0.45, 0.9, sofa, -19.6, 0.3, -8.6);
    this.box(1.1, 0.32, 1.1, mat('#3b3e45'), -19.6, 0.2, -10);
    const trophy = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), mat('#d9a441', { metalness: 0.8, roughness: 0.25 }));
    trophy.position.set(-16.2, 1.03, -11.65); this.root.add(trophy);
    this.plant(-9.4, -15.2, 1.1); this.plant(-21.2, -15.2, 1.1);
    this.pendant(-15, -11.6); this.roomLight(-15, -11, '#fff1d6');
  }

  buildMeeting() {
    this.mezzRoomWalls('meeting', 'glass');
    const table = new THREE.Group(); table.position.set(TABLE.x, 0, TABLE.z); this.root.add(table);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.08, 32), mat('#efe9df', { roughness: 0.35 }));
    top.scale.set(1.4, 1, 2.6); top.position.y = 0.8; top.castShadow = top.receiveShadow = this.quality !== 'low'; table.add(top);
    this.box(0.5, 0.78, 1.8, PALETTE.black, 0, 0.39, 0, table);
    this.clickable(table, { type: 'meeting', id: 'meeting' });
    table.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'meeting', id: 'meeting' }; });
    for (const s of MEETING_SEATS) {
      const ch = this.cafeChair(s.x, s.z, s.heading, PALETTE.terracotta);
      ch.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'meeting', id: 'meeting' }; });
      this.clickables.push(ch);
    }
    const wb = new THREE.Group(); wb.position.set(-8.3, 1.6, -12); wb.rotation.y = Math.PI / 2; this.root.add(wb);
    this.box(3.4, 1.6, 0.05, '#cfd2d6', 0, 0, 0, wb);
    this.box(3.3, 1.5, 0.02, '#fbfbfa', 0, 0, 0.03, wb);
    this.box(3.3, 0.06, 0.12, '#9aa0a6', 0, -0.8, 0.06, wb);
    this.meetingScreen = this.wallScreen(-3, 0.95, -15.75, 0, 3.4, 1.6, 'dashboard', '#34d399', null);
    const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: '#34d399', wireframe: true, transparent: true, opacity: 0.7 }));
    holo.position.set(TABLE.x, 1.25, TABLE.z); this.root.add(holo);
    this.spinners.push({ obj: holo, type: 'spin', speed: 0.8 });
    this.meetingHolo = holo;
    this.plant(1.9, -15.2, 0.9); this.plant(-7.9, -15.2, 0.9);
    this.pendant(-3, -13); this.pendant(-3, -11.2); this.roomLight(-3, -12, '#f2fff6');
  }

  buildSecurity() {
    const a = ROOMS.security.accent;
    this.mezzRoomWalls('security');
    this.workstation('security', 'security', a);
    this.wallScreen(5.75, 0.9, -15.75, 0, 4.0, 1.6, 'security', a, 'security');
    const rack = new THREE.Group(); rack.position.set(3.2, 0, -14.8); this.root.add(rack);
    this.box(0.8, 2.2, 0.7, '#121316', 0, 1.1, 0, rack, { metalness: 0.5 });
    for (let k = 0; k < 8; k++) {
      const led = new THREE.Mesh(boxGeo(0.05, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: k % 4 === 0 ? '#ef4444' : '#22c55e' }));
      led.position.set(-0.25 + (k % 2) * 0.1, 0.4 + k * 0.22, 0.36); rack.add(led);
      this.leds.push({ m: led, phase: Math.random() * 10 });
    }
    const shield = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: '#fff7ed', wireframe: true, transparent: true, opacity: 0.85 }));
    shield.position.set(8.1, 1.6, -9.4); this.root.add(shield);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 12), mat('#2b2e33', { metalness: 0.4 }));
    ped.position.set(8.1, 0.45, -9.4); ped.castShadow = this.quality !== 'low'; this.root.add(ped);
    this.spinners.push({ obj: shield, type: 'spin', speed: 0.6 });
    this.plant(8.3, -15.2, 0.9);
    this.pendant(5.75, -11.4); this.roomLight(5.75, -11, '#ffe9d6');
  }

  // ------------------------------------------------------- ground floor rooms
  archWindow(x, y, z, w = 1.6, h = 2.2) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0);
    const geo = new THREE.ShapeGeometry(s, 16);
    const frame = new THREE.Mesh(geo, mat(PALETTE.black));
    frame.scale.set(1.08, 1.04, 1); frame.position.set(x, y - 0.05, z + 0.075); this.root.add(frame);
    const glass = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cfe4ea', emissive: '#bcd8e2', emissiveIntensity: 0.25, roughness: 0.1 }));
    glass.position.set(x, y, z + 0.08); this.root.add(glass);
    this.box(0.04, h - 0.1, 0.02, PALETTE.black, x, y + (h - 0.1) / 2, z + 0.09);
  }

  buildResearch() {
    const a = ROOMS.research.accent;
    const r = ROOMS.research; const H = 4.4;
    this.wall(r.x[0], r.z[0], r.x[0], r.z[1], PALETTE.navy, H);
    this.wall(r.x[0], r.z[1], DOORS.research.x - 1, r.z[1], PALETTE.navy, H);
    this.wall(DOORS.research.x + 1, r.z[1], r.x[1], r.z[1], PALETTE.navy, H);
    this.box(2.0, H - 2.9, 0.14, mat(PALETTE.navy, { roughness: 0.9 }), DOORS.research.x, 2.9 + (H - 2.9) / 2, r.z[1]);
    this.slidingDoor(DOORS.research.x, DOORS.research.z, 'research', 'glass');
    for (const x of [10.6, 17.6, 20.3]) this.archWindow(x, 0.5, r.z[1]);
    this.lettering('WORKING TOGETHER IS THE WAY', 16.5, 3.65, r.z[1] + 0.09, 0, 9.5);
    const city = cityTexture();
    for (const x of [12, 16.5, 20.5]) {
      const wm = new THREE.MeshStandardMaterial({ color: '#b9d6e0', emissive: '#d6eef5', emissiveIntensity: 0.6, map: city, roughness: 0.1 });
      this.windowMats.push(wm);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), wm); w.position.set(x, 2.7, -15.99); this.root.add(w);
    }
    this.workstation('research', 'chart', a);
    this.wallScreen(11.4, 0.9, -15.85, 0, 2.2, 1.2, 'chart', a, 'research');
    this.board(21.85, -10.5, -Math.PI / 2, 'research', a);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: '#38bdf8', wireframe: true, transparent: true, opacity: 0.55 }));
    globe.position.set(10.6, 1.6, -8); this.root.add(globe);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 16), mat('#2b2e33', { metalness: 0.4 }));
    ped.position.set(10.6, 0.45, -8); ped.castShadow = true; this.root.add(ped);
    this.spinners.push({ obj: globe, type: 'spin', speed: 0.35 });
    this.desk(18.5, -8, 2, 0.9, Math.PI / 2);
    const scr = new Screen('chart', a); this.screens.push({ screen: scr, agentId: 'research' });
    this.monitor(18.6, 0.86, -7.6, -Math.PI / 2, 0.6, 0.36, scr, this.root, 'research');
    this.benchRow(19.3, -13.3, 3.6, 0);
    this.plant(9.8, -15.2, 1.1); this.plant(21.2, -6, 1);
    this.pendant(14, -10.8, '#e0f2fe', 3.6); this.roomLight(14, -10, '#e7f0ff', 3.4);
  }

  buildDevelopment() {
    const a = ROOMS.development.accent;
    const r = ROOMS.development;
    this.glassWall(r.x[0], r.z[0], DOORS.development.x - 1, r.z[0], PALETTE.black);
    this.glassWall(DOORS.development.x + 1, r.z[0], r.x[1], r.z[0], PALETTE.black);
    this.glassWall(r.x[1], r.z[0], r.x[1], r.z[1], PALETTE.black);
    this.slidingDoor(DOORS.development.x, DOORS.development.z, 'development', 'glass');
    this.workstation('development', 'code', a);
    this.board(-21.85, 10.5, Math.PI / 2, 'development', a);
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group(); g.position.set(-6.2 - i * 1, 0, 15.2); this.root.add(g);
      this.box(0.8, 2.2, 0.7, '#121316', 0, 1.1, 0, g, { metalness: 0.5 });
      for (let k = 0; k < 8; k++) {
        const led = new THREE.Mesh(boxGeo(0.05, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: k % 3 ? '#22c55e' : '#a78bfa' }));
        led.position.set(-0.25 + (k % 2) * 0.1, 0.4 + k * 0.22, -0.36); g.add(led);
        this.leds.push({ m: led, phase: Math.random() * 10 });
      }
    }
    this.desk(-18.5, 13.5, 2.4, 1, 0);
    this.chair(-18.5, 12.6, 0);
    const scr = new Screen('code', a); this.screens.push({ screen: scr, agentId: 'development' });
    this.monitor(-18.5, 0.86, 13.75, Math.PI, 0.9, 0.5, scr, this.root, 'development');
    this.benchRow(-8.5, 11.8, 3.6, Math.PI / 2);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), mat(PALETTE.terracotta, { roughness: 0.9 }));
    bag.scale.y = 0.6; bag.position.set(-7.2, 0.35, 7.6); bag.castShadow = true; this.root.add(bag);
    this.plant(-21.2, 15.2, 1.2); this.plant(-5.8, 6, 1);
    this.pendant(-13, 9.6, '#fff3dc', 3.2); this.roomLight(-13, 10, '#fff1e0', 3.4);
  }

  buildSocial() {
    const a = ROOMS.social.accent;
    const r = ROOMS.social;
    for (const [x1, z1, x2, z2] of [[r.x[0], r.z[0], DOORS.social.x - 1.2, r.z[0]], [DOORS.social.x + 1.2, r.z[0], r.x[1], r.z[0]], [r.x[0], r.z[0], r.x[0], r.z[1]]]) {
      this.wall(x1, z1, x2, z2, PALETTE.navy, 1.2, 0.12);
    }
    this.workstation('social', 'social', a);
    this.board(21.85, 10.5, -Math.PI / 2, 'social', a);
    this.benchRow(19.4, 8.4, 3.6, 0);
    this.benchRow(9, 13.6, 3.2, 0);
    const cam = new THREE.Group(); cam.position.set(16.5, 0, 14.6); cam.rotation.y = Math.PI * 0.85; this.root.add(cam);
    for (let i = 0; i < 3; i++) { const leg = this.box(0.03, 1.4, 0.03, '#111', Math.sin(i * 2.1) * 0.25, 0.68, Math.cos(i * 2.1) * 0.25, cam); leg.rotation.z = Math.sin(i * 2.1) * 0.18; leg.rotation.x = -Math.cos(i * 2.1) * 0.18; }
    this.box(0.36, 0.24, 0.2, '#111827', 0, 1.45, 0, cam);
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    rec.position.set(0.14, 1.55, 0.1); cam.add(rec); this.leds.push({ m: rec, phase: 0, blink: true });
    const rl = new THREE.Group(); rl.position.set(20.6, 0, 14.6); this.root.add(rl);
    this.box(0.04, 1.6, 0.04, '#111', 0, 0.8, 0, rl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 32), new THREE.MeshStandardMaterial({ color: '#fff7ed', emissive: '#fff7ed', emissiveIntensity: 1.2 }));
    ring.position.y = 1.9; rl.add(ring); this.lamps.push(ring.material);
    this.plant(21.2, 6, 1); this.plant(5.8, 15.2, 1.1);
    this.pendant(13, 9.6, '#fff3dc', 3.2); this.roomLight(13, 10, '#fff1e6', 3.4);
  }

  buildLobby() {
    this.box(4.6, 3.0, 0.3, PALETTE.black, -2.2, 1.5, 9.6);
    this.lettering('NAFI AI', -2.2, 2.25, 9.76, 0, 3.4);
    this.lettering('OFFICE', -2.2, 1.75, 9.76, 0, 3.4);
    const desk = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.0, 24, 1, true, -Math.PI / 2.4, Math.PI / 1.2), mat('#d9b48c', { side: THREE.DoubleSide, roughness: 0.5 }));
    desk.position.set(-2.2, 0.5, 9.9); desk.castShadow = true; this.root.add(desk);
    this.box(2.4, 0.05, 0.5, mat('#e8cfb0'), -2.2, 1.02, 11.2);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group(); g.position.set(-4 + i * 1.05, 0, 13.4); this.root.add(g);
      this.box(0.22, 1.0, 0.9, '#9ba1a8', 0, 0.5, 0, g, { metalness: 0.6, roughness: 0.3 });
      this.box(0.24, 0.05, 0.92, PALETTE.black, 0, 1.02, 0, g);
    }
    const pp = new THREE.Group(); pp.position.set(2.2, 0, 8.2); this.root.add(pp);
    this.box(2.7, 0.06, 1.5, mat('#4f6aa8', { roughness: 0.5 }), 0, 0.76, 0, pp);
    this.box(0.04, 0.16, 1.5, '#f3f3f1', 0, 0.86, 0, pp);
    this.box(2.7, 0.012, 0.03, '#f3f3f1', 0, 0.8, 0, pp);
    for (const [lx, lz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) this.box(0.05, 0.74, 0.05, PALETTE.black, lx, 0.37, lz, pp);
    const sh = new THREE.Group(); sh.position.set(4.2, 0, 13); sh.rotation.y = Math.PI / 2; this.root.add(sh);
    const metal = mat(PALETTE.black, { metalness: 0.5, roughness: 0.4 });
    for (let c = 0; c <= 4; c++) this.box(0.04, 2.2, 0.45, metal, -1.6 + c * 0.8, 1.1, 0, sh);
    for (let r = 0; r <= 4; r++) this.box(3.2, 0.03, 0.45, metal, 0, r * 0.55, 0, sh);
    for (let i = 0; i < 6; i++) this.box(0.3, 0.3, 0.3, [PALETTE.terracotta, PALETTE.sage, '#f0e6d2'][i % 3], -1.2 + (i % 4) * 0.8, 0.72 + Math.floor(i / 4) * 1.1, 0, sh);
    this.plant(-4.4, 15.2, 1.2); this.plant(1.2, 15.2, 1.1);
    this.box(1.6, 1, 0.7, '#e9e2d6', 4.2, 0.5, 1.4);
    this.box(0.4, 0.5, 0.4, PALETTE.black, 4.4, 1.25, 1.4);
    const cooler = new THREE.Group(); cooler.position.set(-3.5, 0, 2.7); this.root.add(cooler);
    this.box(0.4, 1, 0.4, '#e5e7eb', 0, 0.5, 0, cooler);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 12), new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.6 }));
    bottle.position.y = 1.25; cooler.add(bottle);
    for (const [x, z] of [[-9.5, 3.2], [-9.5, 1.8]]) this.box(0.8, 0.5, 0.8, PALETTE.sage, x, 0.25, z);
    this.plant(-11, 3.8, 0.9); this.plant(19, -4, 1.1); this.plant(-19, 3.8, 1.1);
    this.roomLight(0, 1, '#fff4e4'); this.roomLight(-14, 1, '#fff4e4'); this.roomLight(0, 11, '#fff4e4');
  }

  buildElevator() {
    const g = new THREE.Group(); g.position.set(-21.95, 0, -1.2); g.rotation.y = Math.PI / 2; this.root.add(g);
    this.box(2.6, 3.0, 0.2, '#3f4348', 0, 1.5, -0.05, g, { metalness: 0.6, roughness: 0.3 });
    const inner = this.box(1.8, 2.5, 0.05, '#fef9c3', 0, 1.25, -0.02, g, { emissive: '#fef3c7', emissiveIntensity: 0.6 });
    inner.castShadow = false;
    const doorMat = mat('#a9aeb4', { metalness: 0.85, roughness: 0.25 });
    const left = this.box(0.9, 2.5, 0.06, doorMat, -0.45, 1.25, 0.08, g);
    const right = this.box(0.9, 2.5, 0.06, doorMat, 0.45, 1.25, 0.08, g);
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshBasicMaterial({ color: '#10b981' }));
    ind.position.set(0, 2.75, 0.08); g.add(ind);
    this.elevator = { left, right, open: 0, timer: 6, state: 'closed', ind };
  }

  buildSigns() {
    const signs = [
      ['CEO', '#10b981', -15, LEVEL_Y + 3.15, -7.4], ['MEETING', '#34d399', -3, LEVEL_Y + 3.15, -7.4], ['SECURITY', '#fb923c', 5.75, LEVEL_Y + 3.15, -7.4],
      ['RESEARCH', '#38bdf8', 14, 4.7, -4.9], ['DEVELOPMENT', '#a78bfa', -13, 3.3, 5.1], ['CREATIVE', '#f472b6', 13, 1.9, 5.1],
    ];
    for (const [t, c, x, y, z] of signs) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: signTexture(t, null, c), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
      s.position.set(x, y, z); this.root.add(s);
    }
  }

  // ------------------------------------------------------- per-frame
  update(dt, t, avatars, agentStatus, lowFx) {
    for (const d of this.doors) {
      let near = false;
      for (const a of avatars) {
        const p = a.root.position;
        if (Math.abs(p.y - d.y) < 1.5 && Math.abs(p.x - d.x) < 1.6 && Math.abs(p.z - d.z) < 2.2) { near = true; break; }
      }
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 6);
      d.left.position.x = -0.5 - d.open * 0.95;
      d.right.position.x = 0.5 + d.open * 0.95;
    }
    const e = this.elevator;
    e.timer -= dt;
    if (e.timer <= 0) {
      if (e.state === 'closed') { e.state = 'open'; e.timer = 4; } else { e.state = 'closed'; e.timer = 18 + Math.random() * 20; }
    }
    e.open += ((e.state === 'open' ? 1 : 0) - e.open) * Math.min(1, dt * 3);
    e.left.position.x = -0.45 - e.open * 0.85;
    e.right.position.x = 0.45 + e.open * 0.85;
    e.ind.material.color.set(e.state === 'open' ? '#fbbf24' : '#10b981');
    for (const s of this.spinners) {
      if (s.type === 'spin') s.obj.rotation.y += dt * s.speed;
      else if (!lowFx) s.obj.rotation.z = Math.sin(t * 0.8 + s.phase) * 0.02;
    }
    for (const l of this.leds) l.m.visible = l.blink ? Math.floor(t * 1.5) % 2 === 0 : Math.sin(t * 5 + l.phase * 3) > -0.3;
    this.screenTimer = (this.screenTimer || 0) - dt;
    if (this.screenTimer <= 0) {
      this.screenTimer = lowFx ? 1.5 : 0.12;
      for (const s of this.screens) {
        const st = s.agentId ? agentStatus(s.agentId) : 'working';
        s.screen.status = s.always ? (st === 'idle' ? 'working' : st) : st;
        s.screen.draw(t);
      }
    }
  }

  setDaylight(day) {
    for (const m of this.windowMats) {
      m.emissive.set(day > 0.5 ? '#d6eef5' : '#ffffff');
      m.emissiveIntensity = 0.25 + day * 0.5;
    }
    for (const m of this.lamps) m.emissiveIntensity = 0.5 + (1 - day) * 1.4;
    for (const l of this.pointLights) l.intensity = (1 - day) * 34 + 4;
  }
}
