import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { RouterView, createMemoryHistory, createRouter, type Router } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { useToastsStore } from '@/stores/toasts';
import { useUiStore } from '@/stores/ui';
import { QbtHttpError } from '@/services/qbit/http';
import { MockProvider } from '@/services/qbit/MockProvider';

const isMobile = await vi.hoisted(async () => {
  const { ref } = await import('vue');
  return ref(false);
});

const qbit = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  setPreferences: vi.fn(),
  getNetworkInterfaces: vi.fn(),
  getNetworkInterfaceAddresses: vi.fn(),
  getDirectoryContent: vi.fn(),
  getFreeSpaceAtPath: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => isMobile }));

const { default: SettingsView } = await import('./SettingsView.vue');

const scrollTo = vi.fn();
HTMLElement.prototype.scrollTo = scrollTo;

let mounted: VueWrapper | undefined;
let router: Router;

async function mountView(section?: string) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'main', component: { template: '<p>torrents</p>' } },
      { path: '/settings/:section?', name: 'settings', component: SettingsView },
      { path: '/other', name: 'other', component: { template: '<p>other page</p>' } },
      { path: '/login', name: 'login', component: { template: '<p>login page</p>' } },
      { path: '/log', name: 'log', component: { template: '<p>log page</p>' } },
      { path: '/:p(.*)*', component: {} },
    ],
  });
  await router.push(section ? `/settings/${section}` : '/settings');
  mounted = mount(RouterView, {
    attachTo: document.body,
    global: {
      plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient() }]],
      stubs: { teleport: true },
      renderStubDefaultSlot: true,
    },
  });
  return mounted;
}

async function mountSection(section: string, extra: Record<string, unknown> = {}) {
  qbit.getPreferences.mockResolvedValue({
    ...(await new MockProvider(0).getPreferences()),
    ...extra,
  });
  const w = await mountView(section);
  await flushPromises();
  return w;
}

async function openSection(section: string) {
  await router.push({ name: 'settings', params: { section } });
  await flushPromises();
}

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

beforeEach(async () => {
  vi.clearAllMocks();
  isMobile.value = false;
  qbit.setPreferences.mockReset();
  localStorage.clear();
  setActivePinia(createPinia());
  const app = useAppStore();
  app.version = '5.3.0';
  app.webApiVersion = '2.16.0';
  qbit.getPreferences.mockResolvedValue(await new MockProvider(0).getPreferences());
  const provider = new MockProvider(0);
  qbit.getNetworkInterfaces.mockImplementation(() => provider.getNetworkInterfaces());
  qbit.getNetworkInterfaceAddresses.mockImplementation((iface: string) =>
    provider.getNetworkInterfaceAddresses(iface),
  );
  qbit.getDirectoryContent.mockImplementation((path: string) => provider.getDirectoryContent(path));
  qbit.getFreeSpaceAtPath.mockImplementation(() => provider.getFreeSpaceAtPath());
});

const toastMessages = () => useToastsStore().toasts.map((t) => t.message);
const navLinkTitles = (w: VueWrapper) =>
  w
    .get('nav[aria-label="Settings sections"]')
    .findAll('a')
    .map((a) => a.text());
const saveButton = (w: VueWrapper) => w.findAll('button').find((b) => b.text() === 'Save')!;

