import { useState, useEffect } from 'react';
import App from './App.jsx';
import Lobby from './components/Lobby.jsx';
import MultiplayerGame from './components/MultiplayerGame.jsx';
import DeckSelect from './components/DeckSelect.jsx';
import HowToPlay from './components/HowToPlay.jsx';
import CardGallery from './components/CardGallery.jsx';

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === '/') return { view: 'lobby' };
  if (hash === 'ai') return { view: 'ai_deck_select' };
  if (hash === 'how-to-play') return { view: 'how_to_play' };
  if (hash === 'card-gallery') return { view: 'card_gallery' };
  if (hash === 'deck-builder') return { view: 'deck_builder' };
  const gameMatch = hash.match(/^game\/([A-Z0-9]{6})$/i);
  if (gameMatch) return { view: 'game', gameId: gameMatch[1].toUpperCase() };
  return { view: 'lobby' };
}

export default function Root() {
  const [route, setRoute] = useState(parseHash);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [playMode, setPlayMode] = useState(null); // 'quickplay' | 'custom'

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

  if (route.view === 'how_to_play') {
    return <HowToPlay />;
  }

  if (route.view === 'card_gallery') {
    return <CardGallery />;
  }

  // Deck builder placeholder — implemented in Part 2
  if (route.view === 'deck_builder') {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '24px',
        fontFamily: "'Cinzel', serif",
      }}>
        <h1 style={{ color: '#C9A84C', fontSize: '28px', letterSpacing: '0.2em' }}>DECK BUILDER</h1>
        <p style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', color: '#4a4a6a', fontSize: '15px' }}>
          Coming in Part 2
        </p>
        <button
          onClick={() => navigate('/')}
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
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  // Deck selection before AI game
  if (route.view === 'ai_deck_select') {
    if (!selectedDeck) {
      return (
        <DeckSelect
          onSelect={(deckId) => setSelectedDeck(deckId)}
        />
      );
    }
    return (
      <App
        deckId={selectedDeck}
        onBackToLobby={() => { navigate('/'); setSelectedDeck(null); }}
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
