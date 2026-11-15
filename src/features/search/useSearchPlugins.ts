import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import qbit from '@/services/qbit';
import type { SearchPlugin } from '@/types/app';
import { reportSearchFailure } from './useSearchJobs';

const BACKGROUND_WORK_POLL_MS = 2000;
const BACKGROUND_WORK_WATCH_MS = 30_000;

/** Installs and updates finish in the background with no reply, so the list is re-polled for a while after one. */
export function useSearchPlugins() {
  const watchUntil = ref(0);

  const query = useQuery({
    queryKey: ['search', 'plugins'],
    queryFn: ({ signal }) => qbit.getSearchPlugins(signal),
    refetchInterval: () => (Date.now() < watchUntil.value ? BACKGROUND_WORK_POLL_MS : false),
  });

  const plugins = computed(() =>
    (query.data.value ?? []).toSorted((a, b) => a.fullName.localeCompare(b.fullName)),
  );
  const enabledPlugins = computed(() => plugins.value.filter((plugin) => plugin.isEnabled));

  function fullNameOf(name: string): string {
    return query.data.value?.find((plugin) => plugin.name === name)?.fullName ?? name;
  }

  async function perform(
    label: string,
    action: () => Promise<void>,
    watchesBackgroundWork = false,
  ) {
    try {
      await action();
      if (watchesBackgroundWork) watchUntil.value = Date.now() + BACKGROUND_WORK_WATCH_MS;
      return true;
    } catch (err) {
      reportSearchFailure(label, err);
      return false;
    } finally {
      void query.refetch();
    }
  }

  return {
    plugins,
    enabledPlugins,
    isPending: query.isPending,
    error: query.error,
    fullNameOf,
    install: (sources: string[]) =>
      perform('Install plugin', () => qbit.installSearchPlugins(sources), true),
    uninstall: (plugin: SearchPlugin) =>
      perform('Uninstall plugin', () => qbit.uninstallSearchPlugins([plugin.name])),
    setEnabled: (plugin: SearchPlugin, enabled: boolean) =>
      perform(enabled ? 'Enable plugin' : 'Disable plugin', () =>
        qbit.setSearchPluginsEnabled([plugin.name], enabled),
      ),
    update: () => perform('Check for updates', () => qbit.updateSearchPlugins(), true),
  };
}
