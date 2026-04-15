import { useRef, useLayoutEffect } from 'react';

/**
 * Renders children in a single non-wrapping line, reducing font size from
 * maxFontSize down to minFontSize (default 10px) until the text fits the
 * container width. Uses direct DOM mutation in useLayoutEffect so there is no
 * visible flicker on first paint.
 */
export function AutoSizeText({ maxFontSize, minFontSize = 10, style, className, children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = maxFontSize;
    el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth && size > minFontSize) {
      size--;
      el.style.fontSize = size + 'px';
    }
  });

  return (
    <span
      ref={ref}
      className={className}
      style={{
        ...style,
        fontSize: maxFontSize + 'px',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
