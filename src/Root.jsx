import { useState, useEffect } from 'react';
import App from './App.jsx';
import Lobby from './components/Lobby.jsx';
import LandingPage from './components/LandingPage.jsx';
import MultiplayerGame from './components/MultiplayerGame.jsx';
import DeckSelect from './components/DeckSelect.jsx';
import DeckBuilder from './components/DeckBuilder.jsx';
import HowToPlay from './components/HowToPlay.jsx';
import CardGallery from './components/CardGallery.jsx';
import TutorialMenu from './components/TutorialMenu.jsx';
import DraftMode from './components/draft/DraftMode.jsx';
import ChallengesScreen from './components/ChallengesScreen.jsx';
import { supabase, getGuestId } from './supabase.js';
import { createInitialState, autoAdvancePhase } from './engine/gameEngine.js';
import { loadDraftRun } from './draft/draftRunState.js';

function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === '/') return { view: 'landing' };
  if (hash === 'lobby') return { view: 'lobby' };
  if (hash === 'ai') return { view: 'ai_deck_select' };
  if (hash === 'draft') return { view: 'draft' };
  if (hash === 'how-to-play' || hash === 'howtoplay') return { view: 'how_to_play' };
  if (hash === 'card-gallery') return { view: 'card_gallery' };
  if (hash === 'tutorial') return { view: 'tutorial' };
  if (hash === 'deck-builder') return { view: 'deck_builder' };
  if (hash === 'challenges') return { view: 'challenges' };
  if (hash === 'custom-play') return { view: 'custom_play' };
  if (hash === 'custom-ai') return { view: 'custom_ai' };
  const gameMatch = hash.match(/^game\/([A-Z0-9]{6})$/i);
  if (gameMatch) return { view: 'game', gameId: gameMatch[1].toUpperCase() };
  return { view: 'landing' };
}

export default function Root() {
  const [route, setRoute] = useState(parseHash);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [playMode, setPlayMode] = useState(null); // 'quickplay' | 'custom'

  // Handle Supabase auth callback (password reset / email confirmation).
  // When the user clicks a Supabase link they land on /auth/callback?code=xxx.
  // Exchange the code for a session then redirect to the lobby.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code || !supabase) return;

    supabase.auth.exchangeCodeForSession(window.location.href).then(({ error }) => {
      if (!error) {
        // Clear the code from the URL and go to lobby
        window.history.replaceState({}, '', '/');
        setRoute({ view: 'lobby' });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseHash());
      setSelectedDeck(null);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function navigate(path) {
    window.location.hash = path.startsWith('/') ? path : `/${path}`;
  }

  if (route.view === 'landing') {
    return <LandingPage />;
  }

  if (route.view === 'how_to_play') {
    return <HowToPlay />;
  }

  if (route.view === 'tutorial') {
    return <TutorialMenu onBack={() => navigate('/')} />;
  }

  if (route.view === 'deck_builder') {
    return (
      <DeckBuilder
        onBack={() => navigate('/')}
        onNext={() => navigate('/custom-play')}
      />
    );
  }

  if (route.view === 'custom_ai') {
    return (
      <App
        deckId="custom"
        onBackToLobby={() => navigate('/')}
      />
    );
  }

  if (route.view === 'custom_play') {
    return (
      <CustomPlayModeSelect
        onAI={() => navigate('/custom-ai')}
        onOnline={async () => {
          if (!supabase) return;
          const guestId = getGuestId();
          const gameId = generateGameId();
          const placeholderState = autoAdvancePhase(createInitialState('human', 'human'));
          const { error } = await supabase.from('game_sessions').insert({
            id: gameId,
            player1_id: guestId,
            game_state: placeholderState,
            active_player: guestId,
            status: 'waiting',
            player1_deck: null,
            player2_deck: null,
          });
          if (!error) {
            localStorage.setItem('gridholm_pending_custom_deck', '1');
            navigate(`/game/${gameId}`);
          }
        }}
        onBack={() => navigate('/deck-builder')}
      />
    );
  }

  if (route.view === 'card_gallery') {
    return <CardGallery />;
  }

  if (route.view === 'challenges') {
    return <ChallengesScreen onBack={() => navigate('/')} />;
  }

  if (route.view === 'draft') {
    const savedRun = loadDraftRun();
    return (
      <DraftMode
        onBackToLobby={() => navigate('/')}
        initialRun={savedRun}
      />
    );
  }

  // Deck selection before AI game
  if (route.view === 'ai_deck_select') {
    if (!selectedDeck) {
      return (
        <DeckSelect
          onSelect={(deckId) => {
            const customDeck = localStorage.getItem('gridholm_custom_deck');
            console.log(`[DeckSelect] Player selected deckId="${deckId}" | localStorage gridholm_custom_deck: ${customDeck ? `found (${JSON.parse(customDeck)?.cards?.length ?? 0} cards)` : 'null'}`);
            setSelectedDeck(deckId);
          }}
          opponentSelected={null}
        />
      );
    }
    return (
      <App
        deckId={selectedDeck}
        onBackToLobby={() => { navigate('/'); setSelectedDeck(null); }}
        onPlayAgain={() => setSelectedDeck(null)}
      />
    );
  }

  if (route.view === 'game') {
    return (
      <MultiplayerGame
        gameId={route.gameId}
        onBackToLobby={() => navigate('/')}
      />
    );
  }

  return (
    <Lobby
      onNavigate={navigate}
      playMode={playMode}
      onModeSelect={setPlayMode}
    />
  );
}

function CustomPlayModeSelect({ onAI, onOnline, onBack }) {
  const [creating, setCreating] = useState(false);

  async function handleOnline() {
    setCreating(true);
    await onOnline();
    setCreating(false);
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
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '32px', fontWeight: 600, color: '#C9A84C', letterSpacing: '0.2em', marginBottom: '4px' }}>
            GRIDHOLM
          </h1>
          <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#e2e8f0', fontSize: '15px' }}>
            Choose how to play your deck
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            style={{
              background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
              color: '#0a0a0f',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              padding: '12px 24px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
            onClick={onAI}
          >
            Play vs AI
          </button>

          {supabase && (
            <button
              style={{
                background: creating ? '#1a1a2a' : 'linear-gradient(135deg, #8A8A8A, #C0C0C0)',
                color: creating ? '#4a4a6a' : '#0a0a0f',
                fontFamily: "'Cinzel', serif",
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                padding: '12px 24px',
                cursor: creating ? 'default' : 'pointer',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
              onClick={creating ? undefined : handleOnline}
              disabled={creating}
            >
              {creating ? 'Creating…' : 'Create Online Game'}
            </button>
          )}

          <button
            style={{
              background: 'transparent',
              color: '#6a6a8a',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              border: '1px solid #2a2a3a',
              borderRadius: '4px',
              padding: '8px 24px',
              cursor: 'pointer',
            }}
            onClick={onBack}
          >
            ← Back to Deck Builder
          </button>
        </div>
      </div>
    </div>
  );
}
