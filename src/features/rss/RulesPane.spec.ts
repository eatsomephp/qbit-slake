import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';
import type { RawRssRule } from '@/types/qbit';

const qbit = vi.hoisted(() => ({
  getRssRules: vi.fn(),
  getRssMatchingArticles: vi.fn(),
  setRssRule: vi.fn(),
  renameRssRule: vi.fn(),
  cloneRssRule: vi.fn(),
  removeRssRule: vi.fn(),
  exportRssRules: vi.fn(),
  importRssRules: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue');
  return { useIsMobile: () => ref(false) };
});
vi.mock('@/components/tooltip/vTooltip', () => ({ vTooltip: {} }));
const saveBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/saveBlob', () => ({ saveBlob }));
vi.mock('./useRssFeeds', async () => {
  const { ref } = await import('vue');
  return { useRssFeeds: () => ({ feeds: ref([]) }) };
});

HTMLElement.prototype.scrollTo = vi.fn();

const { default: RulesPane } = await import('./RulesPane.vue');

const rules = (): Record<string, RawRssRule> => ({
  Alpha: {
    enabled: true,
    mustContain: 'ubuntu',
    previouslyMatchedEpisodes: ['1x1'],
    torrentParams: { category: '' },
  },
  Beta: { enabled: false, mustContain: 'debian' },
});

let wrapper: VueWrapper | undefined;
let store: Record<string, RawRssRule>;

async function mountPane(version = '2.16.2') {
  useAppStore().webApiVersion = version;
  wrapper = mount(RulesPane, {
    attachTo: document.body,
    global: {
      plugins: [
        [
          VueQueryPlugin,
          { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        ],
      ],
    },
  });
  await flushPromises();
  return wrapper;
}

const pageButton = (w: VueWrapper, label: string) =>
  w.findAll('button').find((b) => b.text() === label)!;
const bodyButton = (label: string) =>
  [...document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button')].find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLElement;
const ruleButton = (w: VueWrapper, name: string) =>
  w.findAll('ul[aria-label="Download rules"] li button').find((b) => b.text() === name)!;
async function editMustContain(w: VueWrapper, value: string) {
  const input = w.find<HTMLInputElement>('input.font-mono');
  await input.setValue(value);
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  store = rules();
  saveBlob.mockReset();
  Object.values(qbit).forEach((fn) => fn.mockReset().mockResolvedValue(undefined));
  qbit.getRssRules.mockImplementation(async () => structuredClone(store));
  qbit.getRssMatchingArticles.mockResolvedValue({ Feed: ['Ubuntu 24.04'] });
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('RulesPane list', () => {
  it('lists the rules and prompts to select one', async () => {
    const w = await mountPane();
    expect(w.findAll('ul[aria-label="Download rules"] li').map((li) => li.text())).toEqual([
      'Alpha',
      'Beta',
    ]);
    expect(w.text()).toContain('Select a rule to edit it.');
  });

  it('shows an empty-state message with no rules', async () => {
    store = {};
    const w = await mountPane();
    expect(w.text()).toContain('No rules yet.');
  });

  it('shows an error when rules fail to load', async () => {
    qbit.getRssRules.mockRejectedValue(new Error('x'));
    const w = await mountPane();
    expect(w.text()).toContain("Couldn't load the rules.");
  });

  it('toggling the checkbox saves the rule with the flipped flag, keeping other keys', async () => {
    const w = await mountPane();
    await w.find('button[aria-label="Enable Beta"]').trigger('click');
    await flushPromises();
    expect(qbit.setRssRule).toHaveBeenCalledWith('Beta', {
      enabled: true,
      mustContain: 'debian',
    });
  });

  it('hides import/export and clone before the API supports them', async () => {
    const w = await mountPane('2.11.0');
    expect(w.find('button[aria-label="Import rules"]').exists()).toBe(false);
    expect(w.find('button[aria-label="Export rules"]').exists()).toBe(false);
  });
});

describe('RulesPane editing', () => {
  it('opens a rule, fetches its matching articles and starts clean', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    expect(qbit.getRssMatchingArticles).toHaveBeenCalledWith('Alpha', expect.any(AbortSignal));
    expect(w.text()).toContain('Ubuntu 24.04');
    expect(w.find('input.font-mono').element).toHaveProperty('value', 'ubuntu');
    expect(pageButton(w, 'Save').attributes('disabled')).toBeDefined();
    expect(pageButton(w, 'Discard').attributes('disabled')).toBeDefined();
  });

  it('saves only after an edit, sending the whole rule with preserved keys', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    await editMustContain(w, 'ubuntu 24');
    expect(pageButton(w, 'Save').attributes('disabled')).toBeUndefined();
    expect(w.find('[aria-label="Unsaved changes"]').exists()).toBe(true);

    await pageButton(w, 'Save').trigger('click');
    await flushPromises();
    const [name, rule] = qbit.setRssRule.mock.calls[0]!;
    expect(name).toBe('Alpha');
    expect(rule).toMatchObject({
      enabled: true,
      mustContain: 'ubuntu 24',
      previouslyMatchedEpisodes: ['1x1'],
    });
  });

  it('discard restores the saved values', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    await editMustContain(w, 'changed');
    await pageButton(w, 'Discard').trigger('click');
    expect(w.find('input.font-mono').element).toHaveProperty('value', 'ubuntu');
    expect(w.find('[aria-label="Unsaved changes"]').exists()).toBe(false);
  });

  it('blocks saving an invalid episode filter', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    await w.find('input[placeholder="1x1-;"]').setValue('garbage');
    expect(pageButton(w, 'Save').attributes('disabled')).toBeDefined();
    await w.find('input[placeholder="1x1-;"]').setValue('1x1-;');
    expect(pageButton(w, 'Save').attributes('disabled')).toBeUndefined();
  });

  it('asks before leaving a rule with unsaved edits, and Keep editing stays put', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    await editMustContain(w, 'changed');
    await ruleButton(w, 'Beta').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Save changes to “Alpha”?');
    bodyButton('Keep editing').click();
    await flushPromises();
    expect(w.find('h3.truncate').text()).toBe('Alpha');
    expect(w.find('input.font-mono').element).toHaveProperty('value', 'changed');
  });

  it('Discard in the leave prompt switches to the other rule without saving', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    await editMustContain(w, 'changed');
    await ruleButton(w, 'Beta').trigger('click');
    await flushPromises();
    bodyButton('Discard').click();
    await flushPromises();
    expect(qbit.setRssRule).not.toHaveBeenCalled();
    expect(w.find('h3.truncate').text()).toBe('Beta');
    expect(w.find('input.font-mono').element).toHaveProperty('value', 'debian');
  });

  it('Save in the leave prompt saves, then switches', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    await editMustContain(w, 'changed');
    await ruleButton(w, 'Beta').trigger('click');
    await flushPromises();
    bodyButton('Save').click();
    await flushPromises();
    expect(qbit.setRssRule).toHaveBeenCalledWith(
      'Alpha',
      expect.objectContaining({ mustContain: 'changed' }),
    );
    expect(w.find('h3.truncate').text()).toBe('Beta');
  });

  it('stays on the rule and toasts when saving fails', async () => {
    qbit.setRssRule.mockRejectedValue(new Error('nope'));
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    await editMustContain(w, 'changed');
    await pageButton(w, 'Save').trigger('click');
    await flushPromises();
    expect(useToastsStore().toasts[0]?.message).toMatch(/^Save rule failed/);
    expect(w.find('[aria-label="Unsaved changes"]').exists()).toBe(true);
  });
});

