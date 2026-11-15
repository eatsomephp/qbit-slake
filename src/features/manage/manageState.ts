import { shallowRef } from 'vue';
import type { Keymap } from '@/shortcuts/engine';

/** The one management dialog that is open, if any. */
export type ManageRequest =
  | { kind: 'category'; edit?: string; parent?: string; applyTo?: string[] }
  | { kind: 'tags'; applyTo?: string[] }
  | { kind: 'location'; hashes: string[] }
  | { kind: 'downloadPath'; hashes: string[] }
  | { kind: 'enableAutoTmm'; hashes: string[] }
  | { kind: 'rename'; hash: string }
  | { kind: 'comment'; hashes: string[] }
  | { kind: 'replaceTracker'; hashes: string[]; find?: string }
  | { kind: 'speedLimits'; hashes: string[] }
  | { kind: 'shareLimits'; hashes: string[] }
  | { kind: 'removeCategory'; name: string }
  | { kind: 'deleteTag'; name: string }
  | { kind: 'shortcuts'; keymaps: readonly Keymap[] }
  | { kind: 'statistics' }
  | { kind: 'trackerStatistics' }
  | { kind: 'saveView' }
  | { kind: 'renameView'; id: string };

export const manage = shallowRef<ManageRequest | null>(null);

export function openManage(request: ManageRequest) {
  manage.value = request;
}

export function closeManage() {
  manage.value = null;
}
