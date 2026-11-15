import { describe, expect, it } from 'vitest';
import { hostPathName, isAbsoluteHostPath, parentHostPath } from './hostPaths';

describe('isAbsoluteHostPath', () => {
  it.each(['/', '/downloads/tv/', 'C:\\', 'C:\\Users\\x', 'c:/Users', '\\\\nas\\share'])(
    'accepts %s',
    (path) => expect(isAbsoluteHostPath(path)).toBe(true),
  );

  it.each(['', 'downloads', './downloads', '../tv', 'C:', 'C:Users', ' /downloads'])(
    'rejects %j',
    (path) => expect(isAbsoluteHostPath(path)).toBe(false),
  );
});

describe('parentHostPath', () => {
  it.each([
    ['/downloads/tv', '/downloads'],
    ['/downloads/tv/', '/downloads'],
    ['/downloads', '/'],
    ['C:\\Users\\x', 'C:\\Users'],
    ['C:\\Users\\x\\', 'C:\\Users'],
    ['C:\\Users', 'C:\\'],
    ['C:/Users', 'C:/'],
    ['C:/Users/x', 'C:/Users'],
  ])('puts the parent of %s at %s', (path, parent) => {
    expect(parentHostPath(path)).toBe(parent);
  });

  it.each(['/', '//', 'C:\\', 'C:/', 'C:'])('gives the root %s no parent', (path) => {
    expect(parentHostPath(path)).toBeNull();
  });
});

describe('hostPathName', () => {
  it.each([
    ['/downloads/tv', 'tv'],
    ['/downloads/tv/', 'tv'],
    ['C:\\Users\\x', 'x'],
    ['C:/Users', 'Users'],
    ['/downloads', 'downloads'],
  ])('names %s as %s', (path, name) => {
    expect(hostPathName(path)).toBe(name);
  });

  it.each(['/', 'C:\\'])('names the root %s as itself', (path) => {
    expect(hostPathName(path)).toBe(path);
  });
});
