import { ref } from 'vue';

/** Phone-only overlays; not persisted, so a reload starts on the list. */
export const mobileSidebarOpen = ref(false);
export const mobileDetailsOpen = ref(false);
