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
 * «Малювання» landscape `29:2078` / `47:5934`: the monochrome facade photo
 * (Figma `CROP` window of the 4032 × 2268 source, pre-cropped in
 * `public/facade-bw.jpg`) fills the whole stage like `Rectangle 5`, the
 * black bars with the logos and the timer badge lie over it. Touches on
 * the band between the bars stream to the server (and so to the facade)
 * and leave a local trail in the mode's colours.
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
      <img
        className={styles.facadeImage}
        src="/facade-bw.jpg"
        alt=""
        width={1600}
        height={825}
        draggable={false}
      />
      <LandscapeBar layout="drawing">
        <span className={styles.badge} role="timer" aria-live="off">
          {messages.touch.drawing.timer}: {formatClock(seconds)}
        </span>
      </LandscapeBar>
      <div ref={surfaceRef} className={styles.facade}>
        <TrailCanvas ref={trailRef} request={request} />
      </div>
      <footer className={styles.bottom} />
    </main>
  );
};
