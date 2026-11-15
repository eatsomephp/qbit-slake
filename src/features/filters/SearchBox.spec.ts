import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { DEFAULT_RAW_TORRENT } from '@/sync/normalize';
import { TorrentState } from '@/constants/qbit';
import { emptyFilters } from '@/lib/torrentFilters';
import { useTorrentsStore } from '@/stores/torrents';
import { useUiStore } from '@/stores/ui';
import SearchBox from './SearchBox.vue';

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  useTorrentsStore().apply({
    rid: 1,
    full_update: true,
    torrents: {
      a: {
        ...DEFAULT_RAW_TORRENT,
        category: 'movies',
        tags: 'keep',
        state: TorrentState.StalledUP,
      },
      b: { ...DEFAULT_RAW_TORRENT, tags: 'keeper', state: TorrentState.Downloading },
    },
    categories: { movies: { name: 'movies', savePath: '' } },
    tags: ['keep', 'keeper'],
  });
});

const mounted: ReturnType<typeof mount>[] = [];
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

function mountBox() {
  const wrapper = mount(SearchBox, { attachTo: document.body });
  mounted.push(wrapper);
  const input = wrapper.get<HTMLInputElement>('input');
  return { wrapper, input, ui: useUiStore() };
}

type Box = ReturnType<typeof mountBox>;

async function type({ input }: Box, text: string, caret = text.length) {
  await input.trigger('focus');
  input.element.value = text;
  input.element.setSelectionRange(caret, caret);
  await input.trigger('input');
  await flushPromises();
}

const options = ({ wrapper }: Box) => wrapper.findAll('[role="option"]').map((o) => o.text());

describe('SearchBox: committing tokens', () => {
  it('keeps plain text as the search', async () => {
    const box = mountBox();
    await type(box, 'ubuntu');
    expect(box.ui.search).toBe('ubuntu');
    expect(box.ui.filters).toEqual(emptyFilters());
  });

  it('does not commit a token while it is still being typed', async () => {
    const box = mountBox();
    await type(box, 'state:seeding');
    expect(box.ui.search).toBe('state:seeding');
    expect(box.ui.filters.state.include).toEqual([]);
  });

  it('commits a token when a space follows it and removes it from the text', async () => {
    const box = mountBox();
    await type(box, 'state:seeding ');
    expect(box.ui.filters.state.include).toEqual(['seeding']);
    expect(box.ui.search).toBe('');
    expect(box.input.element.value).toBe('');
  });

  it('commits a condition token and keeps surrounding text', async () => {
    const box = mountBox();
    await type(box, 'ubuntu ratio>2 ');
    expect(box.ui.filters.conditions).toEqual([{ field: 'ratio', operator: '>', value: 2 }]);
    expect(box.ui.search).toBe('ubuntu ');
  });

  it('resolves names against the vocabulary', async () => {
    const box = mountBox();
    await type(box, 'cat:MOVIES ');
    expect(box.ui.filters.category.include).toEqual(['movies']);
  });

  it('keeps invalid tokens and flags the input', async () => {
    const box = mountBox();
    await type(box, 'state:nope ');
    expect(box.ui.search).toBe('state:nope ');
    expect(box.ui.filters.state.include).toEqual([]);
    expect(box.input.attributes('aria-invalid')).toBe('true');
    expect(box.wrapper.get('[role="status"]').text()).toContain('Unknown state');
  });

  it('does not flag the token still being typed', async () => {
    const box = mountBox();
    await type(box, 'state:nope');
    expect(box.input.attributes('aria-invalid')).toBeUndefined();
  });

  it('commits every valid token on Enter, including the one at the caret', async () => {
    const box = mountBox();
    await type(box, 'tag:keeper');
    await box.input.trigger('keydown', { key: 'Escape' });
    await box.input.trigger('keydown', { key: 'Enter' });
    expect(box.ui.filters.tag.include).toEqual(['keeper']);
    expect(box.ui.search).toBe('');
  });

  it('commits on blur', async () => {
    const box = mountBox();
    await type(box, 'tag:keeper ubuntu');
    await box.input.trigger('blur');
    expect(box.ui.filters.tag.include).toEqual(['keeper']);
    expect(box.ui.search).toBe('ubuntu');
  });

  it('commits a token in the middle without touching the one being edited', async () => {
    const box = mountBox();
    box.ui.search = 'tag:keep ';
    await type(box, 'state:seeding tag:ke', 20);
    expect(box.ui.filters.state.include).toEqual(['seeding']);
    expect(box.ui.search).toBe('tag:ke');
  });
});