describe('RulesPane rule management', () => {
  async function submitPrompt(value: string) {
    const input = document.querySelector<HTMLInputElement>('#rss-prompt-form input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
    document.querySelector<HTMLFormElement>('#rss-prompt-form')!.requestSubmit();
    await flushPromises();
  }

  it('creates an empty rule and selects it', async () => {
    const w = await mountPane();
    await pageButton(w, 'New rule').trigger('click');
    await flushPromises();
    store.Gamma = {};
    await submitPrompt('Gamma');
    expect(qbit.setRssRule).toHaveBeenCalledWith('Gamma', {});
    expect(w.find('h3.truncate').text()).toBe('Gamma');
  });

  it('rejects a duplicate rule name', async () => {
    const w = await mountPane();
    await pageButton(w, 'New rule').trigger('click');
    await flushPromises();
    await submitPrompt('Alpha');
    expect(document.body.textContent).toContain('A rule with this name already exists.');
    expect(qbit.setRssRule).not.toHaveBeenCalled();
  });

  it('confirms before deleting, then deselects the rule', async () => {
    const w = await mountPane();
    await ruleButton(w, 'Alpha').trigger('click');
    await flushPromises();
    const li = w.findAll('ul[aria-label="Download rules"] li')[0]!;
    await li.trigger('contextmenu');
    await flushPromises();
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((e) =>
      e.textContent?.includes('Delete'),
    ) as HTMLElement;
    item.click();
    await flushPromises();
    expect(document.body.textContent).toContain('Delete rule “Alpha”?');
    expect(qbit.removeRssRule).not.toHaveBeenCalled();
    bodyButton('Delete rule').click();
    await flushPromises();
    expect(qbit.removeRssRule).toHaveBeenCalledWith('Alpha');
    expect(w.text()).toContain('Select a rule to edit it.');
  });

  it('exports rules as a download', async () => {
    qbit.exportRssRules.mockResolvedValue(new Blob(['{}']));
    const w = await mountPane();
    await w.find('button[aria-label="Export rules"]').trigger('click');
    await flushPromises();
    expect(qbit.exportRssRules).toHaveBeenCalled();
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'rss-downloader-rules.json');
  });
});
