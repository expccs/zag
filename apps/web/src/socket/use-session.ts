import { useSyncExternalStore } from 'react';
import type { SessionPhase, SessionStore } from './session-store';
import { useSocket } from './use-socket';

export interface SessionValue {
  phase: SessionPhase;
  session: SessionStore;
}

/** The user's turn (queue / fade / drawing / ended) and its actions. */
export const useSession = (): SessionValue => {
  const { session } = useSocket();
  const phase = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { phase, session };
};
