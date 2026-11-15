import type { IProvider } from './IProvider';
import { MockProvider } from './MockProvider';
import { QbitProvider } from './QbitProvider';

export type { IProvider } from './IProvider';
export { QbtHttpError, describeQbtError, UNAUTHORIZED_EVENT, NETWORK_ERROR_EVENT } from './http';

export const isMock = import.meta.env.MODE === 'demo' || import.meta.env.VITE_USE_MOCK === 'true';

const qbit: IProvider = isMock ? new MockProvider() : new QbitProvider();
export default qbit;
