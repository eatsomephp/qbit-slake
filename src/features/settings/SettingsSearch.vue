<script setup lang="ts">
import { SearchInput } from '@/components/ui/search-input';
import { SETTINGS_SEARCH_ID } from './search';

const query = defineModel<string>({ required: true });
</script>

<template>
  <SearchInput
    :id="SETTINGS_SEARCH_ID"
    v-model="query"
    placeholder="Search settings"
    aria-label="Search settings"
  />
</template>
