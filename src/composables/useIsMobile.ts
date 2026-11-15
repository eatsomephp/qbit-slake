import { useMediaQuery } from '@vueuse/core';

/** The phone layout: below Tailwind's `md` breakpoint (768px). */
export function useIsMobile() {
  return useMediaQuery('(max-width: 767.98px)');
}
