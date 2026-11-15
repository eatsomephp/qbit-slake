import { afterEach, describe, expect, it } from 'vitest';
import { closeManage, manage, openManage } from './manageState';

afterEach(closeManage);

describe('manage state', () => {
  it('starts closed', () => {
    expect(manage.value).toBeNull();
  });

  it('opens a request and closes it', () => {
    openManage({ kind: 'rename', hash: 'h' });
    expect(manage.value).toEqual({ kind: 'rename', hash: 'h' });
    closeManage();
    expect(manage.value).toBeNull();
  });

  it('replaces the open dialog so only one is ever open', () => {
    openManage({ kind: 'statistics' });
    openManage({ kind: 'deleteTag', name: 't' });
    expect(manage.value).toEqual({ kind: 'deleteTag', name: 't' });
  });
});
