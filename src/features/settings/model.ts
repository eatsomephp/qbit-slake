import type { RawPreferences } from '@/types/qbit';
import {
  COMPOSITES,
  NOT_RENDERED,
  SECTIONS,
  fieldKeys,
  type DangerKind,
  type Draft,
  type SettingField,
  type SettingSection,
} from './schema';

const SCHEMA_FIELDS = SECTIONS.flatMap((section) => section.groups.flatMap((g) => g.fields));
const COMPOSITE_KEYS = new Set(COMPOSITES.flatMap((composite) => composite.keys));
const KNOWN_KEYS = new Set([
  ...SCHEMA_FIELDS.flatMap(fieldKeys),
  ...COMPOSITE_KEYS,
  ...Object.keys(NOT_RENDERED),
]);
function labelOfFieldKey(field: SettingField, key: string): string {
  if (key === field.inlineToggle) return field.inlineToggleLabel ?? field.label;
  if (key === field.addressKey) return field.addressLabel ?? field.label;
  return field.label;
}

const LABELS = new Map(
  SCHEMA_FIELDS.flatMap((field) =>
    fieldKeys(field).map((key): [string, string] => [key, labelOfFieldKey(field, key)]),
  ),
);
const SECTION_OF_KEY = new Map(
  SECTIONS.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.fields.flatMap(fieldKeys).map((key) => [key, section.id] as const),
    ),
  ),
);
const FIELD_OWNING_KEY = new Map(
  SCHEMA_FIELDS.flatMap((field) => fieldKeys(field).map((key) => [key, field] as const)),
);

function fieldForUnrecognizedValue(key: string, value: unknown): SettingField {
  switch (typeof value) {
    case 'boolean':
      return { key, label: key, kind: 'bool' };
    case 'number':
      return Number.isInteger(value)
        ? { key, label: key, kind: 'int' }
        : { key, label: key, kind: 'float', step: 'any' };
    case 'string':
      return { key, label: key, kind: 'text' };
    default:
      return { key, label: key, kind: 'json', readonly: true };
  }
}

export function unrecognizedFields(prefs: RawPreferences): SettingField[] {
  return Object.keys(prefs)
    .filter((key) => !KNOWN_KEYS.has(key))
    .sort()
    .map((key) => fieldForUnrecognizedValue(key, prefs[key]));
}

export function renderedSections(prefs: RawPreferences, draft: Draft): SettingSection[] {
  const other = unrecognizedFields(prefs);
  return SECTIONS.map((section) => {
    const groups =
      section.id === 'advanced' && other.length > 0
        ? [...section.groups, { title: 'Other (unrecognized)', fields: other }]
        : section.groups;
    return {
      ...section,
      groups: groups
        .map((group) => ({
          ...group,
          fields: group.fields.filter(
            (field) =>
              (field.presenceKey ?? field.key) in prefs && (field.visibleWhen?.(draft) ?? true),
          ),
        }))
        .filter((group) => group.fields.length > 0),
    };
  }).filter((section) => section.groups.length > 0);
}

export function isEnabledBySettings(field: SettingField, draft: Draft): boolean {
  if (field.enabledBy === undefined) return true;
  if (draft[field.enabledBy] !== true) return false;
  const parent = FIELD_OWNING_KEY.get(field.enabledBy);
  return parent === undefined || parent === field || isEnabledBySettings(parent, draft);
}

export function sectionOfKey(key: string): string {
  return SECTION_OF_KEY.get(key) ?? 'advanced';
}

export function sectionsWithChanges(changes: Partial<RawPreferences>): Set<string> {
  return new Set(Object.keys(changes).map(sectionOfKey));
}

export function sectionsWithProblems(draft: Draft): Set<string> {
  return new Set(
    COMPOSITES.filter((composite) => (composite.problems?.(draft) ?? []).length > 0).flatMap(
      (composite) => composite.keys.map(sectionOfKey),
    ),
  );
}

export function settingLabel(key: string): string {
  return LABELS.get(key) ?? key;
}

function genericKeyScales(prefs: RawPreferences): Map<string, number | undefined> {
  const scales = new Map<string, number | undefined>();
  for (const field of [...SCHEMA_FIELDS, ...unrecognizedFields(prefs)]) {
    for (const key of fieldKeys(field)) {
      if (!COMPOSITE_KEYS.has(key))
        scales.set(key, key === field.key ? field.wireScale : undefined);
    }
  }
  return scales;
}

const copyValue = (value: unknown) =>
  typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value;

function fromWire(value: unknown, scale: number | undefined): unknown {
  if (scale && typeof value === 'number' && value > 0) return Math.round(value / scale);
  return copyValue(value);
}

function toWire(value: unknown, scale: number | undefined): unknown {
  if (scale && typeof value === 'number' && value > 0) return Math.round(value * scale);
  return copyValue(value);
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  return (
    aKeys.length === Object.keys(bRecord).length &&
    aKeys.every((key) => key in bRecord && sameValue(aRecord[key], bRecord[key]))
  );
}

export function fromPreferences(prefs: RawPreferences): Draft {
  const draft: Draft = {};
  for (const [key, scale] of genericKeyScales(prefs)) {
    if (key in prefs) draft[key] = fromWire(prefs[key], scale);
  }
  for (const composite of COMPOSITES) Object.assign(draft, composite.toDraft(prefs));
  return draft;
}

export function toPreferenceChanges(
  original: RawPreferences,
  draft: Draft,
  apiVersion: string | null,
): Partial<RawPreferences> {
  const before = fromPreferences(original);
  const out: Partial<RawPreferences> = {};
  const readonlyKeys = new Set(
    [...SCHEMA_FIELDS, ...unrecognizedFields(original)]
      .filter((field) => field.readonly)
      .map((field) => field.key),
  );
  for (const [key, scale] of genericKeyScales(original)) {
    if (readonlyKeys.has(key)) continue;
    if (key in original && !sameValue(draft[key], before[key])) {
      out[key] = toWire(draft[key], scale);
    }
  }
  for (const composite of COMPOSITES) {
    Object.assign(out, composite.toChanges(original, draft, apiVersion));
  }
  return out;
}

export function draftProblems(draft: Draft): string[] {
  return COMPOSITES.flatMap((composite) => composite.problems?.(draft) ?? []);
}

export interface DangerousChange {
  kind: DangerKind;
  labels: string[];
}

export function dangerousChanges(changes: Partial<RawPreferences>): DangerousChange[] {
  const labelsByKind = new Map<DangerKind, string[]>();
  for (const [key, wireValue] of Object.entries(changes)) {
    const field = FIELD_OWNING_KEY.get(key);
    if (!field?.danger || !(field.isDangerousValue?.(wireValue) ?? true)) continue;
    const labels = labelsByKind.get(field.danger) ?? [];
    labelsByKind.set(field.danger, [...labels, settingLabel(key)]);
  }
  return [...labelsByKind].map(([kind, labels]) => ({ kind, labels }));
}

/** qBittorrent silently ignores invalid values; these are the sent keys that didn't stick. */
export function unappliedKeys(sent: Partial<RawPreferences>, after: RawPreferences): string[] {
  return Object.keys(sent).filter((key) => key in after && !sameValue(sent[key], after[key]));
}
