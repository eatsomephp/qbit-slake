import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { useAppStore } from '@/stores/app';
import { useTorrentsStore } from '@/stores/torrents';

const qbit = vi.hoisted(() => ({
  toggleAltSpeedLimits: vi.fn(),
  getSpeedLimits: vi.fn(),
  setSpeedLimits: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));
const requestSync = vi.hoisted(() => vi.fn());
vi.mock('@/sync/useMaindata', () => ({ requestSync }));

const { default: SpeedLimitControl } = await import('./SpeedLimitControl.vue');

let wrapper: VueWrapper | undefined;

function mountControl() {
  wrapper = mount(SpeedLimitControl, {
    props: { orientation: 'horizontal' },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    attachTo: document.body,
  });
  return wrapper;
}

function seedServerState(serverState: Record<string, unknown>) {
  useTorrentsStore().apply({ rid: 1, full_update: true, server_state: serverState });
}

async function openPopover() {
  await mountControl().get('[aria-label="Speed limits"]').trigger('click');
  await flushPromises();
}

function seedSpeedLimits(limits: Record<string, number> = {}) {
  qbit.getSpeedLimits.mockResolvedValue({
    dl_limit: 0,
    up_limit: 0,
    alt_dl_limit: 0,
    alt_up_limit: 0,
    ...limits,
  });
}

type Mode = 'Normal' | 'Alternative';
type Direction = 'download' | 'upload';

function limitInput(mode: Mode, direction: Direction) {
  return document.body.querySelector<HTMLInputElement>(
    `input[aria-label="${mode} ${direction} limit in KiB/s"]`,
  )!;
}

function modeRadio(label: Mode) {
  return [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((radio) =>
    radio.textContent?.includes(label),
  )!;
}

async function enterLimit(mode: Mode, direction: Direction, kibPerSec: string) {
  const input = limitInput(mode, direction);
  input.value = kibPerSec;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('change'));
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  useAppStore().version = '5.3.0';
  seedSpeedLimits();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = '';
});

describe('SpeedLimitControl', () => {
  it('toggles alternative speed limits and syncs', async () => {
    await mountControl().get('[aria-label="Alternative speed limits"]').trigger('click');
    await flushPromises();
    expect(qbit.toggleAltSpeedLimits).toHaveBeenCalled();
    expect(requestSync).toHaveBeenCalled();
  });

  it('reflects the server alternative speed state in aria-pressed', async () => {
    const button = mountControl().get('[aria-label="Alternative speed limits"]');
    expect(button.attributes('aria-pressed')).toBe('false');
    seedServerState({ use_alt_speed_limits: true });
    await flushPromises();
    expect(button.attributes('aria-pressed')).toBe('true');
  });

  it('shows both normal and alternative limits in KiB/s, empty when unlimited', async () => {
    seedSpeedLimits({
      dl_limit: 2048 * 1024,
      alt_dl_limit: 512 * 1024,
      alt_up_limit: 64 * 1024,
    });
    await openPopover();
    expect(limitInput('Normal', 'download').value).toBe('2048');
    expect(limitInput('Normal', 'upload').value).toBe('');
    expect(limitInput('Alternative', 'download').value).toBe('512');
    expect(limitInput('Alternative', 'upload').value).toBe('64');
  });

  it('dims the column of the mode that is not in effect', async () => {
    await openPopover();
    expect(limitInput('Normal', 'download').classList).not.toContain('opacity-50');
    expect(limitInput('Alternative', 'download').classList).toContain('opacity-50');
    seedServerState({ use_alt_speed_limits: true });
    await flushPromises();
    expect(limitInput('Normal', 'download').classList).toContain('opacity-50');
    expect(limitInput('Alternative', 'download').classList).not.toContain('opacity-50');
  });

  it.each([
    ['Normal', 'download', 'dl_limit'],
    ['Normal', 'upload', 'up_limit'],
    ['Alternative', 'download', 'alt_dl_limit'],
    ['Alternative', 'upload', 'alt_up_limit'],
  ] as const)('saves the %s %s field as %s', async (mode, direction, preferenceKey) => {
    await openPopover();
    await enterLimit(mode, direction, '256');
    expect(qbit.setSpeedLimits).toHaveBeenCalledWith({
      dl_limit: 0,
      up_limit: 0,
      alt_dl_limit: 0,
      alt_up_limit: 0,
      [preferenceKey]: 256 * 1024,
    });
    expect(requestSync).toHaveBeenCalled();
  });

  it('saves an emptied field as unlimited', async () => {
    seedSpeedLimits({ up_limit: 100 * 1024 });
    await openPopover();
    await enterLimit('Normal', 'upload', '');
    expect(qbit.setSpeedLimits).toHaveBeenCalledWith({
      dl_limit: 0,
      up_limit: 0,
      alt_dl_limit: 0,
      alt_up_limit: 0,
    });
  });

  it('skips the request when the limit is unchanged', async () => {
    seedSpeedLimits({ alt_dl_limit: 512 * 1024 });
    await openPopover();
    await enterLimit('Alternative', 'download', '512');
    expect(qbit.setSpeedLimits).not.toHaveBeenCalled();
  });

  it('disables the fields until the limits have loaded', async () => {
    qbit.getSpeedLimits.mockReturnValue(new Promise(() => {}));
    await openPopover();
    expect(limitInput('Normal', 'download').disabled).toBe(true);
  });

  it('switches mode only when picking the inactive one', async () => {
    await openPopover();
    expect(modeRadio('Normal').getAttribute('aria-checked')).toBe('true');
    modeRadio('Normal').click();
    await flushPromises();
    expect(qbit.toggleAltSpeedLimits).not.toHaveBeenCalled();
    modeRadio('Alternative').click();
    await flushPromises();
    expect(qbit.toggleAltSpeedLimits).toHaveBeenCalledOnce();
  });
});
