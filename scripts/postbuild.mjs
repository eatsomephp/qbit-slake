// Writes qbit-slake/version.txt next to public/, as qBittorrent alternate WebUIs expect,
// and fails the build if mock-only code (faker) leaked into the production bundle.
import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../qbit-slake/', import.meta.url);
const assets = new URL('public/assets/', root);

for (const name of await readdir(assets)) {
  if (!name.endsWith('.js')) continue;
  if ((await readFile(new URL(name, assets), 'utf8')).includes('fakerjs.dev')) {
    console.error(`faker leaked into the production bundle (${name}).`);
    console.error('Mock code must have no module-level side effects; see services/qbit.');
    process.exit(1);
  }
}

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await writeFile(new URL('version.txt', root), `${pkg.version}\n`);
console.log(`wrote qbit-slake/version.txt (${pkg.version})`);
