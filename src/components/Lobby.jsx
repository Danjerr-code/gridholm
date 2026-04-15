import { useState, useEffect, useRef } from 'react';
import { supabase, getGuestId } from '../supabase.js';
import { createInitialState, autoAdvancePhase } from '../engine/gameEngine.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import SignInModal from './SignInModal.jsx';
import SignUpModal from './SignUpModal.jsx';
import { loadDraftRun } from '../draft/draftRunState.js';
import { loadRun as loadAdventureRun } from '../adventure/adventureState.js';
import { getActiveChallenges, getChallengeProgress, ensureChallengeProgress } from '../challenges/challengeManager.js';
import { getTotalPackCount } from '../packs/packGenerator.js';

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

const btnTertiary = {
  background: 'transparent',
  color: '#6a6a8a',
  fontFamily: "'Cinzel', serif",
  fontSize: '11px',
  fontWeight: 500,
  border: '1px solid #1e1e2e',
  borderRadius: '4px',
  letterSpacing: '0.04em',
  padding: '6px 16px',
  width: '100%',
  cursor: 'pointer',
  transition: 'box-shadow 150ms ease, transform 150ms ease, filter 150ms ease',
};

const btnTopNav = {
  background: 'transparent',
  border: 'none',
  color: '#4a4a6a',
  fontFamily: "'Cinzel', serif",
  fontSize: '10px',
  letterSpacing: '0.06em',
  padding: '4px 6px',
  cursor: 'pointer',
  textTransform: 'uppercase',
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
  @keyframes metallicShimmer {
    0%, 100% { filter: sepia(0.3) saturate(1.4) brightness(1.0) contrast(1.05); }
    50% { filter: sepia(0.3) saturate(1.4) brightness(1.15) contrast(1.05); }
  }
  .lobby-silhouette {
    filter: sepia(0.3) saturate(1.4) brightness(1.1) contrast(1.05);
    animation: metallicShimmer 4s ease-in-out infinite;
  }
  @media (max-width: 768px) {
    .lobby-silhouette { display: none; }
  }
`;

function QuestCard({ title, description, current, target, completed, isWeekly }) {
  const [showTip, setShowTip] = useState(false);
  const pct = Math.min(100, Math.round((current / target) * 100));
  const accentColor = completed ? '#4ade80' : isWeekly ? '#c084fc' : '#C9A84C';
  return (
    <div
      style={{
        flex: 1,
        background: completed ? '#0d1a0d' : '#0d0d1a',
        border: `1px solid ${completed ? '#4ade8030' : isWeekly ? '#a855f730' : '#C9A84C20'}`,
        borderRadius: '4px',
        padding: '6px 8px',
        position: 'relative',
        cursor: 'default',
        userSelect: 'none',
      }}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onClick={() => setShowTip(v => !v)}
    >
      <div style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '9px',
        fontWeight: 600,
        color: accentColor,
        letterSpacing: '0.03em',
        marginBottom: '2px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{title}</div>
      <div style={{ fontSize: '9px', color: completed ? '#4ade80' : '#4a4a6a', marginBottom: '4px' }}>
        {completed ? '✓ Done' : `${current}/${target}`}
      </div>
      <div style={{ background: '#1a1a2a', borderRadius: '2px', height: '3px', width: '100%', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: accentColor,
          borderRadius: '2px',
          transition: 'width 0.3s ease',
        }} />
      </div>
      {showTip && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#1a1a2a',
          border: '1px solid #2a2a3a',
          borderRadius: '4px',
          padding: '6px 10px',
          fontSize: '10px',
          color: '#a0a0c0',
          zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          minWidth: '200px',
          maxWidth: '260px',
          whiteSpace: 'normal',
          textAlign: 'center',
          lineHeight: 1.4,
        }}>
          {description}
        </div>
      )}
    </div>
  );
}

const WELCOME_SEEN_KEY = 'gridholm_welcome_packs_seen';

function checkShowWelcome() {
  try {
    if (localStorage.getItem(WELCOME_SEEN_KEY)) return false;
    const col = localStorage.getItem('gridholm_collection');
    return !col || col === '{}' || col === 'null';
  } catch { return false; }
}

export default function Lobby({ onNavigate, playMode, onModeSelect }) {
  const [joinInput, setJoinInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [authModal, setAuthModal] = useState(null); // 'signin' | 'signup' | null
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showPackWelcome, setShowPackWelcome] = useState(checkShowWelcome);
  const dropdownRef = useRef(null);
  const { currentUser, signOut } = useAuth();

  const [profileUsername, setProfileUsername] = useState(null);
  const [profileStats, setProfileStats] = useState(null); // { wins, losses }
  const [quests, setQuests] = useState(null);
  const [questProgress, setQuestProgress] = useState({});

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

  // Load quests for signed-in players
  useEffect(() => {
    if (!currentUser) {
      setQuests(null);
      setQuestProgress({});
      return;
    }
    ensureChallengeProgress();
    setQuests(getActiveChallenges());
    setQuestProgress(getChallengeProgress());
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

  const HEADER_HEIGHT = 50;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      paddingTop: `${HEADER_HEIGHT + 16}px`,
      position: 'relative',
    }}>
      <style>{lobbyHoverStyles}</style>

      {/* Fixed header strip */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: `${HEADER_HEIGHT}px`,
        background: '#0a0a0f',
        borderBottom: '1px solid #1a1a2a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 20px',
        zIndex: 10,
        gap: '4px',
      }} ref={dropdownRef}>
        <button style={btnTopNav} onClick={() => onNavigate('/tutorial')}>Tutorial</button>
        <span style={{ color: '#2a2a3a', fontSize: '10px' }}>|</span>
        <button style={btnTopNav} onClick={() => onNavigate('/how-to-play')}>How to Play</button>
        <span style={{ color: '#2a2a3a', fontSize: '10px', marginRight: '4px' }}>|</span>
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

      {/* Decorative silhouettes — start below header */}
      <img
        className="lobby-silhouette"
        src="/dragon.png"
        alt=""
        style={{
          position: 'fixed',
          left: '-115px',
          top: `${HEADER_HEIGHT}px`,
          width: '520px',
          opacity: 0.33,
          pointerEvents: 'none',
          zIndex: 0,
          transform: 'rotate(-17deg)',
        }}
      />
      <img
        className="lobby-silhouette"
        src="/angel.png"
        alt=""
        style={{
          position: 'fixed',
          right: '5px',
          top: `${HEADER_HEIGHT + 45}px`,
          width: '590px',
          opacity: 0.33,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

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

      <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', zIndex: 1 }}>
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

        {/* First-time pack welcome banner */}
        {showPackWelcome && !playMode && (
          <div style={{
            background: 'linear-gradient(135deg, #1a1200, #2a1e00)',
            border: '1px solid #C9A84C60',
            borderRadius: 8,
            padding: '14px 18px',
            boxShadow: '0 0 20px #C9A84C20',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 13, color: '#C9A84C', marginBottom: 6 }}>
              Welcome to Gridholm!
            </div>
            <div style={{ fontSize: 12, color: '#a0a0c0', lineHeight: 1.5, marginBottom: 12 }}>
              You have 3 free packs to open. Start building your collection!
            </div>
            <button
              onClick={() => {
                try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch {}
                setShowPackWelcome(false);
                onNavigate('/packs');
              }}
              style={{
                background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                color: '#0a0a0f',
                fontFamily: "'Cinzel', serif",
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                borderRadius: 6,
                padding: '8px 20px',
                cursor: 'pointer',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                boxShadow: '0 0 12px #C9A84C60',
              }}
            >
              Open Packs
            </button>
          </div>
        )}

        {/* Mode selection */}
        {!playMode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Row 1: Quick Play — primary action */}
            <button className="lobby-btn-primary" style={btnPrimary} onClick={() => onModeSelect('quickplay')}>
              Quick Play
            </button>

            {/* Row 2: Adventure */}
            {(() => {
              const adventureRun = loadAdventureRun();
              return (
                <button className="lobby-btn-primary" style={{ ...btnPrimary, background: 'linear-gradient(135deg, #3a1a60, #7a40b0)' }} onClick={() => onNavigate('/adventure')}>
                  {adventureRun ? 'Continue Adventure' : 'Adventure'}
                </button>
              );
            })()}

            {/* Row 3: Continue Draft + Build a Deck */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {(() => {
                const savedRun = loadDraftRun();
                const hasDraft = savedRun && !savedRun.runComplete;
                return (
                  <button className="lobby-btn-muted" style={{ ...btnSecondary, flex: 1 }} onClick={() => onNavigate('/draft')}>
                    {hasDraft ? 'Continue Draft' : 'Draft'}
                  </button>
                );
              })()}
              <button className="lobby-btn-muted" style={{ ...btnSecondary, flex: 1 }} onClick={() => onNavigate('/deck-builder')}>
                Build a Deck
              </button>
            </div>

            {/* Row 3: Packs + Collection — secondary */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {(() => {
                const packCount = getTotalPackCount();
                return (
                  <button
                    className="lobby-btn-muted"
                    style={{ ...btnTertiary, flex: 1, position: 'relative' }}
                    onClick={() => onNavigate('/packs')}
                  >
                    Packs
                    {packCount > 0 && (
                      <span style={{
                        position: 'absolute',
                        top: '4px',
                        right: '8px',
                        background: '#C9A84C',
                        color: '#0a0a0f',
                        fontSize: '9px',
                        fontFamily: "'Cinzel', serif",
                        fontWeight: 700,
                        borderRadius: '10px',
                        padding: '1px 5px',
                        lineHeight: 1.4,
                      }}>{packCount}</span>
                    )}
                  </button>
                );
              })()}
              <button className="lobby-btn-muted" style={{ ...btnTertiary, flex: 1 }} onClick={() => onNavigate('/collection')}>
                Collection
              </button>
            </div>

            {/* Quests section — only for signed-in players */}
            {currentUser && quests && (
              <div style={{ marginTop: '4px' }}>
                <div style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: '10px',
                  color: '#C9A84C60',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                  textAlign: 'center',
                }}>
                  Daily Quests
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {quests.daily.map(ch => {
                    const prog = questProgress[ch.id] || {};
                    const { current = 0, target = ch.requirement.target ?? 1, completed = false } = prog;
                    return (
                      <QuestCard key={ch.id} title={ch.title} description={ch.description} current={current} target={target} completed={completed} />
                    );
                  })}
                </div>
                {quests.weekly && (() => {
                  const ch = quests.weekly;
                  const prog = questProgress[ch.id] || {};
                  const { current = 0, target = ch.requirement.target ?? 1, completed = false } = prog;
                  return (
                    <>
                      <div style={{
                        fontFamily: "'Cinzel', serif",
                        fontSize: '10px',
                        color: '#c084fc60',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        margin: '8px 0 6px',
                        textAlign: 'center',
                      }}>
                        Weekly Quest
                      </div>
                      <QuestCard title={ch.title} description={ch.description} current={current} target={target} completed={completed} isWeekly />
                    </>
                  );
                })()}
              </div>
            )}
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
