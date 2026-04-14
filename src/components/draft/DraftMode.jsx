import { useState } from 'react';
import DraftScreen from './DraftScreen.jsx';
import GauntletScreen from './GauntletScreen.jsx';
import DraftEndScreen from './DraftEndScreen.jsx';
import LegendaryRewardScreen from './LegendaryRewardScreen.jsx';
import DeckCutScreen from './DeckCutScreen.jsx';
import App from '../../App.jsx';
import {
  createDraftRunState,
  saveDraftRun,
  loadDraftRun,
  clearDraftRun,
} from '../../draft/draftRunState.js';

const MAX_LOSSES = 3;

/**
 * Top-level draft mode orchestrator.
 *
 * Props:
 *   onBackToLobby()   - navigate back to main lobby
 *   initialRun        - optional saved run state to resume (null = start fresh)
 */
export default function DraftMode({ onBackToLobby, initialRun = null }) {
  const [screen, setScreen] = useState(() => {
    if (initialRun && !initialRun.runComplete) return 'gauntlet';
    return 'draft';
  });

  const [runState, setRunState] = useState(() => {
    if (initialRun && !initialRun.runComplete) return initialRun;
    return createDraftRunState();
  });

  // Game launch params
  const [playerDeckSpec, setPlayerDeckSpec] = useState(null);
  const [aiDeckSpec, setAiDeckSpec] = useState(null);

  // Stage 5 state
  const [pendingLegendaryId, setPendingLegendaryId] = useState(null);

  // ── Draft complete → start gauntlet ──────────────────────────────────��────
  function handleDraftComplete({ primaryFaction, secondaryFaction, deck, legendaryIds }) {
    const newRun = {
      ...createDraftRunState(),
      primaryFaction,
      secondaryFaction,
      deck,
      legendaryIds,
    };
    setRunState(newRun);
    saveDraftRun(newRun);
    setScreen('gauntlet');
  }

  // ── Launch a game from the gauntlet ───────────────────────────────────────
  function handleLaunchGame(playerSpec, aiSpec) {
    // Store the AI deck spec in localStorage so useGameState can pick it up
    localStorage.setItem('gridholm_draft_ai_deck', aiSpec);
    setPlayerDeckSpec(playerSpec);
    setAiDeckSpec(aiSpec);
    setScreen('game');
  }

  // ── Game ended ────────────────────────────────────────────────────────────
  function handleGameEnd(didWin) {
    const newRun = { ...runState };

    if (didWin) {
      newRun.wins += 1;
      newRun.currentGame += 1;
      saveDraftRun(newRun);
      setRunState(newRun);
      setScreen('gauntlet');
    } else {
      newRun.losses += 1;
      newRun.currentGame += 1;

      if (newRun.losses >= MAX_LOSSES) {
        newRun.runComplete = true;
        saveDraftRun(newRun);
        setRunState(newRun);
        setScreen('end');
      } else {
        saveDraftRun(newRun);
        setRunState(newRun);
        setScreen('legendary_reward');
      }
    }
  }

  // ── Legendary reward selected ─────────────────────────────────────────────
  function handleLegendarySelected(cardId) {
    if (!cardId) {
      // No legendaries available — skip reward, go back to gauntlet
      setScreen('gauntlet');
      return;
    }
    // Add new legendary to deck (temporarily 31 cards) and go to deck cut
    setPendingLegendaryId(cardId);
    const deckWith31 = [...runState.deck, cardId];
    setRunState(prev => ({ ...prev, _pendingDeck31: deckWith31 }));
    setScreen('deck_cut');
  }

  // ── Deck cut complete ─────────────────────────────────────────────────────
  function handleCutComplete({ deck, legendaryIds }) {
    const newRun = { ...runState, deck, legendaryIds };
    delete newRun._pendingDeck31;
    saveDraftRun(newRun);
    setRunState(newRun);
    setPendingLegendaryId(null);
    setScreen('gauntlet');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (screen === 'draft') {
    return <DraftScreen onDraftComplete={handleDraftComplete} />;
  }

  if (screen === 'gauntlet') {
    return (
      <GauntletScreen
        runState={runState}
        onLaunchGame={handleLaunchGame}
        onRunComplete={() => setScreen('end')}
        onBackToMenu={onBackToLobby}
        onEndDraft={() => { clearDraftRun(); onBackToLobby(); }}
      />
    );
  }

  if (screen === 'game') {
    return (
      <App
        deckId={playerDeckSpec}
        isDraft={true}
        onBackToLobby={() => {
          // Player quit mid-game — return to gauntlet without recording result
          localStorage.removeItem('gridholm_draft_ai_deck');
          setScreen('gauntlet');
        }}
        onPlayAgain={() => handleGameEnd(false)}
        onGameEnd={handleGameEnd}
      />
    );
  }

  if (screen === 'legendary_reward') {
    return (
      <LegendaryRewardScreen
        runState={runState}
        onCardSelected={handleLegendarySelected}
      />
    );
  }

  if (screen === 'deck_cut') {
    return (
      <DeckCutScreen
        deck={runState._pendingDeck31 ?? runState.deck}
        newCardId={pendingLegendaryId}
        legendaryIds={runState.legendaryIds}
        onCutComplete={handleCutComplete}
      />
    );
  }

  if (screen === 'end') {
    return (
      <DraftEndScreen
        runState={runState}
        onDraftAgain={() => {
          clearDraftRun();
          setRunState(createDraftRunState());
          setScreen('draft');
        }}
        onBackToLobby={onBackToLobby}
      />
    );
  }

  return null;
}
