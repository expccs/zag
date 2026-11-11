import { useSyncExternalStore } from 'react';
import type { GeoStatus, GeoStore } from './geo-store';
import { useSocket } from './use-socket';

export interface GeoValue {
  geo: GeoStatus;
  geoStore: GeoStore;
}

/** The location verdict and the watch controls. */
export const useGeo = (): GeoValue => {
  const { geoStore } = useSocket();
  const geo = useSyncExternalStore(geoStore.subscribe, geoStore.getSnapshot);
  return { geo, geoStore };
};
