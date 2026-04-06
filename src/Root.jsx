import { useState, useEffect } from 'react';
import App from './App.jsx';
import Lobby from './components/Lobby.jsx';
import MultiplayerGame from './components/MultiplayerGame.jsx';
import DeckSelect from './components/DeckSelect.jsx';

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === '/') return { view: 'lobby' };
  if (hash === 'ai') return { view: 'ai_deck_select' };
  const gameMatch = hash.match(/^game\/([A-Z0-9]{6})$/i);
  if (gameMatch) return { view: 'game', gameId: gameMatch[1].toUpperCase() };
  return { view: 'lobby' };
}

export default function Root() {
  const [route, setRoute] = useState(parseHash);
  const [selectedDeck, setSelectedDeck] = useState(null);

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

  return <Lobby onNavigate={navigate} />;
}
