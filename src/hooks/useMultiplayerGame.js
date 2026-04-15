import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, getGuestId } from '../supabase.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { playTurnStartSound, playSfxDraw } from '../audio.js';
import { createInitialState, autoAdvancePhase, submitMulligan, getChampionDef } from '../engine/gameEngine.js';
import { FACTION_INFO, parseDeckSpec } from '../engine/cards.js';
import { sanitizeGameState } from '../engine/stateSanitizer.js';

function getDeckDisplayName(deckId) {
  const spec = parseDeckSpec(deckId);
  if (spec) return spec.deckName ?? 'Custom Deck';
  return FACTION_INFO[deckId]?.name ?? deckId;
}

const TURN_TIMER_ENABLED = false; // set to true to re-enable the idle forfeit timer
const IDLE_WARN_SECONDS = 30;  // show countdown when this many seconds remain
const IDLE_FORFEIT_SECONDS = 60; // forfeit after this many idle seconds

export function useMultiplayerGame(gameId) {
  const guestId = getGuestId();
  const { currentUser } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [idleElapsed, setIdleElapsed] = useState(0);
  const retryTimerRef = useRef(null);
  const forfeitCalledRef = useRef(false);
  const winLossUpdatedRef = useRef(false); // guard against double win/loss update
  const replayPersistedRef = useRef(false); // guard against duplicate replay inserts
  // Tracks own mulligan submission so the 5s fallback can retry if opponent's
  // write overwrote ours and the game is still stuck in mulligan phase.
  const [myMulliganSubmission, setMyMulliganSubmission] = useState(null);

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
          setSession(prev => {
            const incoming = payload.new;
            console.log('[Realtime] game_sessions UPDATE — status=' + incoming.status + ', p1_deck=' + (incoming.player1_deck ?? 'null') + ', p2_deck=' + (incoming.player2_deck ?? 'null') + ', game_state=' + (incoming.game_state != null ? 'set' : 'null'));
            // Log is stripped from Supabase writes — carry forward local log so
            // the passive player retains visibility into their accumulated log.
            let gameState = incoming.game_state;
            if (gameState && !gameState.log) {
              gameState = { ...gameState, log: prev?.game_state?.log ?? [] };
            }
            // DIAGNOSTIC LOG 3: Dread Mirror state in incoming Supabase payload
            if (gameState && Array.isArray(gameState.units)) {
              const dm = gameState.units.find(u => u.id === 'dreadmirror');
              if (dm) {
                console.log(`DREAD MIRROR SUPABASE INCOMING: hidden=${dm.hidden}, hp=${dm.hp}, row=${dm.row}, col=${dm.col}, uid=${dm.uid}, inUnits=true`);
              } else {
                console.log('DREAD MIRROR SUPABASE INCOMING: not present in units array');
              }
            }
            return {
              ...incoming,
              game_state: sanitizeGameState(gameState),
            };
          });
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
        setSession({ ...sessionData, game_state: sanitizeGameState(sessionData.game_state) });
        setLoading(false);
        return;
      }

      // Reconnecting as player 2
      if (sessionData.player2_id === guestId) {
        setSession({ ...sessionData, game_state: sanitizeGameState(sessionData.game_state) });
        setLoading(false);
        return;
      }

      // Join as player 2 if slot is open (waiting status)
      if ((sessionData.status === 'deck_select' || sessionData.status === 'waiting') && !sessionData.player2_id) {
        // Randomly select who goes first and write it to Supabase now,
        // so both clients read it from active_player during deck_select.
        const firstPlayer = Math.random() < 0.5 ? sessionData.player1_id : guestId;
        const { data: joined, error: joinError } = await supabase
          .from('game_sessions')
          .update({
            player2_id: guestId,
            player2_auth_id: currentUser?.id ?? null,
            status: 'deck_select',
            active_player: firstPlayer,
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

        setSession({ ...joined, game_state: sanitizeGameState(joined.game_state) });
        setLoading(false);
        return;
      }

      // Game is full or complete
      setSession({ ...sessionData, game_state: sanitizeGameState(sessionData.game_state) });
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

  // Win/loss tracking: when a multiplayer game ends, increment the authenticated
  // player's record in the profiles table. Only runs when both players are authenticated
  // (both player1_auth_id and player2_auth_id are set on the session).
  useEffect(() => {
    if (!session || session.status !== 'complete' || !supabase) return;
    if (!currentUser) return;
    if (!session.player1_auth_id || !session.player2_auth_id) return; // both must be signed in
    if (winLossUpdatedRef.current) return; // only once per game session render
    winLossUpdatedRef.current = true;

    const myAuthId = currentUser.id;
    // Confirm I'm one of the authenticated players in this game
    if (myAuthId !== session.player1_auth_id && myAuthId !== session.player2_auth_id) return;

    const wonGame = session.winner === guestId;

    async function updateRecord() {
      const { data: profile } = await supabase
        .from('profiles')
        .select('wins, losses')
        .eq('id', myAuthId)
        .single();
      if (!profile) return;

      if (wonGame) {
        await supabase.from('profiles').update({ wins: profile.wins + 1 }).eq('id', myAuthId);
      } else {
        await supabase.from('profiles').update({ losses: profile.losses + 1 }).eq('id', myAuthId);
      }
    }
    updateRecord().catch(err => console.error('[WinLoss] Update failed:', err));
  }, [session?.status, session?.winner, currentUser, guestId]);

  // Persist replay on multiplayer game completion.
  // Only player1 inserts to avoid duplicate rows from both clients.
  // Fire-and-forget: failures are logged but do not affect the player experience.
  useEffect(() => {
    if (!session || session.status !== 'complete' || !supabase) return;
    if (!session.game_state || session.player1_id !== guestId) return;
    if (replayPersistedRef.current) return;
    replayPersistedRef.current = true;

    const gs = session.game_state;
    const p1 = gs.players?.[0];
    const p2 = gs.players?.[1];

    let winnerValue = 'draw';
    if (gs.winner === p1?.name) winnerValue = 'p1';
    else if (gs.winner === p2?.name) winnerValue = 'p2';

    const getCardIds = (player) => [
      ...(player?.hand || []),
      ...(player?.deck || []),
      ...(player?.discard || []),
      ...(player?.grave || []),
      ...(player?.banished || []),
    ].map(c => c.id);

    supabase.from('match_replays').insert({
      game_session_id: gameId,
      game_mode: 'multiplayer',
      p1_faction: p1?.deckId ?? null,
      p2_faction: p2?.deckId ?? null,
      p1_deck: p1 ? getCardIds(p1) : [],
      p2_deck: p2 ? getCardIds(p2) : [],
      winner: winnerValue,
      total_turns: gs.turn ?? 0,
      state_history: null, // stateHistory is stripped during multiplayer sync
      final_state: gs,
    }).then(({ error }) => {
      if (error) console.warn('[Replay] Multiplayer insert failed:', error.message);
    });
  }, [session?.status, gameId, guestId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play a chime when active_player transitions to the local player.
  const prevActivePlayerRef = useRef(null);
  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const prev = prevActivePlayerRef.current;
    prevActivePlayerRef.current = session.active_player;
    if (prev === null) return; // skip initial load
    if (prev !== session.active_player && session.active_player === guestId) {
      playTurnStartSound();
      playSfxDraw();
    }
  }, [session?.active_player, session?.status, guestId]);

  // Player 1 retry: if both decks are selected but game_state hasn't appeared
  // within 5 seconds, Player 1 re-generates and writes the initial state.
  // The timer fires as soon as Player 1's own deck is confirmed written —
  // the Supabase re-fetch inside the timer will find Player 2's deck even
  // when the Realtime listener missed the Player 2 deck-selection update.
  useEffect(() => {
    if (!session || !supabase) return;
    const isP1 = session.player1_id === guestId;
    if (!isP1) return;
    if (session.status !== 'deck_select') return;
    if (!session.player1_deck) return; // my deck not confirmed yet

    if (session.player2_deck) {
      console.log('[DeckSelect] Both decks set in React state; scheduling Player 1 retry in 5s if game has not started');
    } else {
      console.log('[DeckSelect] My deck written; scheduling 5s re-fetch in case Realtime missed P2 deck selection');
    }

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
      if (!latest) return;
      if (latest.status === 'active') {
        console.log('[DeckSelect] Retry: game already active — no action needed');
        return;
      }
      if (!latest.player1_deck || !latest.player2_deck) {
        console.log('[DeckSelect] Retry: P2 deck not yet present in Supabase — still waiting for deck selection');
        return;
      }

      console.log('[DeckSelect] Retry: both decks confirmed in Supabase — generating initial game state (Player 1)');
      const firstPlayerGuestId = latest.active_player || latest.player1_id;
      const isSwapped = firstPlayerGuestId === latest.player2_id;
      // Prefer JSONB spec columns (host_deck/guest_deck) for correct round-trip; fall back to text.
      const hostSpec = deckSpecToId(latest.host_deck) ?? latest.player1_deck;
      const guestSpec = deckSpecToId(latest.guest_deck) ?? latest.player2_deck;
      const p1DeckId = isSwapped ? guestSpec : hostSpec;
      const p2DeckId = isSwapped ? hostSpec : guestSpec;

      const s = createInitialState(p1DeckId, p2DeckId);
      s.activePlayer = 0;
      s.firstPlayer = 0;
      const p1ChampName = getChampionDef(s.players[0]).name;
      const p2ChampName = getChampionDef(s.players[1]).name;
      const p1FactionName = getDeckDisplayName(p1DeckId);
      const p2FactionName = getDeckDisplayName(p2DeckId);
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
        console.log('[DeckSelect] Retry succeeded — game_state written, status=active, active_player=' + firstPlayerGuestId);
      }
    }, 5000);

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [session?.status, session?.player1_deck, session?.player2_deck, gameId, guestId]);

  // Convert a JSONB deck spec (stored in host_deck/guest_deck) back to an engine deck-ID string.
  // JSONB objects are re-serialised; plain strings (faction IDs) are returned as-is.
  function deckSpecToId(spec) {
    if (!spec) return null;
    if (typeof spec === 'object') return JSON.stringify(spec);
    return spec;
  }

  // Deck selection: called when this player picks their faction
  const selectDeck = useCallback(async (deckId) => {
    if (!session || !supabase) return;

    const isP1 = session.player1_id === guestId;
    const deckField = isP1 ? 'player1_deck' : 'player2_deck';
    const deckJsonField = isP1 ? 'host_deck' : 'guest_deck';

    // Store deck spec as JSONB: parse custom JSON spec strings into objects so Supabase
    // stores them as proper JSONB; keep faction IDs as plain strings.
    let deckSpecJson;
    if (typeof deckId === 'string' && deckId.startsWith('{')) {
      try { deckSpecJson = JSON.parse(deckId); } catch { deckSpecJson = deckId; }
    } else {
      deckSpecJson = deckId;
    }

    // Write our deck choice (both text ID field and JSONB spec field)
    const updatePayload = {
      [deckField]: deckId,
      [deckJsonField]: deckSpecJson,
      updated_at: new Date().toISOString(),
    };

    // Only Player 1 is responsible for detecting both-decks-ready and initializing
    // game state. Player 2 just writes their deck and waits for the Realtime update.
    // This prevents both clients from racing to write game_state simultaneously.
    if (isP1) {
      // Prefer the JSONB spec (host_deck/guest_deck) for accurate round-trip; fall back to text field.
      const p2Deck = deckSpecToId(session.guest_deck) ?? session.player2_deck;
      console.log('[DeckSelect] Player 1 selecting deck — p1Deck=' + deckId + ', p2Deck=' + (p2Deck ?? 'null'));
      if (p2Deck) {
        console.log('[DeckSelect] Both decks confirmed in React state — Player 1 generating initial game state');
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

        console.log('[DeckSelect] Initial game state created — phase=' + initialState.phase + ', game_state non-null=' + (initialState != null) + ', firstPlayer=' + firstPlayerGuestId);
        updatePayload.game_state = initialState;
        updatePayload.status = 'active';
        updatePayload.active_player = firstPlayerGuestId;
      }
    }

    console.log('[DeckSelect] Writing to Supabase — status=' + (updatePayload.status ?? 'deck_select') + ', game_state=' + (updatePayload.game_state != null ? 'set' : 'null'));
    const { data: updated, error: updateError } = await supabase
      .from('game_sessions')
      .update(updatePayload)
      .eq('id', gameId)
      .select()
      .single();

    if (updateError) {
      console.error('[DeckSelect] Failed to write deck selection:', updateError);
    } else if (updated) {
      setSession({ ...updated, game_state: sanitizeGameState(updated.game_state) });
    }
  }, [session, gameId, guestId]);

  const dispatchAction = useCallback(async (newGameState) => {
    if (!session || !supabase) return;

    // Guard: prevent writing game state during opponent's action phase turn.
    // During mulligan both players may submit independently, so the guard is skipped.
    // This also prevents any AI evaluation path from accidentally writing state on the
    // opponent's turn if such a path were ever wired into the multiplayer component.
    if (newGameState.phase !== 'mulligan' && session.active_player !== guestId) {
      console.warn('[Multiplayer] dispatchAction skipped — not active player');
      return;
    }

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
        // Map losing engine index to guest ID, accounting for isSwapped.
        // When isSwapped, engine index 0 = player2 (first player); otherwise index 0 = player1.
        const winnerEngineIdx = 1 - losingChamp.owner;
        winnerGuestId = winnerEngineIdx === 0
          ? (isSwapped ? session.player2_id : session.player1_id)
          : (isSwapped ? session.player1_id : session.player2_id);
      }
    }

    // Strip stateHistory and log before syncing to Supabase.
    // stateHistory is in-memory only and grows with every turn.
    // log is maintained locally on each client to avoid bloating the JSONB column;
    // the realtime handler carries it forward for the passive player.
    const { stateHistory: _h, log, ...stateForSync } = newGameState;
    console.log('[Multiplayer] sync payload:', JSON.stringify(stateForSync).length, 'bytes | log entries:', (log ?? []).length);

    const { data: updated } = await supabase
      .from('game_sessions')
      .update({
        game_state: stateForSync,
        active_player: nextActiveGuestId,
        status: isComplete ? 'complete' : 'active',
        winner: winnerGuestId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .select()
      .single();

    // Inject the local log back into session so the active client retains the full log.
    if (updated) setSession({ ...updated, game_state: { ...sanitizeGameState(updated.game_state), log: log ?? [] } });
  }, [session, gameId, guestId]);

  // Submit this player's mulligan choice. Re-fetches before writing to capture
  // any concurrent opponent update, then re-fetches once more after writing to
  // detect the simultaneous-submit race (both clients fetched before either
  // wrote → each overwrites the other's selection). Re-applying own selection
  // to the re-fetched state merges them correctly.
  const submitMulliganAction = useCallback(async (playerIdx, cardIndices) => {
    if (!session || !supabase) return;

    // Record submission so the 5s fallback can retry if still stuck.
    setMyMulliganSubmission({ playerIdx, cardIndices });

    // Re-fetch latest state to capture any update from the opponent
    const { data: latest } = await supabase
      .from('game_sessions')
      .select('game_state')
      .eq('id', gameId)
      .single();

    const baseState = sanitizeGameState(latest?.game_state ?? session.game_state);
    if (!baseState || baseState.phase !== 'mulligan') {
      setMyMulliganSubmission(null);
      return;
    }

    const s = JSON.parse(JSON.stringify(baseState));
    submitMulligan(s, playerIdx, cardIndices);

    // If execution completed, advance to action phase
    let finalState = s;
    if (s.phase === 'begin-turn') {
      finalState = autoAdvancePhase(s);
    }

    await dispatchAction(finalState);

    if (finalState.phase !== 'mulligan') {
      setMyMulliganSubmission(null);
      return;
    }

    // Phase is still mulligan: our write only captured one selection.
    // Re-fetch to see if the opponent wrote theirs concurrently (and may have
    // overwritten ours). Re-apply own selection to the fresh row so both are
    // present, then advance.
    const { data: refetch } = await supabase
      .from('game_sessions')
      .select('game_state')
      .eq('id', gameId)
      .single();

    const rState = sanitizeGameState(refetch?.game_state);
    if (!rState || rState.phase !== 'mulligan') {
      setMyMulliganSubmission(null);
      return; // already advanced by the other client
    }

    const r = JSON.parse(JSON.stringify(rState));
    // Re-apply own selection (handles the case where opponent's write
    // overwrote ours, leaving only their selection in DB).
    submitMulligan(r, playerIdx, cardIndices);

    if (r.phase === 'begin-turn') {
      await dispatchAction(autoAdvancePhase(r));
      setMyMulliganSubmission(null);
    }
    // If still only one selection, the 5s fallback effect will retry.
  }, [session, gameId, dispatchAction]);

  // Fallback: if own mulligan was submitted but the game is still stuck in
  // mulligan phase after 5 seconds, re-fetch and retry the merge. This catches
  // any timing edge the double-fetch above missed.
  useEffect(() => {
    if (!myMulliganSubmission || !session || !supabase) return;
    if (session.game_state?.phase !== 'mulligan') {
      setMyMulliganSubmission(null);
      return;
    }

    const { playerIdx, cardIndices } = myMulliganSubmission;
    const timer = setTimeout(async () => {
      const { data: refetch } = await supabase
        .from('game_sessions')
        .select('game_state')
        .eq('id', gameId)
        .single();

      const rState = sanitizeGameState(refetch?.game_state);
      if (!rState || rState.phase !== 'mulligan') {
        setMyMulliganSubmission(null);
        return;
      }

      console.log('[Mulligan] 5s fallback firing — re-applying own selection and retrying');
      const r = JSON.parse(JSON.stringify(rState));
      submitMulligan(r, playerIdx, cardIndices);

      if (r.phase === 'begin-turn') {
        await dispatchAction(autoAdvancePhase(r));
        setMyMulliganSubmission(null);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [myMulliganSubmission, session?.game_state?.phase, gameId, dispatchAction]);

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
    if (updated) setSession({ ...updated, game_state: sanitizeGameState(updated.game_state) });
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
    // Alternate first player; fall back to player1_id if player2_id is somehow missing
    const nextFirstPlayer = lastFirstPlayerId === session.player1_id
      ? (session.player2_id ?? session.player1_id)
      : session.player1_id;

    const freshGameState = createInitialState();
    winLossUpdatedRef.current = false; // allow win/loss tracking for the new game
    replayPersistedRef.current = false; // allow replay insert for the new game
    const updateBody = {
      game_state: freshGameState,
      status: 'deck_select',
      winner: null,
      active_player: nextFirstPlayer,
      player1_deck: null,
      player2_deck: null,
      host_deck: null,
      guest_deck: null,
      updated_at: new Date().toISOString(),
    };

    console.log('[Rematch] PATCH game_sessions', { gameId, body: updateBody });

    const { data: updated, error: rematchError } = await supabase
      .from('game_sessions')
      .update(updateBody)
      .eq('id', gameId)
      .select()
      .single();

    if (rematchError) {
      console.error('[Rematch] PATCH failed', rematchError);
      return;
    }

    if (updated) setSession({ ...updated, game_state: sanitizeGameState(updated.game_state) });
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
      if (updated) setSession({ ...updated, game_state: sanitizeGameState(updated.game_state) });
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
    submitMulliganAction,
    inDeckSelect,
    myDeck,
    opponentDeck,
  };
}
