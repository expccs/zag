import { useLanguage } from '../../../i18n/use-language';
import { TouchChrome } from '../TouchChrome';
import styles from './session.module.css';

export interface RotateViewProps {
  /** Pill text: «Поверніть телефон», «Початок через N» or the timer. */
  title: string;
  onLeave: () => void;
}

/**
 * Portrait prompt `89:1852` / `89:1915`: a pill with the current status,
 * the rotate-phone drawing and the swipe hint. Shown whenever the phone
 * is held upright during a turn: before the request goes out, in the
 * queue, during the fade and while the session runs.
 */
export const RotateView = ({ title, onLeave }: RotateViewProps) => {
  const { messages } = useLanguage();
  const { fade } = messages.touch;
  return (
    <TouchChrome back={onLeave}>
      <div className={styles.rotate}>
        <p className={styles.rotateTitle} role="timer" aria-live="off">
          {title}
        </p>
        <img
          className={styles.rotateIcon}
          src="/icons/rotate-phone.png"
          alt=""
          width={400}
          height={378}
        />
        <p className={styles.rotateBody}>{fade.rotate}</p>
        <img
          className={styles.swipeIcon}
          src="/icons/swipe-hand.png"
          alt=""
          width={512}
          height={512}
        />
        <p className={styles.rotateBody}>{fade.hint}</p>
      </div>
    </TouchChrome>
  );
};
