import type { RawPreferences } from '@/types/qbit';

export type Draft = Record<string, unknown>;

export type FieldKind =
  | 'bool'
  | 'int'
  | 'float'
  | 'text'
  | 'path'
  | 'file'
  | 'secret'
  | 'multiline'
  | 'select'
  | 'time'
  | 'scanDirs'
  | 'newPassword'
  | 'apiKey'
  | 'networkInterface'
  | 'json';

export type DangerKind = 'lockout' | 'reconnect' | 'auth' | 'access';

export interface SelectOption {
  value: string | number | boolean;
  label: string;
}

export interface UnitSelect {
  key: string;
  options: SelectOption[];
}

export interface SettingField {
  key: string;
  label: string;
  hint?: string;
  kind: FieldKind;
  unit?: string;
  wireScale?: number;
  min?: number;
  max?: number;
  step?: string;
  options?: SelectOption[];
  inlineToggle?: string;
  inlineToggleLabel?: string;
  unitSelect?: UnitSelect;
  minuteKey?: string;
  confirmKey?: string;
  addressKey?: string;
  addressLabel?: string;
  presenceKey?: string;
  danger?: DangerKind;
  isDangerousValue?: (wireValue: unknown) => boolean;
  enabledBy?: string;
  visibleWhen?: (draft: Draft) => boolean;
  readonly?: boolean;
  showFreeSpace?: boolean;
}

export interface SettingGroup {
  title?: string;
  hint?: string;
  fields: SettingField[];
}

export interface SettingSection {
  id: string;
  title: string;
  warning?: string;
  groups: SettingGroup[];
}

export interface CompositeEncoder {
  keys: readonly string[];
  toDraft(prefs: RawPreferences): Draft;
  toChanges(
    original: RawPreferences,
    draft: Draft,
    apiVersion: string | null,
  ): Partial<RawPreferences>;
  problems?(draft: Draft): string[];
}

export function fieldKeys(
  field: Pick<
    SettingField,
    'key' | 'inlineToggle' | 'unitSelect' | 'minuteKey' | 'confirmKey' | 'addressKey'
  >,
): string[] {
  const keys = [field.key];
  if (field.inlineToggle) keys.push(field.inlineToggle);
  if (field.unitSelect) keys.push(field.unitSelect.key);
  if (field.minuteKey) keys.push(field.minuteKey);
  if (field.confirmKey) keys.push(field.confirmKey);
  if (field.addressKey) keys.push(field.addressKey);
  return keys;
}
