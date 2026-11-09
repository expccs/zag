import { useCallback, useEffect, useRef } from 'react';
import type { TouchEvent } from '@zag/protocol';

const MOVE_INTERVAL_MS = 33;

interface Stroke {
  pointerId: number;
  lastSentAt: number;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Pointer events of the drawing surface → `touch:event` stream (protocol
 * § 4): unit coordinates inside the surface with the origin bottom-left,
 * `touch: 1` while the finger is
 * down (moves throttled to ~30/s), one `touch: 0` on release. One finger
 * at a time, like the facade.
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
    // Protocol § 4: unit coordinates with the origin in the bottom-left
    // corner (TouchDesigner UV), so `y` grows upwards unlike the DOM.
    const toUnit = (event: PointerEvent) => {
      const rect = surface.getBoundingClientRect();
      return {
        x: clamp((event.clientX - rect.left) / rect.width),
        y: clamp(1 - (event.clientY - rect.top) / rect.height),
      };
    };

    const emit = (event: PointerEvent, touch: 0 | 1) => {
      const { x, y } = toUnit(event);
      sendRef.current({ x, y, touch });
    };

    const down = (event: PointerEvent) => {
      if (strokeRef.current) return;
      event.preventDefault();
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events carry no capturable pointer; drawing still works.
      }
      strokeRef.current = {
        pointerId: event.pointerId,
        lastSentAt: Date.now(),
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
      emit(event, 0);
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
