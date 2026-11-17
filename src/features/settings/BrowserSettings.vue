<script setup lang="ts">
import { computed, ref } from 'vue';
import { FileDown, FileUp } from '@lucide/vue';
import { formatDateAs } from '@/lib/format';
import { saveBlob } from '@/lib/saveBlob';
import { exportUiSettings, importUiSettings, InvalidUiSettingsFile } from '@/lib/uiSettingsFile';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useThemeChoice } from '@/composables/useTheme';
import { DETAILS_TAB_LABELS, DETAILS_TABS, useUiStore } from '@/stores/ui';
import { useToastsStore } from '@/stores/toasts';
import { BROWSER_FIELDS, type BrowserFieldKey } from './browserFields';
import { NativeSelect } from '@/components/ui/select';
import NumberField from './NumberField.vue';
import SettingRow from './SettingRow.vue';

const props = defineProps<{ only?: readonly BrowserFieldKey[] }>();

const ui = useUiStore();
const toasts = useToastsStore();
const { options: themeOptions, selected: selectedTheme } = useThemeChoice();

const bytesPerSecondExample = computed(() => (ui.sizeUnit === 'decimal' ? 'MB/s' : 'MiB/s'));

const exampleDate = new Date();
const dateFormatOptions = [
  { value: 'locale', label: `Browser default (${formatDateAs(exampleDate, 'locale')})` },
  { value: 'iso', label: formatDateAs(exampleDate, 'iso') },
  { value: 'dayFirst', label: formatDateAs(exampleDate, 'dayFirst') },
  { value: 'monthFirst', label: formatDateAs(exampleDate, 'monthFirst') },
];

const importFileInput = ref<HTMLInputElement | null>(null);

function exportSettingsFile() {
  saveBlob(new Blob([exportUiSettings()], { type: 'application/json' }), 'slake-settings.json');
}

async function importSettingsFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    importUiSettings(await file.text());
  } catch (err) {
    if (!(err instanceof InvalidUiSettingsFile)) throw err;
    toasts.error(`Import settings failed: ${err.message}`);
    return;
  }
  location.reload();
}

const shows = (key: BrowserFieldKey) => props.only?.includes(key) ?? true;
const {
  theme,
  colorScheme,
  sidebarCountMode,
  tagsInName,
  refreshInterval,
  sizeUnit,
  speedUnit,
  dateFormat,
  ratioColors,
  hideInfiniteEta,
  speedsInTitle,
  deleteFilesByDefault,
  defaultDetailsTab,
  autoSizeDetails,
  showSettingKeys,
  settingsFile,
} = BROWSER_FIELDS;
</script>

