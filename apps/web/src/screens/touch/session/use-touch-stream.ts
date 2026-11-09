import { useCallback, useEffect, useRef } from 'react';
import type { SwipeDirection, TouchEvent } from '@zag/protocol';

const MOVE_INTERVAL_MS = 33;
const SWIPE_MIN_DX = 0.15;
const SWIPE_MAX_MS = 600;

interface Stroke {
  pointerId: number;
  startX: number;
  startedAt: number;
  lastSentAt: number;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const swipeOf = (stroke: Stroke, x: number): SwipeDirection => {
  if (Date.now() - stroke.startedAt > SWIPE_MAX_MS) return 'none';
  const dx = x - stroke.startX;
  if (Math.abs(dx) < SWIPE_MIN_DX) return 'none';
  return dx < 0 ? 'left' : 'right';
};

/**
 * Pointer events of the drawing surface → `touch:event` stream (protocol
 * § 4): unit coordinates inside the surface, `touch: 1` while the finger is
 * down (moves throttled to ~30/s), one `touch: 0` on release that also
 * reports a quick horizontal swipe. One finger at a time, like the facade.
 * Returns a callback ref for the surface element.
 */
export const useTouchStream = (send: (event: TouchEvent) => void) => {
  const sendRef = useRef(send);
  const strokeRef = useRef<Stroke | null>(null);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // React 19 ref callback: the returned function runs when the element
  // goes away, so the listeners live exactly as long as the surface.
  return useCallback((surface: HTMLDivElement) => {
    const toUnit = (event: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      return {
        x: clamp((event.clientX - rect.left) / rect.width),
        y: clamp((event.clientY - rect.top) / rect.height),
      };
    };

    const emit = (
      event: PointerEvent,
      touch: 0 | 1,
      direction: SwipeDirection = 'none',
    ) => {
      const { x, y } = toUnit(event);
      const swipe: 0 | 1 = direction === 'none' ? 0 : 1;
      sendRef.current({ x, y, touch, swipe, direction });
    };

    const down = (event: PointerEvent) => {
      if (strokeRef.current) return;
      event.preventDefault();
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events carry no capturable pointer; drawing still works.
      }
      const now = Date.now();
      strokeRef.current = {
        pointerId: event.pointerId,
        startX: toUnit(event).x,
        startedAt: now,
        lastSentAt: now,
      };
      emit(event, 1);
    };

    const move = (event: PointerEvent) => {
      const stroke = strokeRef.current;
      if (!stroke || stroke.pointerId !== event.pointerId) return;
      const now = Date.now();
      if (now - stroke.lastSentAt < MOVE_INTERVAL_MS) return;
      stroke.lastSentAt = now;
      emit(event, 1);
    };

    const up = (event: PointerEvent) => {
      const stroke = strokeRef.current;
      if (!stroke || stroke.pointerId !== event.pointerId) return;
      strokeRef.current = null;
      emit(event, 0, swipeOf(stroke, toUnit(event).x));
    };

    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    return () => {
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', up);
      surface.removeEventListener('pointercancel', up);
      strokeRef.current = null;
    };
  }, []);
};
