import { useState, useEffect } from 'react';
import App from './App.jsx';
import Lobby from './components/Lobby.jsx';
import MultiplayerGame from './components/MultiplayerGame.jsx';

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === '/') return { view: 'lobby' };
  if (hash === 'ai') return { view: 'ai' };
  const gameMatch = hash.match(/^game\/([A-Z0-9]{6})$/i);
  if (gameMatch) return { view: 'game', gameId: gameMatch[1].toUpperCase() };
  return { view: 'lobby' };
}

export default function Root() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    function handleHashChange() {
      setRoute(parseHash());
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function navigate(path) {
    window.location.hash = path.startsWith('/') ? path : `/${path}`;
  }

  if (route.view === 'ai') {
    return <App onBackToLobby={() => navigate('/')} />;
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
