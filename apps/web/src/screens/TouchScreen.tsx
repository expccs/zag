import { useEffect } from 'react';
import type { PublicState } from '@zag/protocol';
import { BackLink } from '../components/BackLink';
import { BrandFooter } from '../components/BrandFooter';
import { LangSwitch } from '../components/LangSwitch';
import { ZagHeader } from '../components/ZagHeader';
import type { ConnectionStatus } from '../socket/socket-context';
import { useSocket } from '../socket/use-socket';
import { ConnectionLostView } from './touch/ConnectionLostView';
import { ModesView } from './touch/ModesView';
import { NoticeView } from './touch/NoticeView';
import { ScheduleView } from './touch/ScheduleView';
import styles from './touch-screen.module.css';

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

const renderView = (view: View) => {
  switch (view) {
    case 'lost':
      return <ConnectionLostView />;
    case 'schedule':
      return <ScheduleView />;
    case 'interactive':
      return <ModesView />;
    default:
      return <NoticeView kind={view} />;
  }
};

/**
 * Touch & Create: the only place the socket is opened. Connects on mount,
 * disconnects on unmount, and re-renders on every `state:update` so a
 * change on the server (e.g. a tech pause) replaces the screen at once.
 */
const TouchScreen = () => {
  const { status, error, state, connect, disconnect } = useSocket();

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  const view = resolveView(status, error, state);

  return (
    <main className={styles.screen} data-view={view}>
      <div className={styles.column}>
        <ZagHeader />
        <nav className={styles.nav}>
          <BackLink to="/mission" />
          <div className={styles.lang}>
            <LangSwitch size="home" />
          </div>
        </nav>
        <section className={styles.content} aria-live="polite">
          {renderView(view)}
        </section>
        <BrandFooter />
      </div>
    </main>
  );
};

export default TouchScreen;