describe('SettingsView', () => {
  it('loads preferences and saves only what changed', async () => {
    const w = await mountSection('speed');
    const save = w.findAll('button').find((b) => b.text() === 'Save')!;
    expect(save.attributes('disabled')).toBeDefined();

    await w.get('#pref-dl_limit').setValue('256');
    await openSection('bittorrent');
    await w.get('[aria-label="DHT"]').trigger('click');
    expect(w.text()).toContain('Unsaved changes');
    await save.trigger('click');
    await flushPromises();
    expect(qbit.setPreferences).toHaveBeenCalledWith({ dl_limit: 256 * 1024, dht: true });
  });

  it('discard restores the loaded values', async () => {
    const w = await mountView('speed');
    await flushPromises();
    await w.get('#pref-dl_limit').setValue('99');
    await w
      .findAll('button')
      .find((b) => b.text() === 'Discard')!
      .trigger('click');
    expect((w.get('#pref-dl_limit').element as HTMLInputElement).value).toBe('0');
    expect(w.text()).not.toContain('Unsaved changes');
  });

  it('picks the theme, showing Default when none is chosen', async () => {
    const w = await mountView('browser');
    await flushPromises();
    const select = w.get<HTMLSelectElement>('#theme');
    expect(select.element.value).toBe('default');
    await select.setValue('rose-pine');
    expect(useUiStore().theme).toBe('rose-pine');
  });

  it('picks the sidebar count mode, defaulting to matching', async () => {
    const w = await mountView('browser');
    await flushPromises();
    const select = w.get<HTMLSelectElement>('#sidebar-counts');
    expect(select.element.value).toBe('matching');
    await select.setValue('all');
    expect(useUiStore().sidebarCountMode).toBe('all');
    expect(qbit.setPreferences).not.toHaveBeenCalled();
  });

  it('browser preferences apply immediately without saving', async () => {
    const w = await mountView('browser');
    await flushPromises();
    await w.get('#color-scheme').setValue('dark');
    expect(useUiStore().colorScheme).toBe('dark');
    expect(qbit.setPreferences).not.toHaveBeenCalled();
  });

  it('does not load qBittorrent settings for an unsupported version', async () => {
    useAppStore().version = '4.6.0';
    const w = await mountView('browser');
    await flushPromises();
    expect(qbit.getPreferences).not.toHaveBeenCalled();
    expect(w.text()).toContain('need qBittorrent 5.0.0 or newer');
  });

  it('renders a setting only when qBittorrent returned its key', async () => {
    qbit.getPreferences.mockResolvedValue({ dht: true });
    const w = await mountView('bittorrent');
    await flushPromises();
    expect(w.find('[aria-label="DHT"]').exists()).toBe(true);
    expect(navLinkTitles(w)).not.toContain('Speed');
    expect(w.find('[aria-label="Peer exchange (PeX)"]').exists()).toBe(false);
  });

  it('shows and edits keys it does not recognize', async () => {
    qbit.getPreferences.mockResolvedValue({ dht: true, brand_new_limit: 7 });
    const w = await mountView('advanced');
    await flushPromises();
    await w.get('#pref-brand_new_limit').setValue('9');
    await saveButton(w).trigger('click');
    await flushPromises();
    expect(qbit.setPreferences).toHaveBeenCalledWith({ brand_new_limit: 9 });
  });

  it('disables queue limits while queueing is off and re-enables them with it', async () => {
    const w = await mountView('bittorrent');
    await flushPromises();
    const limit = () => w.get('#pref-max_active_downloads').attributes('disabled');
    expect(limit()).toBeUndefined();

    await w.get('[aria-label="Torrent queueing"]').trigger('click');
    expect(limit()).toBeDefined();
    expect(
      w.get('[aria-label="Don\'t count slow torrents in these limits"]').attributes('disabled'),
    ).toBeDefined();

    await w.get('[aria-label="Torrent queueing"]').trigger('click');
    expect(limit()).toBeUndefined();
  });

  it('disables a limit value until its inline toggle is on', async () => {
    const w = await mountView('bittorrent');
    await flushPromises();
    expect(w.get('#pref-max_ratio').attributes('disabled')).toBeDefined();
    await w.get('[aria-label="Limit ratio"]').trigger('click');
    expect(w.get('#pref-max_ratio').attributes('disabled')).toBeUndefined();
  });

  it('confirms with "Settings saved." when qBittorrent applied everything', async () => {
    const applied = await new MockProvider(0).getPreferences();
    qbit.getPreferences
      .mockResolvedValueOnce(applied)
      .mockResolvedValue({ ...applied, dht: !applied.dht });
    const w = await mountView('bittorrent');
    await flushPromises();
    await w.get('[aria-label="DHT"]').trigger('click');
    await saveButton(w).trigger('click');
    await flushPromises();
    expect(toastMessages()).toEqual(['Settings saved.']);
  });

  it("names the settings qBittorrent didn't apply", async () => {
    const loaded = await new MockProvider(0).getPreferences();
    qbit.getPreferences.mockResolvedValue(loaded);
    const w = await mountSection('connection');
    await w.get('#pref-listen_port').setValue('99');
    await openSection('bittorrent');
    await w.get('[aria-label="DHT"]').trigger('click');
    await saveButton(w).trigger('click');
    await flushPromises();
    expect(qbit.setPreferences).toHaveBeenCalledWith({ listen_port: 99, dht: !loaded.dht });
    expect(toastMessages()).toEqual(["qBittorrent didn't apply: Listening port, DHT"]);
    expect(w.text()).not.toContain('Unsaved changes');
    expect(saveButton(w).attributes('disabled')).toBeDefined();
    expect(w.get('[aria-label="DHT"]').attributes('aria-checked')).toBe(String(loaded.dht));
    await openSection('connection');
    expect((w.get('#pref-listen_port').element as HTMLInputElement).value).toBe(
      String(loaded.listen_port),
    );
  });

  it("only names the settings that didn't stick", async () => {
    const loaded = await new MockProvider(0).getPreferences();
    qbit.getPreferences
      .mockResolvedValueOnce(loaded)
      .mockResolvedValue({ ...loaded, dht: !loaded.dht });
    const w = await mountView('connection');
    await flushPromises();
    await w.get('#pref-listen_port').setValue('99');
    await openSection('bittorrent');
    await w.get('[aria-label="DHT"]').trigger('click');
    await saveButton(w).trigger('click');
    await flushPromises();
    expect(toastMessages()).toEqual(["qBittorrent didn't apply: Listening port"]);
    await openSection('connection');
    expect((w.get('#pref-listen_port').element as HTMLInputElement).value).toBe(
      String(loaded.listen_port),
    );
  });

  describe('navigation', () => {
    const SECTION_TITLES = [
      'Behavior',
      'Downloads',
      'Cookies',
      'Connection',
      'Speed',
      'BitTorrent',
      'RSS',
      'Web UI',
      'Advanced',
    ];
    const activeNavTitles = (w: VueWrapper) =>
      w
        .get('nav[aria-label="Settings sections"]')
        .findAll('a[aria-current="page"]')
        .map((a) => a.text());
    const navLink = (w: VueWrapper, title: string) =>
      w
        .get('nav[aria-label="Settings sections"]')
        .findAll('a')
        .find((a) => a.text() === title)!;
    const backLink = (w: VueWrapper) => w.findAll('a').find((a) => a.text() === 'All settings');

    it('lists This browser first, then the qBittorrent sections in order', async () => {
      const w = await mountSection('browser');
      expect(navLinkTitles(w)).toEqual(['This browser', ...SECTION_TITLES]);
    });

    it('marks the open section as the current page', async () => {
      const w = await mountSection('speed');
      expect(activeNavTitles(w)).toEqual(['Speed']);
      await openSection('rss');
      expect(activeNavTitles(w)).toEqual(['RSS']);
    });

    it('shows only the section from the route', async () => {
      const w = await mountSection('speed');
      expect(w.find('#pref-dl_limit').exists()).toBe(true);
      expect(w.find('[aria-label="DHT"]').exists()).toBe(false);
      expect(w.find('#theme').exists()).toBe(false);
    });

    it('scrolls the pane back to the top when the section changes', async () => {
      await mountSection('speed');
      expect(scrollTo).not.toHaveBeenCalled();
      await openSection('connection');
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    });

    it('opens a section by clicking its nav link', async () => {
      const w = await mountSection('browser');
      await navLink(w, 'BitTorrent').trigger('click');
      await flushPromises();
      expect(w.find('[aria-label="DHT"]').exists()).toBe(true);
      expect(activeNavTitles(w)).toEqual(['BitTorrent']);
    });

    it('falls back to This browser without a section', async () => {
      const w = await mountSection('');
      expect(activeNavTitles(w)).toEqual(['This browser']);
      expect(w.find('#theme').exists()).toBe(true);
    });

    it('falls back to This browser for an unknown section', async () => {
      const w = await mountSection('nonsense');
      expect(activeNavTitles(w)).toEqual(['This browser']);
      expect(w.find('#theme').exists()).toBe(true);
    });

    it('keeps edits when switching sections and saves them all together', async () => {
      const w = await mountSection('speed');
      await w.get('#pref-dl_limit').setValue('256');
      await openSection('connection');
      await w.get('#pref-listen_port').setValue('4242');
      await openSection('speed');
      expect(w.get<HTMLInputElement>('#pref-dl_limit').element.value).toBe('256');
      expect(w.text()).toContain('Unsaved changes');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({
        dl_limit: 256 * 1024,
        listen_port: 4242,
      });
    });

    it('discards edits made in other sections too', async () => {
      const w = await mountSection('speed');
      await w.get('#pref-dl_limit').setValue('256');
      await openSection('connection');
      await w
        .findAll('button')
        .find((b) => b.text() === 'Discard')!
        .trigger('click');
      await openSection('speed');
      expect(w.get<HTMLInputElement>('#pref-dl_limit').element.value).toBe('0');
    });

    it('lists only the sections qBittorrent returned settings for', async () => {
      qbit.getPreferences.mockResolvedValue({ dht: true, rss_refresh_interval: 30 });
      const w = await mountView('browser');
      await flushPromises();
      expect(navLinkTitles(w)).toEqual(['This browser', 'BitTorrent', 'RSS']);
    });

    it('lists only This browser for an unsupported version', async () => {
      useAppStore().version = '4.6.0';
      const w = await mountView('speed');
      await flushPromises();
      expect(navLinkTitles(w)).toEqual(['This browser']);
      expect(activeNavTitles(w)).toEqual(['This browser']);
      expect(w.find('#pref-dl_limit').exists()).toBe(false);
      expect(w.text()).toContain('need qBittorrent 5.0.0 or newer');
    });

    describe('on a phone', () => {
      beforeEach(() => {
        isMobile.value = true;
      });

      it('shows the section list without a section', async () => {
        const w = await mountSection('');
        expect(navLinkTitles(w)).toEqual(['This browser', ...SECTION_TITLES]);
        expect(w.findAll('nav')).toHaveLength(1);
        expect(w.find('#theme').exists()).toBe(false);
        expect(backLink(w)).toBeUndefined();
      });

      it('shows the section list for an unknown section', async () => {
        const w = await mountSection('nonsense');
        expect(navLinkTitles(w)).toContain('Speed');
        expect(backLink(w)).toBeUndefined();
      });

      it('shows a section with a back link to the list', async () => {
        const w = await mountSection('speed');
        expect(w.find('#pref-dl_limit').exists()).toBe(true);
        expect(w.find('nav').exists()).toBe(false);
        await backLink(w)!.trigger('click');
        await flushPromises();
        expect(w.find('#pref-dl_limit').exists()).toBe(false);
        expect(navLinkTitles(w)).toContain('Speed');
      });

      it('opens a section from the list', async () => {
        const w = await mountSection('');
        await navLink(w, 'BitTorrent').trigger('click');
        await flushPromises();
        expect(w.find('[aria-label="DHT"]').exists()).toBe(true);
        expect(backLink(w)).toBeDefined();
      });
    });
  });

  describe('behavior and downloads fields', () => {
    const mailPrefs = {
      mail_notification_enabled: false,
      mail_notification_auth_enabled: false,
      mail_notification_username: 'me',
      mail_notification_password: '',
    };

    it('keeps the mail password disabled until mail and authentication are both on', async () => {
      const w = await mountSection('downloads', mailPrefs);
      const password = () => w.get('#pref-mail_notification_password').attributes('disabled');
      expect(password()).toBeDefined();

      expect(w.get('[aria-label="Authentication"]').attributes('disabled')).toBeDefined();

      await w.get('[aria-label="Send an email"]').trigger('click');
      expect(password()).toBeDefined();

      await w.get('[aria-label="Authentication"]').trigger('click');
      expect(password()).toBeUndefined();

      await w.get('[aria-label="Send an email"]').trigger('click');
      expect(password()).toBeDefined();
    });

    it('saves just the changed mail keys', async () => {
      const w = await mountSection('downloads', mailPrefs);
      await w.get('[aria-label="Send an email"]').trigger('click');
      await w.get('[aria-label="Authentication"]').trigger('click');
      await w.get('#pref-mail_notification_password').setValue('s3cret');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({
        mail_notification_enabled: true,
        mail_notification_auth_enabled: true,
        mail_notification_password: 's3cret',
      });
    });

    it('saves a boolean select choice as a boolean', async () => {
      const w = await mountSection('downloads', { torrent_changed_tmm_enabled: true });
      const select = w.get<HTMLSelectElement>('#pref-torrent_changed_tmm_enabled');
      await select.setValue(select.findAll('option')[1]!.element.value);
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({ torrent_changed_tmm_enabled: false });
    });

    it('saves a changed unit select together with nothing else', async () => {
      const w = await mountSection('behavior', {
        file_log_enabled: true,
        file_log_age: 1,
        file_log_age_type: 0,
        file_log_delete_old: true,
      });
      await w.get('select[aria-label="Delete backup logs older than unit"]').setValue('2');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({ file_log_age_type: 2 });
    });

    it('saves an added watched folder as the whole dict, and discard drops it', async () => {
      const w = await mountSection('downloads', { scan_dirs: { '/watch': 0 } });
      const add = () => w.findAll('button').find((b) => b.text().includes('Add folder'))!;
      await add().trigger('click');
      await w.findAll('input[aria-label="Watched folder"]')[1]!.setValue('/more');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({ scan_dirs: { '/watch': 0, '/more': 0 } });
    });

    it('discard rebuilds the watched folder rows', async () => {
      const w = await mountSection('downloads', { scan_dirs: { '/watch': 0 } });
      await w
        .findAll('button')
        .find((b) => b.text().includes('Add folder'))!
        .trigger('click');
      await w.findAll('input[aria-label="Watched folder"]')[1]!.setValue('/more');
      expect(w.findAll('input[aria-label="Watched folder"]')).toHaveLength(2);
      await w
        .findAll('button')
        .find((b) => b.text() === 'Discard')!
        .trigger('click');
      expect(w.findAll('input[aria-label="Watched folder"]')).toHaveLength(1);
    });

    it('gives directory settings a browse button and file settings none', async () => {
      const downloads = await mountSection('downloads');
      expect(downloads.find('[aria-label="Browse for Default save path"]').exists()).toBe(true);
      expect(downloads.find('[aria-label="Browse for Keep incomplete torrents in"]').exists()).toBe(
        true,
      );
      const connection = await mountSection('connection');
      expect(connection.find('#pref-ip_filter_path').exists()).toBe(true);
      expect(connection.find('[aria-label="Browse for Filter file"]').exists()).toBe(false);
    });

    it('renders use_subcategories only when qBittorrent returns it', async () => {
      const absent = await mountSection('downloads', {});
      expect(absent.find('[aria-label="Enable subcategories"]').exists()).toBe(false);
      const present = await mountSection('downloads', { use_subcategories: false });
      expect(present.find('[aria-label="Enable subcategories"]').exists()).toBe(true);
    });
  });

  describe('connection, speed and BitTorrent fields', () => {
    const proxyInputs = ['proxy_ip', 'proxy_port', 'proxy_username', 'proxy_password'];
    const proxyToggles = [
      'Perform hostname lookup via proxy',
      'Use proxy for BitTorrent purposes',
      'Use proxy for peer connections',
      'Use proxy for RSS purposes',
      'Use proxy for general purposes',
    ];

    const visibleProxyFields = (w: VueWrapper) => ({
      inputs: proxyInputs.filter((key) => w.find(`#pref-${key}`).exists()),
      toggles: proxyToggles.filter((label) => w.find(`[aria-label="${label}"]`).exists()),
    });

    it('hides every proxy detail while the proxy type is None', async () => {
      const w = await mountSection('connection', { proxy_type: 'None' });
      expect(w.find('#pref-proxy_type').exists()).toBe(true);
      expect(visibleProxyFields(w)).toEqual({ inputs: [], toggles: [] });
    });

    it('hides authentication, lookups, RSS and general use for SOCKS4', async () => {
      const w = await mountSection('connection', { proxy_type: 'SOCKS4' });
      expect(visibleProxyFields(w)).toEqual({
        inputs: ['proxy_ip', 'proxy_port'],
        toggles: ['Use proxy for BitTorrent purposes', 'Use proxy for peer connections'],
      });
    });

    it('shows every proxy detail for SOCKS5', async () => {
      const w = await mountSection('connection', { proxy_type: 'SOCKS5' });
      expect(visibleProxyFields(w)).toEqual({
        inputs: proxyInputs,
        toggles: proxyToggles,
      });
    });

    it('reveals the proxy details when the type is switched away from None', async () => {
      const w = await mountSection('connection', { proxy_type: 'None' });
      await w.get('#pref-proxy_type').setValue('HTTP');
      expect(w.find('#pref-proxy_ip').exists()).toBe(true);
      expect(w.find('#pref-proxy_username').exists()).toBe(true);
      await w.get('#pref-proxy_type').setValue('SOCKS4');
      expect(w.find('#pref-proxy_ip').exists()).toBe(true);
      expect(w.find('#pref-proxy_username').exists()).toBe(false);
    });

    it('saves both the hour and the minute when the scheduler From time is edited', async () => {
      const w = await mountSection('speed', {
        scheduler_enabled: true,
        schedule_from_hour: 8,
        schedule_from_min: 0,
        schedule_to_hour: 20,
        schedule_to_min: 0,
      });
      expect(w.get<HTMLInputElement>('#pref-schedule_from_hour').element.value).toBe('08:00');
      await w.get('#pref-schedule_from_hour').setValue('08:30');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({
        schedule_from_hour: 8,
        schedule_from_min: 30,
      });
    });

    it('keeps the scheduler times disabled until the scheduler is on', async () => {
      const w = await mountSection('speed', { scheduler_enabled: false });
      const disabled = () => w.get('#pref-schedule_from_hour').attributes('disabled');
      expect(disabled()).toBeDefined();
      await w.get('[aria-label="Schedule the alternative rate limits"]').trigger('click');
      expect(disabled()).toBeUndefined();
    });

    it('never sends the read-only tracker list', async () => {
      const w = await mountSection('bittorrent', {
        add_trackers_from_url_enabled: true,
        add_trackers_url_list: 'udp://tracker.example:1337',
      });
      const list = w.get<HTMLTextAreaElement>('#pref-add_trackers_url_list');
      expect(list.attributes('readonly')).toBeDefined();
      await w.get('#pref-add_trackers_url').setValue('https://example.com/list.txt');
      await saveButton(w).trigger('click');
      await flushPromises();
      const sent = qbit.setPreferences.mock.calls[0]![0];
      expect(sent).toEqual({ add_trackers_url: 'https://example.com/list.txt' });
    });
  });

  describe('RSS and Web UI fields', () => {
    const dialogButton = (label: string) =>
      [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const dialogText = () =>
      [...document.body.querySelectorAll('[role="alertdialog"]')]
        .map((d) => d.textContent)
        .join(' ');
    const clickDialogButton = async (label: string) => {
      dialogButton(label)!.click();
      await flushPromises();
    };

    it('renders the password fields only when qBittorrent returns the username', async () => {
      const present = await mountSection('webui', { web_ui_username: 'admin' });
      expect(present.find('#pref-web_ui_password').exists()).toBe(true);
      expect(present.find('#pref-web_ui_password-confirm').exists()).toBe(true);
      present.unmount();

      const prefs = { ...(await new MockProvider(0).getPreferences()) };
      delete prefs.web_ui_username;
      qbit.getPreferences.mockResolvedValue(prefs);
      const absent = await mountView('webui');
      await flushPromises();
      expect(absent.find('#pref-web_ui_password').exists()).toBe(false);
    });

    it('blocks saving while the password confirmation does not match', async () => {
      const w = await mountSection('webui', { web_ui_username: 'admin' });
      await w.get('#pref-web_ui_password').setValue('secret1');
      await w.get('#pref-web_ui_password-confirm').setValue('secret2');

      expect(w.get('[role="alert"]').text()).toMatch(/match/);
      expect(saveButton(w).attributes('disabled')).toBeDefined();
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).not.toHaveBeenCalled();
    });

    it('blocks saving a password that is too short', async () => {
      const w = await mountSection('webui', { web_ui_username: 'admin' });
      await w.get('#pref-web_ui_password').setValue('abc');
      await w.get('#pref-web_ui_password-confirm').setValue('abc');
      expect(w.get('[role="alert"]').text()).toContain('6');
      expect(saveButton(w).attributes('disabled')).toBeDefined();
    });

    it('saves a matching password after the authentication warning', async () => {
      const w = await mountSection('webui', { web_ui_username: 'admin' });
      await w.get('#pref-web_ui_password').setValue('secret1');
      await w.get('#pref-web_ui_password-confirm').setValue('secret1');
      expect(w.find('[role="alert"]').exists()).toBe(false);

      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).not.toHaveBeenCalled();
      await clickDialogButton('Save anyway');
      expect(qbit.setPreferences).toHaveBeenCalledWith({ web_ui_password: 'secret1' });
    });

    it('saves a harmless Web UI change without asking', async () => {
      const w = await mountSection('webui', { web_ui_session_timeout: 3600 });
      await w.get('#pref-web_ui_session_timeout').setValue('7200');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(dialogText()).not.toContain('Save these risky changes?');
      expect(qbit.setPreferences).toHaveBeenCalledWith({ web_ui_session_timeout: 7200 });
    });

    it('lists the risky settings and consequences, and cancel sends nothing', async () => {
      const w = await mountSection('webui', {
        web_ui_username: 'admin',
        web_ui_csrf_protection_enabled: true,
      });
      await w.get('#pref-web_ui_username').setValue('bob');
      await w.get('[aria-label="Cross-Site Request Forgery (CSRF) protection"]').trigger('click');
      await saveButton(w).trigger('click');
      await flushPromises();

      expect(dialogText()).toContain('Save these risky changes?');
      expect(dialogText()).toContain('Username');
      expect(dialogText()).toContain('Cross-Site Request Forgery (CSRF) protection');
      expect(dialogText()).not.toContain('Web UI moved');
      expect(qbit.setPreferences).not.toHaveBeenCalled();

      await clickDialogButton('Cancel');
      expect(qbit.setPreferences).not.toHaveBeenCalled();
      expect(dialogText()).not.toContain('Save these risky changes?');
      expect(w.text()).toContain('Unsaved changes');
    });

    it('sends the risky changes only after "Save anyway"', async () => {
      const w = await mountSection('webui', { web_ui_username: 'admin' });
      await w.get('#pref-web_ui_username').setValue('bob');
      await saveButton(w).trigger('click');
      await flushPromises();
      await clickDialogButton('Save anyway');
      expect(qbit.setPreferences).toHaveBeenCalledWith({ web_ui_username: 'bob' });
    });

    it('warns before turning the alternative Web UI off but not for leaving it on', async () => {
      const w = await mountSection('webui', {
        alternative_webui_enabled: true,
        alternative_webui_path: '/ui',
      });
      await w.get('#pref-alternative_webui_path').setValue('/ui2');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(dialogText()).toContain('Save these risky changes?');
      await clickDialogButton('Cancel');

      await w.get('#pref-alternative_webui_path').setValue('/ui');
      await w.get('[aria-label="Use an alternative Web UI"]').trigger('click');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(dialogText()).toContain('Use an alternative Web UI');
      expect(dialogText()).toContain('built-in Web UI');
    });

    it('shows the new address after the Web UI port changes, without refetching', async () => {
      const w = await mountSection('webui', {
        use_https: false,
        web_ui_address: '*',
        web_ui_port: 8080,
      });
      await w.get('#pref-web_ui_port').setValue('9090');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).not.toHaveBeenCalled();
      await clickDialogButton('Save anyway');

      expect(qbit.setPreferences).toHaveBeenCalledWith({ web_ui_port: 9090 });
      expect(qbit.getPreferences).toHaveBeenCalledTimes(1);
      expect(dialogText()).toContain('The Web UI moved');
      expect(dialogText()).toContain(`http://${window.location.hostname}:9090/`);
      expect(w.text()).not.toContain('Unsaved changes');
      expect(toastMessages()).toEqual([]);
    });

    it('shows the new address even when the connection drops before the response', async () => {
      qbit.setPreferences.mockRejectedValue(new TypeError('Failed to fetch'));
      const w = await mountSection('webui', {
        use_https: false,
        web_ui_address: '*',
        web_ui_port: 8080,
      });
      await w.get('#pref-web_ui_port').setValue('9091');
      await saveButton(w).trigger('click');
      await flushPromises();
      await clickDialogButton('Save anyway');

      expect(dialogText()).toContain('The Web UI moved');
      expect(dialogText()).toContain(':9091/');
      expect(toastMessages()).toEqual([]);
    });

    it('reports an HTTP error instead of showing a new address', async () => {
      qbit.setPreferences.mockRejectedValue(new QbtHttpError(500, 'preferences'));
      const w = await mountSection('webui', {
        use_https: false,
        web_ui_address: '*',
        web_ui_port: 8080,
      });
      await w.get('#pref-web_ui_port').setValue('9091');
      await saveButton(w).trigger('click');
      await flushPromises();
      await clickDialogButton('Save anyway');

      expect(dialogText()).not.toContain('The Web UI moved');
      expect(toastMessages()[0]).toContain('Saving failed');
    });

    it('does not echo the new password into the relocated cache', async () => {
      const w = await mountSection('webui', {
        web_ui_username: 'admin',
        use_https: false,
        web_ui_address: '*',
        web_ui_port: 8080,
      });
      await w.get('#pref-web_ui_port').setValue('9090');
      await w.get('#pref-web_ui_password').setValue('secret1');
      await w.get('#pref-web_ui_password-confirm').setValue('secret1');
      await saveButton(w).trigger('click');
      await flushPromises();
      await clickDialogButton('Save anyway');

      expect(qbit.setPreferences).toHaveBeenCalledWith({
        web_ui_port: 9090,
        web_ui_password: 'secret1',
      });
      expect(dialogText()).toContain('The Web UI moved');
      expect((w.get('#pref-web_ui_password').element as HTMLInputElement).value).toBe('');
    });

    it('renders RSS settings and saves a changed one', async () => {
      const w = await mountSection('rss', {
        rss_processing_enabled: true,
        rss_refresh_interval: 30,
      });
      await w.get('#pref-rss_refresh_interval').setValue('15');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({ rss_refresh_interval: 15 });
    });

    it('saves the chosen network interface together with its bind address', async () => {
      const w = await mountSection('advanced', {
        current_network_interface: '',
        current_interface_address: '',
        dht: false,
      });
      await w.get('#pref-current_network_interface').setValue('wg0');
      await flushPromises();
      await w.get('#pref-current_network_interface-address').setValue('10.2.0.2');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({
        current_network_interface: 'wg0',
        current_interface_address: '10.2.0.2',
      });
    });

    it('resets a saved bind address when only the interface changes', async () => {
      const w = await mountSection('advanced', {
        current_network_interface: 'eth0',
        current_interface_address: '192.168.1.20',
      });
      await w.get('#pref-current_network_interface').setValue('wg0');
      await flushPromises();
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences).toHaveBeenCalledWith({
        current_network_interface: 'wg0',
        current_interface_address: '',
      });
    });

    it('never sends the read-only API key', async () => {
      const w = await mountSection('webui', { web_ui_api_key: 'abc123', dht: false });
      expect(w.get<HTMLInputElement>('#pref-web_ui_api_key').element.value).toBe('abc123');
      await openSection('bittorrent');
      await w.get('[aria-label="DHT"]').trigger('click');
      await saveButton(w).trigger('click');
      await flushPromises();
      expect(qbit.setPreferences.mock.calls[0]![0]).toEqual({ dht: true });
    });
  });

  describe('closing', () => {
    const closeButton = (w: VueWrapper) => w.get('[aria-label="Close settings"]');

    it('goes back to the torrent list from the close button', async () => {
      const w = await mountSection('speed');
      await closeButton(w).trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('main');
    });

    it('goes back to the torrent list on Escape', async () => {
      await mountSection('speed');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('main');
    });

    it('asks before closing with unsaved changes', async () => {
      const w = await mountSection('speed');
      await w.get('#pref-dl_limit').setValue('256');
      await closeButton(w).trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.name).toBe('settings');
      expect(document.body.textContent).toContain('Save your changes?');
    });
  });

  describe('unsaved changes', () => {
    const navLink = (w: VueWrapper, title: string) =>
      w
        .get('nav[aria-label="Settings sections"]')
        .findAll('a')
        .find((a) => a.text().startsWith(title))!;
    const leaveDialog = () =>
      [...document.body.querySelectorAll('[role="alertdialog"]')].find((d) =>
        d.textContent?.includes('Save your changes?'),
      );
    const leaveDialogButton = (label: string) =>
      [...(leaveDialog()?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent?.trim() === label,
      );
    const clickLeaveDialogButton = async (label: string) => {
      leaveDialogButton(label)!.click();
      await flushPromises();
    };
    const clickDangerDialogButton = async (label: string) => {
      const dialog = [...document.body.querySelectorAll('[role="alertdialog"]')].find((d) =>
        d.textContent?.includes('Save these risky changes?'),
      )!;
      [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!.click();
      await flushPromises();
    };
    const discardButton = (w: VueWrapper) =>
      w.findAll('button').find((b) => b.text() === 'Discard')!;
    const tryLeave = async (name = 'other') => {
      await router.push({ name });
      await flushPromises();
    };

    describe('nav markers', () => {
      it('marks only the section holding an unsaved change', async () => {
        const w = await mountSection('speed');
        expect(navLink(w, 'Speed').text()).not.toContain('unsaved');

        await w.get('#pref-dl_limit').setValue('256');
        expect(navLink(w, 'Speed').text()).toContain('(unsaved changes)');
        expect(navLink(w, 'BitTorrent').text()).not.toContain('unsaved');
      });

      it('clears the marker after discarding', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await discardButton(w).trigger('click');
        expect(navLink(w, 'Speed').text()).not.toContain('unsaved');
      });

      it('clears the marker after saving', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await saveButton(w).trigger('click');
        await flushPromises();
        expect(qbit.setPreferences).toHaveBeenCalledOnce();
        expect(navLink(w, 'Speed').text()).not.toContain('unsaved');
      });

      it('shows a problem marker instead of the unsaved one on the section with the problem', async () => {
        const w = await mountSection('webui', { web_ui_username: 'admin' });
        await w.get('#pref-web_ui_password').setValue('secret1');
        await w.get('#pref-web_ui_password-confirm').setValue('secret2');
        const text = navLink(w, 'Web UI').text();
        expect(text).toContain('(needs attention)');
        expect(text).not.toContain('(unsaved changes)');
      });

      it('files edits to unrecognized keys under Advanced', async () => {
        const w = await mountSection('advanced', { brand_new_limit: 7 });
        await w.get('#pref-brand_new_limit').setValue('9');
        expect(navLink(w, 'Advanced').text()).toContain('(unsaved changes)');
      });
    });

    describe('leave guard', () => {
      it('does not guard switching between sections', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await openSection('bittorrent');
        expect(router.currentRoute.value.params.section).toBe('bittorrent');
        expect(leaveDialog()).toBeUndefined();
        expect(w.text()).toContain('Unsaved changes');
      });

      it('lets a clean view leave without asking', async () => {
        await mountSection('speed');
        await tryLeave();
        expect(router.currentRoute.value.name).toBe('other');
        expect(leaveDialog()).toBeUndefined();
      });

      it('asks before leaving with unsaved changes and blocks the navigation', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await tryLeave();
        expect(router.currentRoute.value.name).toBe('settings');
        expect(leaveDialog()).toBeDefined();
      });

      it('never blocks navigating to the login route', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await tryLeave('login');
        expect(router.currentRoute.value.name).toBe('login');
        expect(leaveDialog()).toBeUndefined();
      });

      it('Stay keeps the route and the edits', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await tryLeave();
        await clickLeaveDialogButton('Stay');
        expect(leaveDialog()).toBeUndefined();
        expect(router.currentRoute.value.name).toBe('settings');
        expect((w.get('#pref-dl_limit').element as HTMLInputElement).value).toBe('256');
      });

      it('Discard drops the edits and goes to the blocked target', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await tryLeave();
        await clickLeaveDialogButton('Discard');
        expect(router.currentRoute.value.name).toBe('other');
        expect(qbit.setPreferences).not.toHaveBeenCalled();
      });

      it('Save sends the changes, then goes to the blocked target', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await tryLeave();
        await clickLeaveDialogButton('Save');
        expect(qbit.setPreferences).toHaveBeenCalledWith({ dl_limit: 256 * 1024 });
        expect(router.currentRoute.value.name).toBe('other');
      });

      it('Save stays and reports when saving fails', async () => {
        qbit.setPreferences.mockRejectedValue(new QbtHttpError(500, 'preferences'));
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await tryLeave();
        await clickLeaveDialogButton('Save');
        expect(router.currentRoute.value.name).toBe('settings');
        expect(toastMessages()[0]).toContain('Saving failed');
        expect(w.text()).toContain('Unsaved changes');
      });

      it('Save goes through the risky-change confirmation before leaving', async () => {
        const w = await mountSection('webui', { web_ui_username: 'admin' });
        await w.get('#pref-web_ui_username').setValue('bob');
        await tryLeave();
        await clickLeaveDialogButton('Save');
        expect(qbit.setPreferences).not.toHaveBeenCalled();
        expect(router.currentRoute.value.name).toBe('settings');

        await clickDangerDialogButton('Save anyway');
        expect(qbit.setPreferences).toHaveBeenCalledWith({ web_ui_username: 'bob' });
        expect(router.currentRoute.value.name).toBe('other');
      });

      it('cancelling the risky-change confirmation stays, and a later save does not navigate', async () => {
        const w = await mountSection('webui', { web_ui_username: 'admin' });
        await w.get('#pref-web_ui_username').setValue('bob');
        await tryLeave();
        await clickLeaveDialogButton('Save');
        await clickDangerDialogButton('Cancel');
        expect(qbit.setPreferences).not.toHaveBeenCalled();
        expect(router.currentRoute.value.name).toBe('settings');

        await saveButton(w).trigger('click');
        await flushPromises();
        await clickDangerDialogButton('Save anyway');
        expect(qbit.setPreferences).toHaveBeenCalledOnce();
        expect(router.currentRoute.value.name).toBe('settings');
      });

      it('guards a draft with problems, and disables Save in the dialog', async () => {
        const w = await mountSection('webui', { web_ui_username: 'admin' });
        await w.get('#pref-web_ui_password').setValue('secret1');
        await w.get('#pref-web_ui_password-confirm').setValue('secret2');
        await tryLeave();
        expect(leaveDialog()).toBeDefined();
        expect(leaveDialog()!.textContent).toMatch(/match/);
        expect(leaveDialogButton('Save')!.disabled).toBe(true);

        await clickLeaveDialogButton('Discard');
        expect(router.currentRoute.value.name).toBe('other');
      });
    });

    describe('beforeunload', () => {
      const fireBeforeUnload = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event;
      };

      it('is left alone while there are no unsaved edits', async () => {
        await mountSection('speed');
        expect(fireBeforeUnload().defaultPrevented).toBe(false);
      });

      it('is prevented while there are unsaved edits', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        expect(fireBeforeUnload().defaultPrevented).toBe(true);
      });

      it('is left alone again after discarding', async () => {
        const w = await mountSection('speed');
        await w.get('#pref-dl_limit').setValue('256');
        await discardButton(w).trigger('click');
        expect(fireBeforeUnload().defaultPrevented).toBe(false);
      });
    });
  });
});

