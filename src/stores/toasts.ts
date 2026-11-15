import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface ToastAction {
  label: string;
  run: () => void;
  isUndo?: boolean;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  message: string;
  action?: ToastAction;
}

export const UNDO_KEYS = 'u';

const TIMEOUT_MS = { info: 3000, error: 8000 };
const TIMEOUT_WITH_ACTION_MS = 8000;

export const useToastsStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([]);
  let nextId = 1;

  function push(kind: Toast['kind'], message: string, action?: ToastAction) {
    const id = nextId++;
    toasts.value.push({ id, kind, message, action });
    setTimeout(() => dismiss(id), action ? TIMEOUT_WITH_ACTION_MS : TIMEOUT_MS[kind]);
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function runAction(toast: Toast) {
    dismiss(toast.id);
    toast.action?.run();
  }

  const latestUndoable = () => toasts.value.findLast((t) => t.action?.isUndo);

  function undoLatest() {
    const toast = latestUndoable();
    if (toast) runAction(toast);
  }

  return {
    toasts,
    info: (message: string, action?: ToastAction) => push('info', message, action),
    undoable: (message: string, undo: () => void) =>
      push('info', message, { label: 'Undo', run: undo, isUndo: true }),
    error: (message: string) => push('error', message),
    dismiss,
    runAction,
    canUndo: () => latestUndoable() !== undefined,
    undoLatest,
  };
});
