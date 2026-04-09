export const KEYWORD_REMINDERS = {
  rush: {
    label: 'Rush',
    reminder: 'This unit may move the turn it is summoned.',
    color: '#22C55E', // green
  },
  hidden: {
    label: 'Hidden',
    reminder: 'Moves unseen. Revealed when an enemy enters its tile, or by player choice.',
    color: '#8B5CF6', // purple
  },
  action: {
    label: 'Action',
    reminder: 'Use instead of moving this unit. Click the Action button when this unit is selected.',
    color: '#F97316', // orange
  },
  aura: {
    label: 'Aura',
    reminder: 'Passive bonus to nearby units. Calculated at combat time. Range shown as Aura 1 or Aura 2.',
    color: '#F0E6D2', // ivory
  },
  legendary: {
    label: 'Legendary',
    reminder: 'A powerful unique card. Only one copy allowed per deck.',
    color: '#EAB308', // gold
  },
  terrain: {
    label: 'Terrain',
    reminder: 'End your turn with your champion here to deal 4 damage to the enemy champion. This effect cannot reduce the enemy champion below 1 HP.',
    color: '#92400E', // amber brown
  },
  stunned: {
    label: 'Stunned',
    reminder: 'This unit cannot move or use Action abilities this turn.',
    color: '#D97706', // amber
  },
  rooted: {
    label: 'Rooted',
    reminder: 'This unit cannot move this turn. It can still use Action abilities and fight.',
    color: '#4D7C4D', // muted green
  },
}
