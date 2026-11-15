// Zips the qBittorrent alternate WebUI folder (qbit-slake/ with version.txt and public/)
// into dist/qbit-slake-<version>.zip. Usage: node scripts/package.mjs [version-label]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const label = process.argv[2] ?? pkg.version;
const out = `dist/qbit-slake-${label}.zip`;

mkdirSync('dist', { recursive: true });
rmSync(out, { force: true });
// Keep the top-level qbit-slake/ folder: users unzip it and point qBittorrent at it.
execFileSync('zip', ['-r', '-q', '-X', out, 'qbit-slake'], { stdio: 'inherit' });
console.log(`wrote ${out}`);
