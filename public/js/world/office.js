// Builds the office: four departments, a glass meeting room, lobby, corridor,
// elevator, sliding doors, furniture, live screens and decorations — all from
// lightweight procedural geometry (no heavy model downloads).
import * as THREE from 'three';
import { Screen, boardTexture, signTexture, cityTexture } from './textures.js';

// ----------------------------------------------------------- layout data
export const ROOMS = {
  ceo: { name: 'CEO Office', x: [-22, -8.5], z: [-16, -5], floor: '#5b3a24', accent: '#10b981' },
  meeting: { name: 'Glass Meeting Room', x: [-8.5, 2.5], z: [-16, -7], floor: '#3a403e', accent: '#34d399' },
  security: { name: 'Security Ops Centre', x: [2.5, 9], z: [-16, -5], floor: '#2b2622', accent: '#fb923c' },
  research: { name: 'Research Lab', x: [9, 22], z: [-16, -5], floor: '#2a3a46', accent: '#38bdf8' },
  development: { name: 'Development Studio', x: [-22, -5], z: [5, 16], floor: '#24222f', accent: '#a78bfa' },
  social: { name: 'Creative Studio', x: [5, 22], z: [5, 16], floor: '#3b2a31', accent: '#f472b6' },
  lobby: { name: 'Lobby', x: [-5, 5], z: [5, 16], floor: '#1d2422', accent: '#10b981' },
};

export const DOORS = {
  ceo: { x: -15, z: -5 },
  meeting: { x: -3, z: -7 },
  security: { x: 5.75, z: -5 },
  research: { x: 14, z: -5 },
  development: { x: -13, z: 5 },
  social: { x: 13, z: 5 },
};

// Where each agent sits (heading: rotation.y, 0 faces +z).
export const DESKS = {
  ceo: { x: -15, z: -12.6, heading: 0, room: 'ceo' },
  research: { x: 14, z: -11.6, heading: 0, room: 'research' },
  security: { x: 5.75, z: -12.2, heading: 0, room: 'security' },
  development: { x: -13, z: 10.6, heading: Math.PI, room: 'development' },
  social: { x: 13, z: 10.6, heading: Math.PI, room: 'social' },
};

export const MEETING_SEATS = [
  { x: -3, z: -13.6, heading: 0 },
  { x: -5.2, z: -11, heading: Math.PI / 2 },
  { x: -0.8, z: -11, heading: -Math.PI / 2 },
  { x: -5.2, z: -9.6, heading: Math.PI / 2 },
  { x: -0.8, z: -9.6, heading: -Math.PI / 2 },
  { x: -3, z: -8.4, heading: Math.PI },
];

export const AMBIENT_SPOTS = [
  { x: 3.3, z: 1.4, heading: Math.PI / 2, label: 'coffee' },
  { x: -20.2, z: -1.2, heading: -Math.PI / 2, label: 'elevator' },
  { x: -3.5, z: 1.8, heading: 0, label: 'cooler' },
  { x: 0, z: 8.2, heading: Math.PI, label: 'reception' },
  { x: 18, z: -2.5, heading: 0, label: 'window' },
  { x: -8, z: 2.6, heading: Math.PI / 2, label: 'lounge' },
];

export const FOCUS = {
  overview: { pos: [20, 30, 36], target: [0, 0, 0] },
  ceo: { pos: [-8, 13, 3], target: [-15, 0, -11] },
  meeting: { pos: [5, 15, 4], target: [-3, 0, -11.5] },
  research: { pos: [21, 13, 3], target: [14, 0, -11] },
  security: { pos: [10, 13, 2], target: [5.75, 0, -11] },
  development: { pos: [-7, 13, 23], target: [-13, 0, 10] },
  social: { pos: [19, 13, 23], target: [13, 0, 10] },
};

