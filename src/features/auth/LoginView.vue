<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LoaderCircle } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { QbtHttpError } from '@/services/qbit';
import { useAppStore } from '@/stores/app';
import { safeRedirect } from '@/router';

const app = useAppStore();
const route = useRoute();
const router = useRouter();

const username = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function submit() {
  busy.value = true;
  error.value = null;
  try {
    if (await app.login(username.value, password.value)) {
      await router.replace(safeRedirect(route.query.redirect));
    } else {
      error.value = 'Wrong username or password.';
    }
  } catch (err) {
    if (err instanceof QbtHttpError && err.status === 403) {
      error.value = 'Too many failed attempts. qBittorrent has banned this IP for a while.';
    } else if (err instanceof QbtHttpError) {
      error.value = `qBittorrent responded with ${err.status}.`;
    } else {
      error.value = "Can't reach qBittorrent.";
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center p-section">
    <form
      class="flex w-full max-w-xs flex-col gap-form rounded-md border p-dialog"
      @submit.prevent="submit"
    >
      <h1 class="text-base font-medium">Sign in to qBittorrent</h1>
      <Field v-slot="{ id }" label="Username">
        <Input :id="id" v-model="username" autocomplete="username" autofocus required />
      </Field>
      <Field v-slot="{ id }" label="Password">
        <Input :id="id" v-model="password" type="password" autocomplete="current-password" />
      </Field>
      <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
      <Button type="submit" class="w-full" :disabled="busy">
        <LoaderCircle v-if="busy" class="animate-spin" />
        Sign in
      </Button>
    </form>
  </main>
</template>
