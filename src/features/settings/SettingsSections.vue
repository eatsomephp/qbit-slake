<script setup lang="ts">
import { computed } from 'vue';
import type { RawPreferences } from '@/types/qbit';
import FieldRenderer from './FieldRenderer.vue';
import { isEnabledBySettings } from './model';
import type { Draft, SettingSection } from './schema';

const props = defineProps<{ prefs: RawPreferences; sections: SettingSection[] }>();
const draft = defineModel<Draft>('draft', { required: true });

const savedInterfaceName = computed(() => String(props.prefs.current_interface_name ?? ''));

function setCompanion(key: string | undefined, value: unknown) {
  if (key) draft.value[key] = value;
}
</script>

<template>
  <section
    v-for="section in sections"
    :key="section.id"
    class="not-first:mt-section not-first:border-t not-first:border-divider not-first:pt-section"
  >
    <div
      v-for="(group, index) in section.groups"
      :key="index"
      class="flex flex-col gap-row not-first:mt-section not-first:border-t not-first:border-divider not-first:pt-section"
    >
      <div v-if="group.title || group.hint" class="flex flex-col gap-0.5">
        <h3 v-if="group.title" class="text-sm font-medium">{{ group.title }}</h3>
        <p v-if="group.hint" class="text-xs text-muted-foreground">{{ group.hint }}</p>
      </div>
      <FieldRenderer
        v-for="field in group.fields"
        :key="field.key"
        v-model="draft[field.key]"
        :inline-toggle="field.inlineToggle ? draft[field.inlineToggle] : undefined"
        :unit-select="field.unitSelect ? draft[field.unitSelect.key] : undefined"
        :minute="field.minuteKey ? draft[field.minuteKey] : undefined"
        :confirm="field.confirmKey ? draft[field.confirmKey] : undefined"
        :address="field.addressKey ? draft[field.addressKey] : undefined"
        :field="field"
        :disabled="!isEnabledBySettings(field, draft)"
        :saved-interface-name="savedInterfaceName"
        @update:inline-toggle="setCompanion(field.inlineToggle, $event)"
        @update:unit-select="setCompanion(field.unitSelect?.key, $event)"
        @update:minute="setCompanion(field.minuteKey, $event)"
        @update:confirm="setCompanion(field.confirmKey, $event)"
        @update:address="setCompanion(field.addressKey, $event)"
      />
    </div>
  </section>
</template>
