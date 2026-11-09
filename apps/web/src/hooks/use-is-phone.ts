import { useSyncExternalStore } from 'react';

/**
 * A phone: touch as the primary pointer and a short side of at most 500
 * CSS px, in either orientation. Tablets (short side ≥ 600) and desktops
 * (fine pointer) fail the test. `VITE_ANY_DEVICE=true` lifts the gate for
 * local development.
 */
const PHONE_QUERY =
  '(pointer: coarse) and (max-width: 500px), ' +
  '(pointer: coarse) and (max-height: 500px)';

const anyDevice = import.meta.env.VITE_ANY_DEVICE === 'true';

const subscribe = (listener: () => void) => {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};

const getSnapshot = (): boolean =>
  anyDevice || window.matchMedia(PHONE_QUERY).matches;

const getServerSnapshot = (): boolean => true;

export const useIsPhone = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
