export const ATTRIBUTES = {
  light: {
    name: 'Light',
    color: '#F0E6D2',
    friendly: ['primal', 'mystic'],
    enemy: ['dark'],
  },
  primal: {
    name: 'Primal',
    color: '#22C55E',
    friendly: ['light', 'dark'],
    enemy: ['mystic'],
  },
  mystic: {
    name: 'Mystic',
    color: '#A855F7',
    friendly: ['dark', 'light'],
    enemy: ['primal'],
  },
  dark: {
    name: 'Dark',
    color: '#EF4444',
    friendly: ['primal', 'mystic'],
    enemy: ['light'],
  },
  neutral: {
    name: 'Neutral',
    color: '#9CA3AF',
    friendly: [],
    enemy: [],
  },
}

export const RESONANCE_VALUES = {
  primary: 2,
  friendly: 1,
  enemy: -1,
  neutral: 0,
}

export const RESONANCE_THRESHOLDS = {
  attuned: 30,
  ascended: 45,
}

export function calculateResonance(deck, primaryAttribute) {
  const raw = deck.reduce((total, card) => {
    if (card.attribute === primaryAttribute) return total + RESONANCE_VALUES.primary
    if (ATTRIBUTES[primaryAttribute].friendly.includes(card.attribute)) return total + RESONANCE_VALUES.friendly
    if (ATTRIBUTES[primaryAttribute].enemy.includes(card.attribute)) return total + RESONANCE_VALUES.enemy
    return total + RESONANCE_VALUES.neutral
  }, 0)
  return Math.max(0, raw)
}
