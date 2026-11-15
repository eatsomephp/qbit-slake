<script setup lang="ts">
import { ref, watch } from 'vue';
import { Plus, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sameValue } from '../model';
import { NativeSelect } from '@/components/ui/select';
import { scanDirsFromRows, scanDirsToRows, type ScanDirRow, type ScanDirs } from './scanDirs';

defineProps<{ id: string; disabled?: boolean }>();
const value = defineModel<ScanDirs>({ required: true });

const rows = ref<ScanDirRow[]>(scanDirsToRows(value.value));

watch(value, (dirs) => {
  if (!sameValue(dirs, scanDirsFromRows(rows.value))) rows.value = scanDirsToRows(dirs);
});

watch(
  rows,
  (current) => {
    const dirs = scanDirsFromRows(current);
    if (!sameValue(dirs, value.value)) value.value = dirs;
  },
  { deep: true },
);

function addRow() {
  rows.value.push({ folder: '', target: 'watched', customPath: '' });
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
}
</script>

<template>
  <div :id="id" class="flex w-full min-w-0 flex-col gap-2">
    <div v-for="(row, index) in rows" :key="index" class="flex flex-wrap items-center gap-2">
      <Input
        v-model="row.folder"
        class="min-w-40 flex-1"
        placeholder="Watched folder"
        aria-label="Watched folder"
        spellcheck="false"
        autocomplete="off"
        :disabled="disabled"
      />
      <NativeSelect v-model="row.target" aria-label="Save to" :disabled="disabled">
        <option value="watched">Save in watched folder</option>
        <option value="default">Save in default path</option>
        <option value="custom">Save in…</option>
      </NativeSelect>
      <Input
        v-if="row.target === 'custom'"
        v-model="row.customPath"
        class="min-w-40 flex-1"
        placeholder="Custom save path"
        aria-label="Custom save path"
        spellcheck="false"
        autocomplete="off"
        :disabled="disabled"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Remove watched folder"
        :disabled="disabled"
        @click="removeRow(index)"
      >
        <X />
      </Button>
    </div>
    <div>
      <Button variant="outline" size="sm" :disabled="disabled" @click="addRow">
        <Plus />Add folder
      </Button>
    </div>
  </div>
</template>
