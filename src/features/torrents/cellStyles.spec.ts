import { describe, expect, it } from 'vitest';
import { speedLimitHint, speedText } from './cellStyles';

describe('speedLimitHint', () => {
  it('names the direction and formats the limit', () => {
    expect(speedLimitHint(500 * 1024, 'Download')).toBe('Download limit: 500 KiB/s');
    expect(speedLimitHint(1024 ** 2, 'Upload')).toBe('Upload limit: 1.00 MiB/s');
  });

  it('is empty when unlimited', () => {
    expect(speedLimitHint(0, 'Download')).toBe('');
    expect(speedLimitHint(-1, 'Upload')).toBe('');
  });
});

describe('speedText', () => {
  it('shows 0 B/s for an idle limited direction and stays empty when unlimited', () => {
    expect(speedText(2048, 0)).toBe('2.00 KiB/s');
    expect(speedText(0, 1024)).toBe('0 B/s');
    expect(speedText(0, 0)).toBe('');
  });
});
