import { formatClock, useSecondsUntil } from '../../../hooks/use-seconds-until';
import { useLanguage } from '../../../i18n/use-language';
import type { SessionPhase } from '../../../socket/session-store';
import { TouchChrome } from '../TouchChrome';
import styles from './session.module.css';

export interface RotateViewProps {
  phase: Extract<SessionPhase, { phase: 'fade' | 'active' }>;
  onLeave: () => void;
}

/**
 * «Початок через» in portrait `89:1852` / `89:1915`: the countdown of the
 * fade, the rotate-phone drawing and the swipe hint. While the session
 * already runs the pill shows the remaining time instead.
 */
export const RotateView = ({ phase, onLeave }: RotateViewProps) => {
  const { messages } = useLanguage();
  const targetAt = phase.phase === 'fade' ? phase.startsAt : phase.endsAt;
  const seconds = useSecondsUntil(targetAt);
  const { fade, drawing } = messages.touch;
  const title =
    phase.phase === 'fade'
      ? `${fade.title} ${seconds}`
      : `${drawing.timer}: ${formatClock(seconds)}`;
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
