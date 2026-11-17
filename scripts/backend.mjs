import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const composeFile = new URL('../docker-compose.dev.yml', import.meta.url).pathname;
const configDir = new URL('../dev/config/qBittorrent/', import.meta.url);
const configFile = new URL('qBittorrent.conf', configDir);
const builtWebUi = new URL('../qbit-slake/public/index.html', import.meta.url);
const username = 'admin';
const password = 'adminadmin';

function qbittorrentPasswordHash(plain) {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(plain, salt, 100000, 64, 'sha512');
  return `@ByteArray(${salt.toString('base64')}:${key.toString('base64')})`;
}

async function seedConfigOnFirstRun() {
  if (existsSync(configFile)) return false;
  await mkdir(configDir, { recursive: true });
  await writeFile(
    configFile,
    [
      '[LegalNotice]',
      'Accepted=true',
      '',
      '[WebUI]',
      'AlternativeUIEnabled=true',
      'RootFolder=/webui',
      `Username=${username}`,
      `Password_PBKDF2="${qbittorrentPasswordHash(password)}"`,
      '',
    ].join('\n'),
  );
  return true;
}

function compose(...args) {
  const result = spawnSync('docker', ['compose', '-f', composeFile, ...args], { stdio: 'inherit' });
  if (result.error) {
    console.error(`Could not run docker: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const seeded = await seedConfigOnFirstRun();
compose('up', '-d', '--wait');

console.log('\nqBittorrent is running at http://localhost:8080');
if (seeded) console.log(`Seeded a fresh config. Log in with ${username} / ${password}`);
if (!existsSync(builtWebUi))
  console.log(
    'No build in qbit-slake/ yet; run `pnpm build` to serve Slake from qBittorrent itself.',
  );
