import { fieldKeys, type SettingField } from './schema';

export const SETTINGS_SEARCH_ID = 'settings-search';

export type SearchableField = Pick<SettingField, 'key' | 'label'> & Partial<SettingField>;

export interface SearchableSection<F extends SearchableField> {
  id: string;
  title: string;
  groups: { title?: string; hint?: string; fields: F[] }[];
}

const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;

function searchableWords(field: SearchableField, groupTitle: string | undefined): string[] {
  return [
    groupTitle,
    field.label,
    field.hint,
    field.inlineToggleLabel,
    field.addressLabel,
    ...(field.options ?? []).map((option) => option.label),
    ...fieldKeys(field),
  ]
    .filter((text) => text !== undefined)
    .join(' ')
    .toLowerCase()
    .split(WORD_SEPARATOR)
    .filter(Boolean);
}

export function searchWords(query: string): string[] {
  return query.toLowerCase().split(WORD_SEPARATOR).filter(Boolean);
}

export function searchSettings<F extends SearchableField, S extends SearchableSection<F>>(
  sections: readonly S[],
  query: string,
): S[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  return sections
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) => {
            const fieldWords = searchableWords(field, group.title);
            return words.every((word) =>
              fieldWords.some((fieldWord) => fieldWord.startsWith(word)),
            );
          }),
        }))
        .filter((group) => group.fields.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
}
