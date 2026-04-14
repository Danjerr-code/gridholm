import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  isMuted, setMuted, playCardPlaySound, playUnitSummonSound,
  playSfxAttack, playSfxMove, playSfxSpell, playSfxNoMana,
  playSfxWin, playSfxUheal, playSfxCheal, playSfxAttackBlock,
} from '../audio.js';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { getAuraAtkBonus, getEffectiveCost, checkWinner, getChampionDef, getChampionAbilityTargets } from '../engine/gameEngine.js';
import { KEYWORD_REMINDERS } from '../engine/keywords.js';
import { CARD_DB } from '../engine/cards.js';
import { ATTRIBUTES } from '../engine/attributes.js';
import DeckSelect from './DeckSelect.jsx';
import {
  getChampionMoveTiles,
  getSummonTiles,
  playCard,
  summonUnit,
  getUnitMoveTiles,
  getSpellTargets,
  getArcherShootTargets,
  triggerUnitAction,
  getApproachTiles,
  getTerrainCastTiles,
  getAmethystCacheTiles,
  manhattan,
} from '../engine/gameEngine.js';
import {
  handleChampionMove,
  handleUnitMove,
  handleTriggerUnitAction as execTriggerUnitAction,
  handleSpellTarget as execSpellTarget,
  handleCancelSpell as execCancelSpell,
  handleHandSelect as execHandSelect,
  handleGraveSelect as execGraveSelect,
  handleEndTurn,
  handleArcherShoot as execArcherShoot,
  handleDiscardCard as execDiscardCard,
  handleRevealUnit as execRevealUnit,
  handleDirectionTileSelect as execDirectionTileSelect,
  handleApproachAttack,
  handleFleshtitheSacrifice as execFleshtitheSacrifice,
  handleTerrainCast as execTerrainCast,
  handleRelicPlace as execRelicPlace,
  handleDeckPeekSelect as execDeckPeekSelect,
  handleGlimpseDecision as execGlimpseDecision,
  handleScryDismiss as execScryDismiss,
  handleContractSelect as execContractSelect,
  handleBloodPactFriendly as execBloodPactFriendly,
  handleBloodPactEnemy as execBloodPactEnemy,
  handleChampionAbility as execChampionAbility,
} from '../engine/actionHandler.js';
import { getGuestId, getCardImageUrl, supabase } from '../supabase.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import StatusBar, { ResourceDisplay } from './StatusBar.jsx';
import Board from './Board.jsx';
import Card from './Card.jsx';
import Hand from './Hand.jsx';
import Log from './Log.jsx';
import PhaseTracker from './PhaseTracker.jsx';
import GameEndOverlay from './GameEndOverlay.jsx';
import MulliganOverlay from './MulliganOverlay.jsx';
import TurnBanner from './TurnBanner.jsx';
import { CommandDisplay } from '../App.jsx';
import { renderRules } from '../utils/rulesText.jsx';
import GraveViewerModal from './GraveViewerModal.jsx';

const PHASE_GUIDANCE = {
  'begin-turn': 'Beginning turn…',
  action: 'Move your champion, play cards, and move units in any order. Click End Turn when done.',
  discard: 'You have too many cards. Click a card to discard.',
};


