import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { RawRssFolder } from '@/types/qbit';
import { buildRssTree } from './rssTree';

const qbit = vi.hoisted(() => ({
  refreshRssItem: vi.fn(),
  markRssAsRead: vi.fn(),
  addRssFolder: vi.fn(),
  moveRssItem: vi.fn(),
  setRssFeedUrl: vi.fn(),
  setRssFeedRefreshInterval: vi.fn(),
  removeRssItem: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
vi.mock('@/components/tooltip/vTooltip', () => ({ vTooltip: {} }));
const perform = vi.hoisted(() => vi.fn());
vi.mock('./useRssFeeds', () => ({ useRssFeeds: () => ({ perform }) }));

HTMLElement.prototype.scrollTo = vi.fn();

const { default: FeedTree } = await import('./FeedTree.vue');

const raw = (): RawRssFolder => ({
  News: {
    uid: 'u1',
    url: 'http://news/rss',
    refreshInterval: 600,
    articles: [{ id: 'a' }, { id: 'b', isRead: true }],
  },
  TV: {
    Shows: { uid: 'u2', url: 'http://shows/rss', articles: [{ id: 'c' }] },
    Broken: { uid: 'u3', url: 'http://b/rss', hasError: true },
    Inner: { Deep: {} },
  },
});

let wrapper: VueWrapper | undefined;

function mountTree(selectedPath: string | null = null) {
  wrapper = mount(FeedTree, {
    attachTo: document.body,
    props: { root: buildRssTree(raw()), selectedPath },
  });
  return wrapper;
}

const rowButton = (w: VueWrapper, name: string) =>
  w.findAll('ul[aria-label="Feeds"] li').find((li) => li.find('span.truncate').text() === name)!;

async function openMenuItem(w: VueWrapper, rowName: string, itemText: string) {
  await rowButton(w, rowName).trigger('contextmenu');
  await flushPromises();
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((e) =>
    e.textContent?.includes(itemText),
  ) as HTMLElement;
  item.click();
  await flushPromises();
}

function confirmDelete() {
  const confirm = [...document.querySelectorAll('[role="alertdialog"] button')].find(
    (b) => b.textContent?.trim() === 'Delete',
  ) as HTMLElement;
  confirm.click();
}

async function submitPrompt(value: string) {
  const input = document.querySelector<HTMLInputElement>('#rss-prompt-form input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await flushPromises();
  document.querySelector<HTMLFormElement>('#rss-prompt-form')!.requestSubmit();
  await flushPromises();
}

beforeEach(() => {
  setActivePinia(createPinia());
  Object.values(qbit).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
  perform.mockReset().mockImplementation(async (_label: string, call: () => Promise<void>) => {
    await call();
    return true;
  });
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('FeedTree rendering', () => {
  it('shows the unread inbox plus nested rows with unread badges', () => {
    const w = mountTree();
    const labels = w.findAll('ul[aria-label="Feeds"] > li').map((li) => li.text());
    expect(labels).toEqual(['Unread2', 'News1', 'TV1', 'Shows1', 'Broken', 'Inner', 'Deep']);
  });

  it('marks the selected item and the Unread view', () => {
    expect(mountTree(null).find('[aria-current="true"]').text()).toContain('Unread');
    wrapper?.unmount();
    expect(mountTree('TV\\Shows').find('[aria-current="true"]').text()).toContain('Shows');
  });

  it('flags a feed that failed to fetch', () => {
    expect(mountTree().find('[aria-label="Couldn’t fetch the feed"]').exists()).toBe(true);
  });

  it('collapses and expands folders', async () => {
    const w = mountTree();
    await w.find('button[aria-label="Collapse TV"]').trigger('click');
    expect(w.text()).not.toContain('Shows');
    expect(w.find('button[aria-label="Expand TV"]').attributes('aria-expanded')).toBe('false');
    await w.find('button[aria-label="Expand TV"]').trigger('click');
    expect(w.text()).toContain('Shows');
  });

  it('shows an empty state without feeds', () => {
    wrapper = mount(FeedTree, { props: { root: buildRssTree({}), selectedPath: null } });
    expect(wrapper.text()).toContain('No feeds yet.');
  });

  it('emits select with the item path, or null for Unread', async () => {
    const w = mountTree('News');
    await rowButton(w, 'Shows').find('button:last-of-type').trigger('click');
    await w.findAll('ul > li button')[0]!.trigger('click');
    expect(w.emitted('select')).toEqual([['TV\\Shows'], [null]]);
  });
});

describe('FeedTree actions', () => {
  it('refreshes everything from the toolbar with an empty path', async () => {
    const w = mountTree();
    await w.find('button[aria-label="Refresh all feeds"]').trigger('click');
    expect(perform).toHaveBeenCalledWith('Refresh', expect.any(Function));
    expect(qbit.refreshRssItem).toHaveBeenCalledWith('');
  });

  it('marks a folder read by path', async () => {
    const w = mountTree();
    await openMenuItem(w, 'TV', 'Mark all as read');
    expect(qbit.markRssAsRead).toHaveBeenCalledWith('TV');
  });

  it('creates a folder inside the selected folder', async () => {
    const w = mountTree('TV');
    await w.find('button[aria-label="New folder"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('New folder in “TV”');
    await submitPrompt('Anime');
    expect(qbit.addRssFolder).toHaveBeenCalledWith('TV\\Anime');
  });

  it('creates a folder next to a selected feed, in its parent', async () => {
    const w = mountTree('TV\\Shows');
    await w.find('button[aria-label="New folder"]').trigger('click');
    await flushPromises();
    await submitPrompt('Anime');
    expect(qbit.addRssFolder).toHaveBeenCalledWith('TV\\Anime');
  });

  it('rejects names containing the path separator', async () => {
    const w = mountTree();
    await w.find('button[aria-label="New folder"]').trigger('click');
    await flushPromises();
    await submitPrompt('a\\b');
    expect(document.body.textContent).toContain('Names can’t contain');
    expect(qbit.addRssFolder).not.toHaveBeenCalled();
  });

  it('renames within the same folder and keeps the selection following the item', async () => {
    const w = mountTree('TV\\Inner\\Deep');
    await openMenuItem(w, 'Inner', 'Rename');
    await submitPrompt('Renamed');
    expect(qbit.moveRssItem).toHaveBeenCalledWith('TV\\Inner', 'TV\\Renamed');
    expect(w.emitted('select')).toEqual([['TV\\Renamed\\Deep']]);
  });

  it('does not touch the selection when renaming something unrelated', async () => {
    const w = mountTree('News');
    await openMenuItem(w, 'Inner', 'Rename');
    await submitPrompt('Renamed');
    expect(w.emitted('select')).toBeUndefined();
  });

  it('does not emit select when the rename fails', async () => {
    perform.mockResolvedValue(false);
    const w = mountTree('TV\\Inner');
    await openMenuItem(w, 'Inner', 'Rename');
    await submitPrompt('Renamed');
    expect(w.emitted('select')).toBeUndefined();
  });

  it('offers no move target inside the folder being moved', async () => {
    const w = mountTree();
    await openMenuItem(w, 'TV', 'Move to');
    const options = [...document.querySelectorAll('#rss-move-form option')].map((o) =>
      o.textContent?.trim(),
    );
    expect(options).toEqual(['Top level']);
  });

  it('moves a feed into another folder', async () => {
    const w = mountTree();
    await openMenuItem(w, 'News', 'Move to');
    const select = document.querySelector<HTMLSelectElement>('#rss-move-form select')!;
    select.value = 'TV\\Inner';
    select.dispatchEvent(new Event('change'));
    await flushPromises();
    document.querySelector<HTMLFormElement>('#rss-move-form')!.requestSubmit();
    await flushPromises();
    expect(qbit.moveRssItem).toHaveBeenCalledWith('News', 'TV\\Inner\\News');
  });

  it('only accepts http(s) feed URLs', async () => {
    const w = mountTree();
    await openMenuItem(w, 'News', 'Edit feed URL');
    await submitPrompt('ftp://x');
    expect(document.body.textContent).toContain('Use an http:// or https:// URL.');
    expect(qbit.setRssFeedUrl).not.toHaveBeenCalled();
    await submitPrompt('https://new/rss');
    expect(qbit.setRssFeedUrl).toHaveBeenCalledWith('News', 'https://new/rss');
  });

  it('converts the refresh interval from minutes to seconds', async () => {
    const w = mountTree();
    await openMenuItem(w, 'News', 'Refresh interval');
    expect(document.querySelector<HTMLInputElement>('#rss-prompt-form input')!.value).toBe('10');
    await submitPrompt('1.5');
    expect(document.body.textContent).toContain('Enter whole minutes, or 0.');
    await submitPrompt('30');
    expect(qbit.setRssFeedRefreshInterval).toHaveBeenCalledWith('News', 1800);
  });

  it('hides the refresh interval action when the server does not report it', async () => {
    const w = mountTree();
    await rowButton(w, 'Shows').trigger('contextmenu');
    await flushPromises();
    const texts = [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent);
    expect(texts.some((t) => t?.includes('Refresh interval'))).toBe(false);
    expect(texts.some((t) => t?.includes('Edit feed URL'))).toBe(true);
  });

  it('describes what a folder delete removes and deselects when the selection was inside', async () => {
    const w = mountTree('TV\\Shows');
    await openMenuItem(w, 'TV', 'Delete');
    expect(document.body.textContent).toContain('Delete folder “TV”?');
    expect(document.body.textContent).toContain(
      'The 2 feeds in it and their articles are removed too.',
    );
    confirmDelete();
    await flushPromises();
    expect(qbit.removeRssItem).toHaveBeenCalledWith('TV');
    expect(w.emitted('select')).toEqual([[null]]);
  });

  it('keeps the selection when deleting an unrelated item', async () => {
    const w = mountTree('News');
    await openMenuItem(w, 'Shows', 'Delete');
    expect(document.body.textContent).toContain('Its articles are removed too.');
    confirmDelete();
    await flushPromises();
    expect(qbit.removeRssItem).toHaveBeenCalledWith('TV\\Shows');
    expect(w.emitted('select')).toBeUndefined();
  });
});
