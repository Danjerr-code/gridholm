import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, getGuestId } from '../supabase.js';

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

    let channel;

    async function init() {
      const { data, error: fetchError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', gameId)
        .single();

      if (fetchError || !data) {
        setError('Game not found. Check the game ID and try again.');
        setLoading(false);
        return;
      }

      // Join as player2 if the slot is open and we're not player1
      if (!data.player2_id && data.player1_id !== guestId) {
        const { data: joined, error: joinError } = await supabase
          .from('game_sessions')
          .update({ player2_id: guestId, status: 'active' })
          .eq('id', gameId)
          .select()
          .single();

        if (joinError) {
          setError('Failed to join the game. It may have already started.');
          setLoading(false);
          return;
        }
        setSession(joined);
      } else {
        setSession(data);
      }

      setLoading(false);
    }

    init();

    // Subscribe to real-time updates for this game session
    channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${gameId}` },
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

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    };
  }, [gameId, guestId]);

  // Disconnect detection: start a timer whenever it becomes the opponent's turn
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

  const dispatchAction = useCallback(async (newGameState) => {
    if (!session || !supabase) return;

    const nextActivePlayerIndex = newGameState.activePlayer;
    const nextActiveGuestId = nextActivePlayerIndex === 0
      ? session.player1_id
      : session.player2_id;

    const isComplete = !!newGameState.winner;
    let winnerGuestId = null;
    if (isComplete) {
      // Determine winner guest ID from which champion survived
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

  const myPlayerIndex = session
    ? (session.player1_id === guestId ? 0 : 1)
    : null;

  const isMyTurn = session ? session.active_player === guestId : false;

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
  };
}
