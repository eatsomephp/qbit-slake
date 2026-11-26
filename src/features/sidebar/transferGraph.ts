import { GRAPH_HISTORY_MS, type TransferSample } from '@/stores/transfer';

const MIN_Y_SCALE_BYTES_PER_SEC = 16 * 1024;
const HEADROOM_ABOVE_PEAK = 1.15;
const TOP_INSET_PX = 4;
const BASELINE_INSET_PX = 1;
const MIN_TIME_WINDOW_MS = 30_000;

export interface Point {
  x: number;
  y: number;
}

export interface TimeDomain {
  startEpochMs: number;
  endEpochMs: number;
}

export interface GraphGeometry {
  downloadLine: string;
  downloadArea: string;
  uploadLine: string;
  uploadArea: string;
  yScaleMaxBytesPerSec: number;
  xOfEpochMs(atEpochMs: number): number;
  yOfRate(bytesPerSec: number): number;
}

export function timeDomainOf(samples: readonly TransferSample[]): TimeDomain {
  const endEpochMs = samples.at(-1)?.atEpochMs ?? 0;
  const recordedSpanMs = endEpochMs - (samples[0]?.atEpochMs ?? endEpochMs);
  const windowMs = Math.min(GRAPH_HISTORY_MS, Math.max(MIN_TIME_WINDOW_MS, recordedSpanMs));
  return { startEpochMs: endEpochMs - windowMs, endEpochMs };
}

export function spokenTimeWindowOf(samples: readonly TransferSample[]): string {
  const { startEpochMs, endEpochMs } = timeDomainOf(samples);
  const seconds = Math.round((endEpochMs - startEpochMs) / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'minute' : `${minutes} minutes`;
}

export function epochMsAtFraction(domain: TimeDomain, fraction: number): number {
  const clampedFraction = Math.min(1, Math.max(0, fraction));
  return domain.startEpochMs + clampedFraction * (domain.endEpochMs - domain.startEpochMs);
}

export function interpolatedSampleAt(
  samples: readonly TransferSample[],
  atEpochMs: number,
): TransferSample | null {
  if (!samples.length) return null;
  const first = samples[0]!;
  const last = samples.at(-1)!;
  if (atEpochMs < first.atEpochMs) return null;
  if (atEpochMs === first.atEpochMs) return first;
  if (atEpochMs >= last.atEpochMs) return last;
  const laterIndex = samples.findIndex((sample) => sample.atEpochMs >= atEpochMs);
  const later = samples[laterIndex]!;
  const earlier = samples[laterIndex - 1]!;
  const progress = (atEpochMs - earlier.atEpochMs) / (later.atEpochMs - earlier.atEpochMs);
  const lerp = (from: number, to: number) => from + (to - from) * progress;
  return {
    atEpochMs,
    download: lerp(earlier.download, later.download),
    upload: lerp(earlier.upload, later.upload),
  };
}

export function monotoneCurvePath(points: readonly Point[]): string {
  if (points.length < 2) return '';
  const format = (point: Point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  const segmentSlopes = points.slice(1).map((point, index) => {
    const dx = point.x - points[index]!.x;
    return dx === 0 ? 0 : (point.y - points[index]!.y) / dx;
  });
  const tangents = points.map((_, index) => {
    if (index === 0) return segmentSlopes[0]!;
    if (index === points.length - 1) return segmentSlopes.at(-1)!;
    const before = segmentSlopes[index - 1]!;
    const after = segmentSlopes[index]!;
    // Fritsch–Carlson: a zero tangent at local extrema keeps the curve from overshooting below zero.
    if (before * after <= 0) return 0;
    return (2 * before * after) / (before + after);
  });
  let path = `M${format(points[0]!)}`;
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const third = (end.x - start.x) / 3;
    const controlStart = { x: start.x + third, y: start.y + tangents[index - 1]! * third };
    const controlEnd = { x: end.x - third, y: end.y - tangents[index]! * third };
    path += `C${format(controlStart)} ${format(controlEnd)} ${format(end)}`;
  }
  return path;
}

export function withZeroLeadIn(
  samples: readonly TransferSample[],
  domain: TimeDomain,
): readonly TransferSample[] {
  const [first, second] = samples;
  if (!first || !second || first.atEpochMs <= domain.startEpochMs) return samples;
  const rampStartEpochMs = Math.max(
    domain.startEpochMs,
    first.atEpochMs - (second.atEpochMs - first.atEpochMs),
  );
  const zeroAt = (atEpochMs: number): TransferSample => ({ atEpochMs, download: 0, upload: 0 });
  const leadIn =
    rampStartEpochMs > domain.startEpochMs
      ? [zeroAt(domain.startEpochMs), zeroAt(rampStartEpochMs)]
      : [zeroAt(domain.startEpochMs)];
  return [...leadIn, ...samples];
}

export function buildGraphGeometry(
  samples: readonly TransferSample[],
  widthPx: number,
  heightPx: number,
): GraphGeometry {
  const domain = timeDomainOf(samples);
  const domainSpanMs = domain.endEpochMs - domain.startEpochMs;
  let peakBytesPerSec = 0;
  for (const sample of samples) {
    peakBytesPerSec = Math.max(peakBytesPerSec, sample.download, sample.upload);
  }
  const yScaleMaxBytesPerSec = Math.max(
    peakBytesPerSec * HEADROOM_ABOVE_PEAK,
    MIN_Y_SCALE_BYTES_PER_SEC,
  );
  const baselineY = heightPx - BASELINE_INSET_PX;
  const plotHeight = baselineY - TOP_INSET_PX;

  const xOfEpochMs = (atEpochMs: number) =>
    ((atEpochMs - domain.startEpochMs) / domainSpanMs) * widthPx;
  const yOfRate = (bytesPerSec: number) =>
    baselineY - (bytesPerSec / yScaleMaxBytesPerSec) * plotHeight;

  function pathsFor(rateOf: (sample: TransferSample) => number) {
    if (samples.length < 2) return { line: '', area: '' };
    const drawnSamples = withZeroLeadIn(samples, domain);
    const line = monotoneCurvePath(
      drawnSamples.map((sample) => ({
        x: xOfEpochMs(sample.atEpochMs),
        y: yOfRate(rateOf(sample)),
      })),
    );
    const firstX = xOfEpochMs(drawnSamples[0]!.atEpochMs).toFixed(1);
    const lastX = xOfEpochMs(samples.at(-1)!.atEpochMs).toFixed(1);
    return { line, area: `${line}L${lastX},${heightPx}L${firstX},${heightPx}Z` };
  }

  const download = pathsFor((sample) => sample.download);
  const upload = pathsFor((sample) => sample.upload);
  return {
    downloadLine: download.line,
    downloadArea: download.area,
    uploadLine: upload.line,
    uploadArea: upload.area,
    yScaleMaxBytesPerSec,
    xOfEpochMs,
    yOfRate,
  };
}
