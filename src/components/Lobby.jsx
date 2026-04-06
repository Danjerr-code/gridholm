import { useState } from 'react';
import { supabase, getGuestId } from '../supabase.js';
import { createInitialState, autoAdvancePhase } from '../engine/gameEngine.js';

function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

const btnPrimary = {
  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
  color: '#0a0a0f',
  fontFamily: "'Cinzel', serif",
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  borderRadius: '4px',
  boxShadow: '0 2px 8px #C9A84C40',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '12px 24px',
  width: '100%',
  cursor: 'pointer',
};

const btnSecondary = {
  background: 'transparent',
  color: '#C9A84C',
  fontFamily: "'Cinzel', serif",
  fontSize: '13px',
  fontWeight: 500,
  border: '1px solid #C9A84C60',
  borderRadius: '4px',
  letterSpacing: '0.04em',
  padding: '8px 24px',
  width: '100%',
  cursor: 'pointer',
};

const btnCancel = {
  background: 'transparent',
  color: '#6a6a8a',
  fontFamily: "'Cinzel', serif",
  fontSize: '13px',
  border: '1px solid #2a2a3a',
  borderRadius: '4px',
  padding: '8px 24px',
  width: '100%',
  cursor: 'pointer',
};

export default function Lobby({ onNavigate }) {
  const [joinInput, setJoinInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [joinError, setJoinError] = useState(null);

  async function handleCreateGame() {
    if (!supabase) {
      setCreateError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
      return;
    }
    setCreating(true);
    setCreateError(null);

    const guestId = getGuestId();
    const gameId = generateGameId();

    // Generate a placeholder initial state to satisfy the NOT NULL constraint.
    // The real state is replaced by useMultiplayerGame.selectDeck once both
    // players have chosen their factions during the deck_select phase.
    const placeholderState = autoAdvancePhase(createInitialState('human', 'human'));
    if (!placeholderState) {
      setCreateError('Failed to generate initial game state.');
      setCreating(false);
      return;
    }

    const { error } = await supabase.from('game_sessions').insert({
      id: gameId,
      player1_id: guestId,
      game_state: placeholderState,
      active_player: guestId,
      status: 'waiting',
      player1_deck: null,
      player2_deck: null,
    });

    setCreating(false);

    if (error) {
      setCreateError('Failed to create game. Please try again.');
      return;
    }

    onNavigate(`/game/${gameId}`);
  }

  function handleJoinGame(e) {
    e.preventDefault();
    const id = joinInput.trim().toUpperCase();
    if (id.length !== 6) {
      setJoinError('Game ID must be 6 characters.');
      return;
    }
    setJoinError(null);
    onNavigate(`/game/${id}`);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '36px',
            fontWeight: 600,
            color: '#C9A84C',
            letterSpacing: '0.2em',
            marginBottom: '4px',
          }}>GRIDHOLM</h1>
          <p style={{
            fontFamily: "'Crimson Text', serif",
            fontStyle: 'italic',
            fontSize: '15px',
            color: '#4a4a6a',
          }}>A tactical card game</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button style={btnPrimary} onClick={() => onNavigate('/ai')}>
            Play vs AI
          </button>

          <button
            style={{ ...btnPrimary, opacity: creating ? 0.6 : 1 }}
            onClick={handleCreateGame}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create Online Game'}
          </button>
          {createError && (
            <p style={{ fontFamily: "'Crimson Text', serif", color: '#bf4a4a', fontSize: '13px', textAlign: 'center' }}>{createError}</p>
          )}

          <button style={btnCancel} onClick={() => onNavigate('/how-to-play')}>
            How to Play
          </button>

          <form onSubmit={handleJoinGame} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={{
                  flex: 1,
                  background: '#0d0d1a',
                  border: '1px solid #2a2a3a',
                  borderRadius: '4px',
                  padding: '12px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#C9A84C',
                  outline: 'none',
                }}
                placeholder="GAME ID"
                value={joinInput}
                onChange={e => setJoinInput(e.target.value.toUpperCase())}
                maxLength={6}
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button
                type="submit"
                style={{
                  background: 'transparent',
                  color: '#C9A84C',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                  border: '1px solid #C9A84C60',
                  borderRadius: '4px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Join
              </button>
            </div>
            {joinError && (
              <p style={{ fontFamily: "'Crimson Text', serif", color: '#bf4a4a', fontSize: '13px' }}>{joinError}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
