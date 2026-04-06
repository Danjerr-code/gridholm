import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, getGuestId } from '../supabase.js';
import { createInitialState, autoAdvancePhase } from '../engine/gameEngine.js';

const DISCONNECT_TIMEOUT_MS = 60_000;

export function useMultiplayerGame(gameId) {
  const guestId = getGuestId();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const disconnectTimerRef = useRef(null);

  useEffect(() => {
    if (!supabase) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.');
      setLoading(false);
      return;
    }

    const channel = supabase
      .channel('game-' + gameId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: 'id=eq.' + gameId },
        (payload) => {
          setSession(payload.new);
          setOpponentDisconnected(false);
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
        }
      )
      .subscribe();

    async function init() {
      const { data: sessionData, error: fetchError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', gameId)
        .single();

      if (fetchError || !sessionData) {
        setError('Game not found. Check the code and try again.');
        setLoading(false);
        return;
      }

      // Reconnecting as player 1
      if (sessionData.player1_id === guestId) {
        setSession(sessionData);
        setLoading(false);
        return;
      }

      // Reconnecting as player 2
      if (sessionData.player2_id === guestId) {
        setSession(sessionData);
        setLoading(false);
        return;
      }

      // Join as player 2 if slot is open (deck_select or waiting status)
      if ((sessionData.status === 'deck_select' || sessionData.status === 'waiting') && !sessionData.player2_id) {
        const { data: joined, error: joinError } = await supabase
          .from('game_sessions')
          .update({
            player2_id: guestId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', gameId)
          .select()
          .single();

        if (joinError) {
          setError('Failed to join the game. It may have already started.');
          setLoading(false);
          return;
        }

        setSession(joined);
        setLoading(false);
        return;
      }

      // Game is full or complete
      setSession(sessionData);
      setLoading(false);
    }

    init();

    return () => {
      supabase.removeChannel(channel);
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    };
  }, [gameId, guestId]);

  // Disconnect detection
  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const isMyTurn = session.active_player === guestId;
    if (isMyTurn) return;

    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = setTimeout(() => {
      setOpponentDisconnected(true);
    }, DISCONNECT_TIMEOUT_MS);

    return () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    };
  }, [session?.active_player, session?.status, guestId]);

  // Deck selection: called when this player picks their faction
  const selectDeck = useCallback(async (deckId) => {
    if (!session || !supabase) return;

    const isP1 = session.player1_id === guestId;
    const deckField = isP1 ? 'player1_deck' : 'player2_deck';

    // Write our deck choice
    const updatePayload = {
      [deckField]: deckId,
      updated_at: new Date().toISOString(),
    };

    // Check if opponent's deck is already set — if so, initialize game
    const opponentDeck = isP1 ? session.player2_deck : session.player1_deck;

    if (opponentDeck) {
      // Both decks now known — initialize game state
      const p1DeckId = isP1 ? deckId : opponentDeck;
      const p2DeckId = isP1 ? opponentDeck : deckId;
      const s = createInitialState(p1DeckId, p2DeckId);
      s.players[0].name = 'Player 1';
      s.players[1].name = 'Player 2';
      const initialState = autoAdvancePhase(s);

      updatePayload.game_state = initialState;
      updatePayload.status = 'active';
      updatePayload.active_player = session.player1_id;
    }

    const { data: updated } = await supabase
      .from('game_sessions')
      .update(updatePayload)
      .eq('id', gameId)
      .select()
      .single();

    if (updated) setSession(updated);
  }, [session, gameId, guestId]);

  const dispatchAction = useCallback(async (newGameState) => {
    if (!session || !supabase) return;

    const nextActivePlayerIndex = newGameState.activePlayer;
    const nextActiveGuestId = nextActivePlayerIndex === 0
      ? session.player1_id
      : session.player2_id;

    const isComplete = !!newGameState.winner;
    let winnerGuestId = null;
    if (isComplete) {
      const losingChamp = newGameState.champions.find(c => c.hp <= 0);
      if (losingChamp) {
        winnerGuestId = losingChamp.owner === 0 ? session.player2_id : session.player1_id;
      }
    }

    const { data: updated } = await supabase
      .from('game_sessions')
      .update({
        game_state: newGameState,
        active_player: nextActiveGuestId,
        status: isComplete ? 'complete' : 'active',
        winner: winnerGuestId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select()
      .single();

    if (updated) setSession(updated);
  }, [session, gameId]);

  const abandonGame = useCallback(async () => {
    if (!session || !supabase) return;
    await supabase
      .from('game_sessions')
      .update({ status: 'abandoned' })
      .eq('id', gameId);
  }, [session, gameId]);

  const playAgain = useCallback(async () => {
    if (!session || !supabase) return;
    // Reset to deck_select for a fresh rematch
    const { data: updated } = await supabase
      .from('game_sessions')
      .update({
        game_state: null,
        active_player: session.player1_id,
        status: 'deck_select',
        winner: null,
        player1_deck: null,
        player2_deck: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select()
      .single();

    if (updated) setSession(updated);
  }, [session, gameId]);

  const myPlayerIndex = session
    ? (session.player1_id === guestId ? 0
      : session.player2_id === guestId ? 1
      : null)
    : null;

  const isMyTurn = session ? session.active_player === guestId : false;

  // Derived deck selection state
  const myDeck = session
    ? (myPlayerIndex === 0 ? session.player1_deck : session.player2_deck)
    : null;
  const opponentDeck = session
    ? (myPlayerIndex === 0 ? session.player2_deck : session.player1_deck)
    : null;
  const inDeckSelect = session?.status === 'deck_select';

  return {
    session,
    loading,
    error,
    gameState: session?.game_state ?? null,
    myPlayerIndex,
    isMyTurn,
    dispatchAction,
    guestId,
    opponentDisconnected,
    abandonGame,
    playAgain,
    selectDeck,
    inDeckSelect,
    myDeck,
    opponentDeck,
  };
}
