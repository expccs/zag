import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { SessionRequest, TouchEvent } from '@zag/protocol';
import { BRUSH_WIDTHS, PALETTES } from '../../../interactive/modes';
import styles from './landscape.module.css';

export interface TrailHandle {
  push: (event: TouchEvent) => void;
}

export interface TrailCanvasProps {
  ref: Ref<TrailHandle>;
  request: SessionRequest;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  points: Point[];
}

const FADE_PER_FRAME = 0.02;
const COMET_WIDTH = 7;
const PALETTE_WIDTH = 9;
const PALETTE_STROKES_KEPT = 2;

const randomHue = (): string =>
  `hsl(${Math.floor(Math.random() * 360)} 100% 65%)`;

const paramNumber = (request: SessionRequest, key: string): number => {
  const value = request.params[key];
  return typeof value === 'number' ? value : 0;
};

/**
 * Local echo of the stroke in the mode's colours (shared-modules.md § 4:
 * no server preview, the client draws for itself). Comet and Milky Way
 * fade out over a couple of seconds like the facade; Palette keeps the
 * last two strokes and cycles the palette, as the instructions describe.
 */
class TrailRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly request: SessionRequest;
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;
  private frame = 0;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, request: SessionRequest) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2d canvas is unavailable');
    this.context = context;
    this.request = request;
  }

  get fades(): boolean {
    return this.request.mode !== 'palette';
  }

  resize(width: number, height: number, scale: number): void {
    const { canvas } = this.context;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    this.width = width;
    this.height = height;
    if (!this.fades) this.redraw();
  }

  push(event: TouchEvent): void {
    // Protocol `y` grows upwards (origin bottom-left); the canvas does not.
    const point = { x: event.x * this.width, y: (1 - event.y) * this.height };
    if (!this.current) this.begin(point);
    const stroke = this.current as Stroke;
    const previous = stroke.points.at(-1) ?? point;
    stroke.points.push(point);
    if (this.request.mode === 'milky-way') stroke.color = randomHue();
    this.segment(previous, point, stroke.color);
    if (event.touch === 0) this.current = null;
  }

  start(): void {
    if (!this.fades) return;
    const tick = () => {
      this.context.globalCompositeOperation = 'destination-out';
      this.context.fillStyle = `rgba(0, 0, 0, ${FADE_PER_FRAME})`;
      this.context.fillRect(0, 0, this.width, this.height);
      this.context.globalCompositeOperation = 'source-over';
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  private get lineWidth(): number {
    switch (this.request.mode) {
      case 'comet':
        return COMET_WIDTH;
      case 'milky-way':
        return BRUSH_WIDTHS[paramNumber(this.request, 'width')]?.linePx ?? 11;
      default:
        return PALETTE_WIDTH;
    }
  }

  private begin(point: Point): void {
    const stroke: Stroke = { color: this.nextColor(), points: [point] };
    this.current = stroke;
    this.strokes.push(stroke);
    if (!this.fades && this.strokes.length > PALETTE_STROKES_KEPT) {
      this.strokes = this.strokes.slice(-PALETTE_STROKES_KEPT);
      this.redraw();
    }
  }

  private nextColor(): string {
    const { mode, params } = this.request;
    if (mode === 'comet') {
      return typeof params.color === 'string' ? params.color : '#FF4848';
    }
    if (mode === 'milky-way') return randomHue();
    const palette =
      PALETTES[paramNumber(this.request, 'palette')] ?? PALETTES[0];
    return palette[this.strokes.length % palette.length];
  }

  private segment(from: Point, to: Point, color: string): void {
    const { context } = this;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = this.lineWidth;
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = this.request.mode === 'comet' ? 14 : 6;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  private redraw(): void {
    this.context.clearRect(0, 0, this.width, this.height);
    for (const stroke of this.strokes) {
      for (let i = 1; i < stroke.points.length; i++) {
        this.segment(stroke.points[i - 1], stroke.points[i], stroke.color);
      }
    }
  }
}

/** Canvas over the facade photo; `push` draws, nothing re-renders React. */
export const TrailCanvas = ({ ref, request }: TrailCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TrailRenderer | null>(null);

  useImperativeHandle(ref, () => ({
    push: (event) => rendererRef.current?.push(event),
  }));

  useEffect(() => {
    // The canvas is always mounted with this effect.
    const canvas = canvasRef.current as HTMLCanvasElement;
    const renderer = new TrailRenderer(canvas, request);
    rendererRef.current = renderer;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      renderer.resize(width, height, Math.min(2, window.devicePixelRatio));
    });
    observer.observe(canvas);
    renderer.start();
    return () => {
      renderer.stop();
      observer.disconnect();
      rendererRef.current = null;
    };
  }, [request]);

  return <canvas ref={canvasRef} className={styles.trail} aria-hidden="true" />;
};
