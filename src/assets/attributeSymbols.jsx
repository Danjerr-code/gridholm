/**
 * Attribute gem symbols — PNG images replacing previous hand-crafted SVG crystals.
 * Each component accepts a `size` prop (default 24). Scales from 16 to 64.
 *
 * LightSymbol  — gem-light.png
 * PrimalSymbol — gem-primal.png
 * MysticSymbol — gem-mystic.png
 * DarkSymbol   — gem-dark.png
 *
 * All components are wrapped in React.memo to prevent unnecessary re-renders.
 */

import { memo } from 'react';

function LightSymbolInner({ size = 24 }) {
  return (
    <img src="/gem-light.png" width={size} height={size} alt="Light" style={{ display: 'inline-block', objectFit: 'contain' }} />
  );
}

export const LightSymbol = memo(LightSymbolInner);

function PrimalSymbolInner({ size = 24 }) {
  return (
    <img src="/gem-primal.png" width={size} height={size} alt="Primal" style={{ display: 'inline-block', objectFit: 'contain' }} />
  );
}

export const PrimalSymbol = memo(PrimalSymbolInner);

function MysticSymbolInner({ size = 24 }) {
  return (
    <img src="/gem-mystic.png" width={size} height={size} alt="Mystic" style={{ display: 'inline-block', objectFit: 'contain' }} />
  );
}

export const MysticSymbol = memo(MysticSymbolInner);

function DarkSymbolInner({ size = 24 }) {
  return (
    <img src="/gem-dark.png" width={size} height={size} alt="Dark" style={{ display: 'inline-block', objectFit: 'contain' }} />
  );
}

export const DarkSymbol = memo(DarkSymbolInner);

/**
 * Convenience map: attribute key → gem component.
 * Usage: const Sym = ATTR_SYMBOLS['mystic']; <Sym size={20} />
 */
export const ATTR_SYMBOLS = {
  light:  LightSymbol,
  primal: PrimalSymbol,
  mystic: MysticSymbol,
  dark:   DarkSymbol,
};
