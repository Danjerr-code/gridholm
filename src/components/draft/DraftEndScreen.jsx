import { clearDraftRun } from '../../draft/draftRunState.js';

const screen = {
  minHeight: '100vh',
  background: '#0a0a0f',
  color: '#f9fafb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
};

const heading = {
  fontFamily: "'Cinzel', serif",
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

const btnCancel = {
  background: 'transparent',
  color: '#6a6a8a',
  fontFamily: "'Cinzel', serif",
  fontSize: 13,
  border: '1px solid #2a2a3a',
  borderRadius: 4,
  padding: '10px 24px',
  cursor: 'pointer',
};

export default function DraftEndScreen({ runState, onDraftAgain, onBackToLobby }) {
  const { wins, losses } = runState;
  const totalGames = wins + losses;

  function handleDraftAgain() {
    clearDraftRun();
    onDraftAgain();
  }

  const isGoodRun = wins >= 7;
  const resultLabel = isGoodRun ? 'LEGENDARY RUN' : wins >= 4 ? 'SOLID RUN' : wins >= 2 ? 'DECENT RUN' : 'FALLEN';

  return (
    <div style={screen}>
      <div style={{ maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 28, textAlign: 'center' }}>
        <div>
          <h2 style={{ ...heading, fontSize: 26, color: '#C9A84C', marginBottom: 6 }}>{resultLabel}</h2>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#9a9ab0', fontSize: 15 }}>
            Your gauntlet run has ended
          </p>
        </div>

        {/* Final record */}
        <div style={{ background: '#0d0d1a', border: '1px solid #2a2a3a', borderRadius: 8, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 32, color: '#4ade80' }}>{wins}W</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 32, color: '#6a6a8a' }}>–</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 32, color: '#f87171' }}>{losses}L</span>
          </div>
          <p style={{ fontFamily: "'Crimson Text', serif", color: '#6a6a8a', fontSize: 13 }}>
            {totalGames} game{totalGames !== 1 ? 's' : ''} played
          </p>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={btnPrimary} onClick={handleDraftAgain}>
            Draft Again
          </button>
          <button style={btnCancel} onClick={onBackToLobby}>
            ← Back to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