<template>
  <div class="flex flex-col gap-row">
    <SettingRow v-if="shows('theme')" :label="theme.label" :hint="theme.hint" for="theme">
      <NativeSelect id="theme" v-model="selectedTheme">
        <option v-for="option in themeOptions" :key="option.id" :value="option.id">
          {{ option.label }}
        </option>
      </NativeSelect>
    </SettingRow>
    <SettingRow v-if="shows('colorScheme')" :label="colorScheme.label" for="color-scheme">
      <NativeSelect id="color-scheme" v-model="ui.colorScheme">
        <option value="system">Match system</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </NativeSelect>
    </SettingRow>
    <SettingRow
      v-if="shows('sidebarCountMode')"
      :label="sidebarCountMode.label"
      :hint="sidebarCountMode.hint"
      for="sidebar-counts"
    >
      <NativeSelect id="sidebar-counts" v-model="ui.sidebarCountMode">
        <option value="matching">Matching other filters</option>
        <option value="all">All torrents</option>
      </NativeSelect>
    </SettingRow>
    <SettingRow v-if="shows('tagsInName')" :label="tagsInName.label" :hint="tagsInName.hint">
      <Checkbox v-model="ui.tagsInName" :aria-label="tagsInName.label" />
    </SettingRow>
    <SettingRow
      v-if="shows('refreshInterval')"
      :label="refreshInterval.label"
      :hint="refreshInterval.hint"
      for="refresh"
    >
      <NumberField
        id="refresh"
        v-model="ui.refreshInterval"
        :min="500"
        :max="60000"
        step="250"
        unit="ms"
      />
    </SettingRow>
    <SettingRow
      v-if="shows('sizeUnit')"
      :label="sizeUnit.label"
      :hint="sizeUnit.hint"
      for="size-unit"
    >
      <NativeSelect id="size-unit" v-model="ui.sizeUnit">
        <option value="binary">Binary (MiB, GiB)</option>
        <option value="decimal">Decimal (MB, GB)</option>
      </NativeSelect>
    </SettingRow>
    <SettingRow
      v-if="shows('speedUnit')"
      :label="speedUnit.label"
      :hint="speedUnit.hint"
      for="speed-unit"
    >
      <NativeSelect id="speed-unit" v-model="ui.speedUnit">
        <option value="bytes">Bytes per second ({{ bytesPerSecondExample }})</option>
        <option value="bits">Bits per second (Mbps)</option>
      </NativeSelect>
    </SettingRow>
    <SettingRow
      v-if="shows('dateFormat')"
      :label="dateFormat.label"
      :hint="dateFormat.hint"
      for="date-format"
    >
      <NativeSelect id="date-format" v-model="ui.dateFormat">
        <option v-for="option in dateFormatOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </NativeSelect>
    </SettingRow>
    <SettingRow
      v-if="shows('ratioColors')"
      :label="ratioColors.label"
      :hint="ratioColors.hint"
      for="ratio-colors"
    >
      <NativeSelect id="ratio-colors" v-model="ui.ratioColors">
        <option value="low">Low ratios only</option>
        <option value="scale">Full scale</option>
        <option value="off">Off</option>
      </NativeSelect>
    </SettingRow>
    <SettingRow
      v-if="shows('hideInfiniteEta')"
      :label="hideInfiniteEta.label"
      :hint="hideInfiniteEta.hint"
    >
      <Checkbox v-model="ui.hideInfiniteEta" :aria-label="hideInfiniteEta.label" />
    </SettingRow>
    <SettingRow
      v-if="shows('speedsInTitle')"
      :label="speedsInTitle.label"
      :hint="speedsInTitle.hint"
    >
      <Checkbox v-model="ui.speedsInTitle" :aria-label="speedsInTitle.label" />
    </SettingRow>
    <SettingRow
      v-if="shows('deleteFilesByDefault')"
      :label="deleteFilesByDefault.label"
      :hint="deleteFilesByDefault.hint"
    >
      <Checkbox v-model="ui.deleteFilesByDefault" :aria-label="deleteFilesByDefault.label" />
    </SettingRow>
    <SettingRow
      v-if="shows('defaultDetailsTab')"
      :label="defaultDetailsTab.label"
      :hint="defaultDetailsTab.hint"
      for="default-details-tab"
    >
      <NativeSelect id="default-details-tab" v-model="ui.defaultDetailsTab">
        <option value="last">Last one used</option>
        <option v-for="tab in DETAILS_TABS" :key="tab" :value="tab">
          {{ DETAILS_TAB_LABELS[tab] }}
        </option>
      </NativeSelect>
    </SettingRow>
    <SettingRow
      v-if="shows('autoSizeDetails')"
      :label="autoSizeDetails.label"
      :hint="autoSizeDetails.hint"
    >
      <Checkbox v-model="ui.autoSizeDetails" :aria-label="autoSizeDetails.label" />
    </SettingRow>
    <SettingRow
      v-if="shows('showSettingKeys')"
      :label="showSettingKeys.label"
      :hint="showSettingKeys.hint"
    >
      <Checkbox v-model="ui.showSettingKeys" :aria-label="showSettingKeys.label" />
    </SettingRow>
    <SettingRow v-if="shows('settingsFile')" :label="settingsFile.label" :hint="settingsFile.hint">
      <Button variant="outline" size="sm" @click="exportSettingsFile"><FileDown />Export</Button>
      <Button variant="outline" size="sm" @click="importFileInput?.click()">
        <FileUp />Import…
      </Button>
      <input
        ref="importFileInput"
        type="file"
        accept=".json,application/json"
        hidden
        @change="importSettingsFile"
      />
    </SettingRow>
  </div>
</template>
