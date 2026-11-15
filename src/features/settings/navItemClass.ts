import { cn } from '@/lib/utils';

export function settingsNavItemClass(fullWidth: boolean) {
  return cn(
    'flex w-full items-center gap-2 text-sm',
    fullWidth
      ? 'px-gutter py-3'
      : 'rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
  );
}
