import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: { theme: { spacing: ['field', 'row', 'gutter', 'form', 'dialog', 'section'] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
