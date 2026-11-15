/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_QBT_TARGET?: string;
  readonly VITE_USE_MOCK?: string;
  readonly VITE_FAKE_TORRENTS?: string;
  readonly VITE_APP_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
