/**
 * Attribute crystal symbols — hand-crafted medieval gem icons.
 * Each component accepts a `size` prop (default 24). Scales from 16 to 64.
 *
 * LightSymbol  — round faceted gem,    pale gold  #C9A84C, crown
 * PrimalSymbol — rectangular emerald,  deep green #22C55E, claw marks
 * MysticSymbol — tall pointed shard,   purple     #A855F7, crescent moon
 * DarkSymbol   — narrow double-point,  deep red   #EF4444, single eye
 */

export function LightSymbol({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="light-inner" cx="50%" cy="38%" r="52%">
          <stop offset="0%" stopColor="#FFF3C4" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#C9A84C" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#7A5C1A" stopOpacity="0.08" />
        </radialGradient>
      </defs>

      {/* Octagonal crystal body */}
      <path
        d="M8,2 L16,2 L22,8 L22,16 L16,22 L8,22 L2,16 L2,8 Z"
        fill="url(#light-inner)"
        stroke="#C9A84C"
        strokeWidth="1.4"
        strokeLinejoin="miter"
      />

      {/* Top-centre facet lines (meeting at apex point) */}
      <line x1="8"  y1="2"  x2="12" y2="8"  stroke="#EDD882" strokeWidth="0.8" strokeOpacity="0.75" />
      <line x1="16" y1="2"  x2="12" y2="8"  stroke="#EDD882" strokeWidth="0.8" strokeOpacity="0.75" />
      {/* Side facets */}
      <line x1="22" y1="8"  x2="15" y2="12" stroke="#C9A84C" strokeWidth="0.7" strokeOpacity="0.55" />
      <line x1="2"  y1="8"  x2="9"  y2="12" stroke="#C9A84C" strokeWidth="0.7" strokeOpacity="0.55" />
      {/* Bottom facets */}
      <line x1="9"  y1="12" x2="8"  y2="22" stroke="#9A7020" strokeWidth="0.7" strokeOpacity="0.50" />
      <line x1="15" y1="12" x2="16" y2="22" stroke="#9A7020" strokeWidth="0.7" strokeOpacity="0.50" />
      {/* Horizontal girdle */}
      <line x1="2"  y1="12" x2="22" y2="12" stroke="#C9A84C" strokeWidth="0.6" strokeOpacity="0.30" />

      {/* Crown — 3-point silhouette centred at 12,13 */}
      <path
        d="M8,17 L8,14.5 L10,11.5 L10.5,13.5 L12,10 L13.5,13.5 L14,11.5 L16,14.5 L16,17 Z"
        fill="#C9A84C"
        stroke="#8B6010"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PrimalSymbol({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="primal-inner" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#BBFAD4" stopOpacity="0.90" />
          <stop offset="55%" stopColor="#22C55E" stopOpacity="0.50" />
          <stop offset="100%" stopColor="#064E25" stopOpacity="0.08" />
        </radialGradient>
      </defs>

      {/* Rectangular emerald-cut body with clipped corners */}
      <path
        d="M6,2 L18,2 L22,6 L22,18 L18,22 L6,22 L2,18 L2,6 Z"
        fill="url(#primal-inner)"
        stroke="#22C55E"
        strokeWidth="1.4"
        strokeLinejoin="miter"
      />

      {/* Horizontal table facets (emerald-cut style) */}
      <line x1="6"  y1="2"  x2="6"  y2="6"  stroke="#4ADE80" strokeWidth="0.8" strokeOpacity="0.70" />
      <line x1="18" y1="2"  x2="18" y2="6"  stroke="#4ADE80" strokeWidth="0.8" strokeOpacity="0.70" />
      <line x1="2"  y1="6"  x2="22" y2="6"  stroke="#4ADE80" strokeWidth="0.8" strokeOpacity="0.65" />
      <line x1="2"  y1="18" x2="22" y2="18" stroke="#166534" strokeWidth="0.8" strokeOpacity="0.55" />
      <line x1="6"  y1="22" x2="6"  y2="18" stroke="#166534" strokeWidth="0.7" strokeOpacity="0.50" />
      <line x1="18" y1="22" x2="18" y2="18" stroke="#166534" strokeWidth="0.7" strokeOpacity="0.50" />
      {/* Centre vertical step */}
      <line x1="12" y1="6"  x2="12" y2="18" stroke="#22C55E" strokeWidth="0.6" strokeOpacity="0.30" />

      {/* Three claw slashes — parallel diagonal marks */}
      <line x1="8"  y1="8"  x2="11" y2="16" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.95" />
      <line x1="11" y1="8"  x2="14" y2="16" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.95" />
      <line x1="14" y1="8"  x2="17" y2="16" stroke="#22C55E" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.95" />
    </svg>
  );
}

export function MysticSymbol({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mystic-inner" cx="50%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#F0CFFF" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#A855F7" stopOpacity="0.50" />
          <stop offset="100%" stopColor="#3B0764" stopOpacity="0.08" />
        </radialGradient>
      </defs>

      {/* Tall pointed shard — narrow kite/amethyst shape */}
      <path
        d="M12,1 L19,9 L17,22 L7,22 L5,9 Z"
        fill="url(#mystic-inner)"
        stroke="#A855F7"
        strokeWidth="1.4"
        strokeLinejoin="miter"
      />

      {/* Facet lines from tip down both shoulders */}
      <line x1="12" y1="1"  x2="8"  y2="9"  stroke="#D8B4FE" strokeWidth="0.9" strokeOpacity="0.80" />
      <line x1="12" y1="1"  x2="16" y2="9"  stroke="#D8B4FE" strokeWidth="0.9" strokeOpacity="0.80" />
      {/* Horizontal step */}
      <line x1="5"  y1="9"  x2="19" y2="9"  stroke="#A855F7" strokeWidth="0.7" strokeOpacity="0.55" />
      {/* Side facets toward base corners */}
      <line x1="8"  y1="9"  x2="7"  y2="22" stroke="#7E22CE" strokeWidth="0.7" strokeOpacity="0.50" />
      <line x1="16" y1="9"  x2="17" y2="22" stroke="#7E22CE" strokeWidth="0.7" strokeOpacity="0.50" />
      {/* Centre vertical axis */}
      <line x1="12" y1="9"  x2="12" y2="22" stroke="#A855F7" strokeWidth="0.6" strokeOpacity="0.28" />

      {/* Crescent moon — outer arc, inner arc cut-out approximated via two filled paths */}
      {/* Outer circle approximation centred at 12,15.5 r=3.5 */}
      <path
        d="M13.5,12.2 A3.5,3.5 0 1,0 13.5,18.8 A2.2,2.2 0 1,1 13.5,12.2 Z"
        fill="#A855F7"
        stroke="#7E22CE"
        strokeWidth="0.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DarkSymbol({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="dark-inner" cx="50%" cy="45%" r="52%">
          <stop offset="0%" stopColor="#FFBBBB" stopOpacity="0.90" />
          <stop offset="55%" stopColor="#EF4444" stopOpacity="0.50" />
          <stop offset="100%" stopColor="#450A0A" stopOpacity="0.08" />
        </radialGradient>
      </defs>

      {/* Narrow double-pointed crystal (elongated hexagon) */}
      <path
        d="M12,1 L18,9 L18,15 L12,23 L6,15 L6,9 Z"
        fill="url(#dark-inner)"
        stroke="#EF4444"
        strokeWidth="1.4"
        strokeLinejoin="miter"
      />

      {/* Top-tip facets */}
      <line x1="12" y1="1"  x2="9"  y2="9"  stroke="#FCA5A5" strokeWidth="0.9" strokeOpacity="0.75" />
      <line x1="12" y1="1"  x2="15" y2="9"  stroke="#FCA5A5" strokeWidth="0.9" strokeOpacity="0.75" />
      {/* Horizontal girdle */}
      <line x1="6"  y1="9"  x2="18" y2="9"  stroke="#EF4444" strokeWidth="0.7" strokeOpacity="0.50" />
      <line x1="6"  y1="15" x2="18" y2="15" stroke="#B91C1C" strokeWidth="0.7" strokeOpacity="0.50" />
      {/* Bottom-tip facets */}
      <line x1="9"  y1="15" x2="12" y2="23" stroke="#B91C1C" strokeWidth="0.8" strokeOpacity="0.65" />
      <line x1="15" y1="15" x2="12" y2="23" stroke="#B91C1C" strokeWidth="0.8" strokeOpacity="0.65" />
      {/* Centre vertical */}
      <line x1="12" y1="9"  x2="12" y2="15" stroke="#EF4444" strokeWidth="0.6" strokeOpacity="0.28" />

      {/* Eye — almond outline with pupil */}
      <path
        d="M7,12 Q12,8 17,12 Q12,16 7,12 Z"
        fill="none"
        stroke="#EF4444"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2" fill="#EF4444" />
      <circle cx="12" cy="12" r="1" fill="#7F1D1D" />
    </svg>
  );
}

/**
 * Convenience map: attribute key → crystal component.
 * Usage: const Sym = ATTR_SYMBOLS['mystic']; <Sym size={20} />
 */
export const ATTR_SYMBOLS = {
  light:  LightSymbol,
  primal: PrimalSymbol,
  mystic: MysticSymbol,
  dark:   DarkSymbol,
};