describe('SearchBox: suggestions', () => {
  it('opens a list for a key and wires up combobox attributes', async () => {
    const box = mountBox();
    expect(box.input.attributes('aria-expanded')).toBe('false');
    await type(box, 'tag:');
    expect(box.input.attributes('aria-expanded')).toBe('true');
    expect(options(box)[0]).toContain('Untagged');
    expect(options(box).join(' ')).toContain('keeper');
    expect(box.input.attributes('aria-activedescendant')).toBe('torrent-search-option-0');
    expect(box.wrapper.findAll('[role="option"]')[0]!.attributes('aria-selected')).toBe('true');
  });

  it('shows counts next to suggestions', async () => {
    const box = mountBox();
    await type(box, 'state:');
    const seeding = box.wrapper
      .findAll('[role="option"]')
      .find((o) => o.text().includes('Seeding'))!;
    expect(seeding.text()).toContain('1');
  });

  it('filters suggestions as you type and hides them without a match', async () => {
    const box = mountBox();
    await type(box, 'tag:keepe');
    expect(options(box)).toHaveLength(1);
    await type(box, 'tag:zzz');
    expect(box.wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('moves the highlight with ArrowDown and ArrowUp, wrapping around', async () => {
    const box = mountBox();
    await type(box, 'tag:');
    const count = options(box).length;
    await box.input.trigger('keydown', { key: 'ArrowDown' });
    expect(box.input.attributes('aria-activedescendant')).toBe('torrent-search-option-1');
    await box.input.trigger('keydown', { key: 'ArrowUp' });
    await box.input.trigger('keydown', { key: 'ArrowUp' });
    expect(box.input.attributes('aria-activedescendant')).toBe(
      `torrent-search-option-${count - 1}`,
    );
  });

  it('Enter accepts the highlighted suggestion and commits it', async () => {
    const box = mountBox();
    await type(box, 'tag:keep');
    await box.input.trigger('keydown', { key: 'ArrowDown' });
    await box.input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(box.ui.filters.tag.include).toEqual(['keeper']);
    expect(box.ui.search).toBe('');
  });

  it('Tab accepts the first suggestion', async () => {
    const box = mountBox();
    await type(box, 'tag:keep');
    await box.input.trigger('keydown', { key: 'Tab' });
    await flushPromises();
    expect(box.ui.filters.tag.include).toEqual(['keep']);
  });

  it('accepting the untagged suggestion applies the synthetic value', async () => {
    const box = mountBox();
    await type(box, 'tag:untag');
    await box.input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(box.ui.filters.tag.include).toEqual(['']);
  });

  it('accepting an activity suggestion sets the activity', async () => {
    const box = mountBox();
    await type(box, 'is:stal');
    await box.input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(box.ui.filters.activity).toBe('stalled');
  });

  it('accepting a completion suggestion sets the completion', async () => {
    const box = mountBox();
    await type(box, 'is:incomp');
    await box.input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(box.ui.filters.completion).toBe('incomplete');
    expect(box.ui.filters.activity).toBeNull();
  });

  it('shows label and count for completion suggestions', async () => {
    const box = mountBox();
    await type(box, 'completion:');
    const [incomplete, complete] = options(box);
    expect(incomplete).toContain('Incomplete');
    expect(incomplete).toContain('2');
    expect(complete).toContain('Complete');
    expect(complete).toContain('0');
  });

  it('accepting keeps the text after the token', async () => {
    const box = mountBox();
    await type(box, 'tag:kee ubuntu', 7);
    await box.input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(box.ui.filters.tag.include).toEqual(['keep']);
    expect(box.ui.search).toBe('ubuntu');
  });

  it('clicking a suggestion accepts it', async () => {
    const box = mountBox();
    await type(box, 'tag:keeper');
    await box.wrapper.get('[role="option"]').trigger('mousedown');
    await flushPromises();
    expect(box.ui.filters.tag.include).toEqual(['keeper']);
  });

  it('Escape dismisses the list first, then clears the search', async () => {
    const box = mountBox();
    await type(box, 'tag:');
    await box.input.trigger('keydown', { key: 'Escape' });
    expect(box.wrapper.find('[role="listbox"]').exists()).toBe(false);
    expect(box.ui.search).toBe('tag:');
    await box.input.trigger('keydown', { key: 'Escape' });
    expect(box.ui.search).toBe('');
  });

  it('reopens the list after more typing', async () => {
    const box = mountBox();
    await type(box, 'tag:');
    await box.input.trigger('keydown', { key: 'Escape' });
    await type(box, 'tag:k');
    expect(box.wrapper.find('[role="listbox"]').exists()).toBe(true);
  });

  it('does not suggest values that are already applied', async () => {
    const box = mountBox();
    box.ui.filters = { ...emptyFilters(), tag: { include: ['keep'], exclude: [] } };
    await type(box, 'tag:keep');
    expect(options(box)).toHaveLength(1);
    expect(options(box)[0]).toContain('keeper');
  });

  it('closes the list on blur', async () => {
    const box = mountBox();
    await type(box, 'tag:');
    await box.input.trigger('blur');
    expect(box.wrapper.find('[role="listbox"]').exists()).toBe(false);
  });
});

describe('SearchBox: Backspace on an empty box', () => {
  const withChips = () => {
    const box = mountBox();
    box.ui.filters = {
      ...emptyFilters(),
      tag: { include: ['keep'], exclude: [] },
      conditions: [{ field: 'ratio', operator: '>', value: 2 }],
    };
    return box;
  };

  it('pops the last chip back into the text', async () => {
    const box = withChips();
    await box.input.trigger('keydown', { key: 'Backspace' });
    expect(box.ui.search).toBe('ratio>2');
    expect(box.ui.filters.conditions).toEqual([]);
    expect(box.ui.filters.tag.include).toEqual(['keep']);
    await flushPromises();
    expect(box.input.element.selectionStart).toBe('ratio>2'.length);
  });

  it('the popped token stays in the text while the caret is on it', async () => {
    const box = withChips();
    await box.input.trigger('focus');
    await box.input.trigger('keydown', { key: 'Backspace' });
    await flushPromises();
    expect(box.ui.search).toBe('ratio>2');
    expect(box.ui.filters.conditions).toEqual([]);
  });

  it('ignores key repeat so a held key does not wipe every chip', async () => {
    const box = withChips();
    await box.input.trigger('keydown', { key: 'Backspace', repeat: true });
    expect(box.ui.search).toBe('');
    expect(box.ui.filters.conditions).toHaveLength(1);
  });

  it('does nothing when the box has text', async () => {
    const box = withChips();
    box.ui.search = 'abc';
    await box.input.trigger('keydown', { key: 'Backspace' });
    expect(box.ui.search).toBe('abc');
    expect(box.ui.filters.conditions).toHaveLength(1);
  });

  it('does nothing when there are no chips', async () => {
    const box = mountBox();
    await box.input.trigger('keydown', { key: 'Backspace' });
    expect(box.ui.search).toBe('');
  });
});

describe('SearchBox: clearing', () => {
  it('the clear button empties the search and the filters', async () => {
    const box = mountBox();
    box.ui.filters = { ...emptyFilters(), tag: { include: ['keep'], exclude: [] } };
    box.ui.search = 'abc';
    await flushPromises();
    await box.wrapper.get('[aria-label="Clear search and filters"]').trigger('click');
    expect(box.ui.search).toBe('');
    expect(box.ui.filters.tag.include).toEqual([]);
    expect(box.input.element.value).toBe('');
    expect(box.wrapper.find('[aria-label="Clear search and filters"]').exists()).toBe(false);
  });

  it('Escape without a list clears the search', async () => {
    const box = mountBox();
    await type(box, 'abc');
    await box.input.trigger('keydown', { key: 'Escape' });
    expect(box.ui.search).toBe('');
  });
});
