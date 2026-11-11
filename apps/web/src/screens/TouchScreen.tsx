import { useEffect } from 'react';
import { Outlet } from 'react-router';
import type { PublicState } from '@zag/protocol';
import type { GeoStatus } from '../socket/geo-store';
import type { SessionPhase } from '../socket/session-store';
import type { ConnectionStatus } from '../socket/socket-context';
import { useGeo } from '../socket/use-geo';
import { useSession } from '../socket/use-session';
import { useSocket } from '../socket/use-socket';
import { ConnectionLostView } from './touch/ConnectionLostView';
import { GeoNoticeView } from './touch/GeoNoticeView';
import { NoticeView } from './touch/NoticeView';
import { ScheduleView } from './touch/ScheduleView';
import { TouchChrome } from './touch/TouchChrome';

type View = 'connecting' | 'lost' | 'geo' | PublicState['screen'];

const isLive = (phase: SessionPhase): boolean =>
  phase.phase === 'queued' ||
  phase.phase === 'fade' ||
  phase.phase === 'active';

/**
 * Connection first, server state second, location third: a dropped
 * socket shows «Зв'язок втрачено» whatever the last state was; a live
 * socket shows the screen the server resolved from the CCS flags
 * (shared-modules.md § 3); on `interactive` a failed location check
 * replaces the flow — unless the turn is already running: the server
 * holds the place, and GPS jitter must not throw the user out of it.
 */
const resolveView = (
  status: ConnectionStatus,
  error: string | null,
  state: PublicState | null,
  geo: GeoStatus,
  phase: SessionPhase,
): View => {
  if (status === 'offline') return 'lost';
  if (status !== 'connected') return error ? 'lost' : 'connecting';
  if (!state) return 'connecting';
  if (state.screen !== 'interactive') return state.screen;
  if (geo.status === 'blocked' && !isLive(phase)) return 'geo';
  return 'interactive';
};

const renderNotice = (view: Exclude<View, 'interactive'>, geo: GeoStatus) => {
  switch (view) {
    case 'lost':
      return <ConnectionLostView />;
    case 'schedule':
      return <ScheduleView />;
    case 'geo':
      return (
        <GeoNoticeView
          block={geo.status === 'blocked' ? geo.block : 'missing'}
        />
      );
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
 * the user leaves Touch & Create. The location watch runs only while the
 * server's `locationRestriction` flag is on: with it off the browser
 * never asks for the permission.
 */
const TouchScreen = () => {
  const { status, error, state, session, connect, disconnect } = useSocket();
  const { geo, geoStore } = useGeo();
  const { phase } = useSession();
  const restricted = state?.flags.locationRestriction === true;

  useEffect(() => {
    connect();
    return () => {
      session.reset();
      disconnect();
    };
  }, [connect, disconnect, session]);

  useEffect(() => {
    if (restricted) geoStore.start();
    return restricted ? geoStore.stop : undefined;
  }, [restricted, geoStore]);

  const view = resolveView(status, error, state, geo, phase);
  if (view === 'interactive') return <Outlet />;
  return <TouchChrome back="/mission">{renderNotice(view, geo)}</TouchChrome>;
};

export default TouchScreen;