export default function MultiplayerGame({ gameId, onBackToLobby }) {
  const {
    session,
    loading,
    error,
    gameState,
    myPlayerIndex,
    isMyTurn,
    dispatchAction,
    guestId,
    opponentPresent,
    idleCountdown,
    concedeGame,
    abandonGame,
    proposeRematch,
    declineRematch,
    iHaveVoted,
    opponentHasVoted,
    selectDeck,
    submitMulliganAction,
    inDeckSelect,
    myDeck,
    opponentDeck,
    cancelWaiting,
  } = useMultiplayerGame(gameId);

  const { currentUser } = useAuth();
  const isMobile = useIsMobile();
  const [muted, setMutedState] = useState(() => isMuted());

  // Load profile decks from Supabase when the player is authenticated
  const [profileDecks, setProfileDecks] = useState(null);
  useEffect(() => {
    if (!currentUser || !supabase) {
      setProfileDecks(null);
      return;
    }
    supabase
      .from('decks')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProfileDecks(data ?? []);
      });
  }, [currentUser]);

  // Auto-select custom deck when player arrives from deck builder
  useEffect(() => {
    if (inDeckSelect && !myDeck) {
      const pending = localStorage.getItem('gridholm_pending_custom_deck');
      if (pending) {
        localStorage.removeItem('gridholm_pending_custom_deck');
        // Pass the full deck spec so it can be transmitted to the opponent via Supabase
        try {
          const saved = JSON.parse(localStorage.getItem('gridholm_custom_deck') || 'null');
          if (saved && Array.isArray(saved.cards) && saved.cards.length > 0) {
            selectDeck(JSON.stringify({
              type: 'custom',
              champion: saved.champion ?? saved.primaryAttr,
              primaryAttr: saved.primaryAttr ?? saved.champion,
              secondaryAttr: saved.secondaryAttr,
              cards: saved.cards,
              deckName: saved.deckName ?? 'Custom Deck',
            }));
            return;
          }
        } catch {}
        // Fallback: use 'custom' (reads from localStorage on same device)
        selectDeck('custom');
      }
    }
  }, [inDeckSelect, myDeck, selectDeck]);

  // Local UI selection state
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectMode, setSelectMode] = useState(null);
  const [selectedSacrificeUid, setSelectedSacrificeUid] = useState(null);
  const [pendingApproach, setPendingApproach] = useState(null);
  const [pendingChampionAbility, setPendingChampionAbility] = useState(null);
  const [inspectedItem, setInspectedItem] = useState(null);
  const [mobileModalItem, setMobileModalItem] = useState(null);
  const [mobilePrimedCard, setMobilePrimedCard] = useState(null);
  const [playAgainLoading, setPlayAgainLoading] = useState(false);
  const [isRematch, setIsRematch] = useState(false);
  const [showConcedeConfirm, setShowConcedeConfirm] = useState(false);
  const [opponentLeftCountdown, setOpponentLeftCountdown] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const copiedTimerRef = useRef(null);
  const prevStatusRef = useRef(null);
  const countdownRef = useRef(null);
  const prevGameStateRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const [opponentMoveTiles, setOpponentMoveTiles] = useState(new Set());
  const [spellGlowTile, setSpellGlowTile] = useState(null); // {row, col}
  // Grave viewer: null = closed, 0 = player 0's grave, 1 = player 1's grave
  const [graveViewerPlayer, setGraveViewerPlayer] = useState(null);
  const spellGlowTimerRef = useRef(null);
  const [extraLogEntries, setExtraLogEntries] = useState([]);
  const [handExpanded, setHandExpanded] = useState(true);
  const touchStartYRef = useRef(null);
  const [gameStartNotice, setGameStartNotice] = useState(null); // null | string
  const gameStartShownRef = useRef(false);
  const gameStartTimerRef = useRef(null);
  const [contractModalMinimized, setContractModalMinimized] = useState(false);

  // Reset minimize state whenever a new contract selection appears
  useEffect(() => {
    if (gameState?.pendingContractSelect) setContractModalMinimized(false);
  }, [gameState?.pendingContractSelect]);

  // Show "You Go First!" / "Opponent Goes First!" once when game state first arrives
  useEffect(() => {
    if (!gameState || myPlayerIndex === null) return;
    if (gameStartShownRef.current) return;
    // Only show on fresh game start (turn 1, no winner)
    if (gameState.turn !== 1 || gameState.winner) return;
    gameStartShownRef.current = true;
    const goFirst = gameState.firstPlayer === myPlayerIndex;
    setGameStartNotice(goFirst ? 'You Go First!' : 'Opponent Goes First!');
    gameStartTimerRef.current = setTimeout(() => setGameStartNotice(null), 2500);
    return () => clearTimeout(gameStartTimerRef.current);
  }, [gameState, myPlayerIndex]);

  // Reset the shown flag on rematch so the notice fires again
  useEffect(() => {
    if (isRematch) {
      gameStartShownRef.current = false;
    }
  }, [isRematch]);

  // Detect status transitions: rematch and opponent-left
  useEffect(() => {
    const prev = prevStatusRef.current;
    const cur = session?.status;
    if (prev === 'complete' && cur === 'deck_select') {
      setIsRematch(true);
    }
    if (cur === 'abandoned' && prev !== 'abandoned') {
      setOpponentLeftCountdown(5);
    }
    prevStatusRef.current = cur;
  }, [session?.status]);

  useEffect(() => {
    if (opponentLeftCountdown === null) return;
    if (opponentLeftCountdown <= 0) {
      onBackToLobby();
      return;
    }
    countdownRef.current = setTimeout(() => {
      setOpponentLeftCountdown(n => n - 1);
    }, 1000);
    return () => clearTimeout(countdownRef.current);
  }, [opponentLeftCountdown, onBackToLobby]);

  // Block Escape key while the Nezzar contract prompt is open — selection is mandatory
  useEffect(() => {
    if (!gameState?.pendingContractSelect) return;
    const block = (e) => { if (e.key === 'Escape') e.preventDefault(); };
    window.addEventListener('keydown', block, true);
    return () => window.removeEventListener('keydown', block, true);
  }, [gameState?.pendingContractSelect]);

  // Play win sound when local player wins
  const prevSessionWinnerRef = useRef(null);
  useEffect(() => {
    const prev = prevSessionWinnerRef.current;
    prevSessionWinnerRef.current = session?.winner;
    if (!prev && session?.winner && session.winner === guestId) {
      playSfxWin();
    }
  }, [session?.winner, guestId]);

  // Detect opponent moves for tile highlights and missing log entries
  useEffect(() => {
    const prev = prevGameStateRef.current;
    prevGameStateRef.current = gameState;

    if (!prev || !gameState || myPlayerIndex === null) return;

    const oppIndex = 1 - myPlayerIndex;
    const newLogSlice = (gameState.log ?? []).slice((prev.log ?? []).length);
    const movedTiles = new Set();
    const newEntries = [];

    // Detect opponent unit position changes
    for (const newUnit of gameState.units) {
      if (newUnit.owner !== oppIndex) continue;
      const prevUnit = prev.units.find(u => u.uid === newUnit.uid);
      if (!prevUnit) continue;
      if (prevUnit.row === newUnit.row && prevUnit.col === newUnit.col) continue;
      movedTiles.add(`${newUnit.row},${newUnit.col}`);
      // Hidden units do not reveal their position via the log
      if (newUnit.hidden) continue;
      // Plain move (no combat) — not logged by engine; add locally
      const alreadyLogged = newLogSlice.some(e => {
        const text = typeof e === 'string' ? e : (e?.text ?? '');
        return text.includes(newUnit.name) && (text.includes('attacks') || text.includes('moves') || text.includes('revealed') || text.includes('pounce'));
      });
      if (!alreadyLogged) {
        newEntries.push(`Opponent moves ${newUnit.name} to (${newUnit.row},${newUnit.col}).`);
      }
    }

    // Detect opponent champion moves for tile highlights
    const oppChampNew = gameState.champions.find(c => c.owner === oppIndex);
    const oppChampPrev = prev.champions.find(c => c.owner === oppIndex);
    if (oppChampNew && oppChampPrev && (oppChampNew.row !== oppChampPrev.row || oppChampNew.col !== oppChampPrev.col)) {
      movedTiles.add(`${oppChampNew.row},${oppChampNew.col}`);
    }

    if (movedTiles.size > 0) {
      setOpponentMoveTiles(movedTiles);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setOpponentMoveTiles(new Set()), 1000);
    }
    if (newEntries.length > 0) {
      setExtraLogEntries(prev => [...prev, ...newEntries]);
    }
  }, [gameState, myPlayerIndex]);

  const clearSelection = useCallback(() => {
    setSelectedCard(null);
    setSelectedUnit(null);
    setSelectMode(null);
    setPendingApproach(null);
    setPendingChampionAbility(null);
  }, []);

  const NO_TARGET_SPELL_EFFECTS = new Set([
    'overgrowth', 'packhowl', 'callofthesnakes', 'rally', 'crusade',
    'ironthorns', 'infernalpact', 'martiallaw', 'fortify',
    'ancientspring', 'shadowveil', 'verdantsurge', 'predatorsmark',
    'agonizingsymphony', 'pestilence', 'fatesledger', 'seconddawn',
  ]);

  // Dispatch helper: compute new state then write to Supabase
  const dispatch = useCallback(async (newState) => {
    clearSelection();
    // Ensure winner is detected from indirect damage (spells, triggers, passives) before sync
    if (newState && !newState.winner) {
      checkWinner(newState);
    }
    await dispatchAction(newState);
  }, [dispatchAction, clearSelection]);

  // ── Action handlers ────────────────────────────────────────────────────

  const handleChampionMoveTile = useCallback(async (row, col) => {
    if (!gameState) return;
    if (isMobile && !selectedCard) setHandExpanded(false);
    playSfxMove();
    await dispatch(handleChampionMove(gameState, row, col));
  }, [gameState, dispatch, isMobile, selectedCard]);

  const handlePlayCard = useCallback(async (cardUid) => {
    if (!gameState) return;

    // Second click on the already-selected card → deselect
    if (cardUid === selectedCard) {
      clearSelection();
      if (gameState.pendingSpell || gameState.pendingSummon) {
        await dispatch(execCancelSpell(gameState));
      }
      return;
    }

    setSelectedUnit(null);
    setSelectMode(null);

    // Auto-decline any pending Flesh Tithe sacrifice before processing new card
    const preFT = gameState.pendingFleshtitheSacrifice ? execFleshtitheSacrifice(gameState, 'no', null) : gameState;
    // Cancel any leftover pending state from a previous selection
    const base = (preFT.pendingSpell || preFT.pendingSummon || preFT.pendingTerrainCast || preFT.pendingRelicPlace) ? execCancelSpell(preFT) : preFT;
    const p = base.players[base.activePlayer];
    const graveAccessActive = base.graveAccessActive?.[base.activePlayer];
    const card = p.hand.find(c => c.uid === cardUid)
      || (graveAccessActive && (p.grave || []).find(c => c.uid === cardUid));
    if (!card) return;
    if (p.resources < getEffectiveCost(card, base, base.activePlayer)) { playSfxNoMana(); return; }

    // Targetless spell (and Pact of Ruin): preview mode — don't execute yet
    if (card.type === 'spell' && (NO_TARGET_SPELL_EFFECTS.has(card.effect) || card.effect === 'pactofruin')) {
      setSelectedCard(cardUid);
      setSelectMode('targetless_spell');
      if (base !== gameState) await dispatchAction(base);
      return;
    }

    const s = playCard(base, cardUid);
    if (s.pendingHandSelect) {
      setSelectedCard(cardUid);
      setSelectMode('hand_select');
      await dispatchAction(s);
    } else if (s.pendingSummon) {
      setSelectedCard(cardUid);
      setSelectMode('summon');
      await dispatchAction(s);
    } else if (s.pendingTerrainCast) {
      setSelectedCard(cardUid);
      setSelectMode('terrain_cast');
      await dispatchAction(s);
    } else if (s.pendingRelicPlace) {
      setSelectedCard(cardUid);
      setSelectMode('relic_place');
      await dispatchAction(s);
    } else if (s.pendingSpell) {
      setSelectedCard(cardUid);
      setSelectMode('spell');
      await dispatchAction(s);
    } else {
      await dispatch(s);
    }
  }, [gameState, selectedCard, clearSelection, dispatch, dispatchAction]);

  const handleCastTargetlessSpell = useCallback(async () => {
    if (!gameState || !selectedCard || selectMode !== 'targetless_spell') return;
    playSfxSpell();
    const s = playCard(gameState, selectedCard);
    // Pact of Ruin sets pendingHandSelect after cast; all other targetless spells complete immediately.
    if (s.pendingHandSelect) {
      setSelectedCard(null);
      setSelectedUnit(null);
      setSelectMode('hand_select');
      await dispatchAction(s);
    } else {
      await dispatch(s);
    }
  }, [gameState, selectedCard, selectMode, dispatch, dispatchAction]);

  const handleSummonOnTile = useCallback(async (row, col) => {
    if (!gameState || !selectedCard) return;
    const s = summonUnit(gameState, selectedCard, row, col);
    if (s.pendingHandSelect) {
      setSelectMode('hand_select');
      await dispatchAction(s);
    } else if (s.pendingFleshtitheSacrifice) {
      setSelectMode('fleshtithe_sacrifice');
      await dispatchAction(s);
    } else if (s.pendingSpell) {
      setSelectMode('spell');
      await dispatchAction(s);
    } else {
      if (!s.pendingSummon) playUnitSummonSound();
      await dispatch(s);
    }
  }, [gameState, selectedCard, dispatch, dispatchAction]);

  const handleFleshtitheSacrificeSelect = useCallback((uid) => {
    setSelectedSacrificeUid(uid);
  }, []);

  const handleFleshtitheSacrifice = useCallback(async (choice, sacrificeUid) => {
    if (!gameState) return;
    setSelectedSacrificeUid(null);
    await dispatch(execFleshtitheSacrifice(gameState, choice, sacrificeUid));
  }, [gameState, dispatch]);

  const handleTerrainCast = useCallback(async (row, col) => {
    if (!gameState || !selectedCard) return;
    await dispatch(execTerrainCast(gameState, selectedCard, row, col));
  }, [gameState, selectedCard, dispatch]);

  const handleRelicPlace = useCallback(async (row, col) => {
    if (!gameState) return;
    await dispatch(execRelicPlace(gameState, row, col));
  }, [gameState, dispatch]);

  const handleSpellTarget = useCallback(async (targetUid) => {
    if (!gameState) return;
    // Trigger spell glow on the targeted tile
    const targetUnit = gameState.units.find(u => u.uid === targetUid);
    const targetChamp = !targetUnit && gameState.champions?.find(c => 'champion' + c.owner === targetUid || c.uid === targetUid);
    const glowSource = targetUnit || targetChamp;
    if (glowSource) {
      if (spellGlowTimerRef.current) clearTimeout(spellGlowTimerRef.current);
      setSpellGlowTile({ row: glowSource.row, col: glowSource.col });
      spellGlowTimerRef.current = setTimeout(() => setSpellGlowTile(null), 600);
    }
    const cardUid = gameState.pendingSpell?.cardUid ?? selectedCard;
    if (!cardUid && !gameState.pendingSpell) return;
    const prevChampHp = gameState.champions[myPlayerIndex]?.hp ?? 0;
    const prevUnitHps = gameState.units.filter(u => u.owner === myPlayerIndex).map(u => ({ uid: u.uid, hp: u.hp }));
    const newState = execSpellTarget(gameState, cardUid, targetUid);
    if (newState.pendingSpell) {
      // Multi-step spell or action: stay in spell mode, don't clear selection
      await dispatchAction(newState);
    } else if (newState.pendingHandSelect) {
      // Spell step completed but a hand-select is now required (e.g. Toll of Shadows discard)
      playSfxSpell();
      setSelectMode('hand_select');
      await dispatchAction(newState);
    } else {
      playSfxSpell();
      if ((newState.champions[myPlayerIndex]?.hp ?? 0) > prevChampHp) playSfxCheal();
      const healed = prevUnitHps.find(({ uid, hp }) => {
        const after = newState.units.find(u => u.uid === uid);
        return after && after.hp > hp;
      });
      if (healed) playSfxUheal();
      await dispatch(newState);
    }
  }, [gameState, selectedCard, myPlayerIndex, dispatch, dispatchAction]);

  const handleGraveSelect = useCallback(async (graveUid) => {
    if (!gameState) return;
    const s = execGraveSelect(gameState, graveUid);
    if (!s.winner) checkWinner(s);
    if (s.pendingSummon?.rebirthMode) {
      setSelectedCard(s.pendingSummon.card.uid);
      setSelectMode('summon');
      await dispatchAction(s);
    } else if (s.pendingSpell) {
      setSelectMode('spell');
      await dispatchAction(s);
    } else {
      await dispatch(s);
    }
  }, [gameState, dispatch, dispatchAction]);

  const handleCancelSpell = useCallback(async () => {
    if (!gameState) return;
    await dispatch(execCancelSpell(gameState));
  }, [gameState, dispatch]);

  const handleEndAction = useCallback(async () => {
    if (!gameState) return;
    await dispatch(handleEndTurn(gameState));
  }, [gameState, dispatch]);

  const handleSelectChampion = useCallback(() => {
    setSelectedUnit(null);
    setSelectedCard(null);
    setSelectMode('champion_move');
    if (isMobile && !selectedCard) setHandExpanded(false);
  }, [isMobile, selectedCard]);

  const handleSelectUnit = useCallback((unitUid) => {
    setSelectedUnit(unitUid);
    setSelectMode('unit_move');
    if (isMobile && !selectedCard) setHandExpanded(false);
  }, [isMobile, selectedCard]);

  const handleMoveUnit = useCallback(async (row, col) => {
    if (!gameState || !selectedUnit) return;
    const result = handleUnitMove(gameState, selectedUnit, row, col);
    if (result.needsApproach) {
      setPendingApproach({ unitUid: selectedUnit, targetRow: row, targetCol: col });
      setSelectMode('approach_select');
      return;
    }
    const targetHasEnemy = gameState.units.some(u => u.owner !== gameState.activePlayer && u.row === row && u.col === col)
      || gameState.champions.some(ch => ch.owner !== gameState.activePlayer && ch.row === row && ch.col === col);
    if (targetHasEnemy) {
      const attackerSurvived = !!result.state.units.find(u => u.uid === selectedUnit);
      if (!attackerSurvived) playSfxAttackBlock(); else playSfxAttack();
    } else {
      playSfxMove();
    }
    await dispatch(result.state);
  }, [gameState, selectedUnit, dispatch]);

  const handleApproachTileChosen = useCallback(async (approachRow, approachCol) => {
    if (!gameState || !pendingApproach) return;
    const { unitUid, targetRow, targetCol } = pendingApproach;
    const next = handleApproachAttack(gameState, unitUid, approachRow, approachCol, targetRow, targetCol);
    const attackerSurvived = !!next.units.find(u => u.uid === unitUid);
    if (!attackerSurvived) playSfxAttackBlock(); else playSfxAttack();
    await dispatch(next);
  }, [gameState, pendingApproach, dispatch]);

  const handleArcherSelectTarget = useCallback((archerUid) => {
    setSelectedUnit(archerUid);
    setSelectMode('archer_target');
  }, []);

  const handleArcherShoot = useCallback(async (targetUid) => {
    if (!gameState || !selectedUnit) return;
    playSfxAttack();
    await dispatch(execArcherShoot(gameState, selectedUnit, targetUid));
  }, [gameState, selectedUnit, dispatch]);

  const handleDiscardCard = useCallback(async (cardUid) => {
    if (!gameState) return;
    await dispatch(execDiscardCard(gameState, cardUid));
  }, [gameState, dispatch]);

  const handleRevealUnit = useCallback(async (unitUid) => {
    if (!gameState) return;
    await dispatch(execRevealUnit(gameState, unitUid));
  }, [gameState, dispatch]);

  const handleDeckPeekSelect = useCallback(async (cardUid) => {
    if (!gameState) return;
    await dispatch(execDeckPeekSelect(gameState, cardUid));
  }, [gameState, dispatch]);

  const handleGlimpseDecision = useCallback(async (keepTop) => {
    if (!gameState) return;
    await dispatch(execGlimpseDecision(gameState, keepTop));
  }, [gameState, dispatch]);

  const handleScryDismiss = useCallback(async () => {
    if (!gameState) return;
    await dispatch(execScryDismiss(gameState));
  }, [gameState, dispatch]);

  const handleContractSelect = useCallback(async (contractId) => {
    if (!gameState) return;
    const s = execContractSelect(gameState, contractId);
    if (s.pendingHandSelect) {
      setSelectMode('hand_select');
      await dispatchAction(s);
    } else {
      await dispatch(s);
    }
  }, [gameState, dispatch, dispatchAction]);

  const handleBloodPactSelect = useCallback(async (unitUid) => {
    if (!gameState) return;
    let s;
    if (gameState.pendingBloodPact?.step === 'selectFriendly') {
      s = execBloodPactFriendly(gameState, unitUid);
    } else if (gameState.pendingBloodPact?.step === 'selectEnemy') {
      s = execBloodPactEnemy(gameState, unitUid);
    } else {
      return;
    }
    await dispatch(s);
  }, [gameState, dispatch]);

  // Units whose action needs a target (routes through pendingSpell / resolveSpell)
  const TARGETED_ACTION_UNITS = new Set(['battlepriestunit', 'woodlandguard', 'packrunner', 'elfarcher', 'clockworkmanimus', 'rootsongcommander']);

  const handleTriggerUnitAction = useCallback(async (unitUid) => {
    if (!gameState) return;
    const newState = execTriggerUnitAction(gameState, unitUid);
    if (newState.pendingSpell) {
      setSelectedCard(newState.pendingSpell.cardUid);
      setSelectMode('spell');
      await dispatchAction(newState);
    } else if (newState.pendingDirectionSelect) {
      setSelectMode('direction_tile_select');
      await dispatchAction(newState);
    } else {
      await dispatch(newState);
    }
  }, [gameState, dispatch, dispatchAction]);

  const handleActionButtonClick = useCallback((unitUid) => {
    if (!gameState) return;
    const unit = gameState.units.find(u => u.uid === unitUid);
    if (!unit) return;
    // Direction-select units: trigger action and enter tile selection mode
    if (unit.id === 'vornthundercaller' || unit.id === 'manacannon' || unit.id === 'ironqueen') {
      handleTriggerUnitAction(unitUid);
    } else if (TARGETED_ACTION_UNITS.has(unit.id)) {
      handleTriggerUnitAction(unitUid);
    } else {
      setSelectMode('action_confirm');
    }
  }, [gameState, TARGETED_ACTION_UNITS, handleTriggerUnitAction]);

  const handleConfirmAction = useCallback(async () => {
    if (!selectedUnit) return;
    await handleTriggerUnitAction(selectedUnit);
  }, [selectedUnit, handleTriggerUnitAction]);

  const handleDirectionTileSelect = useCallback(async (row, col) => {
    if (!gameState) return;
    const newState = execDirectionTileSelect(gameState, gameState.pendingDirectionSelect?.unitUid, row, col);
    clearSelection();
    await dispatch(newState);
  }, [gameState, dispatch, clearSelection]);

  const handleInspectUnit = useCallback((unit) => {
    setInspectedItem({ type: 'unit', uid: unit.uid });
    if (window.innerWidth < 768 && gameState) {
      const isMoveable = unit.owner === myPlayerIndex && !unit.moved && !unit.summoned;
      if (selectedUnit === unit.uid || !isMoveable || !isMyTurn || gameState.phase !== 'action') {
        setMobileModalItem({ type: 'unit', uid: unit.uid });
      }
    }
  }, [selectedUnit, myPlayerIndex, isMyTurn, gameState]);

  const handleInspectCard = useCallback((card) => {
    setInspectedItem({ type: 'card', card });
  }, []);

  const handleLogCardNameClick = useCallback((card) => {
    setInspectedItem({ type: 'card', card });
    if (isMobile) {
      setMobileModalItem({ type: 'card', card });
    }
  }, [isMobile]);

  const handleClearInspect = useCallback(() => {
    setInspectedItem(null);
  }, []);

  const handleInspectTerrain = useCallback((terrain) => {
    if (!terrain) {
      // Throne tile
      const item = { type: 'terrain', name: 'Throne' };
      setInspectedItem(item);
      if (window.innerWidth < 768) setMobileModalItem(item);
      return;
    }
    const card = Object.values(CARD_DB).find(c => c.type === 'terrain' && c.terrainEffect?.id === terrain.id) ?? null;
    const item = { type: 'terrain', name: terrain.ownerName || terrain.id, card };
    setInspectedItem(item);
    if (window.innerWidth < 768) setMobileModalItem(item);
  }, []);

  const handleInspectChampion = useCallback((playerIdx) => {
    setInspectedItem({ type: 'champion', playerIdx });
    if (window.innerWidth < 768) setMobileModalItem({ type: 'champion', playerIdx });
  }, []);

  const handleChampionAbilityActivate = useCallback((abilityId, targetFilter) => {
    if (!targetFilter) {
      // Targetless ability: apply immediately and sync
      if (!gameState) return;
      const next = execChampionAbility(gameState, myPlayerIndex, abilityId, null);
      dispatch(next);
      return;
    }
    setPendingChampionAbility({ abilityId, targetFilter });
    setSelectMode('champion_ability');
  }, [gameState, myPlayerIndex, dispatch]);

  const handleChampionAbilityTarget = useCallback(async (targetUid) => {
    if (!pendingChampionAbility || !gameState) return;
    const next = execChampionAbility(gameState, myPlayerIndex, pendingChampionAbility.abilityId, targetUid);
    setPendingChampionAbility(null);
    setSelectMode(null);
    await dispatch(next);
  }, [gameState, myPlayerIndex, pendingChampionAbility, dispatch]);

  const handleMobileModalDismiss = useCallback(() => {
    if (mobileModalItem?.type === 'card') {
      setMobilePrimedCard(mobileModalItem.card.uid);
    }
    setMobileModalItem(null);
  }, [mobileModalItem]);

  const handleMobileHandCardTap = useCallback((card) => {
    const canPlayNow = isMyTurn && gameState?.phase === 'action';
    if (mobilePrimedCard === card.uid && canPlayNow) {
      setMobilePrimedCard(null);
      handlePlayCard(card.uid);
    } else {
      setMobilePrimedCard(null);
      setMobileModalItem({ type: 'card', card });
    }
  }, [mobilePrimedCard, handlePlayCard, isMyTurn, gameState]);

  const handleProposeRematch = useCallback(async () => {
    if (playAgainLoading) return;
    setPlayAgainLoading(true);
    await proposeRematch();
    setPlayAgainLoading(false);
  }, [proposeRematch, playAgainLoading]);

  const handleDeclineRematch = useCallback(async () => {
    await declineRematch();
    onBackToLobby();
  }, [declineRematch, onBackToLobby]);

  // ── Loading / Error states ────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-gray-400 text-sm">Connecting to game…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
            onClick={onBackToLobby}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Deck selection phase
  if (inDeckSelect) {
    // Player hasn't selected their deck yet
    if (!myDeck) {
      return (
        <DeckSelect
          onSelect={selectDeck}
          waitingForOpponent={false}
          opponentSelected={!!opponentDeck}
          isRematch={isRematch}
          profileDecks={profileDecks}
        />
      );
    }
    // Player selected, waiting for opponent
    return (
      <DeckSelect
        onSelect={selectDeck}
        waitingForOpponent={true}
        selectedDeck={myDeck}
        opponentSelected={!!opponentDeck}
        isRematch={isRematch}
        profileDecks={profileDecks}
      />
    );
  }

  // Waiting for player 2 to join (legacy waiting status or pre-deck-select)
  if ((session?.status === 'waiting' || (session?.status === 'deck_select' && !session?.player2_id)) && myPlayerIndex === 0) {
    const gameLink = `${window.location.origin}${window.location.pathname}#/game/${gameId}`;
    const handleCopyLink = () => {
      navigator.clipboard.writeText(gameLink).then(() => {
        setCopiedLink(true);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
      });
    };
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#111827' }}>
        <div className="text-center flex flex-col gap-5" style={{ maxWidth: '340px', width: '100%' }}>
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '22px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.12em', margin: 0 }}>
            GRIDHOLM
          </h1>
          <p style={{ color: '#8a8aaa', fontSize: '13px', margin: 0 }}>Waiting for opponent to join…</p>
          <div style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3a',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#6a6a8a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Game ID</div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '32px', fontWeight: 700, color: '#C9A84C', letterSpacing: '0.18em' }}>{gameId}</div>
            </div>
            <div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#6a6a8a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>Share link</div>
              <div style={{
                background: '#070710',
                border: '1px solid #1a1a2e',
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '11px',
                color: '#8a8aaa',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
                textAlign: 'left',
              }}>
                {gameLink}
              </div>
              <button
                style={{
                  marginTop: '10px',
                  background: 'transparent',
                  color: copiedLink ? '#60a060' : '#C9A84C',
                  border: `1px solid ${copiedLink ? '#3a6a3a' : '#C9A84C40'}`,
                  borderRadius: '4px',
                  padding: '6px 18px',
                  cursor: 'pointer',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  transition: 'color 0.2s, border-color 0.2s',
                }}
                onClick={handleCopyLink}
              >
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>
          <button
            style={{
              background: 'transparent',
              color: '#3a3a5a',
              border: 'none',
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              letterSpacing: '0.05em',
            }}
            onMouseEnter={e => e.target.style.color = '#6a6a8a'}
            onMouseLeave={e => e.target.style.color = '#3a3a5a'}
            onClick={async () => { await cancelWaiting(); onBackToLobby(); }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // If player 2 slot is taken but we're neither player — show error
  if (session && myPlayerIndex === null) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">This game is already in progress.</p>
          <button
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
            onClick={onBackToLobby}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) return null;

  const state = gameState;
  const { phase, winner, pendingDiscard } = state;
  const isActiveTurn = isMyTurn;
  const p1 = state.players[0];
  const p2 = state.players[1];
  const myPlayer = state.players[myPlayerIndex];
  const oppPlayerIndex = 1 - myPlayerIndex;
  const oppPlayer = state.players[oppPlayerIndex];

  const selectedCardObj = selectedCard ? myPlayer.hand.find(c => c.uid === selectedCard) : null;
  const selectedUnitObj = selectedUnit ? state.units.find(u => u.uid === selectedUnit) : null;

  let guidance = isActiveTurn ? (PHASE_GUIDANCE[phase] || '') : 'Waiting for opponent…';
  if (pendingDiscard && isActiveTurn) guidance = PHASE_GUIDANCE.discard;
  if (selectMode === 'summon') guidance = 'Click a green tile to summon the unit.';
  if (selectMode === 'spell') guidance = 'Click a highlighted unit to target the spell.';
  if (selectMode === 'targetless_spell') {
    guidance = `Click Cast to play ${selectedCardObj?.name ?? 'spell'} or click the card again to cancel.`;
  }
  if (selectMode === 'unit_move') {
    guidance = selectedUnitObj?.action && !selectedUnitObj.moved
      ? `Move ${selectedUnitObj.name} to a highlighted tile or click Action to use its ability.`
      : 'Click a blue tile to move the unit. Or select another unit.';
  }
  if (selectMode === 'action_confirm' && selectedUnitObj) guidance = `Use ${selectedUnitObj.name} Action?`;
  if (selectMode === 'hand_select') guidance = 'Select a card from your hand to discard.';
  if (selectMode === 'fleshtithe_sacrifice') guidance = selectedSacrificeUid ? 'Confirm sacrifice for Flesh Tithe +2/+2, or Cancel to summon as 3/3.' : 'Select a friendly unit to sacrifice for Flesh Tithe +2/+2, or Cancel to summon as 3/3.';
  if (selectMode === 'terrain_cast') guidance = 'Click a tile to place the terrain card there.';
  if (selectMode === 'relic_place') guidance = 'Click an adjacent tile to place the Amethyst Crystal.';
  if (selectMode === 'approach_select') guidance = 'Multiple approach tiles available. Click a gold tile to position your unit before attacking.';
  if (selectMode === 'direction_tile_select') guidance = 'Click a highlighted tile to choose a direction.';
  if (selectMode === 'grave_select') guidance = 'Select a unit from your grave.';

  const showAction = selectedUnitObj?.action === true
    && !selectedUnitObj.moved
    && !selectedUnitObj.summoned
    && selectMode === 'unit_move'
    && phase === 'action'
    && isActiveTurn
    && !(selectedUnitObj.id === 'manacannon' && (state.players[myPlayerIndex]?.resources ?? 0) < 1);
  const showHiddenReveal = selectedUnitObj?.hidden
    && selectedUnitObj.owner === myPlayerIndex
    && !selectedUnitObj.moved
    && selectMode === 'unit_move'
    && phase === 'action'
    && isActiveTurn;

  // Derived highlight data (only valid when it's my turn and champion is explicitly selected)
  const championMoveTiles = phase === 'action' && isActiveTurn && selectMode === 'champion_move'
    ? getChampionMoveTiles(state)
    : [];

  const summonTiles = selectMode === 'summon'
    ? getSummonTiles(state)
    : [];

  const unitMoveTiles = selectMode === 'unit_move' && selectedUnit
    ? getUnitMoveTiles(state, selectedUnit)
    : [];

  const approachTiles = selectMode === 'approach_select' && pendingApproach
    ? (() => {
        const unit = state.units.find(u => u.uid === pendingApproach.unitUid);
        return unit ? getApproachTiles(state, unit, pendingApproach.targetRow, pendingApproach.targetCol) : [];
      })()
    : [];

  const directionTargetTiles = selectMode === 'direction_tile_select' && state.pendingDirectionSelect
    ? (() => {
        const unit = state.units.find(u => u.uid === state.pendingDirectionSelect.unitUid);
        if (!unit) return [];
        return [[-1, 0], [1, 0], [0, -1], [0, 1]]
          .map(([dr, dc]) => [unit.row + dr, unit.col + dc])
          .filter(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5);
      })()
    : [];

  const spellTargetUids = selectMode === 'spell' && state.pendingSpell
    ? (() => {
        const ps = state.pendingSpell;
        return getSpellTargets(state, ps.effect, ps.step || 0, ps.data || {});
      })()
    : [];

  const archerShootTargets = selectMode === 'archer_target' && selectedUnit
    ? getArcherShootTargets(state, selectedUnit)
    : [];

  const sacrificeTargetUids = selectMode === 'fleshtithe_sacrifice' && state.pendingFleshtitheSacrifice
    ? state.units
        .filter(u => u.owner === myPlayerIndex && u.uid !== state.pendingFleshtitheSacrifice.unitUid && !u.isRelic && !u.isOmen)
        .map(u => u.uid)
    : [];

  const terrainTargetTiles = selectMode === 'terrain_cast'
    ? getTerrainCastTiles(state)
    : [];

  const relicPlaceTiles = selectMode === 'relic_place'
    ? getAmethystCacheTiles(state)
    : [];

  const championAbilityTargetUids = selectMode === 'champion_ability' && pendingChampionAbility
    ? getChampionAbilityTargets(state, myPlayerIndex, pendingChampionAbility.targetFilter)
    : [];

  const handlers = {
    handleChampionMoveTile,
    handlePlayCard,
    handleCastTargetlessSpell,
    handleSummonOnTile,
    handleSpellTarget,
    handleCancelSpell,
    handleEndAction,
    handleSelectChampion,
    handleSelectUnit,
    handleMoveUnit,
    handleApproachTileChosen,
    handleArcherSelectTarget,
    handleArcherShoot,
    handleTriggerUnitAction,
    handleActionButtonClick,
    handleConfirmAction,
    handleDirectionTileSelect,
    handleRevealUnit,
    handleFleshtitheSacrificeSelect,
    handleFleshtitheSacrifice,
    handleTerrainCast,
    handleRelicPlace,
    handleDiscardCard,
    handleNewGame: onBackToLobby,
    clearSelection,
    handleInspectUnit,
    handleInspectCard,
    handleClearInspect,
    handleInspectTerrain,
    handleInspectChampion,
    handleChampionAbilityTarget,
  };

  const isImportantGuidance = selectMode === 'spell' || selectMode === 'summon' || selectMode === 'action_confirm' || selectMode === 'fleshtithe_sacrifice' || selectMode === 'targetless_spell' || selectMode === 'terrain_cast' || selectMode === 'relic_place' || selectMode === 'champion_ability';

  return (
    <div className="h-screen overflow-hidden text-white p-2 flex flex-col gap-2" style={{ background: '#0a0a0f', paddingBottom: isMobile ? '220px' : '8px' }}>
      {/* Opponent left overlay (after game over) */}
      {opponentLeftCountdown !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-60">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl p-8 text-center shadow-2xl max-w-xs">
            <p className="text-gray-300 font-bold mb-2">Opponent left the game</p>
            <p className="text-gray-500 text-sm">Returning to lobby in {opponentLeftCountdown}…</p>
          </div>
        </div>
      )}

      {/* Game start notice: "You Go First!" / "Opponent Goes First!" */}
      {gameStartNotice && (
        <div className="game-start-notice-anim" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          zIndex: 50,
          pointerEvents: 'none',
          fontFamily: "'Cinzel', serif",
          fontSize: '22px',
          fontWeight: 700,
          color: '#C9A84C',
          letterSpacing: '0.1em',
          textShadow: '0 0 24px #C9A84C88',
          whiteSpace: 'nowrap',
          background: 'rgba(0,0,0,0.82)',
          padding: '14px 32px',
          borderRadius: '6px',
          border: '1px solid #C9A84C44',
        }}>
          {gameStartNotice}
        </div>
      )}

      {/* Mulligan overlay — both players see this before play begins */}
      {phase === 'mulligan' && myPlayerIndex !== null && (
        <MulliganOverlay
          hand={state.players[myPlayerIndex].hand}
          deadline={state.mulliganDeadline}
          waitingFor={
            state.mulliganSelections?.[myPlayerIndex] !== null &&
            state.mulliganSelections?.[1 - myPlayerIndex] === null
              ? 'opponent'
              : null
          }
          onConfirm={(cardIndices) => submitMulliganAction(myPlayerIndex, cardIndices)}
        />
      )}

      {/* Winner overlay */}
      {winner && opponentLeftCountdown === null && (
        <GameEndOverlay isWinner={winner === myPlayer.name}>
          {/* Rematch flow: propose → wait → accept/decline */}
          {!iHaveVoted && !opponentHasVoted && (
            <button
              style={{
                background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                color: '#0a0a0f',
                fontFamily: "'Cinzel', serif",
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '4px',
                padding: '10px 24px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px #C9A84C40',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
              onClick={handleProposeRematch}
              disabled={playAgainLoading}
            >
              {playAgainLoading ? 'Proposing…' : 'Play Again'}
            </button>
          )}
          {iHaveVoted && !opponentHasVoted && (
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '12px',
              color: '#8a8aaa',
              padding: '10px 0',
              letterSpacing: '0.05em',
            }}>
              Waiting for opponent…
            </div>
          )}
          {!iHaveVoted && opponentHasVoted && (
            <>
              <div style={{
                fontFamily: "'Cinzel', serif",
                fontSize: '12px',
                color: '#C9A84C',
                marginBottom: '8px',
                letterSpacing: '0.05em',
              }}>
                Opponent proposes a rematch!
              </div>
              <button
                style={{
                  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                  color: '#0a0a0f',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px 24px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px #C9A84C40',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
                onClick={handleProposeRematch}
                disabled={playAgainLoading}
              >
                {playAgainLoading ? 'Starting…' : 'Accept'}
              </button>
              <button
                style={{
                  background: 'transparent',
                  color: '#6a6a8a',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #2a2a3a',
                  borderRadius: '4px',
                  padding: '10px 24px',
                  cursor: 'pointer',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
                onClick={handleDeclineRematch}
              >
                Decline
              </button>
            </>
          )}
          <button
            style={{
              background: 'transparent',
              color: '#6a6a8a',
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              fontWeight: 600,
              border: '1px solid #2a2a3a',
              borderRadius: '4px',
              padding: '10px 24px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
            onClick={async () => { await abandonGame(); onBackToLobby(); }}
          >
            Leave Game
          </button>
        </GameEndOverlay>
      )}

      {/* Idle countdown overlay (visible to both players) */}
      {idleCountdown !== null && !winner && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40">
          <div style={{
            background: '#0d0d1a',
            border: `1px solid ${idleCountdown <= 10 ? '#ef4444' : '#d97706'}`,
            borderRadius: '16px',
            padding: '24px 32px',
            textAlign: 'center',
            maxWidth: '280px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          }}>
            <p style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '13px',
              fontWeight: 600,
              color: isMyTurn ? '#fbbf24' : '#f97316',
              marginBottom: '8px',
              letterSpacing: '0.05em',
            }}>
              {isMyTurn ? 'Your turn is almost up!' : 'Opponent away'}
            </p>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '52px',
              fontWeight: 700,
              color: idleCountdown <= 10 ? '#ef4444' : '#C9A84C',
              lineHeight: 1,
              margin: '8px 0',
            }}>
              {idleCountdown}
            </div>
            <p style={{ fontSize: '12px', color: '#8080a0', marginTop: '8px' }}>
              {isMyTurn
                ? 'Take an action or you will forfeit.'
                : 'Reconnecting\u2026 forfeiting if no response.'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '18px', fontWeight: 600, color: '#C9A84C', letterSpacing: '0.1em' }}>GRIDHOLM</h1>
        <div className="flex gap-2 items-center">
          <span className="hidden sm:inline" style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#4a4a6a' }}>#{gameId}</span>
          {session?.status === 'active' && (
            <button
              style={{
                fontSize: '11px',
                color: '#4a3a3a',
                background: 'transparent',
                border: '1px solid #2a1a1a',
                borderRadius: '4px',
                padding: '2px 8px',
                cursor: 'pointer',
                fontFamily: "'Cinzel', serif",
              }}
              onMouseEnter={e => { e.target.style.color = '#8a4a4a'; e.target.style.borderColor = '#3a2a2a'; }}
              onMouseLeave={e => { e.target.style.color = '#4a3a3a'; e.target.style.borderColor = '#2a1a1a'; }}
              onClick={() => setShowConcedeConfirm(true)}
            >
              Concede
            </button>
          )}
          <button
            title={muted ? 'Unmute' : 'Mute'}
            style={{
              fontSize: '14px',
              color: muted ? '#4a4a6a' : '#C9A84C',
              background: 'transparent',
              border: '1px solid ' + (muted ? '#2a2a3a' : '#C9A84C60'),
              borderRadius: '4px',
              padding: '2px 8px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            style={{
              fontSize: '12px',
              color: '#6a6a8a',
              background: 'transparent',
              border: '1px solid #2a2a3a',
              borderRadius: '4px',
              padding: '2px 8px',
              cursor: 'pointer',
              fontFamily: "'Cinzel', serif",
            }}
            onMouseEnter={e => e.target.style.color = '#C9A84C'}
            onMouseLeave={e => e.target.style.color = '#6a6a8a'}
            onClick={onBackToLobby}
          >
            ← Lobby
          </button>
        </div>
      </div>

      {/* Concede confirmation dialog */}
      {showConcedeConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3a',
            borderRadius: '10px',
            padding: '28px 32px',
            textAlign: 'center',
            maxWidth: '320px',
            width: '90%',
          }}>
            <p style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#c0c0d8', marginBottom: '20px', lineHeight: 1.5 }}>
              Are you sure you want to concede?<br />This will end the game.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                style={{
                  background: '#2a1a1a',
                  color: '#bf6060',
                  border: '1px solid #3a2a2a',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                  fontWeight: 600,
                }}
                onClick={async () => { setShowConcedeConfirm(false); await concedeGame(); }}
              >
                Concede
              </button>
              <button
                style={{
                  background: 'transparent',
                  color: '#6a6a8a',
                  border: '1px solid #2a2a3a',
                  borderRadius: '4px',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                }}
                onClick={() => setShowConcedeConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <StatusBar
        state={state}
        myPlayerIndex={myPlayerIndex}
        commandsUsed={state.players[myPlayerIndex].commandsUsed ?? 0}
        opponentConnected={opponentPresent}
        onViewP1Grave={() => setGraveViewerPlayer(0)}
        onViewP2Grave={() => setGraveViewerPlayer(1)}
      />

      {/* Middle content row */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left column: phase tracker + card detail */}
        {!isMobile && (
          <div className="flex-shrink-0 flex flex-col gap-2" style={{ width: 220, minHeight: 0 }}>
            <PhaseTracker
              phase={phase}
              phaseChangeId={`${state.turn}-${state.activePlayer}-${phase}`}
            />
            <CardDetailPanel inspectedItem={inspectedItem} state={state} myPlayerIndex={myPlayerIndex} phase={phase} isActiveTurn={isActiveTurn} onChampionAbilityActivate={handleChampionAbilityActivate} />
          </div>
        )}

        {/* Center: board with command display as flex sibling */}
        <div className="flex flex-1 min-w-0 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <TurnBanner activePlayer={state.activePlayer} myPlayerIndex={myPlayerIndex} />
          <div className="flex items-center flex-1 min-h-0 justify-center">
          {!isMobile && (
            <div className="flex flex-shrink-0 items-center">
              <CommandDisplay commandsUsed={state.players[myPlayerIndex].commandsUsed ?? 0} />
            </div>
          )}
          <div className="flex-1 min-w-0 min-h-0">
          <Board
            state={state}
            selectedUnit={selectedUnit}
            selectMode={isActiveTurn ? selectMode : null}
            championMoveTiles={isActiveTurn ? championMoveTiles : []}
            summonTiles={isActiveTurn ? summonTiles : []}
            unitMoveTiles={isActiveTurn ? unitMoveTiles : []}
            approachTiles={isActiveTurn ? approachTiles : []}
            terrainTargetTiles={isActiveTurn ? terrainTargetTiles : []}
            relicPlaceTiles={isActiveTurn ? relicPlaceTiles : []}
            directionTargetTiles={isActiveTurn ? directionTargetTiles : []}
            spellTargetUids={isActiveTurn ? spellTargetUids : []}
            archerShootTargets={isActiveTurn ? archerShootTargets : []}
            sacrificeTargetUids={isActiveTurn ? sacrificeTargetUids : []}
            selectedSacrificeUid={isActiveTurn ? selectedSacrificeUid : null}
            championAbilityTargetUids={isActiveTurn ? championAbilityTargetUids : []}
            opponentMoveTiles={opponentMoveTiles}
            spellGlowTile={spellGlowTile}
            handlers={handlers}
            onInspectUnit={handleInspectUnit}
            onClearInspect={handleClearInspect}
            onInspectTerrain={handleInspectTerrain}
            isMyTurn={isActiveTurn}
            myPlayerIndex={myPlayerIndex}
            isMobile={isMobile}
            onLongPressUnit={isMobile ? handleInspectUnit : undefined}
            onLongPressDismiss={isMobile ? handleClearInspect : undefined}
          />
          </div>
          </div>
        </div>
        </div>

        {/* Right sidebar: game log + action buttons */}
        {!isMobile && (
          <div className="w-48 flex-shrink-0 flex flex-col gap-2" style={{ minHeight: 0 }}>
            <Log entries={[...(state.log ?? []), ...extraLogEntries]} onCardNameClick={handleLogCardNameClick} myPlayerIndex={myPlayerIndex} />

            {/* Action buttons panel */}
            <div
              className="flex flex-col gap-2 flex-shrink-0"
              style={{
                background: '#0a0a14',
                border: '1px solid #1e1e2e',
                borderRadius: '6px',
                padding: '8px',
              }}
            >
              <span
                style={{
                  fontFamily: "'Crimson Text', serif",
                  fontStyle: isImportantGuidance ? 'normal' : 'italic',
                  fontSize: '12px',
                  color: isImportantGuidance ? '#C9A84C' : '#8a8aaa',
                  lineHeight: 1.4,
                }}
              >{guidance}</span>

              {isActiveTurn && (
                <div className="flex flex-col gap-1">
                  {phase === 'action' && selectMode === 'summon' && (
                    <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && selectMode === 'spell' && (
                    <ActionBtn onClick={handleCancelSpell} label="Cancel Spell" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && selectedSacrificeUid && (
                    <ActionBtn onClick={() => handleFleshtitheSacrifice('yes', selectedSacrificeUid)} label="Confirm Sacrifice" variant="action" fullWidth />
                  )}
                  {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
                    <ActionBtn onClick={() => handleFleshtitheSacrifice('no', null)} label="Cancel (3/3)" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && selectMode === 'targetless_spell' && (
                    <>
                      <ActionBtn onClick={handleCastTargetlessSpell} label={isMobile ? 'Cast' : `Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="action" fullWidth />
                      <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" fullWidth />
                    </>
                  )}
                  {phase === 'action' && showAction && (
                    <ActionBtn
                      onClick={() => handleActionButtonClick(selectedUnit)}
                      label="Action"
                      variant="action"
                      fullWidth
                    />
                  )}
                  {phase === 'action' && selectMode === 'action_confirm' && selectedUnitObj && (
                    <>
                      <ActionBtn onClick={handleConfirmAction} label="Confirm" variant="action" fullWidth />
                      <ActionBtn onClick={clearSelection} label="Cancel" variant="cancel" fullWidth />
                    </>
                  )}
                  {phase === 'action' && showHiddenReveal && (
                    <ActionBtn
                      onClick={() => { handleRevealUnit(selectedUnit); clearSelection(); }}
                      label="Reveal"
                      variant="gold"
                      fullWidth
                    />
                  )}
                  {phase === 'action' && selectedUnit && (
                    <ActionBtn onClick={clearSelection} label="Deselect" variant="cancel" fullWidth />
                  )}
                  {phase === 'action' && (
                    <ActionBtn onClick={handleEndAction} label="End Turn →" variant="endphase" fullWidth />
                  )}
                  {pendingDiscard && (
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: '#C9A84C', fontWeight: 600 }}>Discard a card to continue</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile fixed bottom action bar */}
      {isMobile && isActiveTurn && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: '#0a0a14',
          borderTop: '1px solid #1e1e2e',
          padding: '8px 12px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}>
          {phase === 'action' && selectMode === 'summon' && (
            <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'spell' && (
            <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'fleshtithe_sacrifice' && (
            <ActionBtn onClick={() => handleFleshtitheSacrifice('no', null)} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectMode === 'targetless_spell' && (
            <>
              <ActionBtn onClick={handleCastTargetlessSpell} label={isMobile ? 'Cast' : `Cast ${selectedCardObj?.name ?? 'Spell'}`} variant="action" style={{ minHeight: '44px' }} />
              <ActionBtn onClick={handleCancelSpell} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
            </>
          )}
          {phase === 'action' && selectMode === 'action_confirm' && (
            <ActionBtn onClick={clearSelection} label="Cancel" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && selectedUnit && (
            <ActionBtn onClick={clearSelection} label="Deselect" variant="cancel" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
          {phase === 'action' && (
            <ActionBtn onClick={handleEndAction} label="End Turn →" variant="endphase" style={{ minHeight: '44px', minWidth: '44px' }} />
          )}
        </div>
      )}

      {/* Grave viewer modal */}
      {graveViewerPlayer !== null && gameState && (
        <GraveViewerModal
          cards={state.players[graveViewerPlayer].grave || []}
          title={`${state.players[graveViewerPlayer].name}'s Grave`}
          onClose={() => setGraveViewerPlayer(null)}
          canPlayFromGrave={graveViewerPlayer === myPlayerIndex && isActiveTurn && !!(gameState.graveAccessActive?.[myPlayerIndex])}
          onPlayCard={handlePlayCard}
          gameState={gameState}
          playerIndex={graveViewerPlayer}
          resources={state.players[graveViewerPlayer].resources}
        />
      )}

      {/* Grave select modal */}
      {gameState?.pendingGraveSelect && isActiveTurn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '520px',
            width: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
              Select a unit from your grave
            </div>
            {myPlayer.grave && myPlayer.grave.length > 0 ? (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {(gameState.pendingGraveSelect?.reason === 'rebirth'
                  ? myPlayer.grave.filter(u => u.type === 'unit' && !u.isOmen && !u.isRelic && !u.token && !u.isToken)
                  : myPlayer.grave
                ).map((card, idx) => {
                  const imageUrl = getCardImageUrl(card.image);
                  return (
                    <div
                      key={card.uid ?? idx}
                      onClick={() => handleGraveSelect(card.uid)}
                      style={{
                        background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                        border: '1px solid #3a3a60',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        minWidth: '100px',
                        maxWidth: '130px',
                        textAlign: 'center',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#3a3a60'}
                    >
                      {imageUrl && (
                        <img
                          src={imageUrl}
                          alt={card.name}
                          onError={e => { e.target.style.display = 'none'; }}
                          style={{ width: '100%', borderRadius: '4px', marginBottom: '6px', objectFit: 'cover', maxHeight: '70px' }}
                        />
                      )}
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '2px' }}>{card.name}</div>
                      <div style={{ fontSize: '10px', color: '#C9A84C', marginBottom: '2px' }}>Cost {card.cost}</div>
                      <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#6a6a8a', fontSize: '12px' }}>Your grave is empty.</div>
            )}
          </div>
        </div>
      )}

      {/* Deck peek modal — Arcane Lens (click-to-select), Glimpse (keep/shuffle), or Scry (dismiss) */}
      {gameState?.pendingDeckPeek && isActiveTurn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '480px',
            width: '90vw',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            {gameState.pendingDeckPeek.reason === 'scry' ? (
              <>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
                  Fennwick — Top card of your deck
                </div>
                {gameState.pendingDeckPeek.cards.map(card => (
                  <div key={card.uid} style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)', border: '1px solid #3a3a60', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#e8e8f0', marginBottom: '4px' }}>{card.name}</div>
                    <div style={{ fontSize: '10px', color: '#C9A84C' }}>Cost {card.cost}</div>
                    {card.type === 'unit' && <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>}
                    {card.rules && <div style={{ fontSize: '9px', color: '#6060a0', marginTop: '4px', lineHeight: 1.3 }}>{renderRules(card.rules)}</div>}
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleScryDismiss()}
                    style={{ background: '#1a1a2a', border: '1px solid #4a4a7a', borderRadius: '4px', color: '#a0a0d0', fontSize: '11px', padding: '6px 20px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >Dismiss</button>
                </div>
              </>
            ) : gameState.pendingDeckPeek.reason === 'glimpse' ? (
              <>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
                  Glimpse — Top card of your deck
                </div>
                {gameState.pendingDeckPeek.cards.map(card => (
                  <div key={card.uid} style={{ background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)', border: '1px solid #3a3a60', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 600, color: '#e8e8f0', marginBottom: '4px' }}>{card.name}</div>
                    <div style={{ fontSize: '10px', color: '#C9A84C' }}>Cost {card.cost}</div>
                    {card.type === 'unit' && <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>}
                    {card.rules && <div style={{ fontSize: '9px', color: '#6060a0', marginTop: '4px', lineHeight: 1.3 }}>{renderRules(card.rules)}</div>}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleGlimpseDecision(true)}
                    style={{ background: '#1a2a1a', border: '1px solid #2a7a2a', borderRadius: '4px', color: '#6cf06c', fontSize: '11px', padding: '6px 16px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >Keep on top</button>
                  <button
                    onClick={() => handleGlimpseDecision(false)}
                    style={{ background: '#2a1a1a', border: '1px solid #7a2a2a', borderRadius: '4px', color: '#f06c6c', fontSize: '11px', padding: '6px 16px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                  >Shuffle back</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#C9A84C', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
                  Arcane Lens — Choose a card to keep on top
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {gameState.pendingDeckPeek.cards.map(card => (
                    <div
                      key={card.uid}
                      onClick={() => handleDeckPeekSelect(card.uid)}
                      style={{
                        background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                        border: '1px solid #3a3a60',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        minWidth: '100px',
                        textAlign: 'center',
                        transition: 'border-color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#3a3a60'}
                    >
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '2px' }}>{card.name}</div>
                      <div style={{ fontSize: '10px', color: '#C9A84C', marginBottom: '2px' }}>Cost {card.cost}</div>
                      {card.type === 'unit' && <div style={{ fontSize: '10px', color: '#8080a0' }}>{card.atk}/{card.hp}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* My hand (face up) */}
      <div style={{
        flexShrink: 0,
        ...(isMobile && {
          position: 'fixed',
          bottom: '60px',
          left: 0,
          right: 0,
          zIndex: 38,
          transition: 'transform 0.3s ease',
          transform: handExpanded ? 'translateY(0)' : 'translateY(calc(100% - 28px))',
        }),
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          color: myPlayerIndex === 0 ? '#4a8abf' : '#bf4a4a',
          padding: '4px 8px 2px',
          fontWeight: 600,
        }}>
          <span>
            {myPlayer.name}
            <span className="hidden sm:inline" style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontWeight: 400, color: '#4a4a6a', fontSize: '12px' }}>
              {phase === 'action' && isActiveTurn ? '  (click cards to play)' : ''}
              {pendingDiscard && isActiveTurn ? '  — click a card to discard' : ''}
            </span>
          </span>
          {isMobile && (
            <button
              onClick={() => setHandExpanded(v => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6a6a8a',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 4px',
                lineHeight: 1,
              }}
            >
              {handExpanded ? '▼' : '▲'}
            </button>
          )}
        </div>
        <div className="hidden sm:flex" style={{ alignItems: 'center', justifyContent: 'center', gap: 12, padding: '4px 8px 8px' }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '10px 12px',
            background: '#0f0f1e',
            border: '1px solid #252538',
            borderRadius: 8,
            minWidth: 72,
            flexShrink: 0,
          }}>
            <button
              onClick={() => setGraveViewerPlayer(myPlayerIndex)}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                fontFamily: 'var(--font-sans)',
                background: '#12121e',
                border: '1px solid #3a3a5a',
                borderRadius: '4px',
                color: '#9a7abf',
                cursor: 'pointer',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
                marginBottom: 2,
              }}
            >☠ Grave</button>
            <div style={{ fontSize: 10, color: '#6a6a88', fontWeight: 500, fontFamily: 'var(--font-sans)', letterSpacing: '0.05em', marginBottom: 2 }}>
              MANA
            </div>
            <ResourceDisplay
              current={myPlayer.resources}
              max={10}
              maxThisTurn={myPlayer.maxResourcesThisTurn}
              playerColor={myPlayerIndex === 0 ? '#185FA5' : '#993C1D'}
              small={false}
            />
          </div>
          <div style={{ overflow: 'visible' }}>
            <Hand
              player={myPlayer}
              resources={myPlayer.resources}
              isActive={true}
              canPlay={isActiveTurn && phase === 'action'}
              gameState={gameState}
              playerIndex={myPlayerIndex}
              pendingDiscard={pendingDiscard && isActiveTurn}
              pendingHandSelect={isActiveTurn && selectMode === 'hand_select'}
              selectedCard={selectedCard}
              onPlayCard={handlePlayCard}
              onDiscardCard={handleDiscardCard}
              onHandSelect={async (cardUid) => {
                if (!gameState) return;
                const s = execHandSelect(gameState, cardUid);
                if (s.pendingSpell) {
                  if (!s.winner) checkWinner(s);
                  setSelectMode('spell');
                  await dispatchAction(s);
                } else {
                  await dispatch(s);
                }
              }}
              onInspectCard={handleInspectCard}
            />
          </div>
        </div>
        {/* Mobile: resources on top, hand scrollable below */}
        <div
          className="flex flex-col sm:hidden"
          style={{ padding: '4px 8px 8px' }}
          onTouchStart={e => { touchStartYRef.current = e.touches[0].clientY; }}
          onTouchEnd={e => {
            if (touchStartYRef.current === null) return;
            const delta = e.changedTouches[0].clientY - touchStartYRef.current;
            touchStartYRef.current = null;
            if (Math.abs(delta) > 30) setHandExpanded(delta < 0);
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            padding: '4px 0',
            marginBottom: 0,
          }}>
            <button
              onClick={() => setGraveViewerPlayer(myPlayerIndex)}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                fontFamily: 'var(--font-sans)',
                background: '#12121e',
                border: '1px solid #3a3a5a',
                borderRadius: '4px',
                color: '#9a7abf',
                cursor: 'pointer',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >☠ Grave</button>
            <ResourceDisplay current={myPlayer.resources} max={10} maxThisTurn={myPlayer.maxResourcesThisTurn} playerColor={myPlayerIndex === 0 ? '#185FA5' : '#993C1D'} singleRow={true} />
          </div>
          <Hand
            player={myPlayer}
            resources={myPlayer.resources}
            isActive={true}
            canPlay={isActiveTurn && phase === 'action'}
            gameState={gameState}
            playerIndex={myPlayerIndex}
            pendingDiscard={pendingDiscard && isActiveTurn}
            pendingHandSelect={isActiveTurn && selectMode === 'hand_select'}
            selectedCard={selectedCard}
            onPlayCard={handlePlayCard}
            onDiscardCard={handleDiscardCard}
            onHandSelect={async (cardUid) => {
              if (!gameState) return;
              const s = execHandSelect(gameState, cardUid);
              if (s.pendingSpell) {
                if (!s.winner) checkWinner(s);
                setSelectMode('spell');
                await dispatchAction(s);
              } else {
                await dispatch(s);
              }
            }}
            onInspectCard={handleInspectCard}
            isMobile={true}
            onMobileTap={handleMobileHandCardTap}
            onLongPressCard={handleInspectCard}
            onLongPressDismiss={handleClearInspect}
          />
        </div>
      </div>
      {/* Mobile card detail modal */}
      {mobileModalItem && (
        <CardDetailModal
          inspectedItem={mobileModalItem}
          state={state}
          onClose={handleMobileModalDismiss}
          myPlayerIndex={myPlayerIndex}
          phase={phase}
          isActiveTurn={isActiveTurn}
          onChampionAbilityActivate={(abilityId, targetFilter) => {
            handleMobileModalDismiss();
            handleChampionAbilityActivate(abilityId, targetFilter);
          }}
        />
      )}

      {/* Nezzar contract selection modal — only shown to the active player who owns Nezzar */}
      {state.pendingContractSelect && isMyTurn && (
        contractModalMinimized ? (
          <div
            onClick={() => setContractModalMinimized(false)}
            style={{
              position: 'fixed',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 50,
              background: '#1a0a0a',
              border: '1px solid #7a2a2a',
              borderBottom: 'none',
              borderRadius: '8px 8px 0 0',
              padding: '6px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              boxShadow: '0 -2px 12px rgba(0,0,0,0.6)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#EF4444', letterSpacing: '0.05em' }}>
              Choose a Contract
            </span>
            <span style={{ fontSize: '14px', color: '#EF4444', lineHeight: 1 }}>↑</span>
          </div>
        ) : (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.80)' }}
          >
            <div style={{
              background: '#0f0f1e',
              border: '1px solid #C9A84C60',
              borderRadius: '8px',
              padding: '20px',
              maxWidth: '600px',
              width: '92vw',
              boxShadow: '0 4px 32px rgba(0,0,0,0.8)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4px', position: 'relative' }}>
                <div style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#EF4444', fontVariant: 'small-caps', letterSpacing: '0.08em', textAlign: 'center' }}>
                  Nezzar, Terms and Conditions
                </div>
                <button
                  onClick={() => setContractModalMinimized(true)}
                  style={{
                    position: 'absolute',
                    right: 0,
                    background: 'transparent',
                    border: '1px solid #2a2a42',
                    borderRadius: '4px',
                    color: '#6060a0',
                    fontSize: '14px',
                    lineHeight: 1,
                    padding: '2px 7px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                  title="Minimize"
                >−</button>
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#8080a0', marginBottom: '16px', textAlign: 'center' }}>
                You must choose a contract to proceed.
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {state.pendingContractSelect.contracts.map(contract => (
                  <div
                    key={contract.id}
                    onClick={() => handleContractSelect(contract.id)}
                    style={{
                      background: 'linear-gradient(180deg, #1a0a0a 0%, #200d0d 100%)',
                      border: '1px solid #7a2a2a',
                      borderRadius: '6px',
                      padding: '12px',
                      cursor: 'pointer',
                      minWidth: '130px',
                      maxWidth: '160px',
                      textAlign: 'center',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#EF4444'; e.currentTarget.style.background = 'linear-gradient(180deg, #2a0a0a 0%, #300d0d 100%)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#7a2a2a'; e.currentTarget.style.background = 'linear-gradient(180deg, #1a0a0a 0%, #200d0d 100%)'; }}
                  >
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, color: '#EF4444', marginBottom: '6px', letterSpacing: '0.04em' }}>{contract.name}</div>
                    <div style={{ fontSize: '10px', color: '#c0a0a0', lineHeight: 1.4 }}>{contract.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      )}

      {/* Blood Pact — select a friendly unit to sacrifice */}
      {state.pendingBloodPact?.step === 'selectFriendly' && isMyTurn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '520px',
            width: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#EF4444', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
              Blood Pact — Sacrifice a friendly unit
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {state.units
                .filter(u => u.owner === myPlayerIndex && !u.isRelic && !u.isOmen && u.uid !== state.pendingBloodPact.nezzarUid)
                .map(u => (
                  <div
                    key={u.uid}
                    onClick={() => handleBloodPactSelect(u.uid)}
                    style={{
                      background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                      border: '1px solid #7a2a2a',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      minWidth: '90px',
                      textAlign: 'center',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#EF4444'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#7a2a2a'}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '2px' }}>{u.name}</div>
                    <div style={{ fontSize: '10px', color: '#8080a0' }}>{u.atk}/{u.hp}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Blood Pact — select an enemy unit to destroy */}
      {state.pendingBloodPact?.step === 'selectEnemy' && isMyTurn && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
        >
          <div style={{
            background: '#0f0f1e',
            border: '1px solid #C9A84C60',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '520px',
            width: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
          }}>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', color: '#EF4444', fontVariant: 'small-caps', letterSpacing: '0.08em', marginBottom: '12px', textAlign: 'center' }}>
              Blood Pact — Destroy an enemy unit
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {state.units
                .filter(u => u.owner !== myPlayerIndex && !u.isRelic && !u.isOmen)
                .map(u => (
                  <div
                    key={u.uid}
                    onClick={() => handleBloodPactSelect(u.uid)}
                    style={{
                      background: 'linear-gradient(180deg, #0d0d1a 0%, #141420 100%)',
                      border: '1px solid #7a2a2a',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      minWidth: '90px',
                      textAlign: 'center',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#EF4444'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#7a2a2a'}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e8e8f0', marginBottom: '2px' }}>{u.name}</div>
                    <div style={{ fontSize: '10px', color: '#8080a0' }}>{u.atk}/{u.hp}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getActiveKeywords(source) {
  const keys = ['rush', 'flying', 'hidden', 'action', 'legendary'];
  const result = [];
  for (const key of keys) {
    if (source[key]) result.push({ key, ...KEYWORD_REMINDERS[key] });
  }
  if (source.aura) {
    const range = source.aura.range;
    const base = KEYWORD_REMINDERS.aura;
    const label = range === 1 ? 'Aura 1' : range === 2 ? 'Aura 2' : base.label;
    result.push({ key: 'aura', ...base, label });
  }
  return result;
}

function KeywordBubbles({ keywords }) {
  const [openKey, setOpenKey] = useState(null);
  if (!keywords || keywords.length === 0) return null;
  const activeKw = keywords.find(kw => kw.key === openKey);
  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
        {keywords.map(kw => {
          const isOpen = openKey === kw.key;
          return (
            <div
              key={kw.key}
              onClick={() => setOpenKey(isOpen ? null : kw.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: isOpen ? `${kw.color}40` : `${kw.color}26`,
                border: `0.5px solid ${kw.color}`,
                borderRadius: '99px',
                padding: '4px 10px',
                marginRight: '6px',
                marginBottom: '6px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 500, color: kw.color, fontFamily: 'var(--font-sans)' }}>
                {kw.label}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          overflow: 'hidden',
          maxHeight: activeKw ? '120px' : '0',
          opacity: activeKw ? 1 : 0,
          transition: 'max-height 0.2s ease, opacity 0.2s ease',
        }}
      >
        {activeKw && (
          <div
            style={{
              fontSize: '12px',
              color: '#9090b8',
              lineHeight: 1.5,
              padding: '6px 8px',
              background: '#1a1a2e',
              borderRadius: '4px',
              borderLeft: `2px solid ${activeKw.color}`,
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span style={{ fontWeight: 500, color: activeKw.color }}>{activeKw.label}: </span>
            {activeKw.reminder}
          </div>
        )}
      </div>
    </div>
  );
}

function CardDetailContent({ inspectedItem, state, large = false, myPlayerIndex, phase, isActiveTurn, onChampionAbilityActivate }) {
  const nameStyle = { fontFamily: 'var(--font-sans)', fontSize: large ? '15px' : '15px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 };
  const typeStyle = { fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 500, color: '#9090b8' };
  const rulesStyle = {
    fontFamily: 'var(--font-sans)',
    fontStyle: 'normal',
    fontSize: '12px',
    fontWeight: 400,
    color: '#c0c0d8',
    lineHeight: 1.6,
    marginTop: '4px',
    borderTop: '0.5px solid #252538',
    paddingTop: '4px',
  };

  if (inspectedItem?.type === 'champion') {
    const playerIdx = inspectedItem.playerIdx ?? 0;
    const champ = state.champions[playerIdx];
    const player = state.players[playerIdx];
    if (!champ || !player) return null;
    const champDef = getChampionDef(player);
    const tier = player.resonance?.tier ?? 'none';
    const abilityUsed = champ.moved;
    const isOwn = playerIdx === myPlayerIndex;
    const ownerLabel = isOwn ? 'Friendly' : 'Enemy';
    const ownerColor = isOwn ? '#4a8abf' : '#bf4a4a';
    const champImageUrl = getCardImageUrl(champDef.image);

    // Ability section for own champion
    let abilitySection = null;
    if (isOwn && onChampionAbilityActivate && tier !== 'none' && phase === 'action' && isActiveTurn) {
      const ascended = champDef.abilities.ascended;
      const attuned = champDef.abilities.attuned;
      const attunedPassive = champDef.abilities.attunedPassive;
      let activatedAbility = attuned;
      if (tier === 'ascended' && ascended?.type === 'activated' && ascended?.replacesAbility) {
        activatedAbility = ascended;
      }
      let passiveAbility = null;
      if (tier === 'ascended' && ascended?.type === 'passive') passiveAbility = ascended;
      const costLabel = activatedAbility?.cost ? `${activatedAbility.cost.amount} ${activatedAbility.cost.type}` : null;
      const canAfford = activatedAbility?.cost
        ? (activatedAbility.cost.type === 'mana'
            ? player.resources >= activatedAbility.cost.amount
            : champ.hp > activatedAbility.cost.amount)
        : true;
      const hasValidTargets = activatedAbility?.targetFilter === 'friendly_unit_within_2'
        ? (state?.units ?? []).some(u => u.owner === champ.owner && !u.hidden && manhattan([champ.row, champ.col], [u.row, u.col]) <= 2)
        : activatedAbility?.targetFilter === 'friendly_unit'
          ? (state?.units ?? []).some(u => u.owner === champ.owner && !u.hidden)
          : true;
      const btnDisabled = !canAfford || abilityUsed || !hasValidTargets;
      abilitySection = (
        <div style={{ borderTop: '0.5px solid #252538', paddingTop: '6px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#9090b8', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-sans)' }}>Invoke:</div>
          {activatedAbility && (
            <button
              disabled={btnDisabled}
              onClick={() => !btnDisabled && onChampionAbilityActivate(activatedAbility.id, activatedAbility.targetRequired ? activatedAbility.targetFilter : null)}
              style={{
                background: btnDisabled ? 'transparent' : 'linear-gradient(135deg, #5a3a00, #8a6a00)',
                color: btnDisabled ? '#4a4a6a' : '#C9A84C',
                fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600,
                border: `1px solid ${btnDisabled ? '#2a2a3a' : '#C9A84C60'}`,
                borderRadius: '4px', padding: '5px 8px',
                cursor: btnDisabled ? 'not-allowed' : 'pointer',
                textAlign: 'left', width: '100%',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                <span>{activatedAbility.name}</span>
                {costLabel && <span style={{ fontSize: '10px', opacity: 0.8 }}>{costLabel}</span>}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 400, lineHeight: 1.4, opacity: 0.85 }}>{activatedAbility.description}</div>
              {abilityUsed && <div style={{ fontSize: '9px', color: '#6a6a8a', marginTop: '2px' }}>Invoke used — cannot move this turn</div>}
            </button>
          )}
          {passiveAbility && (
            <div style={{ fontSize: '11px', color: '#9090b8', fontFamily: 'var(--font-sans)', fontStyle: 'italic', lineHeight: 1.4, paddingLeft: '2px' }}>
              <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#b0a0c0' }}>{passiveAbility.name}:</span> {passiveAbility.description}
            </div>
          )}
          {attunedPassive && (
            <div style={{ fontSize: '11px', color: '#9090b8', fontFamily: 'var(--font-sans)', fontStyle: 'italic', lineHeight: 1.4, paddingLeft: '2px' }}>
              <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#b0a0c0' }}>{attunedPassive.name}:</span> {attunedPassive.description}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          {champImageUrl ? (
            <img src={champImageUrl} alt={champDef.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)', fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500 }}>Champion</div>
          )}
        </div>
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: '#C9A84C' }}>{champDef.name}</span>
          <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
        </div>
        <div style={typeStyle}>Champion · {tier !== 'none' ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'Unbound'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: champ.hp <= 5 ? '#f87171' : '#ffffff' }}>{champ.hp}/{champ.maxHp}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resonance</div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#C9A84C' }}>{player.resonance?.score ?? 0}</div>
          </div>
        </div>
        {champ.thornShield && (
          <div style={{ fontSize: '11px', color: '#67e8f9', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>🛡 Iron Thorns Shield (absorb {champ.thornShield.absorb}, thorn {champ.thornShield.thornDamage})</div>
        )}
        {abilitySection}
      </div>
    );
  }

  if (inspectedItem?.type === 'unit') {
    const unit = state.units.find(u => u.uid === inspectedItem.uid);
    if (!unit) return null;
    const ownerLabel = unit.owner === 0 ? 'P1' : 'P2';
    const ownerColor = unit.owner === 0 ? '#4a8abf' : '#bf4a4a';

    // Opponent's hidden unit: show redacted information
    const isOpponentHidden = unit.hidden && unit.owner !== myPlayerIndex;
    if (isOpponentHidden) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <span style={nameStyle}>Hidden Unit</span>
            <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
          </div>
          <div style={typeStyle}>Unknown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e05050' }}>⚔ ???</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#50c050' }}>♥ ???</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#5090e0' }}>⚡ ???</div>
          </div>
          <KeywordBubbles keywords={[{ key: 'hidden', ...KEYWORD_REMINDERS.hidden }]} />
        </div>
      );
    }

    const auraBonus = getAuraAtkBonus(state, unit);
    const displayAtk = unit.atk + (unit.atkBonus || 0) + auraBonus;
    const unitKeywords = !large ? getActiveKeywords(unit) : [];
    const unitImageUrl = getCardImageUrl(unit.image);
    return (
      <div className="flex flex-col gap-1">
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          {unitImageUrl ? (
            <img src={unitImageUrl} alt={unit.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)', fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500 }}>
              {unit.unitType || 'Unit'}
            </div>
          )}
        </div>
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: unit.legendary ? '#C9A84C' : '#ffffff' }}>{unit.name}</span>
          <span style={{ fontSize: '10px', color: ownerColor, fontFamily: 'var(--font-sans)' }}>{ownerLabel}</span>
        </div>
        {unit.unitType && <div style={typeStyle}>{unit.unitType}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e05050' }}>
              {displayAtk}{auraBonus > 0 && <span style={{ color: '#5eead4', fontSize: '11px' }}> +{auraBonus}</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#50c050' }}>{unit.isOmen ? '—' : `${unit.hp ?? '?'}/${unit.maxHp ?? '?'}`}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#5090e0' }}>{unit.spd + (unit.speedBonus || 0)}</div>
          </div>
        </div>
        {unit.shield > 0 && (
          <div style={{ fontSize: '11px', color: '#67e8f9', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>🛡 Shield: {unit.shield}</div>
        )}
        {unit.rules && <div style={rulesStyle}>{renderRules(unit.rules)}</div>}
        <KeywordBubbles keywords={unitKeywords} />
        {(() => {
          const tileTerrain = state.terrainGrid?.[unit.row]?.[unit.col] ?? null;
          const tileTCard = tileTerrain ? Object.values(CARD_DB).find(c => c.type === 'terrain' && c.terrainEffect?.id === tileTerrain.id) : null;
          if (!tileTCard) return null;
          const attrColor = ATTRIBUTES[tileTCard.attribute]?.color ?? '#9090b8';
          return (
            <div style={{ marginTop: '6px', borderTop: '0.5px solid #252538', paddingTop: '6px' }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#C9A84C', marginBottom: '3px', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>Terrain</div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: '12px', fontFamily: 'var(--font-sans)', marginBottom: '1px' }}>{tileTCard.name}</div>
              <div style={{ fontSize: '10px', color: attrColor, fontFamily: 'var(--font-sans)', marginBottom: '2px' }}>{ATTRIBUTES[tileTCard.attribute]?.name ?? tileTCard.attribute}</div>
              <div style={{ fontSize: '11px', color: '#c0c0d8', lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>{renderRules(tileTCard.rules)}</div>
            </div>
          );
        })()}
      </div>
    );
  }

  if (inspectedItem?.type === 'terrain') {
    const terrainKeyword = !large ? [{ key: 'terrain', ...KEYWORD_REMINDERS.terrain }] : [];
    const { card } = inspectedItem;
    if (card) {
      const attrColor = ATTRIBUTES[card.attribute]?.color ?? '#9090b8';
      const radiusNote = card.terrainRadius > 0
        ? `Area: all tiles within ${card.terrainRadius}.`
        : 'Area: target tile only.';
      return (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-start">
            <span style={nameStyle}>{card.name}</span>
            <span style={{ background: '#C9A84C', color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px' }}>{getEffectiveCost(card, state, myPlayerIndex)}</span>
          </div>
          <div style={{ ...typeStyle, color: attrColor }}>Terrain · {ATTRIBUTES[card.attribute]?.name ?? card.attribute}</div>
          <div style={{ ...rulesStyle, borderLeft: `2px solid ${attrColor}40`, paddingLeft: '6px' }}>
            {renderRules(card.rules)}
          </div>
          <div style={{ fontSize: '10px', color: '#6a6a88', fontFamily: 'var(--font-sans)', marginTop: '2px' }}>{radiusNote}</div>
          <KeywordBubbles keywords={terrainKeyword} />
        </div>
      );
    }
    // Throne tile (no card object)
    return (
      <div className="flex flex-col gap-1">
        <span style={nameStyle}>Throne</span>
        <div style={{ ...typeStyle, color: '#9090b8' }}>Terrain</div>
        <div style={rulesStyle}>
          Control the Throne with your champion to deal 2 damage to the enemy champion at the end of your turn. Cannot deal the winning blow this way.
        </div>
        <KeywordBubbles keywords={terrainKeyword} />
      </div>
    );
  }

  if (inspectedItem?.type === 'card') {
    const card = inspectedItem.card;
    const cardKeywords = !large ? getActiveKeywords(card) : [];
    const cardImageUrl = getCardImageUrl(card.image);
    return (
      <div className="flex flex-col gap-1">
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          {cardImageUrl ? (
            <img src={cardImageUrl} alt={card.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', WebkitTouchCallout: 'none', userSelect: 'none' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(156,163,175,1)', fontSize: '11px', fontFamily: "'Cinzel', serif", fontWeight: 500 }}>
              {card.type === 'spell' ? 'Spell' : (card.unitType || 'Unit')}
            </div>
          )}
        </div>
        <div className="flex justify-between items-start">
          <span style={{ ...nameStyle, color: card.legendary ? '#C9A84C' : '#ffffff' }}>{card.name}</span>
          <span style={{ background: '#C9A84C', color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 700, padding: '1px 7px', borderRadius: '99px' }}>{getEffectiveCost(card, state, myPlayerIndex)}</span>
        </div>
        <div style={typeStyle}>{card.type === 'spell' ? 'Spell' : card.unitType}</div>
        {card.type === 'unit' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ATK</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#e05050' }}>{card.atk}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HP</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#50c050' }}>{card.hp}</div>
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 500, color: '#6a6a88', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SPD</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#5090e0' }}>{card.spd}</div>
            </div>
          </div>
        )}
        {card.rules && <div style={rulesStyle}>{renderRules(card.rules)}</div>}
        <KeywordBubbles keywords={cardKeywords} />
      </div>
    );
  }

  return null;
}

function CardDetailPanel({ inspectedItem, state, myPlayerIndex, phase, isActiveTurn, onChampionAbilityActivate }) {
  const scrollRef = useRef(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 2);
  }, []);

  useEffect(() => {
    const t = setTimeout(checkScroll, 0);
    return () => clearTimeout(t);
  }, [inspectedItem, checkScroll]);

  const arrowStyle = {
    position: 'absolute', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(15,15,30,0.85)', color: '#6b7280', border: 'none',
    cursor: 'pointer', fontSize: '9px', lineHeight: 1, padding: '2px 8px',
    zIndex: 10,
  };

  return (
    <div
      style={{
        background: '#0f0f1e',
        border: '1px solid #252538',
        borderRadius: '6px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#C9A84C', marginBottom: '6px', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>Card Detail</div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {canScrollUp && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: -60, behavior: 'smooth' })}
            style={{ ...arrowStyle, top: 0, borderRadius: '0 0 4px 4px' }}
          >▲</button>
        )}
        <div
          ref={scrollRef}
          className="no-scrollbar"
          style={{ flex: 1, overflowY: 'auto', minHeight: 0, overflowWrap: 'break-word', wordBreak: 'break-word' }}
          onScroll={checkScroll}
        >
          {inspectedItem ? (
            <CardDetailContent inspectedItem={inspectedItem} state={state} myPlayerIndex={myPlayerIndex} phase={phase} isActiveTurn={isActiveTurn} onChampionAbilityActivate={onChampionAbilityActivate} />
          ) : (
            <div style={{ fontFamily: "'Crimson Text', serif", fontStyle: 'italic', fontSize: '11px', color: '#2a2a3a', lineHeight: 1.5 }}>
              Click a card or unit to inspect
            </div>
          )}
        </div>
        {canScrollDown && (
          <button
            onClick={() => scrollRef.current?.scrollBy({ top: 60, behavior: 'smooth' })}
            style={{ ...arrowStyle, bottom: 0, borderRadius: '4px 4px 0 0' }}
          >▼</button>
        )}
      </div>
    </div>
  );
}

function CardDetailModal({ inspectedItem, state, onClose, myPlayerIndex, phase, isActiveTurn, onChampionAbilityActivate }) {
  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', zIndex: 9999, paddingTop: 80 }}
      onClick={onClose}
    >
      <div
        className="relative bg-gray-900 border-2 border-amber-500 rounded-xl p-4 overflow-y-auto"
        style={{ width: 280, maxHeight: '70vh', zIndex: 10000 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          className="absolute top-2 right-2 flex items-center justify-center text-gray-400 hover:text-white text-sm"
          style={{ width: 44, height: 44 }}
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
        <div className="pr-6">
          <CardDetailContent inspectedItem={inspectedItem} state={state} large myPlayerIndex={myPlayerIndex} phase={phase} isActiveTurn={isActiveTurn} onChampionAbilityActivate={onChampionAbilityActivate} />
        </div>
      </div>
    </div>,
    document.body
  );
}

function ActionBtn({ onClick, label, variant = 'endphase', fullWidth = false, style: extraStyle }) {
  const styles = {
    endphase: {
      background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
      color: '#0a0a0f',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      fontWeight: 600,
      border: 'none',
      borderRadius: '4px',
      boxShadow: '0 2px 8px #C9A84C40',
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    },
    action: {
      background: 'linear-gradient(135deg, #5a3a00, #8a6a00)',
      color: '#C9A84C',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      fontWeight: 600,
      border: '1px solid #C9A84C60',
      borderRadius: '4px',
      letterSpacing: '0.04em',
    },
    cancel: {
      background: 'transparent',
      color: '#6a6a8a',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      border: '1px solid #2a2a3a',
      borderRadius: '4px',
    },
    gold: {
      background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
      color: '#0a0a0f',
      fontFamily: "'Cinzel', serif",
      fontSize: '12px',
      fontWeight: 600,
      border: 'none',
      borderRadius: '4px',
      boxShadow: '0 2px 8px #C9A84C40',
    },
  };

  return (
    <button
      className={`px-3 py-3 sm:py-1.5 cursor-pointer${fullWidth ? ' w-full sm:w-auto' : ''}`}
      style={{ ...(styles[variant] || styles.endphase), ...extraStyle }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
