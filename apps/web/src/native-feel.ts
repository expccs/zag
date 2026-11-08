/**
 * Browser gestures a native app does not have. CSS (`global.css`) and the
 * viewport meta cover most of it; this closes the gaps iOS Safari leaves
 * open in a regular tab, where `user-scalable=no` is ignored:
 * pinch zoom (`gesturestart` / multi-touch `touchmove`) and the long-press
 * context menu on touch devices.
 */
const NOT_PASSIVE = { passive: false } as const;

const prevent = (event: Event) => {
  event.preventDefault();
};

const preventPinch = (event: TouchEvent) => {
  if (event.touches.length > 1) event.preventDefault();
};

export const installNativeFeel = (target: Document = document) => {
  target.addEventListener('gesturestart', prevent, NOT_PASSIVE);
  target.addEventListener('gesturechange', prevent, NOT_PASSIVE);
  target.addEventListener('touchmove', preventPinch, NOT_PASSIVE);
  if (window.matchMedia('(pointer: coarse)').matches) {
    target.addEventListener('contextmenu', prevent);
  }
};
