import { LangSwitch } from '../../../components/LangSwitch';
import { useSecondsUntil } from '../../../hooks/use-seconds-until';
import { useLanguage } from '../../../i18n/use-language';
import { LandscapeBar } from './LandscapeBar';
import styles from './landscape.module.css';

export interface CountdownViewProps {
  startsAt: number;
}

/** «Відлік» landscape `31:2523` / `84:3543`: logos, title, the big digit. */
export const CountdownView = ({ startsAt }: CountdownViewProps) => {
  const { messages } = useLanguage();
  const seconds = useSecondsUntil(startsAt);
  return (
    <main className={`${styles.stage} ${styles.countdownStage}`}>
      <LandscapeBar layout="countdown" />
      <p className={styles.countdownTitle}>
        {messages.touch.fade.titleLandscape}
      </p>
      <p className={styles.digit} role="timer" aria-live="off">
        {seconds}
      </p>
      <div className={styles.lang}>
        <LangSwitch size="screen" layout="row" />
      </div>
    </main>
  );
};
