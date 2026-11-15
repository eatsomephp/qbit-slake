import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Button } from './Button.vue';

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 focus-visible:z-10 aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-accent disabled:text-muted-foreground disabled:opacity-100',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:bg-accent disabled:text-muted-foreground disabled:opacity-100 focus-visible:outline-destructive',
        outline:
          'border bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        soft: 'bg-primary/12 text-primary hover:bg-primary/18 dark:bg-primary/15 dark:hover:bg-primary/22',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        muted:
          'text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-accent/50',
        quiet: 'text-muted-foreground hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3 has-[>svg]:px-2.5',
        inline: 'h-auto gap-1 p-0 font-sans text-xs font-normal hover:underline',
        '2xs': 'h-5 gap-1 rounded-sm px-1 text-2xs font-normal',
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-7 rounded-md gap-1.5 px-2.5 text-xs has-[>svg]:px-2',
        lg: 'h-9 rounded-md px-5 has-[>svg]:px-4',
        icon: 'size-8',
        'icon-2xs': "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
export type ButtonVariants = VariantProps<typeof buttonVariants>;

export const revealOnRowHover =
  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100';
