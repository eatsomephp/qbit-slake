import { onScopeDispose, ref } from 'vue';
import { isTorrentFile } from './parse';
import { openAdd } from './addState';

function carriesTorrents(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return (
    dt.types.includes('Files') ||
    dt.types.includes('text/uri-list') ||
    dt.types.includes('text/plain')
  );
}

/**
 * Drag-and-drop anywhere in the window: .torrent files, magnet links and URLs
 * open the add dialog. `active` drives the drop overlay.
 */
export function useWindowDrop() {
  const active = ref(false);
  let depth = 0;

  function onEnter(e: DragEvent) {
    if (!carriesTorrents(e.dataTransfer)) return;
    e.preventDefault();
    depth++;
    active.value = true;
  }

  function onOver(e: DragEvent) {
    if (!carriesTorrents(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
  }

  function onLeave() {
    depth = Math.max(0, depth - 1);
    if (depth === 0) active.value = false;
  }

  function onDrop(e: DragEvent) {
    depth = 0;
    active.value = false;
    const dt = e.dataTransfer;
    if (!carriesTorrents(dt)) return;
    e.preventDefault();
    const files = [...(dt!.files ?? [])].filter(isTorrentFile);
    const text = files.length ? '' : dt!.getData('text/uri-list') || dt!.getData('text/plain');
    if (files.length || text.trim()) openAdd({ files, text: text.trim() });
  }

  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragover', onOver);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('drop', onDrop);
  onScopeDispose(() => {
    window.removeEventListener('dragenter', onEnter);
    window.removeEventListener('dragover', onOver);
    window.removeEventListener('dragleave', onLeave);
    window.removeEventListener('drop', onDrop);
  });

  return { active, onDrop };
}
