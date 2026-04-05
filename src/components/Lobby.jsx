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

function buildInitialMultiplayerState() {
  const s = createInitialState();
  s.players[0].name = 'Player 1';
  s.players[1].name = 'Player 2';
  return autoAdvancePhase(s);
}

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
    const initialState = buildInitialMultiplayerState();

    const { error } = await supabase.from('game_sessions').insert({
      id: gameId,
      player1_id: guestId,
      game_state: initialState,
      active_player: guestId,
      status: 'waiting',
    });

    setCreating(false);

    if (error) {
      setCreateError('Failed to create game. Please try again.');
      return;
    }

    onNavigate(`/game/${gameId}`);
  }

  function handleJoinGame(e) {
    console.log('JOIN BUTTON CLICKED - gameId input value:', joinInput);
    e.preventDefault();
    const id = joinInput.trim().toUpperCase();
    if (id.length !== 6) {
      setJoinError('Game ID must be 6 characters.');
      return;
    }
    setJoinError(null);
    onNavigate(`/game/${id}`);
  }

  console.log('LOBBY RENDERED');
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-amber-400 tracking-widest mb-1">GRIDHOLM</h1>
          <p className="text-gray-400 text-sm">A tactical card game</p>
        </div>

        <div className="flex flex-col gap-3">
          <button
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg text-sm transition-colors"
            onClick={() => onNavigate('/ai')}
          >
            Play vs AI
          </button>

          <button
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg text-sm transition-colors disabled:opacity-50"
            onClick={handleCreateGame}
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create Online Game'}
          </button>
          {createError && (
            <p className="text-red-400 text-xs text-center">{createError}</p>
          )}

          <form onSubmit={handleJoinGame} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-3 text-sm font-mono uppercase tracking-widest text-white placeholder-gray-500 focus:outline-none focus:border-gray-400"
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
                className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg text-sm transition-colors"
              >
                Join Game
              </button>
            </div>
            {joinError && (
              <p className="text-red-400 text-xs">{joinError}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
