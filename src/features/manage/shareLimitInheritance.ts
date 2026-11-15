export interface ShareLimitInheritance {
  label: string;
  hint?: string;
}

const GLOBAL: ShareLimitInheritance = { label: 'Use global' };

export function torrentShareLimitInheritance(categoriesHaveLimits: boolean): ShareLimitInheritance {
  if (!categoriesHaveLimits) return GLOBAL;
  return {
    label: 'Inherit',
    hint: 'Inherit uses the category’s limits, or the global ones for torrents without a category.',
  };
}

export function categoryShareLimitInheritance(categoryName: string): ShareLimitInheritance {
  const parentEnd = categoryName.lastIndexOf('/');
  if (parentEnd <= 0) return GLOBAL;
  const parent = categoryName.slice(0, parentEnd);
  return {
    label: 'Inherit',
    hint: `Inherit uses the limits of “${parent}”, then the global ones.`,
  };
}
