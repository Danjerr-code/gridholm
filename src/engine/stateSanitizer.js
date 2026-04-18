/**
 * Sanitizes a raw game state object received from Supabase, guaranteeing that
 * all array fields exist and all required sub-structures are initialized.
 *
 * Call this at every Supabase read boundary before passing state to any engine
 * function or setting it as local React state. The engine assumes arrays exist
 * and should never need to guard against nulls internally.
 */
export function sanitizeGameState(state) {
  if (!state) return null;
  const s = { ...state };

  // Top-level arrays that must exist
  s.log = Array.isArray(s.log) ? s.log : [];
  s.units = Array.isArray(s.units) ? s.units : [];
  s.players = Array.isArray(s.players) ? s.players : [];
  s.champions = Array.isArray(s.champions) ? s.champions : [];
  s.activeModifiers = Array.isArray(s.activeModifiers) ? s.activeModifiers : [];
  s.graveyard = Array.isArray(s.graveyard) ? s.graveyard : [];
  // Player sub-arrays
  if (s.players.length > 0) {
    s.players = s.players.map(p => {
      if (!p) return p;
      return {
        ...p,
        hand: Array.isArray(p.hand) ? p.hand : [],
        deck: Array.isArray(p.deck) ? p.deck : [],
        grave: Array.isArray(p.grave) ? p.grave : [],
        banished: Array.isArray(p.banished) ? p.banished : [],
      };
    });
  }

  // Mulligan-specific: mulliganSelections should be a plain object keyed by player index.
  // Initialize if missing or if it arrived as an array (wrong type from serialization).
  if (!s.mulliganSelections || Array.isArray(s.mulliganSelections)) {
    s.mulliganSelections = { 0: null, 1: null };
  }

  // Unit counters: ensure poison is initialized to a number on every board unit.
  if (s.units.length > 0) {
    s.units = s.units.map(u => {
      if (u.poison == null) return { ...u, poison: 0 };
      return u;
    });
  }

  return s;
}
