import { useRef, useState, type PointerEvent } from 'react';
import { DEFAULT_WHEEL_POINT } from '../../../interactive/modes';
import styles from './setup.module.css';

export interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

interface Point {
  x: number;
  y: number;
}

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
 * 11.5 px ring marker (§ 6.6). The colour is read from the wheel's own
 * pixels, so the facade gets exactly the shade the user tapped.
 */
export const ColorPicker = ({ onChange }: ColorPickerProps) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const samplerRef = useRef<WheelSampler | null>(null);
  const [point, setPoint] = useState<Point>(DEFAULT_WHEEL_POINT);

  const pick = (next: Point) => {
    const color = samplerRef.current?.sample(next);
    if (!color) return;
    setPoint(next);
    onChange(color);
  };

  const handleLoad = (event: { currentTarget: HTMLImageElement }) => {
    const sampler = new WheelSampler(event.currentTarget);
    samplerRef.current = sampler;
    const color = sampler.sample(DEFAULT_WHEEL_POINT);
    if (color) onChange(color);
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
    pick({ x, y });
  };

  return (
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
      <span
        className={styles.marker}
        style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
};
