import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';

const qbit = vi.hoisted(() => ({
  getNetworkInterfaces: vi.fn(),
  getNetworkInterfaceAddresses: vi.fn(),
}));
vi.mock('@/services/qbit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  default: qbit,
}));

const { default: NetworkInterfaceField } = await import('./NetworkInterfaceField.vue');

const ADDRESSES: Record<string, string[]> = {
  '': ['127.0.0.1', '10.2.0.2'],
  eth0: ['192.168.1.20'],
  wg0: ['10.2.0.2'],
};

let wrapper: VueWrapper | undefined;

async function mountField(
  props: {
    modelValue?: string;
    address?: string;
    savedInterfaceName?: string;
    disabled?: boolean;
  } = {},
) {
  wrapper = mount(NetworkInterfaceField, {
    props: {
      id: 'nic',
      label: 'Network interface',
      addressLabel: 'Bind address',
      modelValue: '',
      address: '',
      ...props,
      'onUpdate:modelValue': (value: string) => wrapper!.setProps({ modelValue: value }),
      'onUpdate:address': (value: string) => wrapper!.setProps({ address: value }),
    },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
  await flushPromises();
  return wrapper;
}

const optionsOf = (w: VueWrapper, selector: string) =>
  w.findAll(`${selector} option`).map((o) => ({
    value: (o.element as HTMLOptionElement).value,
    label: o.text(),
  }));
const interfaceOptions = (w: VueWrapper) => optionsOf(w, '#nic');
const addressOptions = (w: VueWrapper) => optionsOf(w, '#nic-address');

beforeEach(() => {
  vi.clearAllMocks();
  qbit.getNetworkInterfaces.mockResolvedValue([
    { name: 'eth0', value: 'eth0' },
    { name: 'WireGuard', value: 'wg0' },
  ]);
  qbit.getNetworkInterfaceAddresses.mockImplementation(async (iface: string) => ADDRESSES[iface]);
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

describe('NetworkInterfaceField', () => {
  it('offers Any interface first, then the server interfaces', async () => {
    const w = await mountField();
    expect(interfaceOptions(w)).toEqual([
      { value: '', label: 'Any interface' },
      { value: 'eth0', label: 'eth0' },
      { value: 'wg0', label: 'WireGuard' },
    ]);
  });

  it('keeps a configured interface missing from the server list, labelled by its saved name', async () => {
    const w = await mountField({ modelValue: 'wg1', savedInterfaceName: 'Office VPN' });
    expect(interfaceOptions(w).at(-1)).toEqual({ value: 'wg1', label: 'Office VPN' });
    expect((w.get('#nic').element as HTMLSelectElement).value).toBe('wg1');
  });

  it('labels a missing interface by its raw value without a saved name', async () => {
    const w = await mountField({ modelValue: 'wg1' });
    expect(interfaceOptions(w).at(-1)).toEqual({ value: 'wg1', label: 'wg1' });
  });

  it('does not duplicate a configured interface that the server lists', async () => {
    const w = await mountField({ modelValue: 'eth0', savedInterfaceName: 'Ethernet' });
    expect(interfaceOptions(w).filter((o) => o.value === 'eth0')).toEqual([
      { value: 'eth0', label: 'eth0' },
    ]);
  });

  it('offers the wildcard addresses, then the addresses of the chosen interface', async () => {
    const w = await mountField({ modelValue: 'eth0' });
    expect(qbit.getNetworkInterfaceAddresses).toHaveBeenCalledWith('eth0');
    expect(addressOptions(w)).toEqual([
      { value: '', label: 'All addresses' },
      { value: '0.0.0.0', label: 'All IPv4 addresses' },
      { value: '::', label: 'All IPv6 addresses' },
      { value: '192.168.1.20', label: '192.168.1.20' },
    ]);
  });

  it('keeps a configured address the server no longer reports', async () => {
    const w = await mountField({ modelValue: 'eth0', address: '192.168.9.9' });
    expect(addressOptions(w).at(-1)).toEqual({ value: '192.168.9.9', label: '192.168.9.9' });
    expect((w.get('#nic-address').element as HTMLSelectElement).value).toBe('192.168.9.9');
  });

  it('reloads the addresses when the interface changes', async () => {
    const w = await mountField({ modelValue: 'eth0' });
    await w.get('#nic').setValue('wg0');
    await flushPromises();
    expect(qbit.getNetworkInterfaceAddresses).toHaveBeenCalledWith('wg0');
    expect(addressOptions(w).map((o) => o.value)).toContain('10.2.0.2');
    expect(addressOptions(w).map((o) => o.value)).not.toContain('192.168.1.20');
  });

  it('resets the address to all addresses when the interface changes', async () => {
    const w = await mountField({ modelValue: 'eth0', address: '192.168.1.20' });
    await w.get('#nic').setValue('wg0');
    expect(w.emitted('update:modelValue')).toEqual([['wg0']]);
    expect(w.emitted('update:address')).toEqual([['']]);
  });

  it('changes only the address when an address is picked', async () => {
    const w = await mountField({ modelValue: 'eth0' });
    await w.get('#nic-address').setValue('::');
    expect(w.emitted('update:address')).toEqual([['::']]);
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it('disables both selects', async () => {
    const w = await mountField({ disabled: true });
    expect(w.get('#nic').attributes('disabled')).toBeDefined();
    expect(w.get('#nic-address').attributes('disabled')).toBeDefined();
  });
});
