import { useState, useEffect, useRef } from 'react';
import { supabase, getGuestId } from '../supabase.js';
import { createInitialState, autoAdvancePhase } from '../engine/gameEngine.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import SignInModal from './SignInModal.jsx';
import SignUpModal from './SignUpModal.jsx';

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
  transition: 'box-shadow 150ms ease, transform 150ms ease, filter 150ms ease',
};

const btnSilver = {
  background: 'linear-gradient(135deg, #8A8A8A, #C0C0C0)',
  color: '#0a0a0f',
  fontFamily: "'Cinzel', serif",
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  borderRadius: '4px',
  boxShadow: '0 2px 8px #C0C0C040',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '12px 24px',
  width: '100%',
  cursor: 'pointer',
  transition: 'box-shadow 150ms ease, transform 150ms ease, filter 150ms ease',
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
  transition: 'box-shadow 150ms ease, transform 150ms ease, filter 150ms ease',
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
  transition: 'box-shadow 150ms ease, transform 150ms ease, filter 150ms ease',
};

const lobbyHoverStyles = `
  .lobby-btn-primary:hover {
    box-shadow: 0 0 14px 4px #C9A84C80 !important;
    transform: translateY(1px);
    filter: brightness(0.92);
  }
  .lobby-btn-silver:hover {
    box-shadow: 0 0 14px 4px #C0C0C080 !important;
    transform: translateY(1px);
    filter: brightness(0.92);
  }
  .lobby-btn-muted:hover {
    box-shadow: 0 0 10px 3px #C9A84C30 !important;
    transform: translateY(1px);
    filter: brightness(0.92);
  }
`;

export default function Lobby({ onNavigate, playMode, onModeSelect }) {
  const [joinInput, setJoinInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [authModal, setAuthModal] = useState(null); // 'signin' | 'signup' | null
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { currentUser, signOut } = useAuth();

  const [profileUsername, setProfileUsername] = useState(null);
  const [profileStats, setProfileStats] = useState(null); // { wins, losses }

  // Fetch username and win/loss stats when user logs in
  useEffect(() => {
    if (!currentUser || !supabase) {
      setProfileUsername(null);
      setProfileStats(null);
      return;
    }
    supabase.from('profiles').select('username, wins, losses').eq('id', currentUser.id).single()
      .then(({ data }) => {
        setProfileUsername(data?.username ?? null);
        if (data) setProfileStats({ wins: data.wins ?? 0, losses: data.losses ?? 0 });
      });
  }, [currentUser]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!profileDropdownOpen) return;
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileDropdownOpen]);

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
      player1_auth_id: currentUser?.id ?? null,
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
      position: 'relative',
    }}>
      <style>{lobbyHoverStyles}</style>

      {/* Profile button — top-right corner */}
      <div style={{ position: 'absolute', top: '16px', right: '20px' }} ref={dropdownRef}>
        {currentUser ? (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setProfileDropdownOpen(v => !v)}
              style={{
                background: 'transparent',
                border: '1px solid #2a2a3a',
                borderRadius: '4px',
                color: '#C9A84C',
                fontFamily: "'Cinzel', serif",
                fontSize: '11px',
                letterSpacing: '0.06em',
                padding: '6px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {profileUsername ?? currentUser.email}
              <span style={{ fontSize: '9px', opacity: 0.6 }}>▼</span>
            </button>
            {profileDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: '#0d0d1a',
                border: '1px solid #2a2a3a',
                borderRadius: '4px',
                minWidth: '140px',
                zIndex: 100,
              }}>
                {profileStats && (
                  <div style={{
                    padding: '10px 14px 6px',
                    borderBottom: '1px solid #1a1a2a',
                    fontFamily: "'Cinzel', serif",
                    fontSize: '10px',
                    letterSpacing: '0.06em',
                    color: '#6a6a8a',
                    display: 'flex',
                    gap: '12px',
                  }}>
                    <span style={{ color: '#4ade80' }}>W: {profileStats.wins}</span>
                    <span style={{ color: '#f87171' }}>L: {profileStats.losses}</span>
                  </div>
                )}
                <button
                  onClick={async () => { setProfileDropdownOpen(false); await signOut(); }}
                  style={{
                    display: 'block',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    color: '#a0a0c0',
                    fontFamily: "'Cinzel', serif",
                    fontSize: '11px',
                    letterSpacing: '0.05em',
                    padding: '10px 14px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAuthModal('signin')}
            style={{
              background: 'transparent',
              border: '1px solid #C9A84C60',
              borderRadius: '4px',
              color: '#C9A84C',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              letterSpacing: '0.06em',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        )}
      </div>

      {/* Auth modals */}
      {authModal === 'signin' && (
        <SignInModal
          onClose={() => setAuthModal(null)}
          onSwitchToSignUp={() => setAuthModal('signup')}
        />
      )}
      {authModal === 'signup' && (
        <SignUpModal
          onClose={() => setAuthModal(null)}
          onSwitchToSignIn={() => setAuthModal('signin')}
        />
      )}

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

        {/* Mode selection */}
        {!playMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button className="lobby-btn-primary" style={btnPrimary} onClick={() => onModeSelect('quickplay')}>
              Quick Play
            </button>
            <button className="lobby-btn-muted" style={btnSecondary} onClick={() => onNavigate('/deck-builder')}>
              Build a Deck
            </button>
            <button className="lobby-btn-muted" style={btnCancel} onClick={() => onNavigate('/how-to-play')}>
              How to Play
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Mode indicator with back option */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#0d0d1a',
              border: '1px solid #2a2a3a',
              borderRadius: '4px',
            }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C', letterSpacing: '0.08em' }}>
                QUICK PLAY
              </span>
              <button
                onClick={() => onModeSelect(null)}
                style={{ background: 'none', border: 'none', color: '#4a4a6a', fontSize: '12px', cursor: 'pointer', fontFamily: "'Cinzel', serif" }}
              >
                ← change
              </button>
            </div>

            <button className="lobby-btn-primary" style={btnPrimary} onClick={() => onNavigate('/ai')}>
              Play vs AI
            </button>

            <button
              className="lobby-btn-silver"
              style={{ ...btnSilver, opacity: creating ? 0.6 : 1 }}
              onClick={handleCreateGame}
              disabled={creating}
            >
              {creating ? 'Creating…' : 'Create Online Game'}
            </button>
            {createError && (
              <p style={{ fontFamily: "'Crimson Text', serif", color: '#bf4a4a', fontSize: '13px', textAlign: 'center' }}>{createError}</p>
            )}

            <button className="lobby-btn-muted" style={btnCancel} onClick={() => onNavigate('/how-to-play')}>
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
                  className="lobby-btn-muted"
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
                    transition: 'box-shadow 150ms ease, transform 150ms ease, filter 150ms ease',
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
        )}
      </div>
    </div>
  );
}
