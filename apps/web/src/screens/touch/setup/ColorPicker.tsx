import { useRef, useState, type PointerEvent } from 'react';
import { useLanguage } from '../../../i18n/use-language';
import {
  DEFAULT_WHEEL_POINTS,
  type CometColors,
  type CometPart,
} from '../../../interactive/modes';
import styles from './setup.module.css';

export interface ColorPickerProps {
  colors: CometColors;
  onChange: (colors: CometColors) => void;
}

interface Point {
  x: number;
  y: number;
}

type Points = Record<CometPart, Point>;

const PARTS: readonly CometPart[] = ['head', 'tail'];
const WHEEL_SRC = '/color-wheel.png';
const SAMPLE_SIZE = 300;

const toHex = (channel: number): string =>
  channel.toString(16).padStart(2, '0').toUpperCase();

/** Draws the wheel once on an offscreen canvas and reads colours from it. */
class WheelSampler {
  private context: CanvasRenderingContext2D | null = null;

  constructor(image: HTMLImageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    this.context = context;
  }

  /** Hex colour at a unit point, or null outside the painted wheel. */
  sample(point: Point): string | null {
    if (!this.context) return null;
    const x = Math.min(SAMPLE_SIZE - 1, Math.floor(point.x * SAMPLE_SIZE));
    const y = Math.min(SAMPLE_SIZE - 1, Math.floor(point.y * SAMPLE_SIZE));
    const [r, g, b, a] = this.context.getImageData(x, y, 1, 1).data;
    if (a < 128) return null;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}

/**
 * Colour wheel of `31:2237` (298 × 298, `images/color-wheel.png`) with the
 * 11.5 px ring marker (§ 6.6), extended for the comet's two colours: the
 * glass pills above the wheel choose which part (head or tail) the next
 * touch colours; both markers stay on the wheel, the active one solid.
 * Colours are read from the wheel's own pixels, so the facade gets exactly
 * the shade the user tapped.
 */
export const ColorPicker = ({ colors, onChange }: ColorPickerProps) => {
  const { messages } = useLanguage();
  const wheelRef = useRef<HTMLDivElement>(null);
  const samplerRef = useRef<WheelSampler | null>(null);
  const [active, setActive] = useState<CometPart>('head');
  const [points, setPoints] = useState<Points>(DEFAULT_WHEEL_POINTS);

  const pick = (part: CometPart, point: Point, next: CometColors) => {
    const color = samplerRef.current?.sample(point);
    if (!color) return next;
    setPoints((current) => ({ ...current, [part]: point }));
    return { ...next, [part]: color };
  };

  const handleLoad = (event: { currentTarget: HTMLImageElement }) => {
    samplerRef.current = new WheelSampler(event.currentTarget);
    let next = colors;
    for (const part of PARTS) {
      next = pick(part, DEFAULT_WHEEL_POINTS[part], next);
    }
    onChange(next);
  };

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointermove' && event.buttons === 0) return;
    const wheel = wheelRef.current;
    if (!wheel) return;
    const rect = wheel.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    if (event.type === 'pointerdown') wheel.setPointerCapture(event.pointerId);
    const next = pick(active, { x, y }, colors);
    if (next !== colors) onChange(next);
  };

  return (
    <>
      <div className={styles.parts} role="radiogroup">
        {PARTS.map((part) => (
          <button
            key={part}
            type="button"
            role="radio"
            aria-checked={part === active}
            className={`glass-pill ${styles.part}`}
            onClick={() => setActive(part)}
          >
            <span
              className={styles.swatch}
              style={{ background: colors[part] }}
              aria-hidden="true"
            />
            {messages.touch.setup[part]}
          </button>
        ))}
      </div>
      <div
        ref={wheelRef}
        className={styles.wheel}
        onPointerDown={handlePointer}
        onPointerMove={handlePointer}
      >
        <img
          className={styles.wheelImage}
          src={WHEEL_SRC}
          alt=""
          width={600}
          height={600}
          onLoad={handleLoad}
        />
        {PARTS.map((part) => (
          <span
            key={part}
            className={`${styles.marker} ${part === active ? '' : styles.markerIdle}`}
            style={{
              left: `${points[part].x * 100}%`,
              top: `${points[part].y * 100}%`,
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    </>
  );
};
