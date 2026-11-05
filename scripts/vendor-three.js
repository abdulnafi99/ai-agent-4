// Copies the parts of Three.js the browser needs into public/vendor/three.
// The copies are committed so every host (including Vercel's CDN, which only
// serves files present in the repository's public/ folder) can serve them.
// Run `npm run vendor` after upgrading the three package.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'three');
const dest = path.join(root, 'public', 'vendor', 'three');
const files = [
  'build/three.module.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/geometries/RoundedBoxGeometry.js',
];
for (const f of files) {
  fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
console.log(`Copied ${files.length} Three.js files to public/vendor/three`);
