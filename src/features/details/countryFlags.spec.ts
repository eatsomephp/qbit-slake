import { describe, expect, it } from 'vitest';
import { countryFlagUrl } from './countryFlags';

describe('countryFlagUrl', () => {
  it('finds a flag by country code regardless of case', () => {
    const url = countryFlagUrl('de');
    expect(url).toMatch(/de.*\.svg/);
    expect(countryFlagUrl('DE')).toBe(url);
  });

  it('returns undefined for unknown or empty codes', () => {
    expect(countryFlagUrl('zz')).toBeUndefined();
    expect(countryFlagUrl('')).toBeUndefined();
  });
});
