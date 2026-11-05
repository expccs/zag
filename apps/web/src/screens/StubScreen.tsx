import { useSocket } from '../socket/use-socket';
import type { ConnectionStatus } from '../socket/socket-context';
import styles from './stub-screen.module.css';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Очікування',
  connecting: 'Підключення…',
  connected: 'Підключено',
  offline: "Зв'язок втрачено",
};

const version = import.meta.env.VITE_APP_VERSION || 'dev';

const header = (
  <header className={styles.header}>
    <img className={styles.logo} src="/zag-header.svg" alt="ZAG" />
  </header>
);

const footer = (
  <footer className={styles.footer}>
    <img src="/expolight.png" width={127} height={35} alt="Expolight" />
    <img src="/kabluka.png" width={82} height={23} alt="Kabluka" />
  </footer>
);

export const StubScreen = () => {
  const { status, error } = useSocket();
  const label =
    status === 'connecting' && error
      ? `${STATUS_LABEL[status]} ${error}`
      : STATUS_LABEL[status];

  return (
    <main className={styles.screen}>
      <div className={styles.column}>
        {header}
        <section className={styles.hero}>
          <h1 className={styles.title}>Створюй світлом</h1>
          <div
            className={`glass-pill ${styles.status} ${styles[status]}`}
            role="status"
            aria-live="polite"
          >
            <span className={styles.dot} aria-hidden="true" />
            {label}
          </div>
        </section>
        {footer}
        <p className={styles.version}>{version.slice(0, 7)}</p>
      </div>
    </main>
  );
};
