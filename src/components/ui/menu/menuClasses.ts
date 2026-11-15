export const menuSurfaceClass =
  'z-50 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]';

export const menuContentClass = `${menuSurfaceClass} min-w-44 overflow-hidden`;
export const menuSubContentClass = `${menuSurfaceClass} max-h-80 min-w-40 overflow-y-auto`;

const menuRow =
  'relative flex h-7 cursor-default items-center gap-2 rounded-sm outline-none select-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[state=open]:bg-accent [&_svg]:size-3.5';

export const menuItemClass = `${menuRow} px-2 [&_svg]:text-muted-foreground`;
export const menuIndicatorItemClass = `${menuRow} pr-2 pl-7`;
export const menuIndicatorClass = 'absolute left-2 flex size-3.5 items-center justify-center';
export const menuDestructiveItemClass =
  'text-destructive data-highlighted:text-destructive [&_svg]:text-destructive';
export const menuSeparatorClass = '-mx-1 my-1 h-px bg-border';
export const menuLabelClass = 'px-2 py-1 text-xs text-muted-foreground';
