/**
 * cardThreatRatings.js
 *
 * Hand-curated threat ratings for all named cards.
 *
 * allyValue  — how valuable this unit is to its owner (1–10)
 * threatValue — how dangerous this unit is to the opponent (1–10)
 *
 * Scale:
 *   10 = game-defining, must protect/remove immediately
 *   7–9 = high priority
 *   4–6 = medium priority, contextual
 *   1–3 = low priority, ignorable
 *
 * Cards not listed fall back to: allyValue = ceil(cost * 0.8), threatValue = ceil(cost * 0.7)
 */

export const THREAT_RATINGS = {
  // ── Legendaries ─────────────────────────────────────────────────────────────
  azulonsilvertide:       { allyValue: 10, threatValue: 10 },
  yggararootmother:       { allyValue: 10, threatValue:  9 },
  razorfangalpha:         { allyValue:  9, threatValue: 10 },
  lucernunbrokenvow:      { allyValue:  9, threatValue:  8 },
  aendortheancient:       { allyValue:  9, threatValue:  9 },
  korraksecondfang:       { allyValue:  8, threatValue:  9 },
  vornthundercaller:      { allyValue:  8, threatValue:  8 },
  sistersiofrafirstprayer:{ allyValue:  8, threatValue:  7 },
  nezzartermsandconditions:{ allyValue: 8, threatValue:  7 },
  gavrieholystride:       { allyValue:  8, threatValue:  8 },
  fennwickthequiet:       { allyValue:  7, threatValue:  6 },
  vexishollowking:        { allyValue:  8, threatValue:  8 },
  namelessdealer:         { allyValue:  6, threatValue:  5 },
  waddlestrustedaide:     { allyValue:  6, threatValue:  5 },
  zmoreasleepingash:      { allyValue:  7, threatValue:  8 },
  clockworkmanimus:       { allyValue:  7, threatValue:  7 },
  theironqueen:           { allyValue:  8, threatValue:  8 },

  // ── High-value non-legendaries ───────────────────────────────────────────────
  moonveilmystic:         { allyValue:  8, threatValue:  9 },
  wardlightcolossus:      { allyValue:  7, threatValue:  8 },
  cascadesage:            { allyValue:  7, threatValue:  7 },
  rootsongcommander:      { allyValue:  7, threatValue:  7 },
  lifebinder:             { allyValue:  7, threatValue:  6 },
  canopysentinel:         { allyValue:  6, threatValue:  6 },
  peacekeeper:            { allyValue:  7, threatValue:  7 },
  inkdrinker:             { allyValue:  7, threatValue:  6 },
  shimmerguardian:        { allyValue:  6, threatValue:  5 },
  kragorsbehemoth:        { allyValue:  7, threatValue:  8 },
  stormcrestdrake:        { allyValue:  7, threatValue:  8 },
  gravecaller:            { allyValue:  6, threatValue:  6 },
  gravedfedhorror:        { allyValue:  6, threatValue:  7 },
  oathkeepparagon:        { allyValue:  6, threatValue:  6 },
  grindgearcolossus:      { allyValue:  7, threatValue:  7 },

  // ── Low-value explicit overrides ─────────────────────────────────────────────
  sapling:                { allyValue:  1, threatValue:  1 },
  spiteling:              { allyValue:  2, threatValue:  2 },
  imp:                    { allyValue:  2, threatValue:  2 },

  // ── New base-set cards (batch: set completion) ────────────────────────────
  armourer:               { allyValue:  3, threatValue:  2 },
  rayslinger:             { allyValue:  4, threatValue:  4 },
  shieldbearer:           { allyValue:  5, threatValue:  5 },
  ashclaw:                { allyValue:  3, threatValue:  2 },
  drumhide:               { allyValue:  4, threatValue:  3 },
  recklesscharger:        { allyValue:  5, threatValue:  4 },
  manasprite:             { allyValue:  3, threatValue:  2 },
  spellkeeper:            { allyValue:  3, threatValue:  3 },
  dryadtrickster:         { allyValue:  5, threatValue:  5 },
  veilseer:               { allyValue:  3, threatValue:  2 },
  hollowoffering:         { allyValue:  3, threatValue:  2 },
  hexcrawler:             { allyValue:  5, threatValue:  5 },
  nullherald:             { allyValue:  4, threatValue:  4 },
};

/**
 * Returns the threat rating for a card.
 *
 * @param {string} cardId     - the card's id (e.g. 'moonveilmystic')
 * @param {string} perspective - 'ally' or 'threat'
 * @param {number} [cost]     - the card's mana cost, used for fallback formula
 * @returns {number}            rating on 1–10 scale
 */
export function getCardRating(cardId, perspective, cost = 4) {
  const entry = THREAT_RATINGS[cardId];
  if (entry) {
    return perspective === 'ally' ? entry.allyValue : entry.threatValue;
  }
  // Fallback: cost-based formula
  if (perspective === 'ally')   return Math.ceil(cost * 0.8);
  /* threat */                  return Math.ceil(cost * 0.7);
}