// ----------------------------------------------------------- helpers
const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts }));
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
    this.root = new THREE.Group();
    scene.add(this.root);
    this.clickables = [];
    this.screens = [];        // { screen, agentId }
    this.doors = [];          // sliding doors
    this.lamps = [];          // emissive lamp materials
    this.pointLights = [];
    this.spinners = [];       // animated decorations
    this.leds = [];
    this.windowMats = [];
    this.roomLabels = [];
    this.build();
  }

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
    this.buildWalls();
    this.buildCEO();
    this.buildMeeting();
    this.buildResearch();
    this.buildSecurity();
    this.buildDevelopment();
    this.buildSocial();
    this.buildLobby();
    this.buildElevator();
    this.buildDecor();
  }

  // ------------------------------------------------------- shell & floors
  buildShell() {
    // ground slab
    const base = this.box(46, 0.4, 34, '#0e1312', 0, -0.2, 0);
    base.castShadow = false;
    // corridor floor (polished)
    const corridor = this.box(44, 0.02, 32, mat('#202826', { roughness: 0.25, metalness: 0.15 }), 0, 0.01, 0);
    corridor.castShadow = false;
    // department floors
    for (const [id, r] of Object.entries(ROOMS)) {
      const w = r.x[1] - r.x[0]; const d = r.z[1] - r.z[0];
      const f = this.box(w - 0.1, 0.04, d - 0.1, mat(r.floor, { roughness: id === 'ceo' ? 0.45 : 0.7 }), (r.x[0] + r.x[1]) / 2, 0.03, (r.z[0] + r.z[1]) / 2);
      f.castShadow = false;
      if (id !== 'lobby') this.clickable(f, { type: id === 'meeting' ? 'meeting' : 'department', id });
      this.roomLabels.push({ text: r.name, pos: new THREE.Vector3((r.x[0] + r.x[1]) / 2, 0.1, id.match(/development|social|lobby/) ? r.z[1] - 1 : r.z[0] + 1.1) });
      // accent rug
      if (id !== 'lobby' && id !== 'meeting') {
        const rug = this.box(Math.min(w - 4, 7), 0.02, Math.min(d - 4, 4.5), mat(r.accent, { roughness: 0.95, transparent: true, opacity: 0.18 }), (r.x[0] + r.x[1]) / 2, 0.06, (r.z[0] + r.z[1]) / 2 + (id.match(/development|social/) ? -0.5 : 0.5));
        rug.castShadow = false;
      }
    }
    // corridor guide strip lights
    for (let x = -20; x <= 20; x += 4) {
      const s = this.box(1.6, 0.02, 0.08, mat('#34d399', { emissive: '#10b981', emissiveIntensity: 0.6 }), x, 0.04, 0);
      s.castShadow = false; this.lamps.push(s.material);
    }
  }

  // ------------------------------------------------------- walls & doors
  buildWalls() {
    const wallMat = mat('#2a302e', { roughness: 0.85 });
    const H = 4.2;
    // north wall with big windows (full height)
    this.box(44.4, H, 0.3, wallMat, 0, H / 2, -16.15);
    // west wall
    this.box(0.3, H, 32.6, wallMat, -22.15, H / 2, 0);
    // east and south — low cutaway walls (Sims-style) so the camera sees inside
    this.box(0.3, 1.1, 32.6, wallMat, 22.15, 0.55, 0);
    this.box(44.4, 1.1, 0.3, wallMat, 0, 0.55, 16.15);

    // windows on the north wall
    const city = cityTexture();
    for (let x = -20; x <= 20; x += 4.4) {
      const wm = new THREE.MeshStandardMaterial({ color: '#9fd4e6', emissive: '#bfe8f5', emissiveIntensity: 0.7, map: city, roughness: 0.1, metalness: 0.3 });
      this.windowMats.push(wm);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), wm);
      w.position.set(x, 2.3, -15.99);
      this.root.add(w);
      this.box(3.8, 0.12, 0.15, '#4b5552', x, 1.06, -15.95);
      this.box(3.8, 0.12, 0.15, '#4b5552', x, 3.54, -15.95);
    }
    // windows on west wall
    for (let z = -12; z <= 12; z += 6) {
      if (Math.abs(z) < 3) continue;
      const wm = new THREE.MeshStandardMaterial({ color: '#9fd4e6', emissive: '#bfe8f5', emissiveIntensity: 0.7, map: city, roughness: 0.1 });
      this.windowMats.push(wm);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.4), wm);
      w.rotation.y = Math.PI / 2; w.position.set(-21.99, 2.3, z);
      this.root.add(w);
    }

    // interior glass partitions: [x1,z1,x2,z2, doorAt?, room]
    const segs = [
      [-22, -5, -8.5, -5, DOORS.ceo, 'ceo'],
      [-8.5, -16, -8.5, -5, null, 'ceo'],
      [-8.5, -7, 2.5, -7, DOORS.meeting, 'meeting'],
      [2.5, -16, 2.5, -7, null, 'meeting'],
      [2.5, -7, 2.5, -5, null, 'security'],
      [2.5, -5, 9, -5, DOORS.security, 'security'],
      [9, -16, 9, -5, null, 'research'],
      [9, -5, 22, -5, DOORS.research, 'research'],
      [-22, 5, -5, 5, DOORS.development, 'development'],
      [-5, 5, -5, 16, null, 'development'],
      [5, 5, 22, 5, DOORS.social, 'social'],
      [5, 5, 5, 16, null, 'social'],
    ];
    for (const [x1, z1, x2, z2, door, room] of segs) {
      const accent = ROOMS[room].accent;
      if (door) {
        const horizontal = z1 === z2;
        const a = horizontal ? door.x : door.z;
        const lo = horizontal ? Math.min(x1, x2) : Math.min(z1, z2);
        const hi = horizontal ? Math.max(x1, x2) : Math.max(z1, z2);
        if (horizontal) {
          this.glassWall(lo, z1, a - 1, z1, accent);
          this.glassWall(a + 1, z1, hi, z1, accent);
        }
        this.slidingDoor(door.x, door.z, accent, room);
      } else this.glassWall(x1, z1, x2, z2, accent);
    }
  }

  glassWall(x1, z1, x2, z2, accent) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.05) return;
    const H = 3;
    const g = new THREE.Group();
    g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    g.rotation.y = Math.atan2(x2 - x1, z2 - z1) - Math.PI / 2;
    this.root.add(g);
    const glass = new THREE.Mesh(boxGeo(len, H - 0.15, 0.05), mat('#bfe9e0', { transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    glass.position.y = H / 2; glass.renderOrder = 2; g.add(glass);
    this.box(len, 0.08, 0.12, '#59625f', 0, 0.04, 0, g, { metalness: 0.6, roughness: 0.3 });
    const top = this.box(len, 0.06, 0.12, mat(accent, { emissive: accent, emissiveIntensity: 0.8 }), 0, H, 0, g);
    this.lamps.push(top.material);
    for (let p = -len / 2; p <= len / 2 + 0.01; p += Math.max(len / Math.ceil(len / 3), 0.5)) this.box(0.07, H, 0.1, '#59625f', p, H / 2, 0, g, { metalness: 0.6, roughness: 0.3 });
  }

  slidingDoor(x, z, accent, room) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.root.add(g);
    const frameMat = mat('#59625f', { metalness: 0.6, roughness: 0.3 });
    this.box(0.1, 3, 0.14, frameMat, -1.02, 1.5, 0, g);
    this.box(0.1, 3, 0.14, frameMat, 1.02, 1.5, 0, g);
    const lintel = this.box(2.14, 0.22, 0.16, mat(accent, { emissive: accent, emissiveIntensity: 0.9 }), 0, 2.95, 0, g);
    this.lamps.push(lintel.material);
    const panelMat = mat('#c8f1e6', { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, depthWrite: false });
    const left = new THREE.Mesh(boxGeo(1, 2.8, 0.05), panelMat); left.position.set(-0.5, 1.4, 0.03);
    const right = new THREE.Mesh(boxGeo(1, 2.8, 0.05), panelMat); right.position.set(0.5, 1.4, -0.03);
    left.renderOrder = right.renderOrder = 2;
    g.add(left, right);
    this.doors.push({ x, z, left, right, open: 0, room });
  }

  // ------------------------------------------------------- furniture kit
  desk(x, z, w, d, rot, color = '#e8e4dc', parent = this.root, legColor = '#2f3533') {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
    this.box(w, 0.07, d, mat(color, { roughness: 0.4 }), 0, 0.82, 0, g);
    this.box(0.06, 0.8, d - 0.1, legColor, -w / 2 + 0.08, 0.41, 0, g);
    this.box(0.06, 0.8, d - 0.1, legColor, w / 2 - 0.08, 0.41, 0, g);
    this.box(w - 0.2, 0.4, 0.04, legColor, 0, 0.55, -d / 2 + 0.1, g);
    return g;
  }

  chair(x, z, rot, color = '#1f2937', exec = false, parent = this.root) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
    this.box(0.6, 0.1, 0.56, color, 0, 0.48, 0, g);
    this.box(0.58, exec ? 1.0 : 0.62, 0.09, color, 0, exec ? 1.0 : 0.82, -0.27, g);
    if (exec) this.box(0.4, 0.2, 0.12, color, 0, 1.55, -0.27, g);
    this.box(0.06, 0.4, 0.06, '#9ca3af', 0, 0.24, 0, g, { metalness: 0.8, roughness: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 5), mat('#374151', { metalness: 0.6 }));
    base.position.y = 0.04; g.add(base);
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

  plant(x, z, scale = 1, potColor = '#d6d3cb') {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale); this.root.add(g);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 10), mat(potColor, { roughness: 0.8 }));
    pot.position.y = 0.25; pot.castShadow = this.quality !== 'low'; g.add(pot);
    const leafMat = mat('#2f8f5b', { roughness: 0.8, flatShading: true });
    const leafMat2 = mat('#3fae6e', { roughness: 0.8, flatShading: true });
    const n = this.quality === 'low' ? 2 : 5;
    for (let i = 0; i < n; i++) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + Math.random() * 0.14, 0), i % 2 ? leafMat : leafMat2);
      l.position.set((Math.random() - 0.5) * 0.35, 0.65 + i * 0.16, (Math.random() - 0.5) * 0.35);
      l.castShadow = this.quality !== 'low'; g.add(l);
    }
    this.spinners.push({ obj: g, type: 'sway', phase: Math.random() * 6 });
    return g;
  }

  pendant(x, z, color = '#fef3c7', y = 3.6) {
    const cord = this.box(0.02, 0.8, 0.02, '#111', x, y + 0.4, z); cord.castShadow = false;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.42, 0.3, 14, 1, true), mat('#1f2523', { side: THREE.DoubleSide, metalness: 0.4 }));
    shade.position.set(x, y, z); this.root.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
    bulb.position.set(x, y - 0.12, z); this.root.add(bulb);
    this.lamps.push(bulb.material);
  }

  roomLight(x, z, color) {
    const l = new THREE.PointLight(color, 0, 16, 2);
    l.position.set(x, 3.4, z);
    this.root.add(l);
    this.pointLights.push(l);
  }

  board(x, z, rot, kind, accent, w = 3.2, h = 1.6) {
    const g = new THREE.Group(); g.position.set(x, 1.9, z); g.rotation.y = rot; this.root.add(g);
    this.box(w + 0.1, h + 0.1, 0.05, '#cbd5d1', 0, 0, 0, g);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: boardTexture(kind, accent), roughness: 0.7 }));
    p.position.z = 0.03; g.add(p);
    return g;
  }

  wallScreen(x, y, z, rot, w, h, kind, accent, agentId) {
    const scr = new Screen('wall', accent, 384, 216);
    scr.sub = kind;
    this.screens.push({ screen: scr, agentId, always: true });
    const g = this.monitor(x, y, z, rot, w, h, scr, this.root, agentId);
    g.children[2].visible = false; g.children[3].visible = false; // no stand on wall
    return scr;
  }

  workstation(agentId, kind, accent, deskColor, chairColor, exec = false) {
    const d = DESKS[agentId];
    const fwd = d.heading === 0 ? 1 : -1; // desk is in front of the agent along z
    const deskZ = d.z + fwd * 0.95;
    const desk = this.desk(d.x, deskZ, exec ? 3 : 2.4, 1.1, 0, deskColor);
    this.clickable(desk, { type: 'desk', id: agentId });
    desk.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'desk', id: agentId }; });
    const chair = this.chair(d.x, d.z - fwd * 0.05, d.heading, chairColor, exec);
    chair.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'desk', id: agentId }; });
    this.clickables.push(chair);
    // monitors face the agent
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
    // keyboard + mouse + mug
    this.box(0.5, 0.02, 0.16, '#111827', d.x, 0.87, deskZ - fwd * 0.22);
    this.box(0.07, 0.02, 0.1, '#111827', d.x + 0.4, 0.87, deskZ - fwd * 0.22);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 10), mat(accent));
    mug.position.set(d.x - 0.85, 0.91, deskZ - fwd * 0.1); this.root.add(mug);
  }

  // ------------------------------------------------------- departments
  buildCEO() {
    const a = ROOMS.ceo.accent;
    this.workstation('ceo', 'dashboard', a, '#3b2416', '#111111', true);
    this.wallScreen(-15, 1.05, -15.85, 0, 3.4, 1.6, 'dashboard', a, 'ceo');
    // sofa lounge
    this.box(2.6, 0.45, 0.9, '#1f2937', -20, 0.32, -9.5).rotation.y = Math.PI / 2;
    this.box(0.25, 0.8, 2.6, '#1f2937', -20.9, 0.6, -9.5);
    this.box(1, 0.35, 1.4, mat('#0f1514', { roughness: 0.3 }), -18.7, 0.25, -9.5);
    // bookshelf
    const shelf = new THREE.Group(); shelf.position.set(-10.3, 0, -15.6); this.root.add(shelf);
    this.box(2.4, 2.6, 0.4, '#2c1d13', 0, 1.3, 0, shelf);
    const bookColors = ['#10b981', '#e5e7eb', '#1f2937', '#a16207', '#0e7490'];
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) this.box(0.18, 0.4 + Math.random() * 0.12, 0.28, bookColors[(r + i) % 5], -1 + i * 0.24, 0.3 + r * 0.6, 0.05, shelf);
    // award trophy
    const trophy = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), mat('#fbbf24', { metalness: 0.9, roughness: 0.2 }));
    trophy.position.set(-16.2, 1.03, -11.65); this.root.add(trophy);
    this.plant(-21, -15, 1.3); this.plant(-9.5, -6, 1.1);
    this.pendant(-15, -11.6, '#fef3c7'); this.roomLight(-15, -10.5, '#fff1d6');
  }

  buildMeeting() {
    const c = { x: -3, z: -11 };
    const table = new THREE.Group(); table.position.set(c.x, 0, c.z); this.root.add(table);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.08, 32), mat('#e7e5e4', { roughness: 0.25 }));
    top.scale.set(1.4, 1, 2.6); top.position.y = 0.8; top.castShadow = top.receiveShadow = this.quality !== 'low'; table.add(top);
    this.box(0.5, 0.78, 1.8, '#374151', 0, 0.39, 0, table);
    this.clickable(table, { type: 'meeting', id: 'meeting' });
    table.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'meeting', id: 'meeting' }; });
    for (const s of MEETING_SEATS) {
      const ch = this.chair(s.x, s.z, s.heading, '#0f766e');
      ch.traverse((o) => { if (o.isMesh) o.userData.click = { type: 'meeting', id: 'meeting' }; });
      this.clickables.push(ch);
    }
    const scr = this.wallScreen(-3, 1.1, -15.85, 0, 3.6, 1.8, 'dashboard', '#34d399', null);
    this.meetingScreen = scr;
    // holographic table centrepiece
    const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: '#34d399', wireframe: true, transparent: true, opacity: 0.7 }));
    holo.position.set(c.x, 1.25, c.z); this.root.add(holo);
    this.spinners.push({ obj: holo, type: 'spin', speed: 0.8 });
    this.meetingHolo = holo;
    this.plant(1.8, -15.3, 1); this.plant(-7.9, -15.3, 1);
    this.pendant(-3, -12, '#ecfdf5'); this.pendant(-3, -10, '#ecfdf5');
    this.roomLight(-3, -11, '#e6fff5');
    // room sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('MEETING', null, '#34d399'), transparent: true }));
    sign.position.set(-3, 3.3, -6.95); this.root.add(sign);
  }

  buildResearch() {
    const a = ROOMS.research.accent;
    this.workstation('research', 'chart', a, '#e5eef3', '#1e3a5f');
    this.wallScreen(11.5, 1.0, -15.85, 0, 2.6, 1.4, 'chart', a, 'research');
    this.wallScreen(16.5, 1.0, -15.85, 0, 2.6, 1.4, 'dashboard', a, 'research');
    this.board(21.85, -10.5, -Math.PI / 2, 'research', a);
    // holographic globe
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: '#38bdf8', wireframe: true, transparent: true, opacity: 0.55 }));
    globe.position.set(10.6, 1.6, -8); this.root.add(globe);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 16), mat('#1e293b', { metalness: 0.5 }));
    ped.position.set(10.6, 0.45, -8); ped.castShadow = true; this.root.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 32), new THREE.MeshBasicMaterial({ color: '#7dd3fc' }));
    ring.rotation.x = Math.PI / 2; ring.position.set(10.6, 0.92, -8); this.root.add(ring);
    this.spinners.push({ obj: globe, type: 'spin', speed: 0.35 });
    // document stacks and second desk
    this.desk(18.5, -8, 2, 0.9, Math.PI / 2, '#e5eef3');
    for (let i = 0; i < 4; i++) this.box(0.32, 0.04 + i * 0.03, 0.42, '#f8fafc', 18.4, 0.88 + i * 0.02, -8.6 + i * 0.4);
    const scr = new Screen('chart', a); this.screens.push({ screen: scr, agentId: 'research' });
    this.monitor(18.6, 0.86, -7.6, -Math.PI / 2, 0.6, 0.36, scr, this.root, 'research');
    this.plant(9.8, -15.2, 1.2); this.plant(21, -6, 1);
    this.pendant(14, -10.8, '#e0f2fe'); this.roomLight(14, -10, '#dbeafe');
  }

  buildSecurity() {
    const a = ROOMS.security.accent;
    this.workstation('security', 'security', a, '#1c1a19', '#7c2d12');
    // threat-map video wall
    this.wallScreen(5.75, 1.0, -15.85, 0, 4.2, 1.7, 'security', a, 'security');
    // firewall / server rack with status LEDs
    const rack = new THREE.Group(); rack.position.set(3.2, 0, -14.8); this.root.add(rack);
    this.box(0.8, 2.2, 0.7, '#0f0d0c', 0, 1.1, 0, rack, { metalness: 0.5 });
    for (let k = 0; k < 8; k++) {
      const led = new THREE.Mesh(boxGeo(0.05, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: k % 4 === 0 ? '#ef4444' : '#22c55e' }));
      led.position.set(-0.25 + (k % 2) * 0.1, 0.4 + k * 0.22, 0.36); rack.add(led);
      this.leds.push({ m: led, phase: Math.random() * 10 });
    }
    // holographic shield
    const shield = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: a, wireframe: true, transparent: true, opacity: 0.75 }));
    shield.position.set(8, 1.6, -7.6); this.root.add(shield);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.9, 12), mat('#1c1917', { metalness: 0.5 }));
    ped.position.set(8, 0.45, -7.6); ped.castShadow = this.quality !== 'low'; this.root.add(ped);
    this.spinners.push({ obj: shield, type: 'spin', speed: 0.6 });
    // warning-stripe floor marking at the door
    const stripe = this.box(1.8, 0.02, 0.25, mat('#f59e0b', { emissive: '#b45309', emissiveIntensity: 0.4 }), 5.75, 0.06, -5.6);
    stripe.castShadow = false;
    this.plant(8.4, -15.2, 1);
    this.pendant(5.75, -11.4, '#ffedd5'); this.roomLight(5.75, -10.5, '#ffe4cc');
  }

  buildDevelopment() {
    const a = ROOMS.development.accent;
    this.workstation('development', 'code', a, '#1f1d2b', '#4c1d95');
    this.board(-21.85, 10.5, Math.PI / 2, 'development', a);
    // server racks with blinking LEDs
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group(); g.position.set(-6.2 - i * 1, 0, 15.2); this.root.add(g);
      this.box(0.8, 2.2, 0.7, '#0f0f17', 0, 1.1, 0, g, { metalness: 0.5 });
      for (let k = 0; k < 8; k++) {
        const led = new THREE.Mesh(boxGeo(0.05, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: k % 3 ? '#22c55e' : '#a78bfa' }));
        led.position.set(-0.25 + (k % 2) * 0.1, 0.4 + k * 0.22, -0.36); g.add(led);
        this.leds.push({ m: led, phase: Math.random() * 10 });
      }
    }
    // pair-programming desk
    this.desk(-18.5, 13.5, 2.4, 1, 0, '#1f1d2b');
    this.chair(-18.5, 12.6, 0, '#4c1d95');
    const scr = new Screen('code', a); this.screens.push({ screen: scr, agentId: 'development' });
    this.monitor(-18.5, 0.86, 13.75, Math.PI, 0.9, 0.5, scr, this.root, 'development');
    // big wall code display on the corridor-facing side
    const wall = new Screen('wall', a, 384, 216); wall.sub = 'code'; this.screens.push({ screen: wall, agentId: 'development', always: true });
    const g = this.monitor(-21.8, 1.1, 7.6, Math.PI / 2, 2.6, 1.4, wall, this.root, 'development');
    g.children[2].visible = g.children[3].visible = false;
    // bean bag
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), mat('#7c3aed', { roughness: 0.9 }));
    bag.scale.y = 0.6; bag.position.set(-7.2, 0.35, 8); bag.castShadow = true; this.root.add(bag);
    this.plant(-21, 15.2, 1.2); this.plant(-5.8, 6, 1);
    this.pendant(-13, 9.6, '#ede9fe'); this.roomLight(-13, 10, '#e9d5ff');
  }

  buildSocial() {
    const a = ROOMS.social.accent;
    this.workstation('social', 'social', a, '#f5ede9', '#9d174d');
    this.board(21.85, 10.5, -Math.PI / 2, 'social', a);
    // camera on tripod
    const cam = new THREE.Group(); cam.position.set(9, 0, 13.5); cam.rotation.y = Math.PI * 0.8; this.root.add(cam);
    for (let i = 0; i < 3; i++) { const leg = this.box(0.03, 1.4, 0.03, '#111', Math.sin(i * 2.1) * 0.25, 0.68, Math.cos(i * 2.1) * 0.25, cam); leg.rotation.z = Math.sin(i * 2.1) * 0.18; leg.rotation.x = -Math.cos(i * 2.1) * 0.18; }
    this.box(0.36, 0.24, 0.2, '#111827', 0, 1.45, 0, cam);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.2, 12), mat('#0b0b0b', { metalness: 0.7 }));
    lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.45, 0.18); cam.add(lens);
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: '#ef4444' }));
    rec.position.set(0.14, 1.55, 0.1); cam.add(rec); this.leds.push({ m: rec, phase: 0, blink: true });
    // ring light
    const rl = new THREE.Group(); rl.position.set(16, 0, 14); this.root.add(rl);
    this.box(0.04, 1.6, 0.04, '#111', 0, 0.8, 0, rl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 32), new THREE.MeshStandardMaterial({ color: '#fff7ed', emissive: '#fff7ed', emissiveIntensity: 1.4 }));
    ring.position.y = 1.9; rl.add(ring); this.lamps.push(ring.material);
    // softbox
    const sb = new THREE.Group(); sb.position.set(20.5, 0, 13); sb.rotation.y = -0.6; this.root.add(sb);
    this.box(0.04, 1.8, 0.04, '#111', 0, 0.9, 0, sb);
    const box = this.box(0.8, 0.8, 0.4, mat('#fafafa', { emissive: '#ffffff', emissiveIntensity: 0.5 }), 0, 2, 0, sb);
    this.lamps.push(box.material);
    // backdrop & neon sign
    this.box(3.5, 2.6, 0.06, '#fbcfe8', 12.5, 1.3, 15.9);
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: signTexture('#GoLive', null, '#f472b6'), transparent: true, toneMapped: false }));
    neon.position.set(12.5, 2.2, 15.85); neon.rotation.y = Math.PI; this.root.add(neon);
    const wall = new Screen('wall', a, 384, 216); wall.sub = 'social'; this.screens.push({ screen: wall, agentId: 'social', always: true });
    const g = this.monitor(21.8, 1.1, 7.6, -Math.PI / 2, 2.4, 1.3, wall, this.root, 'social');
    g.children[2].visible = g.children[3].visible = false;
    this.plant(6, 15.2, 1.2, '#f9a8d4'); this.plant(21, 6, 1);
    this.pendant(13, 9.6, '#fce7f3'); this.roomLight(13, 10, '#fde2f0');
  }

  buildLobby() {
    // reception desk
    const rec = new THREE.Group(); rec.position.set(0, 0, 9.4); this.root.add(rec);
    const curve = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.05, 24, 1, true, -Math.PI / 2.6, Math.PI / 1.3), mat('#e8e4dc', { side: THREE.DoubleSide, roughness: 0.4 }));
    curve.position.y = 0.52; curve.rotation.y = Math.PI; curve.castShadow = true; rec.add(curve);
    const strip = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.02, 0.05, 24, 1, true, -Math.PI / 2.6, Math.PI / 1.3), new THREE.MeshStandardMaterial({ color: '#10b981', emissive: '#10b981', emissiveIntensity: 1, side: THREE.DoubleSide }));
    strip.position.y = 0.95; strip.rotation.y = Math.PI; rec.add(strip); this.lamps.push(strip.material);
    // logo wall
    this.box(7, 3.2, 0.3, '#151b19', 0, 1.6, 15.7);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.4), new THREE.MeshBasicMaterial({ map: signTexture('NAFI AI OFFICE', 'Living Autonomous Workspace'), transparent: true, toneMapped: false }));
    logo.position.set(0, 2.2, 15.54); logo.rotation.y = Math.PI; this.root.add(logo);
    // sofas
    for (const sx of [-3, 3]) {
      this.box(0.9, 0.45, 2.2, '#134e4a', sx, 0.3, 12.5);
      this.box(0.25, 0.8, 2.2, '#134e4a', sx + (sx > 0 ? 0.45 : -0.45), 0.6, 12.5);
    }
    this.box(1.2, 0.35, 1.2, mat('#0f1514', { roughness: 0.25 }), 0, 0.22, 12.5);
    this.plant(-4.4, 15.2, 1.4); this.plant(4.4, 15.2, 1.4);
    this.pendant(0, 12, '#ecfdf5'); this.roomLight(0, 11, '#e6fff5');
    // corridor lounge: coffee bar + water cooler + armchairs
    this.box(1.6, 1, 0.7, '#e8e4dc', 4.2, 0.5, 1.4);
    this.box(0.4, 0.5, 0.4, '#1f2937', 4.4, 1.25, 1.4);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 8), mat('#ffffff')); cup.position.set(3.8, 1.05, 1.4); this.root.add(cup);
    const cooler = new THREE.Group(); cooler.position.set(-3.5, 0, 2.7); this.root.add(cooler);
    this.box(0.4, 1, 0.4, '#e5e7eb', 0, 0.5, 0, cooler);
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 12), new THREE.MeshStandardMaterial({ color: '#7dd3fc', transparent: true, opacity: 0.6 }));
    bottle.position.y = 1.25; cooler.add(bottle);
    for (const [x, z] of [[-9.5, 3.2], [-9.5, 1.8]]) this.box(0.8, 0.5, 0.8, '#0f766e', x, 0.25, z);
    this.plant(-11, 3.8, 0.9); this.plant(19, -4, 1.1); this.plant(-19, 3.8, 1.1);
    this.roomLight(0, 0, '#ecfdf5'); this.roomLight(-14, 0, '#ecfdf5');
  }

  buildElevator() {
    const g = new THREE.Group(); g.position.set(-21.95, 0, -1.2); g.rotation.y = Math.PI / 2; this.root.add(g);
    this.box(2.6, 3.4, 0.2, '#3f4745', 0, 1.7, -0.05, g, { metalness: 0.6, roughness: 0.3 });
    const inner = this.box(1.8, 2.6, 0.05, '#fef9c3', 0, 1.3, -0.02, g, { emissive: '#fef3c7', emissiveIntensity: 0.6 });
    inner.castShadow = false;
    const doorMat = mat('#9ca3af', { metalness: 0.85, roughness: 0.25 });
    const left = this.box(0.9, 2.6, 0.06, doorMat, -0.45, 1.3, 0.08, g);
    const right = this.box(0.9, 2.6, 0.06, doorMat, 0.45, 1.3, 0.08, g);
    const ind = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.2), new THREE.MeshBasicMaterial({ color: '#10b981' }));
    ind.position.set(0, 2.95, 0.08); g.add(ind);
    this.elevator = { left, right, open: 0, timer: 6, state: 'closed', ind };
  }

  buildDecor() {
    // floating department holo-signs
    const signs = [['CEO', '#10b981', -15, -5.2], ['RESEARCH', '#38bdf8', 14, -5.2], ['SECURITY', '#fb923c', 5.75, -5.2], ['DEVELOPMENT', '#a78bfa', -13, 5.2], ['CREATIVE', '#f472b6', 13, 5.2]];
    for (const [t, c, x, z] of signs) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTexture(t, null, c), transparent: true, toneMapped: false, side: THREE.DoubleSide }));
      s.position.set(x, 3.45, z); this.root.add(s);
    }
  }

  // ------------------------------------------------------- per-frame
  update(dt, t, avatars, agentStatus, lowFx) {
    // doors open when someone is close
    for (const d of this.doors) {
      let near = false;
      for (const a of avatars) { const p = a.root.position; if (Math.abs(p.x - d.x) < 1.6 && Math.abs(p.z - d.z) < 2.2) { near = true; break; } }
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 6);
      d.left.position.x = -0.5 - d.open * 0.95;
      d.right.position.x = 0.5 + d.open * 0.95;
    }
    // elevator cycle
    const e = this.elevator;
    e.timer -= dt;
    if (e.timer <= 0) {
      if (e.state === 'closed') { e.state = 'open'; e.timer = 4; } else { e.state = 'closed'; e.timer = 18 + Math.random() * 20; }
    }
    e.open += ((e.state === 'open' ? 1 : 0) - e.open) * Math.min(1, dt * 3);
    e.left.position.x = -0.45 - e.open * 0.85;
    e.right.position.x = 0.45 + e.open * 0.85;
    e.ind.material.color.set(e.state === 'open' ? '#fbbf24' : '#10b981');
    // decorations
    for (const s of this.spinners) {
      if (s.type === 'spin') s.obj.rotation.y += dt * s.speed;
      else if (!lowFx) s.obj.rotation.z = Math.sin(t * 0.8 + s.phase) * 0.02;
    }
    for (const l of this.leds) l.m.visible = l.blink ? Math.floor(t * 1.5) % 2 === 0 : Math.sin(t * 5 + l.phase * 3) > -0.3;
    // screens (throttled)
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
      m.emissive.set(day > 0.5 ? '#cfeefa' : '#ffffff');
      m.emissiveIntensity = 0.25 + day * 0.6;
      m.color.setRGB(0.5 + day * 0.2, 0.6 + day * 0.25, 0.75 + day * 0.2);
    }
    for (const m of this.lamps) m.emissiveIntensity = 0.5 + (1 - day) * 1.4;
    for (const l of this.pointLights) l.intensity = (1 - day) * 40 + 4;
  }
}
