import { useRef } from 'react';
import type { SessionRequest, TouchEvent } from '@zag/protocol';
import { formatClock, useSecondsUntil } from '../../../hooks/use-seconds-until';
import { useLanguage } from '../../../i18n/use-language';
import { LandscapeBar } from './LandscapeBar';
import { TrailCanvas, type TrailHandle } from './TrailCanvas';
import { useTouchStream } from './use-touch-stream';
import styles from './landscape.module.css';

export interface DrawingViewProps {
  sessionId: string;
  request: SessionRequest;
  endsAt: number;
  onTouch: (event: TouchEvent) => void;
}

/**
 * «Малювання» landscape `29:2078` / `47:5943`: black bars with the logos and
 * the timer badge, the monochrome facade photo in between. Touches on the
 * photo stream to the server (and so to the facade) and leave a local
 * trail in the mode's colours so the user sees what they draw.
 */
export const DrawingView = ({ request, endsAt, onTouch }: DrawingViewProps) => {
  const { messages } = useLanguage();
  const seconds = useSecondsUntil(endsAt);
  const trailRef = useRef<TrailHandle>(null);
  const surfaceRef = useTouchStream((event) => {
    onTouch(event);
    trailRef.current?.push(event);
  });
  return (
    <main className={`${styles.stage} ${styles.drawingStage}`}>
      <LandscapeBar layout="drawing">
        <span className={styles.badge} role="timer" aria-live="off">
          {messages.touch.drawing.timer}: {formatClock(seconds)}
        </span>
      </LandscapeBar>
      <div ref={surfaceRef} className={styles.facade}>
        <img
          className={styles.facadeImage}
          src="/facade-bw.jpg"
          alt=""
          width={1600}
          height={900}
          draggable={false}
        />
        <TrailCanvas ref={trailRef} request={request} />
      </div>
      <footer className={styles.bottom} />
    </main>
  );
};
