import { onScopeDispose, watchEffect } from 'vue';
import { formatSpeedValue } from '@/lib/format';
import { useTransferStore } from '@/stores/transfer';
import { useUiStore } from '@/stores/ui';

export function speedsTitle(download: number, upload: number, baseTitle: string): string {
  return `[D: ${formatSpeedValue(download)}, U: ${formatSpeedValue(upload)}] ${baseTitle}`;
}

export function useSpeedsInTitle() {
  const ui = useUiStore();
  const transfer = useTransferStore();
  const baseTitle = document.title;

  watchEffect(() => {
    const newest = transfer.samples.at(-1);
    document.title =
      ui.speedsInTitle && newest
        ? speedsTitle(newest.download, newest.upload, baseTitle)
        : baseTitle;
  });

  onScopeDispose(() => {
    document.title = baseTitle;
  });
}
