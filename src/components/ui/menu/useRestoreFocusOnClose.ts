/**
 * Reka returns focus to the trigger button on close, and the shortcut engine leaves Space to a
 * focused button, so a menu opened by a shortcut would leave the leader key dead after Esc.
 */
export function useRestoreFocusOnClose() {
  const focusedBeforeOpen = document.activeElement;

  return function restoreFocus(event: Event) {
    event.preventDefault();
    if (focusedBeforeOpen instanceof HTMLElement && focusedBeforeOpen.isConnected)
      focusedBeforeOpen.focus({ preventScroll: true });
  };
}
