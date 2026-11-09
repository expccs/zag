import { useSecondsUntil } from '../../../hooks/use-seconds-until';
import { useLanguage } from '../../../i18n/use-language';
import { TouchChrome } from '../TouchChrome';
import styles from './session.module.css';

export interface QueueViewProps {
  /** Local timestamp when the user's own session starts. */
  turnAt: number;
  onLeave: () => void;
}

/** «Зачекайте будь-ласка!» `34:2820` / `47:3825`: h3, body, ring + seconds. */
export const QueueView = ({ turnAt, onLeave }: QueueViewProps) => {
  const { messages } = useLanguage();
  const seconds = useSecondsUntil(turnAt);
  const { title, body } = messages.touch.queue;
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
