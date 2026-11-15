// Generates the PWA icons in public/icons/ with no dependencies: a flat accent
// square with a down-arrow into a tray, rasterized with 4x4 supersampling.
// Run with `node scripts/make-icons.mjs`; the outputs are committed.
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const ACCENT = [0, 128, 129]; // ≈ --primary oklch(0.54 0.095 195)
const GLYPH = [255, 255, 255];

/** Glyph coverage in unit space (0..1), centered, scaled by `s`. */
function glyph(x, y, s) {
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  const stem = u > 0.44 && u < 0.56 && v > 0.16 && v < 0.5;
  const head = v >= 0.42 && v < 0.64 && Math.abs(u - 0.5) < (0.64 - v) * 1.15;
  const trayBase = v > 0.76 && v < 0.86 && u > 0.2 && u < 0.8;
  const trayWalls = v > 0.6 && v <= 0.86 && ((u > 0.2 && u < 0.3) || (u > 0.7 && u < 0.8));
  return stem || head || trayBase || trayWalls;
}

function roundedSquare(x, y, r) {
  const dx = Math.max(r - x, 0, x - (1 - r));
  const dy = Math.max(r - y, 0, y - (1 - r));
  return dx * dx + dy * dy <= r * r;
}

function render(size, { maskable }) {
  const SS = 4;
  const px = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (pxl + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const inBg = maskable || roundedSquare(x, y, 0.18);
          if (!inBg) continue;
          bg++;
          // Maskable icons keep the glyph inside the 80% safe zone.
          if (glyph(x, y, maskable ? 0.62 : 0.78)) fg++;
        }
      }
      const total = SS * SS;
      const i = (py * size + pxl) * 4;
      const a = bg / total;
      const f = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(ACCENT[c] * (1 - f) + GLYPH[c] * f);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, px);
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="18" fill="rgb(${ACCENT.join(',')})"/>
  <g fill="#fff" transform="translate(50 50) scale(0.78) translate(-50 -50)">
    <rect x="44" y="16" width="12" height="34"/>
    <polygon points="24.7,42 75.3,42 50,64"/>
    <path d="M20 60h10v16h40V60h10v26H20z"/>
  </g>
</svg>
`;

const dir = new URL('../public/icons/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('icon.svg', dir), svg);
for (const size of [192, 512]) {
  await writeFile(new URL(`icon-${size}.png`, dir), render(size, { maskable: false }));
  await writeFile(new URL(`maskable-${size}.png`, dir), render(size, { maskable: true }));
}
await writeFile(new URL('apple-touch-icon.png', dir), render(180, { maskable: true }));
console.log('wrote public/icons/');
