<script setup lang="ts">
import { computed, useId } from 'vue';
import { NativeSelect } from '@/components/ui/select';
import { ShareLimitAction, ShareLimitsMode } from '@/constants/qbit';
import type { ShareLimits } from '@/types/app';
import LimitField from './LimitField.vue';
import type { ShareLimitInheritance } from './shareLimitInheritance';

const limits = defineModel<ShareLimits>({ required: true });
const props = defineProps<{
  inheritance: ShareLimitInheritance;
  showMode: boolean;
  showAction: boolean;
  compact?: boolean;
}>();

const labelledRowClass = computed(() => [
  'grid items-center gap-x-2',
  props.compact ? 'grid-cols-[8rem_1fr]' : 'grid-cols-[9rem_1fr]',
]);
const modeId = useId();
const actionId = useId();

const modes = computed(() => [
  { value: ShareLimitsMode.Default, label: props.inheritance.label },
  { value: ShareLimitsMode.MatchAny, label: 'When any limit is reached' },
  { value: ShareLimitsMode.MatchAll, label: 'When all limits are reached' },
]);
const actions = computed(() => [
  { value: ShareLimitAction.Default, label: props.inheritance.label },
  { value: ShareLimitAction.Stop, label: 'Stop torrent' },
  { value: ShareLimitAction.Remove, label: 'Remove torrent' },
  { value: ShareLimitAction.RemoveWithContent, label: 'Remove torrent and files' },
  { value: ShareLimitAction.EnableSuperSeeding, label: 'Enable super seeding' },
]);
</script>

<template>
  <LimitField
    v-model="limits.ratioLimit"
    label="Ratio"
    unit="ratio"
    step="0.01"
    :custom-default="2"
    :inherit-label="inheritance.label"
    :compact="compact"
  />
  <LimitField
    v-model="limits.seedingTimeLimit"
    label="Seeding time"
    unit="minutes"
    :custom-default="1440"
    :inherit-label="inheritance.label"
    :compact="compact"
  />
  <LimitField
    v-model="limits.inactiveSeedingTimeLimit"
    label="Inactive seeding time"
    unit="minutes"
    :custom-default="1440"
    :inherit-label="inheritance.label"
    :compact="compact"
  />
  <div v-if="showMode" :class="labelledRowClass">
    <label :for="modeId" class="text-sm">Act</label>
    <NativeSelect :id="modeId" v-model="limits.mode" name="shareLimitsMode" class="w-full">
      <option v-for="m in modes" :key="m.value" :value="m.value">{{ m.label }}</option>
    </NativeSelect>
  </div>
  <div v-if="showAction" :class="labelledRowClass">
    <label :for="actionId" class="text-sm">Then</label>
    <NativeSelect :id="actionId" v-model="limits.action" name="shareLimitAction" class="w-full">
      <option v-for="a in actions" :key="a.value" :value="a.value">{{ a.label }}</option>
    </NativeSelect>
  </div>
  <p v-if="inheritance.hint" class="text-xs text-muted-foreground">{{ inheritance.hint }}</p>
</template>
