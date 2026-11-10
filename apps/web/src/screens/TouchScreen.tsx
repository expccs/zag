import { useEffect } from 'react';
import { Outlet } from 'react-router';
import type { PublicState } from '@zag/protocol';
import type { ConnectionStatus } from '../socket/socket-context';
import { useSocket } from '../socket/use-socket';
import { ConnectionLostView } from './touch/ConnectionLostView';
import { NoticeView } from './touch/NoticeView';
import { ScheduleView } from './touch/ScheduleView';
import { TouchChrome } from './touch/TouchChrome';

type View = 'connecting' | 'lost' | PublicState['screen'];

/**
 * Connection first, server state second: a dropped socket shows «Зв'язок
 * втрачено» whatever the last state was; a live socket shows the screen
 * the server resolved from the CCS flags (shared-modules.md § 3).
 */
const resolveView = (
  status: ConnectionStatus,
  error: string | null,
  state: PublicState | null,
): View => {
  if (status === 'offline') return 'lost';
  if (status !== 'connected') return error ? 'lost' : 'connecting';
  return state ? state.screen : 'connecting';
};

const renderNotice = (view: Exclude<View, 'interactive'>) => {
  switch (view) {
    case 'lost':
      return <ConnectionLostView />;
    case 'schedule':
      return <ScheduleView />;
    default:
      return <NoticeView kind={view} />;
  }
};

/**
 * Touch & Create: the only place the socket is opened. Connects on mount,
 * disconnects on unmount, and re-renders on every `state:update` so a
 * change on the server (e.g. a tech pause) replaces the screen at once.
 * While the screen is `interactive` the nested routes (modes →
 * instructions → setup → session; with a sole enabled mode `/touch`
 * redirects to its instructions) render through the outlet; otherwise the
 * notice replaces them. The session store survives a notice (a short
 * connection loss keeps the place in the queue) and is forgotten only when
 * the user leaves Touch & Create.
 */
const TouchScreen = () => {
  const { status, error, state, session, connect, disconnect } = useSocket();

  useEffect(() => {
    connect();
    return () => {
      session.reset();
      disconnect();
    };
  }, [connect, disconnect, session]);

  const view = resolveView(status, error, state);
  if (view === 'interactive') return <Outlet />;
  return <TouchChrome back="/mission">{renderNotice(view)}</TouchChrome>;
};

export default TouchScreen;
