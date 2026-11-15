// `?no-inline`: without it Vite inlines the ~190 flags under 4 kB into the JS bundle as data URIs.
const FLAG_URLS = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

const flagUrlByCode = new Map(
  Object.entries(FLAG_URLS).map(([path, url]) => [path.slice(-6, -4), url]),
);

export function countryFlagUrl(code: string): string | undefined {
  return flagUrlByCode.get(code.toLowerCase());
}
