import { LangSwitch } from '../../../components/LangSwitch';
import { useSecondsUntil } from '../../../hooks/use-seconds-until';
import { useLanguage } from '../../../i18n/use-language';
import { TouchChrome } from '../TouchChrome';
import { LandscapeBar } from './LandscapeBar';
import landscape from './landscape.module.css';
import styles from './session.module.css';

export interface QueueViewProps {
  /** Local timestamp when the user's own session starts. */
  turnAt: number;
  onLeave: () => void;
  /** The phone is already turned when the queue is joined. */
  orientation: 'portrait' | 'landscape';
}

/**
 * «Зачекайте будь-ласка!» `34:2820` / `47:3825`: h3, body, ring + seconds.
 * The request is sent from landscape, so the queue is mostly seen in the
 * landscape chrome of `31:2523` (no Figma frame; same type and ring,
 * smaller); upright it is the portrait frame.
 */
export const QueueView = ({ turnAt, onLeave, orientation }: QueueViewProps) => {
  const { messages } = useLanguage();
  const seconds = useSecondsUntil(turnAt);
  const { title, body } = messages.touch.queue;
  if (orientation === 'landscape') {
    return (
      <main className={`${landscape.stage} ${landscape.countdownStage}`}>
        <LandscapeBar layout="countdown" />
        <div className={landscape.queue}>
          <div className={landscape.queueText}>
            <h1 className={styles.queueTitle}>{title}</h1>
            <p className={styles.queueBody}>{body}</p>
          </div>
          <div
            className={`${styles.ring} ${landscape.ring}`}
            role="timer"
            aria-live="off"
          >
            <span className={`${styles.ringNumber} ${landscape.ringNumber}`}>
              {seconds}
            </span>
          </div>
        </div>
        <div className={landscape.lang}>
          <LangSwitch size="screen" layout="row" />
        </div>
      </main>
    );
  }
  return (
    <TouchChrome back={onLeave}>
      <div className={styles.queue}>
        <h1 className={styles.queueTitle}>{title}</h1>
        <p className={styles.queueBody}>{body}</p>
        <div className={styles.ring} role="timer" aria-live="off">
          <span className={styles.ringNumber}>{seconds}</span>
        </div>
      </div>
    </TouchChrome>
  );
};
