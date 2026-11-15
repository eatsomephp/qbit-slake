import { advanced } from './advanced';
import { behavior } from './behavior';
import { bittorrent } from './bittorrent';
import { connection } from './connection';
import { downloads } from './downloads';
import { rss } from './rss';
import { speed } from './speed';
import type { SettingSection } from './types';
import { webui } from './webui';

export { COMPOSITES } from './composites';
export type * from './types';
export { fieldKeys } from './types';
export { DANGER_CONSEQUENCES } from './webui';

export const SECTIONS: readonly SettingSection[] = [
  behavior,
  downloads,
  connection,
  speed,
  bittorrent,
  rss,
  webui,
  advanced,
];

export const NOT_RENDERED: Readonly<Record<string, string>> = {
  locale: 'This UI is English only for now.',
  current_interface_name: 'Read-only; shown as the label of the network interface field.',
  random_port: 'Deprecated alias for listen_port 0, which the listening port field covers.',
};
