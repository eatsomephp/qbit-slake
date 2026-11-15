export const DETAILS_PANEL_ID = 'details-panel';
export const TORRENT_TABLE_ID = 'torrent-table';

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** A dialog or menu has its own keyboard handling; stay out of its way. */
export function overlayOpen(ignoring: Element | null = null): boolean {
  return [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu]')].some(
    (overlay) => overlay !== ignoring,
  );
}
