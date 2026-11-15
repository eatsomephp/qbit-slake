import { useStorage } from '@vueuse/core';
import { ETA_INFINITY } from '@/constants/qbit';

export type SpeedUnit = 'bytes' | 'bits';
export type SizeUnit = 'binary' | 'decimal';
export type DateFormat = 'locale' | 'iso' | 'dayFirst' | 'monthFirst';

// Read inside the formatters so every computed and render that shows a size or speed tracks them.
export const speedUnit = useStorage<SpeedUnit>('slake:speedUnit', 'bytes');
export const sizeUnit = useStorage<SizeUnit>('slake:sizeUnit', 'binary');
export const dateFormat = useStorage<DateFormat>('slake:dateFormat', 'locale');
export const hideInfiniteEta = useStorage('slake:hideInfiniteEta', false);

const BINARY_BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
const DECIMAL_BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
const BIT_RATE_UNITS = ['bps', 'kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'];

function scaleToUnit(amount: number, base: number, units: readonly string[]) {
  let value = amount;
  let unit = 0;
  while (value >= base && unit < units.length - 1) {
    value /= base;
    unit++;
  }
  // Two decimals below 10, one below 100, none above: keeps widths steady.
  const digits = unit === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return { value: value.toFixed(digits), unit: units[unit]! };
}

function scaleBytes(bytes: number, system: SizeUnit) {
  return system === 'decimal'
    ? scaleToUnit(bytes, 1000, DECIMAL_BYTE_UNITS)
    : scaleToUnit(bytes, 1024, BINARY_BYTE_UNITS);
}

export function formatBytes(bytes: number, system: SizeUnit = sizeUnit.value): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '–';
  const { value, unit } = scaleBytes(bytes, system);
  return `${value} ${unit}`;
}

export function splitSpeedValueAndUnit(bytesPerSec: number) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return { value: '–', unit: '' };
  if (speedUnit.value === 'bits') return scaleToUnit(bytesPerSec * 8, 1000, BIT_RATE_UNITS);
  const { value, unit } = scaleBytes(bytesPerSec, sizeUnit.value);
  return { value, unit: `${unit}/s` };
}

/** Always a value, zero included; for readouts that should never go blank. */
export function formatSpeedValue(bytesPerSec: number): string {
  const { value, unit } = splitSpeedValueAndUnit(bytesPerSec);
  return unit ? `${value} ${unit}` : value;
}

/** Empty string for zero, so idle rows stay quiet. */
export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec) return '';
  return formatSpeedValue(bytesPerSec);
}

export function formatEta(seconds: number): string {
  if (seconds >= ETA_INFINITY || seconds < 0) return hideInfiniteEta.value ? '' : '∞';
  return formatTwoLargestUnits(seconds);
}

function formatTwoLargestUnits(seconds: number): string {
  if (seconds === 0) return '';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** qBittorrent caps ratios at 9999 and uses -1 for "not applicable". */
export function formatRatio(ratio: number): string {
  if (ratio < 0) return '–';
  if (ratio >= 9999) return '∞';
  return ratio.toFixed(2);
}

/** Progress 0..1 → "45.3%". Never shows 100% until actually complete. */
export function formatPercent(progress: number): string {
  if (progress >= 1) return '100%';
  return `${Math.min(Math.floor(progress * 1000) / 10, 99.9).toFixed(1)}%`;
}

const localeDateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const twoDigits = (n: number) => String(n).padStart(2, '0');

export function formatDateAs(date: Date, format: DateFormat): string {
  if (format === 'locale') return localeDateFormat.format(date);
  const year = date.getFullYear();
  const month = twoDigits(date.getMonth() + 1);
  const day = twoDigits(date.getDate());
  const hours = date.getHours();
  const minutes = twoDigits(date.getMinutes());
  if (format === 'iso') return `${year}-${month}-${day} ${twoDigits(hours)}:${minutes}`;
  if (format === 'dayFirst') return `${day}/${month}/${year} ${twoDigits(hours)}:${minutes}`;
  const meridiem = hours < 12 ? 'AM' : 'PM';
  return `${month}/${day}/${year} ${hours % 12 || 12}:${minutes} ${meridiem}`;
}

/** Unix seconds → local date-time. qBittorrent uses 0 or -1 for "never". */
export function formatDate(unixSeconds: number): string {
  if (!(unixSeconds > 0)) return '';
  return formatDateAs(new Date(unixSeconds * 1000), dateFormat.value);
}

/** Elapsed seconds → "3d 4h", "2h 5m", "45s". Empty for zero or negative. */
export function formatDuration(seconds: number): string {
  if (!(seconds > 0)) return '';
  return formatTwoLargestUnits(seconds);
}

const RELATIVE_STEPS: [limitSeconds: number, unitSeconds: number, suffix: string][] = [
  [60, 1, 's'],
  [3600, 60, 'm'],
  [86_400, 3600, 'h'],
  [30 * 86_400, 86_400, 'd'],
  [365 * 86_400, 30 * 86_400, 'mo'],
  [Infinity, 365 * 86_400, 'y'],
];

export function formatRelativeTime(unixSeconds: number, nowMs: number = Date.now()): string {
  if (!(unixSeconds > 0)) return '';
  const elapsed = Math.max(0, Math.floor(nowMs / 1000 - unixSeconds));
  if (elapsed < 10) return 'just now';
  const [, unit, suffix] = RELATIVE_STEPS.find(([limit]) => elapsed < limit)!;
  return `${Math.floor(elapsed / unit)}${suffix} ago`;
}

const trackerHostCache = new Map<string, string>();

export function trackerHost(url: string): string {
  if (!url) return '';
  let host = trackerHostCache.get(url);
  if (host === undefined) {
    try {
      host = new URL(url).hostname || url;
    } catch {
      host = url;
    }
    trackerHostCache.set(url, host);
  }
  return host;
}