describe('SettingsView search', () => {
  const searchBox = (w: VueWrapper) => w.get<HTMLInputElement>('#settings-search');
  const search = async (w: VueWrapper, query: string) => {
    await searchBox(w).setValue(query);
    await flushPromises();
  };
  const headings = (w: VueWrapper) => w.findAll('h3').map((h) => h.text());
  const navLink = (w: VueWrapper, title: string) =>
    w
      .get('nav[aria-label="Settings sections"]')
      .findAll('a')
      .find((a) => a.text() === title)!;
  const isDimmed = (w: VueWrapper, title: string) => navLink(w, title).classes('opacity-50');
  const pressSlash = (target: HTMLElement = document.body) => {
    if (target === document.body && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it('shows matches from every section under Section › Group headings', async () => {
    const w = await mountSection('browser');
    await search(w, 'limit');
    expect(headings(w)).toContain('Speed › Global rate limits');
    expect(headings(w)).toContain('Connection › Connection limits');
    expect(w.find('#pref-dl_limit').exists()).toBe(true);
    expect(w.find('[aria-label="DHT"]').exists()).toBe(false);
  });

  it('shows matching browser settings under This browser', async () => {
    const w = await mountSection('speed');
    await search(w, 'theme');
    expect(headings(w)).toContain('This browser');
    expect(w.find('#theme').exists()).toBe(true);
    expect(w.find('#color-scheme').exists()).toBe(false);
    expect(w.find('#pref-dl_limit').exists()).toBe(false);
  });

  it('dims sections without hits and marks none as the current page', async () => {
    const w = await mountSection('speed');
    await search(w, 'dht');
    expect(isDimmed(w, 'BitTorrent')).toBe(false);
    expect(isDimmed(w, 'Speed')).toBe(true);
    expect(isDimmed(w, 'This browser')).toBe(true);
    expect(w.findAll('nav a[aria-current="page"]')).toHaveLength(0);
  });

  it('dims This browser only when none of its settings match', async () => {
    const w = await mountSection('speed');
    await search(w, 'theme');
    expect(isDimmed(w, 'This browser')).toBe(false);
    expect(isDimmed(w, 'Speed')).toBe(true);
  });

  it('says so when nothing matches', async () => {
    const w = await mountSection('speed');
    await search(w, 'zzzz nothing');
    expect(w.get('[role=status]').text()).toBe('No settings match “zzzz nothing”.');
    expect(w.find('#pref-dl_limit').exists()).toBe(false);
  });

  it('returns to the open section when the search is cleared', async () => {
    const w = await mountSection('speed');
    await search(w, 'dht');
    await search(w, '');
    expect(w.find('#pref-dl_limit').exists()).toBe(true);
    expect(w.find('[aria-label="DHT"]').exists()).toBe(false);
    expect(w.findAll('nav a[aria-current="page"]').map((a) => a.text())).toEqual(['Speed']);
  });

  it('edits a result in place, marks it unsaved and saves the right key', async () => {
    const w = await mountSection('browser');
    await search(w, 'download limit');
    await w.get('#pref-dl_limit').setValue('256');
    expect(w.text()).toContain('Unsaved changes');
    await saveButton(w).trigger('click');
    await flushPromises();
    expect(qbit.setPreferences).toHaveBeenCalledWith({ dl_limit: 256 * 1024 });
  });

  it('keeps an edit made in results after the search is cleared', async () => {
    const w = await mountSection('speed');
    await search(w, 'download limit');
    await w.get('#pref-dl_limit').setValue('256');
    await search(w, '');
    expect((w.get('#pref-dl_limit').element as HTMLInputElement).value).toBe('256');
  });

  it('clears the search when a nav entry is clicked', async () => {
    const w = await mountSection('browser');
    await search(w, 'dht');
    await navLink(w, 'BitTorrent').trigger('click');
    await flushPromises();
    expect(searchBox(w).element.value).toBe('');
    expect(w.find('[aria-label="DHT"]').exists()).toBe(true);
    expect(w.find('[role=status]').exists()).toBe(false);
  });

  it('clears the search when the route section changes', async () => {
    const w = await mountSection('speed');
    await search(w, 'dht');
    await openSection('rss');
    expect(searchBox(w).element.value).toBe('');
  });

  it('clears the search with Escape', async () => {
    const w = await mountSection('speed');
    await search(w, 'dht');
    await searchBox(w).trigger('keydown', { key: 'Escape' });
    expect(searchBox(w).element.value).toBe('');
  });

  it('keeps the dialog open when Escape only clears the search', async () => {
    const w = await mountSection('speed');
    await search(w, 'dht');
    await searchBox(w).trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('settings');
  });

  it('clears the search with the clear button', async () => {
    const w = await mountSection('speed');
    expect(w.find('[aria-label="Clear search"]').exists()).toBe(false);
    await search(w, 'dht');
    await w.get('[aria-label="Clear search"]').trigger('click');
    expect(searchBox(w).element.value).toBe('');
  });

  it('does not put the search text in the URL', async () => {
    const w = await mountSection('speed');
    await search(w, 'dht');
    expect(router.currentRoute.value.fullPath).toBe('/settings/speed');
  });

  describe('/ shortcut', () => {
    it('focuses the search box', async () => {
      await mountSection('speed');
      const event = pressSlash();
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe('settings-search');
    });

    it('is left alone while typing in a field', async () => {
      const w = await mountSection('speed');
      const field = w.get<HTMLInputElement>('#pref-dl_limit').element;
      field.focus();
      const event = pressSlash(field);
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(field);
    });

    it('is left alone while a dialog is open', async () => {
      await mountSection('speed');
      document.body.insertAdjacentHTML('beforeend', '<div role="dialog"></div>');
      const event = pressSlash();
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement?.id).not.toBe('settings-search');
    });

    it('does nothing on a phone when the search box is not shown', async () => {
      isMobile.value = true;
      await mountSection('speed');
      const event = pressSlash();
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('on a phone', () => {
    beforeEach(() => {
      isMobile.value = true;
    });

    it('shows the search above the section list', async () => {
      const w = await mountSection('');
      expect(w.find('#settings-search').exists()).toBe(true);
    });

    it('lists results in place of the section list', async () => {
      const w = await mountSection('');
      await search(w, 'download limit');
      expect(w.find('#pref-dl_limit').exists()).toBe(true);
      expect(w.find('[role=status]').exists()).toBe(false);
    });

    it('is hidden inside a section', async () => {
      const w = await mountSection('speed');
      expect(w.find('#settings-search').exists()).toBe(false);
    });
  });
});

describe('SettingsView raw keys and section warnings', () => {
  const rawKeyTexts = (w: VueWrapper) => w.findAll('main p.font-mono').map((p) => p.text());
  const rowOfInput = (w: VueWrapper, id: string) =>
    w.get(`label[for="${id}"]`).element.parentElement!.textContent!;
  const showKeys = () => {
    useUiStore().showSettingKeys = true;
  };

  it('hides raw keys by default', async () => {
    const w = await mountSection('speed');
    expect(rawKeyTexts(w)).toEqual([]);
  });

  it('toggles raw keys from the This browser section and persists the choice', async () => {
    const w = await mountSection('browser');
    expect(w.get<HTMLElement>('[aria-label="Show raw keys"]').attributes('aria-checked')).toBe(
      'false',
    );
    await w.get('[aria-label="Show raw keys"]').trigger('click');
    expect(useUiStore().showSettingKeys).toBe(true);
    expect(localStorage.getItem('slake:showSettingKeys')).toBe('true');
    await openSection('speed');
    expect(rawKeyTexts(w)).toContain('dl_limit');
  });

  it('prints each field key under its label when on', async () => {
    showKeys();
    const w = await mountSection('speed');
    expect(rowOfInput(w, 'pref-dl_limit')).toContain('dl_limit');
    expect(rawKeyTexts(w)).toContain('scheduler_enabled');
  });

  it('lists the minute key alongside the hour key of a time field', async () => {
    showKeys();
    const w = await mountSection('speed');
    expect(rawKeyTexts(w)).toContain('schedule_from_hour, schedule_from_min');
    expect(rawKeyTexts(w)).toContain('schedule_to_hour, schedule_to_min');
  });

  it('lists the inline toggle and unit select keys with the field key', async () => {
    showKeys();
    const w = await mountSection('behavior');
    expect(rawKeyTexts(w)).toContain('file_log_max_size, file_log_backup_enabled');
    expect(rawKeyTexts(w)).toContain('file_log_age, file_log_delete_old, file_log_age_type');
  });

  it('never shows the draft-only password confirmation key', async () => {
    showKeys();
    const w = await mountSection('webui');
    expect(rawKeyTexts(w)).toContain('web_ui_password');
    expect(w.text()).not.toContain('web_ui_password_confirm');
  });

  it('shows the interface and address keys under their own rows', async () => {
    showKeys();
    const w = await mountSection('advanced');
    expect(rawKeyTexts(w)).toContain('current_network_interface');
    expect(rawKeyTexts(w)).toContain('current_interface_address');
  });

  it('shows raw keys on search results too', async () => {
    showKeys();
    const w = await mountSection('browser');
    await w.get('#settings-search').setValue('theme');
    await flushPromises();
    expect(w.find('#theme').exists()).toBe(true);
    await w.get('#settings-search').setValue('dht');
    await flushPromises();
    expect(rawKeyTexts(w)).toContain('dht');
  });

  it('finds the raw keys setting by searching the browser section', async () => {
    const w = await mountSection('speed');
    await w.get('#settings-search').setValue('raw keys');
    await flushPromises();
    expect(w.find('[aria-label="Show raw keys"]').exists()).toBe(true);
    expect(w.find('#pref-dl_limit').exists()).toBe(false);
  });

  const warning = (w: VueWrapper) => w.find('[role="note"]');

  it('warns under the Advanced heading when that section is open', async () => {
    const w = await mountSection('advanced');
    expect(warning(w).exists()).toBe(true);
    expect(warning(w).text()).toContain('libtorrent internals');
  });

  it('shows no warning on sections without one', async () => {
    const w = await mountSection('speed');
    expect(warning(w).exists()).toBe(false);
  });

  it('drops the Advanced warning from search results', async () => {
    const w = await mountSection('advanced');
    await w.get('#settings-search').setValue('limit');
    await flushPromises();
    expect(warning(w).exists()).toBe(false);
  });
});
