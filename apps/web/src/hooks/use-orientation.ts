import { useSyncExternalStore } from 'react';

export type Orientation = 'portrait' | 'landscape';

const QUERY = '(orientation: landscape)';

const subscribe = (listener: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};

const getSnapshot = (): Orientation =>
  window.matchMedia(QUERY).matches ? 'landscape' : 'portrait';

const getServerSnapshot = (): Orientation => 'portrait';

/** Live screen orientation; the countdown and drawing screens are landscape. */
export const useOrientation = (): Orientation =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
