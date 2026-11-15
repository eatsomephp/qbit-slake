import { describe, expect, it } from 'vitest';
import { isValidPeerAddress, parsePeerList, peerAddress } from './peerAddresses';

describe('peerAddress', () => {
  it('brackets IPv6 hosts only', () => {
    expect(peerAddress({ ip: '1.2.3.4', port: 6881 })).toBe('1.2.3.4:6881');
    expect(peerAddress({ ip: '2001:db8::1', port: 6881 })).toBe('[2001:db8::1]:6881');
  });
});

describe('isValidPeerAddress', () => {
  it.each(['1.2.3.4:6881', '255.255.255.255:65535', '[::1]:1', '[2001:DB8::1]:6881'])(
    'accepts %s',
    (address) => expect(isValidPeerAddress(address)).toBe(true),
  );

  it.each([
    '1.2.3.4',
    '1.2.3.4:0',
    '1.2.3.4:65536',
    '256.1.1.1:80',
    '1.2.3:80',
    '::1:80',
    '[::1]',
    '[1.2.3.4]:80',
    'host.example:80',
    '',
  ])('rejects %s', (address) => expect(isValidPeerAddress(address)).toBe(false));
});

describe('parsePeerList', () => {
  it('splits on whitespace and commas, drops duplicates, and separates invalid entries', () => {
    expect(parsePeerList('1.2.3.4:80, [::1]:81\n1.2.3.4:80  bogus\r\n\n5.6.7.8:99999')).toEqual({
      peers: ['1.2.3.4:80', '[::1]:81'],
      invalid: ['bogus', '5.6.7.8:99999'],
    });
  });

  it('returns empty lists for blank input', () => {
    expect(parsePeerList(' \n ')).toEqual({ peers: [], invalid: [] });
  });
});
