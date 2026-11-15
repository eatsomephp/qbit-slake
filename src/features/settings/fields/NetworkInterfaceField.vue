<script setup lang="ts">
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import qbit from '@/services/qbit';
import SettingRow from '../SettingRow.vue';
import { NativeSelect } from '@/components/ui/select';
import type { SelectOption } from '../schema';

const props = defineProps<{
  id: string;
  label: string;
  addressLabel: string;
  savedInterfaceName?: string;
  disabled?: boolean;
  interfaceRawKey?: string;
  addressRawKey?: string;
}>();
const networkInterface = defineModel<string>({ required: true });
const address = defineModel<string>('address', { required: true });

const { data: interfaces } = useQuery({
  queryKey: ['networkInterfaces'],
  queryFn: () => qbit.getNetworkInterfaces(),
});
const { data: addresses } = useQuery({
  queryKey: ['networkInterfaceAddresses', networkInterface],
  queryFn: () => qbit.getNetworkInterfaceAddresses(networkInterface.value),
});

// A VPN interface that's down is missing from the list but still configured; keep it selectable.
const interfaceOptions = computed<SelectOption[]>(() => {
  const listed = interfaces.value ?? [];
  const options = [
    { value: '', label: 'Any interface' },
    ...listed.map((entry) => ({ value: entry.value, label: entry.name })),
  ];
  if (networkInterface.value && !listed.some((entry) => entry.value === networkInterface.value)) {
    options.push({
      value: networkInterface.value,
      label: props.savedInterfaceName || networkInterface.value,
    });
  }
  return options;
});

const addressOptions = computed<SelectOption[]>(() => {
  const options = [
    { value: '', label: 'All addresses' },
    { value: '0.0.0.0', label: 'All IPv4 addresses' },
    { value: '::', label: 'All IPv6 addresses' },
    ...(addresses.value ?? []).map((ip) => ({ value: ip, label: ip })),
  ];
  if (!options.some((option) => option.value === address.value)) {
    options.push({ value: address.value, label: address.value });
  }
  return options;
});

const selectedInterface = computed({
  get: () => networkInterface.value,
  set: (value: string) => {
    networkInterface.value = value;
    address.value = '';
  },
});
</script>

<template>
  <SettingRow :label="label" :for="id" :raw-keys="interfaceRawKey ? [interfaceRawKey] : undefined">
    <NativeSelect :id="id" v-model="selectedInterface" :disabled="disabled">
      <option v-for="option in interfaceOptions" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </NativeSelect>
  </SettingRow>
  <SettingRow
    :label="addressLabel"
    :for="`${id}-address`"
    :raw-keys="addressRawKey ? [addressRawKey] : undefined"
  >
    <NativeSelect :id="`${id}-address`" v-model="address" :disabled="disabled">
      <option v-for="option in addressOptions" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </NativeSelect>
  </SettingRow>
</template>
