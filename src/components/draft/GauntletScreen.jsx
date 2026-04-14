import { CARD_DB } from '../../engine/cards.js';
import { ATTRIBUTES } from '../../engine/attributes.js';
import { getRandomFactions } from '../../draft/draftPool.js';
import { generateAIDeck } from '../../draft/aiDrafter.js';
import { saveDraftRun } from '../../draft/draftRunState.js';

const FACTION_STYLE = {
  light:  { label: 'Light' },
  primal: { label: 'Primal' },
  mystic: { label: 'Mystic' },
  dark:   { label: 'Dark' },
};

const MAX_LOSSES = 3;

// ── Difficulty mapping by wins ────────────────────────────────────────────────
function getDifficulty(wins) {
  if (wins === 0) return 0;
  if (wins <= 2) return 2;
  if (wins <= 4) return 4;
  if (wins <= 6) return 6;
  return 8;
}

// ── Shared styles ────────────────────────────────────────────────────────────
const screen = {
  minHeight: '100vh',
  background: '#0a0a0f',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '16px',
  overflowY: 'auto',
};

const heading = {
  fontFamily: "'Cinzel', serif",
  color: '#C9A84C',
  letterSpacing: '0.15em',
};

const btnPrimary = {
  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
  color: '#0a0a0f',
  fontFamily: "'Cinzel', serif",
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  borderRadius: 4,
  padding: '12px 24px',
  cursor: 'pointer',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

// ── Component ────────────────────────────────────────────────────────────────
export default function GauntletScreen({ runState, onLaunchGame, onRunComplete }) {
  const { wins, losses, deck, legendaryIds, primaryFaction, secondaryFaction } = runState;
  const sortedDeck = getSortedDeck(deck);

  function handleNextGame() {
    const difficulty = getDifficulty(wins);
    const [aiFaction1, aiFaction2] = getRandomFactions(2);
    const aiDeckIds = generateAIDeck(
      aiFaction1,
      aiFaction2,
      legendaryIds.length,
      difficulty,
      legendaryIds
    );

    // Encode both decks as JSON deck specs for the game engine
    const playerSpec = JSON.stringify({
      type: 'custom',
      cards: deck,
      primaryAttr: primaryFaction,
    });
    const aiSpec = JSON.stringify({
      type: 'custom',
      cards: aiDeckIds,
      primaryAttr: aiFaction1,
    });

    onLaunchGame(playerSpec, aiSpec);
  }

  return (
    <div style={screen}>
      <div style={{ maxWidth: 480, width: '100%', display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 32 }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ ...heading, fontSize: 22, marginBottom: 4 }}>GAUNTLET</h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 14 }}>
            {FACTION_STYLE[primaryFaction]?.label} / {FACTION_STYLE[secondaryFaction]?.label}
          </p>
        </div>

        {/* Record */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: '#4ade80' }}>{wins}W</span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: '#6a6a8a' }}>–</span>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: '#f87171' }}>{losses}L</span>
        </div>

        {/* Lives */}
        <div>
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', marginBottom: 8 }}>LIVES REMAINING</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: MAX_LOSSES }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: i < (MAX_LOSSES - losses) ? '#ef4444' : 'transparent',
                  border: '2px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                }}
              >
                {i < (MAX_LOSSES - losses) ? '♥' : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Next game button */}
        <button style={btnPrimary} onClick={handleNextGame}>
          Next Game →
        </button>

        {/* Deck list */}
        <div>
          <p style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#6a6a8a', letterSpacing: '0.08em', marginBottom: 8 }}>
            YOUR DECK (30 cards)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 320, overflowY: 'auto', border: '1px solid #1a1a2a', borderRadius: 4, padding: '4px 8px' }}>
            {sortedDeck.map((card, i) => (
              <DeckListRow key={i} card={card} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeckListRow({ card }) {
  const attrColor = card.attribute ? (ATTRIBUTES[card.attribute]?.color ?? '#6a6a8a') : '#6a6a8a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #1a1a2a' }}>
      <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#C9A84C', minWidth: 18, textAlign: 'right' }}>{card.cost}</span>
      <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#e8e8f0', flex: 1 }}>
        {card.legendary && <span style={{ color: '#C9A84C', marginRight: 3 }}>♛</span>}
        {card.name}
      </span>
      <span style={{ fontSize: 9, color: attrColor, fontFamily: "'Cinzel', serif", textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {card.type}
      </span>
    </div>
  );
}

function getSortedDeck(ids) {
  return ids
    .map(id => CARD_DB[id])
    .filter(Boolean)
    .sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
}
