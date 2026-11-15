<script setup lang="ts">
import { Power } from '@lucide/vue';
import { RouterLink } from 'vue-router';
import { Button } from '@/components/ui/button';
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center p-section">
    <div class="flex w-full max-w-xs flex-col gap-form rounded-md border p-dialog">
      <div class="flex flex-col gap-field">
        <h1 class="flex items-center gap-2 text-base font-medium">
          <Power class="size-4 text-muted-foreground" aria-hidden="true" />
          qBittorrent has shut down
        </h1>
        <p class="text-sm text-muted-foreground">Start it again on its host, then sign in.</p>
      </div>
      <Button as-child class="w-full">
        <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
      </Button>
    </div>
  </main>
</template>
