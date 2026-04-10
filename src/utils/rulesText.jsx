/**
 * Render rules text with pipe-delimiter support.
 * Cards with multiple distinct abilities use `|` to separate them.
 * Returns a plain string when there is only one segment.
 */
export function renderRules(rules) {
  if (!rules) return null;
  const segments = rules.split('|');
  if (segments.length === 1) return segments[0];
  return segments.map((seg, i) => (
    <div key={i} style={i > 0 ? { marginTop: '4px' } : {}}>{seg}</div>
  ));
}

/**
 * Plain-text version of rules for title/tooltip attributes.
 * Replaces pipe delimiters with ` · ` so they read naturally.
 */
export function rulesTitle(rules) {
  if (!rules) return '';
  return rules.replace(/\|/g, ' · ');
}
