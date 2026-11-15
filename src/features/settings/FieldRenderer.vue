<script setup lang="ts">
import { computed } from 'vue';
import type { CheckboxCheckedState } from 'reka-ui';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import NumberField from './NumberField.vue';
import ApiKeyField from './fields/ApiKeyField.vue';
import NetworkInterfaceField from './fields/NetworkInterfaceField.vue';
import NewPasswordField from './fields/NewPasswordField.vue';
import HostPathInput from '@/components/HostPathInput.vue';
import ScanDirsField from './fields/ScanDirsField.vue';
import type { ScanDirs } from './fields/scanDirs';
import SecretField from './fields/SecretField.vue';
import TimeField from './fields/TimeField.vue';
import SettingRow from './SettingRow.vue';
import { NativeSelect } from '@/components/ui/select';
import { useUiStore } from '@/stores/ui';
import type { SettingField } from './schema';

const props = defineProps<{
  field: SettingField;
  disabled?: boolean;
  savedInterfaceName?: string;
}>();
const value = defineModel<unknown>({ required: true });
const inlineToggleValue = defineModel<unknown>('inlineToggle');
const unitSelectValue = defineModel<unknown>('unitSelect');
const minuteValue = defineModel<unknown>('minute');
const confirmValue = defineModel<unknown>('confirm');
const addressValue = defineModel<unknown>('address');

const ui = useUiStore();

const inputId = computed(() => `pref-${props.field.key}`);
const preferenceKeys = computed(() =>
  [
    props.field.key,
    props.field.inlineToggle,
    props.field.unitSelect?.key,
    props.field.minuteKey,
    props.field.addressKey,
  ].filter((key) => key !== undefined),
);
const rawKeys = computed(() => (ui.showSettingKeys ? preferenceKeys.value : undefined));
const inputDisabled = computed(
  () =>
    props.disabled || (props.field.inlineToggle !== undefined && inlineToggleValue.value !== true),
);

const checked = computed({
  get: () => value.value === true,
  set: (state: CheckboxCheckedState) => (value.value = state === true),
});
const inlineToggleChecked = computed({
  get: () => inlineToggleValue.value === true,
  set: (state: CheckboxCheckedState) => (inlineToggleValue.value = state === true),
});
const numberValue = computed({
  get: () => Number(value.value),
  set: (n: number) => (value.value = n),
});
const textValue = computed({
  get: () => String(value.value ?? ''),
  set: (text: string | number) => (value.value = String(text)),
});
const minuteNumber = computed({
  get: () => Number(minuteValue.value),
  set: (n: number) => (minuteValue.value = n),
});
const confirmText = computed({
  get: () => String(confirmValue.value ?? ''),
  set: (text: string) => (confirmValue.value = text),
});
const addressText = computed({
  get: () => String(addressValue.value ?? ''),
  set: (text: string) => (addressValue.value = text),
});
const scanDirsValue = computed({
  get: () => (value.value ?? {}) as ScanDirs,
  set: (dirs: ScanDirs) => (value.value = dirs),
});
const numberStep = computed(
  () => props.field.step ?? (props.field.kind === 'float' ? 'any' : undefined),
);
</script>

<template>
  <NetworkInterfaceField
    v-if="field.kind === 'networkInterface'"
    :id="inputId"
    v-model="textValue"
    v-model:address="addressText"
    :label="field.label"
    :address-label="field.addressLabel ?? field.label"
    :saved-interface-name="savedInterfaceName"
    :disabled="inputDisabled"
    :interface-raw-key="ui.showSettingKeys ? field.key : undefined"
    :address-raw-key="ui.showSettingKeys ? field.addressKey : undefined"
  />
  <SettingRow
    v-else
    :label="field.label"
    :hint="field.hint"
    :for="field.kind === 'bool' ? undefined : inputId"
    :raw-keys="rawKeys"
  >
    <Checkbox
      v-if="field.inlineToggle"
      v-model="inlineToggleChecked"
      :aria-label="field.inlineToggleLabel ?? field.label"
      :disabled="disabled"
    />
    <Checkbox
      v-if="field.kind === 'bool'"
      v-model="checked"
      :aria-label="field.label"
      :disabled="inputDisabled"
    />
    <NumberField
      v-else-if="field.kind === 'int' || field.kind === 'float'"
      :id="inputId"
      v-model="numberValue"
      :min="field.min"
      :max="field.max"
      :step="numberStep"
      :unit="field.unitSelect ? undefined : field.unit"
      :disabled="inputDisabled"
    />
    <Input
      v-else-if="field.kind === 'text' || field.kind === 'file'"
      :id="inputId"
      v-model="textValue"
      spellcheck="false"
      autocomplete="off"
      :disabled="inputDisabled"
    />
    <HostPathInput
      v-else-if="field.kind === 'path'"
      :id="inputId"
      v-model="textValue"
      :label="field.label"
      :show-free-space="field.showFreeSpace"
      :disabled="inputDisabled"
    />
    <SecretField
      v-else-if="field.kind === 'secret'"
      :id="inputId"
      v-model="textValue"
      :disabled="inputDisabled"
    />
    <NewPasswordField
      v-else-if="field.kind === 'newPassword'"
      :id="inputId"
      v-model="textValue"
      v-model:confirmation="confirmText"
      :disabled="inputDisabled"
    />
    <ApiKeyField
      v-else-if="field.kind === 'apiKey'"
      :id="inputId"
      :stored-key="textValue"
      :disabled="inputDisabled"
    />
    <Textarea
      v-else-if="field.kind === 'multiline'"
      :id="inputId"
      v-model="textValue"
      rows="3"
      spellcheck="false"
      autocomplete="off"
      class="max-h-64 font-mono"
      :readonly="field.readonly"
      :disabled="inputDisabled"
    />
    <TimeField
      v-else-if="field.kind === 'time'"
      :id="inputId"
      v-model:hour="numberValue"
      v-model:minute="minuteNumber"
      :disabled="inputDisabled"
    />
    <ScanDirsField
      v-else-if="field.kind === 'scanDirs'"
      :id="inputId"
      v-model="scanDirsValue"
      :disabled="inputDisabled"
    />
    <NativeSelect
      v-else-if="field.kind === 'select'"
      :id="inputId"
      v-model="value"
      :disabled="inputDisabled"
    >
      <option v-for="option in field.options" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </NativeSelect>
    <pre
      v-else
      :id="inputId"
      class="min-w-0 overflow-x-auto font-mono text-xs text-muted-foreground"
      >{{ JSON.stringify(value) }}</pre>
    <NativeSelect
      v-if="field.unitSelect"
      v-model="unitSelectValue"
      :aria-label="`${field.label} unit`"
      :disabled="inputDisabled"
    >
      <option
        v-for="option in field.unitSelect.options"
        :key="String(option.value)"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </NativeSelect>
  </SettingRow>
</template>
