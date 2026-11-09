import { useSyncExternalStore } from 'react';

const remainingSeconds = (targetAt: number): number =>
  Math.max(0, Math.ceil((targetAt - Date.now()) / 1000));

// Fires right after each second boundary of the countdown, so the number
// changes exactly once a second instead of on an unrelated interval.
const subscribeTo = (targetAt: number) => (listener: () => void) => {
  let timer = 0;
  const schedule = () => {
    const left = targetAt - Date.now();
    if (left <= 0) return;
    const toBoundary = ((left % 1000) + 1000) % 1000 || 1000;
    timer = window.setTimeout(() => {
      listener();
      schedule();
    }, toBoundary + 10);
  };
  schedule();
  return () => window.clearTimeout(timer);
};

type Subscribe = (listener: () => void) => () => void;

const subscribers = new Map<number, Subscribe>();

const subscriberFor = (targetAt: number) => {
  let subscribe = subscribers.get(targetAt);
  if (!subscribe) {
    subscribe = subscribeTo(targetAt);
    subscribers.set(targetAt, subscribe);
  }
  return subscribe;
};

/** Whole seconds left until `targetAt` (a `Date.now()` timestamp), live. */
export const useSecondsUntil = (targetAt: number): number =>
  useSyncExternalStore(
    subscriberFor(targetAt),
    () => remainingSeconds(targetAt),
    () => remainingSeconds(targetAt),
  );

export const formatClock = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};
