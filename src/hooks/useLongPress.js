import { useRef, useCallback } from 'react';

/**
 * Fires callback after pointer has been held for `delay` ms.
 * Returns event handler props to spread onto the target element.
 *
 * firedRef.current is true from the moment the long-press fires until
 * the next click event, so callers can suppress the click in onClick.
 */
export default function useLongPress(callback, delay = 400) {
  const timerRef = useRef(null);
  const firedRef = useRef(false);

  const onPointerDown = useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      callback();
    }, delay);
  }, [callback, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onPointerDown,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    firedRef,
  };
}
