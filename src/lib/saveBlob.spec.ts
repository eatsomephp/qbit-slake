import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadUrl, safeFilename, saveBlob } from './saveBlob';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('safeFilename', () => {
  it('replaces path separators and reserved characters', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });

  it('replaces control characters and trims', () => {
    expect(safeFilename('  na\u0000me\n ')).toBe('na_me_');
  });

  it('falls back to "download" for blank names', () => {
    expect(safeFilename('   ')).toBe('download');
    expect(safeFilename('')).toBe('download');
  });
});

describe('downloadUrl', () => {
  it('clicks an anchor with the sanitized filename', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('a_b.torrent');
      expect(this.getAttribute('href')).toBe('blob:x');
    });
    downloadUrl('blob:x', 'a/b.torrent');
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('saveBlob', () => {
  it('revokes the object URL only after the click has been dispatched', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:abc');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    saveBlob(new Blob(['x']), 'f.txt');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:abc');
  });
});
