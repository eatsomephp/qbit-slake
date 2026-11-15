<script setup lang="ts">
import { ChevronRight, CircleAlert } from '@lucide/vue';
import { RouterLink } from 'vue-router';
import { cn } from '@/lib/utils';
import { settingsNavItemClass } from './navItemClass';

export interface SettingsNavEntry {
  id: string;
  title: string;
  unsaved?: boolean;
  hasProblem?: boolean;
  dimmed?: boolean;
}

defineProps<{ entries: SettingsNavEntry[]; activeId: string | null; fullWidth?: boolean }>();
defineEmits<{ select: [id: string] }>();
</script>

<template>
  <nav aria-label="Settings sections">
    <ul :class="fullWidth ? 'divide-y' : 'space-y-0.5'">
      <li v-for="entry in entries" :key="entry.id">
        <RouterLink
          :to="{ name: 'settings', params: { section: entry.id } }"
          :aria-current="entry.id === activeId ? 'page' : undefined"
          :class="
            cn(
              settingsNavItemClass(fullWidth),
              entry.id === activeId && 'bg-accent font-medium text-accent-foreground',
              entry.dimmed && 'opacity-50',
            )
          "
          @click="$emit('select', entry.id)"
        >
          {{ entry.title }}
          <CircleAlert
            v-if="entry.hasProblem"
            class="size-3.5 text-destructive"
            aria-hidden="true"
          />
          <span
            v-else-if="entry.unsaved"
            class="size-1.5 rounded-full bg-primary"
            aria-hidden="true"
          />
          <span v-if="entry.hasProblem" class="sr-only">(needs attention)</span>
          <span v-else-if="entry.unsaved" class="sr-only">(unsaved changes)</span>
          <ChevronRight v-if="fullWidth" class="ml-auto size-4 text-muted-foreground" />
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
