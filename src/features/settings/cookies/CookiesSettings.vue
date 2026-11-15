<script setup lang="ts">
import { vTooltip } from '@/components/tooltip/vTooltip';
import { computed } from 'vue';
import { Plus, Trash2, X } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { emptyCookieRow, invalidFields, isExpired, type CookieRow } from './cookieRows';

defineProps<{ isPending: boolean; error: unknown }>();
const rows = defineModel<CookieRow[]>({ required: true });

const invalidByRow = computed(() => new Map(rows.value.map((row) => [row, invalidFields(row)])));

const ROW_GRID =
  'grid grid-cols-2 gap-2 @2xl:grid-cols-[minmax(0,1.5fr)_4.5rem_minmax(0,1fr)_minmax(0,1fr)_13.5rem_2rem] @2xl:items-center';

function addRow() {
  rows.value.push(emptyCookieRow());
}

function removeRow(row: CookieRow) {
  rows.value = rows.value.filter((other) => other !== row);
}

function isInvalid(row: CookieRow, field: 'domain' | 'name' | 'value') {
  return invalidByRow.value.get(row)?.has(field) ?? false;
}
</script>

<template>
  <div class="@container flex flex-col gap-form">
    <p class="text-sm text-muted-foreground">
      qBittorrent sends these cookies when it downloads .torrent links and RSS feeds, for sites that
      need you to be signed in. A cookie with no expiry lasts until qBittorrent restarts.
    </p>
    <p v-if="error" class="text-sm text-destructive">Couldn't load cookies.</p>
    <p v-else-if="isPending" class="text-sm text-muted-foreground">Loading…</p>
    <template v-else>
      <div v-if="rows.length > 0" class="flex flex-col gap-row @2xl:gap-2">
        <div
          :class="ROW_GRID"
          class="hidden text-xs text-muted-foreground @2xl:grid"
          aria-hidden="true"
        >
          <span>Domain</span><span>Path</span><span>Name</span><span>Value</span>
          <span>Expires</span>
        </div>
        <div
          v-for="row in rows"
          :key="row.key"
          :class="ROW_GRID"
          class="rounded-md border p-gutter @2xl:rounded-none @2xl:border-0 @2xl:p-0"
        >
          <label class="flex flex-col gap-field">
            <span class="text-xs text-muted-foreground @2xl:sr-only">Domain</span>
            <Input
              v-model="row.domain"
              placeholder="example.com"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="none"
              :aria-invalid="isInvalid(row, 'domain') || undefined"
            />
          </label>
          <label class="flex flex-col gap-field">
            <span class="text-xs text-muted-foreground @2xl:sr-only">Path</span>
            <Input
              v-model="row.path"
              placeholder="/"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="none"
            />
          </label>
          <label class="flex flex-col gap-field">
            <span class="text-xs text-muted-foreground @2xl:sr-only">Name</span>
            <Input
              v-model="row.name"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="none"
              :aria-invalid="isInvalid(row, 'name') || undefined"
            />
          </label>
          <label class="flex flex-col gap-field">
            <span class="text-xs text-muted-foreground @2xl:sr-only">Value</span>
            <Input
              v-model="row.value"
              class="font-mono"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="none"
              :aria-invalid="isInvalid(row, 'value') || undefined"
            />
          </label>
          <div class="col-span-2 flex items-end gap-2 @2xl:contents">
            <div class="flex min-w-0 flex-1 flex-col gap-field">
              <label
                :for="`cookie-expires-${row.key}`"
                class="text-xs text-muted-foreground @2xl:sr-only"
              >
                Expires
              </label>
              <div class="flex items-center gap-1">
                <Input
                  :id="`cookie-expires-${row.key}`"
                  v-model="row.expires"
                  type="datetime-local"
                  :aria-describedby="isExpired(row) ? `cookie-expired-${row.key}` : undefined"
                />
                <Button
                  v-tooltip="'Clear expiry (until qBittorrent restarts)'"
                  variant="quiet"
                  size="icon-2xs"
                  aria-label="Clear expiry"
                  :class="{ invisible: !row.expires }"
                  @click="row.expires = ''"
                >
                  <X />
                </Button>
              </div>
            </div>
            <div class="flex justify-end">
              <Button
                v-tooltip="'Remove cookie'"
                variant="muted"
                size="icon-sm"
                aria-label="Remove cookie"
                @click="removeRow(row)"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
          <p
            v-if="isExpired(row)"
            :id="`cookie-expired-${row.key}`"
            class="col-span-full text-xs text-warning"
          >
            Expired. qBittorrent no longer sends it and drops it when it restarts.
          </p>
        </div>
      </div>
      <p v-else class="text-sm text-muted-foreground">No cookies.</p>
      <div>
        <Button variant="outline" size="sm" @click="addRow"><Plus />Add cookie</Button>
      </div>
    </template>
  </div>
</template>
