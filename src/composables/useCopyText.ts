import { useToastsStore } from '@/stores/toasts';

export function useCopyText() {
  const toasts = useToastsStore();
  return async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toasts.info('Copied');
    } catch {
      toasts.error("Couldn't copy to the clipboard");
    }
  };
}
