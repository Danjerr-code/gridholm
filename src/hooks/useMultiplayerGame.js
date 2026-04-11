import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, getGuestId } from '../supabase.js';
import { playTurnStartSound } from '../audio.js';
import { createInitialState, autoAdvancePhase, getChampionDef } from '../engine/gameEngine.js';
import { FACTION_INFO } from '../engine/cards.js';

const TURN_TIMER_ENABLED = false; // set to true to re-enable the idle forfeit timer
const IDLE_WARN_SECONDS = 30;  // show countdown when this many seconds remain
const IDLE_FORFEIT_SECONDS = 60; // forfeit after this many idle seconds

export function useMultiplayerGame(gameId) {
  const guestId = getGuestId();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [idleElapsed, setIdleElapsed] = useState(0);
  const retryTimerRef = useRef(null);
  const forfeitCalledRef = useRef(false);

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

      // Join as player 2 if slot is open (waiting status)
      if ((sessionData.status === 'deck_select' || sessionData.status === 'waiting') && !sessionData.player2_id) {
        const { data: joined, error: joinError } = await supabase
          .from('game_sessions')
          .update({
            player2_id: guestId,
            status: 'deck_select',
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
    };
  }, [gameId, guestId]);

  // Idle elapsed ticker: counts seconds since last session update during active gameplay
  // Disabled when TURN_TIMER_ENABLED is false
  useEffect(() => {
    if (!TURN_TIMER_ENABLED || !session || session.status !== 'active') {
      setIdleElapsed(0);
      return;
    }

    const getElapsed = () =>
      Math.floor((Date.now() - new Date(session.updated_at).getTime()) / 1000);

    const tick = () => setIdleElapsed(getElapsed());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session?.updated_at, session?.status]);

  // Reset forfeit guard when active player changes (new turn)
  useEffect(() => {
    forfeitCalledRef.current = false;
  }, [session?.active_player]);

  // Auto-forfeit idle player: triggered by the waiting player when opponent is idle >= 60s
  // Disabled when TURN_TIMER_ENABLED is false
  useEffect(() => {
    if (!TURN_TIMER_ENABLED || !session || session.status !== 'active' || !supabase) return;
    if (session.active_player === guestId) return; // it's my turn — I don't forfeit myself
    if (idleElapsed < IDLE_FORFEIT_SECONDS) return;
    if (forfeitCalledRef.current) return;
    forfeitCalledRef.current = true;

    const idlePlayerId = session.active_player;
    const winnerGuestId = idlePlayerId === session.player1_id
      ? session.player2_id
      : session.player1_id;
    const firstPlayerId = session.game_state?.firstPlayerId ?? session.player1_id;
    const isSwapped = firstPlayerId === session.player2_id;
    const idleEngineIndex = idlePlayerId === session.player1_id
      ? (isSwapped ? 1 : 0)
      : (isSwapped ? 0 : 1);
    const winnerEngineIndex = 1 - idleEngineIndex;
    const winnerName = session.game_state?.players?.[winnerEngineIndex]?.name
      ?? (winnerEngineIndex === 0 ? 'Player 1' : 'Player 2');
    const updatedGameState = { ...session.game_state, winner: winnerName };

    supabase
      .from('game_sessions')
      .update({
        status: 'complete',
        winner: winnerGuestId,
        game_state: updatedGameState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .then(({ error: err }) => {
        if (err) console.error('[IdleTimeout] Forfeit failed:', err);
      });
  }, [idleElapsed, session, gameId, guestId]);

  // Play a chime when active_player transitions to the local player.
  const prevActivePlayerRef = useRef(null);
  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const prev = prevActivePlayerRef.current;
    prevActivePlayerRef.current = session.active_player;
    if (prev === null) return; // skip initial load
    if (prev !== session.active_player && session.active_player === guestId) {
      playTurnStartSound();
    }
  }, [session?.active_player, session?.status, guestId]);

  // Player 1 retry: if both decks are selected but game_state hasn't appeared
  // within 5 seconds (e.g. Player 1's first selectDeck write happened before
  // Player 2 had chosen), Player 1 re-generates and writes the initial state.
  useEffect(() => {
    if (!session || !supabase) return;
    const isP1 = session.player1_id === guestId;
    if (!isP1) return;
    if (session.status !== 'deck_select') return;
    if (!session.player1_deck || !session.player2_deck) return;

    console.log('[DeckSelect] Both decks set; scheduling Player 1 retry in 5s if game has not started');

    retryTimerRef.current = setTimeout(async () => {
      const { data: latest, error: fetchError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', gameId)
        .single();

      if (fetchError) {
        console.error('[DeckSelect] Retry fetch failed:', fetchError);
        return;
      }
      if (!latest || latest.status === 'active') return;

      console.log('[DeckSelect] Retry: generating initial game state (Player 1)');
      const firstPlayerGuestId = latest.active_player || latest.player1_id;
      const isSwapped = firstPlayerGuestId === latest.player2_id;
      const p1DeckId = isSwapped ? latest.player2_deck : latest.player1_deck;
      const p2DeckId = isSwapped ? latest.player1_deck : latest.player2_deck;

      const s = createInitialState(p1DeckId, p2DeckId);
      s.activePlayer = 0;
      s.firstPlayer = 0;
      const p1ChampName = getChampionDef(s.players[0]).name;
      const p2ChampName = getChampionDef(s.players[1]).name;
      const p1FactionName = FACTION_INFO[p1DeckId]?.name ?? p1DeckId;
      const p2FactionName = FACTION_INFO[p2DeckId]?.name ?? p2DeckId;
      s.log[0] = `Game started. Player 1 goes first. Both players start with 5 cards. Player 1 skips draw on turn 1. Player 1 plays ${p1FactionName} with ${p1ChampName}. Player 2 plays ${p2FactionName} with ${p2ChampName}.`;
      s.players[0].name = 'Player 1';
      s.players[1].name = 'Player 2';
      const initialState = autoAdvancePhase(s);
      initialState.firstPlayerId = firstPlayerGuestId;

      const { error: retryError } = await supabase
        .from('game_sessions')
        .update({
          game_state: initialState,
          status: 'active',
          active_player: firstPlayerGuestId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId);

      if (retryError) {
        console.error('[DeckSelect] Retry write failed:', retryError);
      } else {
        console.log('[DeckSelect] Retry succeeded');
      }
    }, 5000);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [session?.status, session?.player1_deck, session?.player2_deck, gameId, guestId]);

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

    // Only Player 1 is responsible for detecting both-decks-ready and initializing
    // game state. Player 2 just writes their deck and waits for the Realtime update.
    // This prevents both clients from racing to write game_state simultaneously.
    if (isP1) {
      const p2Deck = session.player2_deck;
      if (p2Deck) {
        console.log('[DeckSelect] Both decks selected — Player 1 generating initial game state');
        // session.active_player during deck_select holds the intended first player
        // (player1_id for game 1, swapped for rematches).
        const firstPlayerGuestId = session.active_player || session.player1_id;
        const isSwapped = firstPlayerGuestId === session.player2_id;

        // Map each player's deck to the correct engine index (0 = first player)
        const p1DeckId = isSwapped ? p2Deck : deckId;
        const p2DeckId = isSwapped ? deckId : p2Deck;

        const s = createInitialState(p1DeckId, p2DeckId);
        // Override the engine's random coin flip so activePlayer always starts at 0,
        // preventing a mismatch between session.active_player (guest ID) and engine index.
        s.activePlayer = 0;
        s.firstPlayer = 0;
        const p1ChampName = getChampionDef(s.players[0]).name;
        const p2ChampName = getChampionDef(s.players[1]).name;
        const p1FactionName = FACTION_INFO[p1DeckId]?.name ?? p1DeckId;
        const p2FactionName = FACTION_INFO[p2DeckId]?.name ?? p2DeckId;
        s.log[0] = `Game started. Player 1 goes first. Both players start with 5 cards. Player 1 skips draw on turn 1. Player 1 plays ${p1FactionName} with ${p1ChampName}. Player 2 plays ${p2FactionName} with ${p2ChampName}.`;
        s.players[0].name = 'Player 1';
        s.players[1].name = 'Player 2';
        const initialState = autoAdvancePhase(s);

        // Track who goes first (guest ID) so rematches can alternate correctly
        initialState.firstPlayerId = firstPlayerGuestId;

        updatePayload.game_state = initialState;
        updatePayload.status = 'active';
        updatePayload.active_player = firstPlayerGuestId;
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('game_sessions')
      .update(updatePayload)
      .eq('id', gameId)
      .select()
      .single();

    if (updateError) {
      console.error('[DeckSelect] Failed to write deck selection:', updateError);
    } else if (updated) {
      setSession(updated);
    }
  }, [session, gameId, guestId]);

  const dispatchAction = useCallback(async (newGameState) => {
    if (!session || !supabase) return;

    const nextActivePlayerIndex = newGameState.activePlayer;
    // If decks were swapped (player2 went first), index 0 = player2, index 1 = player1
    const firstPlayerId = newGameState.firstPlayerId || session.player1_id;
    const isSwapped = firstPlayerId === session.player2_id;
    const nextActiveGuestId = nextActivePlayerIndex === 0
      ? (isSwapped ? session.player2_id : session.player1_id)
      : (isSwapped ? session.player1_id : session.player2_id);

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

  const concedeGame = useCallback(async () => {
    if (!session || !supabase) return;
    const firstPlayerId = session.game_state?.firstPlayerId ?? session.player1_id;
    const isSwapped = firstPlayerId === session.player2_id;
    const myIndex = session.player1_id === getGuestId()
      ? (isSwapped ? 1 : 0)
      : session.player2_id === getGuestId()
      ? (isSwapped ? 0 : 1)
      : null;
    if (myIndex === null) return;
    const opponentId = myIndex === 0
      ? (isSwapped ? session.player1_id : session.player2_id)
      : (isSwapped ? session.player2_id : session.player1_id);
    const opponentEngineIndex = myIndex === 0 ? 1 : 0;
    const winnerName = session.game_state?.players?.[opponentEngineIndex]?.name
      ?? (opponentEngineIndex === 0 ? 'Player 1' : 'Player 2');
    const updatedGameState = { ...session.game_state, winner: winnerName };
    const { data: updated } = await supabase
      .from('game_sessions')
      .update({ status: 'complete', winner: opponentId, game_state: updatedGameState, updated_at: new Date().toISOString() })
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

  const cancelWaiting = useCallback(async () => {
    if (!session || !supabase) return;
    await supabase
      .from('game_sessions')
      .delete()
      .eq('id', gameId);
  }, [session, gameId]);

  // Internal: resets game to deck_select for a rematch, alternating who goes first
  const startRematch = useCallback(async () => {
    if (!session || !supabase) return;
    const lastFirstPlayerId = session.game_state?.firstPlayerId || session.player1_id;
    const nextFirstPlayer = lastFirstPlayerId === session.player1_id
      ? session.player2_id
      : session.player1_id;

    const { data: updated } = await supabase
      .from('game_sessions')
      .update({
        game_state: null,
        status: 'deck_select',
        winner: null,
        active_player: nextFirstPlayer,
        player1_deck: null,
        player2_deck: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select()
      .single();

    if (updated) setSession(updated);
  }, [session, gameId]);

  // Propose a rematch. Uses a vote in game_state.rematchVotes — when both players
  // have voted, the second voter triggers startRematch automatically.
  const proposeRematch = useCallback(async () => {
    if (!session || !supabase || session.status !== 'complete') return;
    const currentVotes = session.game_state?.rematchVotes ?? [];
    if (currentVotes.includes(guestId)) return; // already voted

    const newVotes = [...currentVotes, guestId];
    const bothVoted =
      newVotes.includes(session.player1_id) && newVotes.includes(session.player2_id);

    if (bothVoted) {
      await startRematch();
    } else {
      const updatedGameState = { ...session.game_state, rematchVotes: newVotes };
      const { data: updated } = await supabase
        .from('game_sessions')
        .update({ game_state: updatedGameState, updated_at: new Date().toISOString() })
        .eq('id', gameId)
        .select()
        .single();
      if (updated) setSession(updated);
    }
  }, [session, gameId, guestId, startRematch]);

  // Decline a rematch proposal — sets status to abandoned, triggering lobby redirect for both
  const declineRematch = useCallback(async () => {
    if (!session || !supabase) return;
    await supabase
      .from('game_sessions')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', gameId);
  }, [session, gameId]);

  // When decks are swapped for alternation, player2 has game-engine index 0
  const firstPlayerId = session?.game_state?.firstPlayerId ?? session?.player1_id;
  const isSwapped = firstPlayerId === session?.player2_id;
  const myPlayerIndex = session
    ? (session.player1_id === guestId
      ? (isSwapped ? 1 : 0)
      : session.player2_id === guestId
      ? (isSwapped ? 0 : 1)
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

  // Idle countdown: seconds remaining until forfeit (null when not in warning zone)
  const idleCountdown = session?.status === 'active' && idleElapsed >= IDLE_WARN_SECONDS
    ? Math.max(0, IDLE_FORFEIT_SECONDS - idleElapsed)
    : null;

  // Opponent presence: false when it's opponent's turn and they've been idle >= warn threshold
  const opponentPresent = session?.status !== 'active' || isMyTurn || idleElapsed < IDLE_WARN_SECONDS;

  // Rematch vote state
  const rematchVotes = session?.game_state?.rematchVotes ?? [];
  const iHaveVoted = rematchVotes.includes(guestId);
  const opponentGuestId = session
    ? (session.player1_id === guestId ? session.player2_id : session.player1_id)
    : null;
  const opponentHasVoted = opponentGuestId ? rematchVotes.includes(opponentGuestId) : false;

  return {
    session,
    loading,
    error,
    gameState: session?.game_state ?? null,
    myPlayerIndex,
    isMyTurn,
    dispatchAction,
    guestId,
    opponentPresent,
    idleCountdown,
    concedeGame,
    abandonGame,
    cancelWaiting,
    proposeRematch,
    declineRematch,
    iHaveVoted,
    opponentHasVoted,
    selectDeck,
    inDeckSelect,
    myDeck,
    opponentDeck,
  };
}
