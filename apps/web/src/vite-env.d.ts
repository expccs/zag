/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Socket.IO server origin; empty string = same origin. */
  readonly VITE_SOCKET_URL: string;
  /** Git SHA injected by CI; 'dev' locally. */
  readonly VITE_APP_VERSION: string;
  /** 'true' lifts the phone-only gate (local development on a desktop). */
  readonly VITE_ANY_DEVICE?: string;
}
