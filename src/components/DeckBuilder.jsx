import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { CHAMPIONS } from '../engine/champions.js';
import { ATTRIBUTES, calculateResonance, RESONANCE_THRESHOLDS } from '../engine/attributes.js';
import { CARD_DB } from '../engine/cards.js';
import { supabase, getCardImageUrl, getGuestId } from '../supabase.js';
import { createInitialState, autoAdvancePhase } from '../engine/gameEngine.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import Card from './Card.jsx';
import { renderRules } from '../utils/rulesText.jsx';
import { ATTR_SYMBOLS } from '../assets/attributeSymbols.jsx';

const CUSTOM_DECK_KEY = 'gridholm_custom_deck';
const SAVED_DECKS_KEY = 'gridholm_saved_decks';

function generateGameId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const DECK_PANEL_STYLES = `
@keyframes db-bar-pulse {
  0%   { box-shadow: 0 0 0 0 #C9A84C00; }
  30%  { box-shadow: 0 0 12px 4px #C9A84CAA; }
  100% { box-shadow: 0 0 0 0 #C9A84C00; }
}
@keyframes db-bar-sweep {
  0%   { transform: translateX(-110%); }
  100% { transform: translateX(110%); }
}
@keyframes db-particle {
  0%   { transform: translate(0, 0) scale(1); opacity: 1; }
  100% { transform: translate(var(--pdx, 0px), var(--pdy, -12px)) scale(0); opacity: 0; }
}
@keyframes db-header-flash {
  0%   { }
  35%  { text-shadow: 0 0 10px currentColor; letter-spacing: 0.14em; }
  100% { }
}
`;

const PARTICLE_DIRS = [
  { dx: '-8px',  dy: '-14px' },
  { dx: '8px',   dy: '-14px' },
  { dx: '-14px', dy: '-6px'  },
  { dx: '14px',  dy: '-6px'  },
  { dx: '-4px',  dy: '-18px' },
  { dx: '4px',   dy: '-18px' },
  { dx: '-10px', dy: '-10px' },
  { dx: '10px',  dy: '-10px' },
];

function loadSavedDecks() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVED_DECKS_KEY) || '[]');
    return Array.isArray(data) ? data.slice(0, 3) : [];
  } catch { return []; }
}

function syncCustomDeck(decks) {
  if (!decks.length) { localStorage.removeItem(CUSTOM_DECK_KEY); return; }
  const recent = [...decks].sort((a, b) => b.savedAt - a.savedAt)[0];
  localStorage.setItem(CUSTOM_DECK_KEY, JSON.stringify({
    champion: recent.champion,
    primaryAttr: recent.primaryAttribute,
    secondaryAttr: recent.secondaryAttribute,
    cards: recent.cards,
    deckName: recent.name,
    resonanceScore: recent.resonance,
  }));
}

const ATTRIBUTE_ORDER = ['light', 'primal', 'mystic', 'dark'];

const CHAMPION_DESCRIPTIONS = {
  light: 'A radiant protector who shields allies and fortifies the battle line.',
  primal: 'A savage warlord who empowers allies and rewards conquest.',
  mystic: 'A nature-sage who nurtures life and summons an endless grove.',
  dark: 'A dark sorcerer who drains vitality to fuel terrible power.',
};

const FACTION_NAMES = {
  light: 'Light',
  primal: 'Primal',
  mystic: 'Mystic',
  dark: 'Dark',
};

const ATTR_GRADIENTS = {
  light: 'linear-gradient(135deg, #f8f0e0, #F0E6D2, #c4a882)',
  primal: 'linear-gradient(135deg, #5edb8a, #22C55E, #0f6b30)',
  mystic: 'linear-gradient(135deg, #c988fb, #A855F7, #6b1fa8)',
  dark: 'linear-gradient(135deg, #f47a7a, #EF4444, #8b1a1a)',
};

export default function DeckBuilder({ onBack, onNext }) {
  const [step, setStep] = useState('champion');
  const [selectedChampion, setSelectedChampion] = useState(null);
  const [secondaryAttr, setSecondaryAttr] = useState(null);
  // deck: { [cardId]: count }
  const [deck, setDeck] = useState({});
  const [deckName, setDeckName] = useState('My Deck');
  const [savedDecks, setSavedDecks] = useState(loadSavedDecks);
  const [saveFlash, setSaveFlash] = useState(false);
  const [saveModal, setSaveModal] = useState(null); // null | { overwrite: bool }
  const [saveNameInput, setSaveNameInput] = useState('');
  const [loadModal, setLoadModal] = useState(false);
  const [playDeckModal, setPlayDeckModal] = useState(null); // null | deck object
  const [deleteConfirm, setDeleteConfirm] = useState(null); // null | index
  const [inviteLink, setInviteLink] = useState(null); // null | string
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  // Pending change that requires deck-clear confirmation
  const [pendingChange, setPendingChange] = useState(null); // { type: 'champion'|'secondary', key: string }

  const { currentUser } = useAuth();
  const maxDecks = currentUser ? 5 : 3;
  const savedDeckExists = savedDecks.length > 0;

  // When user authenticates, fetch their decks from Supabase
  useEffect(() => {
    if (!currentUser || !supabase) return;
    supabase.from('decks').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const mapped = data.map(row => {
          const stored = row.cards;
          const cardIds = Array.isArray(stored) ? stored : (stored?.cards ?? []);
          return {
            supabaseId: row.id,
            name: row.name,
            champion: row.faction,
            primaryAttribute: row.faction,
            secondaryAttribute: stored?.secondaryAttribute ?? null,
            cards: cardIds,
            resonance: stored?.resonance ?? 0,
            savedAt: new Date(row.updated_at).getTime(),
          };
        });
        setSavedDecks(mapped);
        syncCustomDeck(mapped);
      });
  }, [currentUser]);

  // Auto-navigate to the game as soon as the opponent joins via invite link
  useEffect(() => {
    if (!inviteLink || !supabase) return;
    const gameId = inviteLink.split('/game/')[1];
    if (!gameId) return;

    const channel = supabase
      .channel('deck-builder-invite-' + gameId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: 'id=eq.' + gameId },
        (payload) => {
          if (payload.new?.player2_id) {
            window.location.hash = `/game/${gameId}`;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inviteLink]);

  const deckCardIds = useMemo(() => {
    return Object.entries(deck).flatMap(([id, count]) => Array(count).fill(id));
  }, [deck]);

  const deckCount = useMemo(() => deckCardIds.length, [deckCardIds]);
  const isValid = deckCount === 30;

  const handleSaveDeck = useCallback(() => {
    if (!selectedChampion || !secondaryAttr || !isValid) return;
    const nextNum = savedDecks.length + 1;
    const defaultName = `${FACTION_NAMES[selectedChampion] || 'My'} Deck ${nextNum}`;
    setSaveNameInput((deckName || '').trim() || defaultName);
    setSaveModal({ overwrite: savedDecks.length >= maxDecks });
  }, [selectedChampion, secondaryAttr, isValid, savedDecks.length, deckName, maxDecks]);

  const handleSaveDeckConfirm = useCallback(async (name, overwriteIdx = null) => {
    const cardObjs = deckCardIds.map(id => CARD_DB[id]).filter(Boolean);
    const resonanceScore = calculateResonance(cardObjs, selectedChampion);
    const defaultName = overwriteIdx !== null
      ? (savedDecks[overwriteIdx]?.name || `My Deck ${overwriteIdx + 1}`)
      : `${FACTION_NAMES[selectedChampion] || 'My'} Deck ${savedDecks.length + 1}`;
    const finalName = (name || '').trim() || defaultName;

    const entry = {
      name: finalName,
      champion: selectedChampion,
      primaryAttribute: selectedChampion,
      secondaryAttribute: secondaryAttr,
      cards: deckCardIds,
      resonance: resonanceScore,
      savedAt: Date.now(),
    };

    if (currentUser && supabase) {
      // Store cards as a rich object so secondary attr + resonance survive a round-trip
      const cardsPayload = { cards: deckCardIds, secondaryAttribute: secondaryAttr, resonance: resonanceScore };
      const existingSupabaseId = overwriteIdx !== null ? savedDecks[overwriteIdx]?.supabaseId : null;

      if (existingSupabaseId) {
        const { data } = await supabase.from('decks').update({
          name: finalName,
          cards: cardsPayload,
          faction: selectedChampion,
          updated_at: new Date().toISOString(),
        }).eq('id', existingSupabaseId).select().single();
        if (data) entry.supabaseId = data.id;
      } else {
        const { data } = await supabase.from('decks').insert({
          player_id: currentUser.id,
          name: finalName,
          cards: cardsPayload,
          faction: selectedChampion,
        }).select().single();
        if (data) entry.supabaseId = data.id;
      }

      const next = overwriteIdx !== null
        ? savedDecks.map((d, i) => i === overwriteIdx ? entry : d)
        : [...savedDecks, entry];
      syncCustomDeck(next);
      setSavedDecks(next);
    } else {
      const next = overwriteIdx !== null
        ? savedDecks.map((d, i) => i === overwriteIdx ? entry : d)
        : [...savedDecks, entry].slice(0, 3);
      localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(next));
      syncCustomDeck(next);
      setSavedDecks(next);
    }

    setSaveModal(null);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
  }, [selectedChampion, secondaryAttr, deckCardIds, savedDecks, currentUser]);

  function handleLoadSavedDeck(deckObj) {
    const deckMap = {};
    for (const id of deckObj.cards) {
      deckMap[id] = (deckMap[id] || 0) + 1;
    }
    setSelectedChampion(deckObj.primaryAttribute || deckObj.champion);
    setSecondaryAttr(deckObj.secondaryAttribute);
    setDeck(deckMap);
    setDeckName(deckObj.name || 'My Deck');
    setStep('browser');
  }

  function handleLoadDeck() {
    if (!savedDecks.length) return;
    setLoadModal(true);
  }

  async function handleDeleteSavedDeck(index) {
    const deckEntry = savedDecks[index];
    if (currentUser && supabase && deckEntry?.supabaseId) {
      await supabase.from('decks').delete().eq('id', deckEntry.supabaseId);
    }
    const next = savedDecks.filter((_, i) => i !== index);
    if (!currentUser || !supabase) {
      localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(next));
    }
    syncCustomDeck(next);
    setSavedDecks(next);
  }

  function handlePlay() {
    handleSaveDeck();
    if (onNext) onNext();
  }

  function handlePlayDeckAI(deckObj) {
    localStorage.setItem(CUSTOM_DECK_KEY, JSON.stringify({
      champion: deckObj.champion,
      primaryAttr: deckObj.primaryAttribute,
      secondaryAttr: deckObj.secondaryAttribute,
      cards: deckObj.cards,
      deckName: deckObj.name,
      resonanceScore: deckObj.resonance,
    }));
    window.location.hash = '/custom-ai';
  }

  async function handleSendMatchInvite(deckObj) {
    if (!supabase) return;
    setCreatingInvite(true);
    const hostDeckSpec = {
      champion: deckObj.champion,
      primaryAttr: deckObj.primaryAttribute,
      secondaryAttr: deckObj.secondaryAttribute,
      cards: deckObj.cards,
      deckName: deckObj.name,
      resonanceScore: deckObj.resonance,
    };
    localStorage.setItem(CUSTOM_DECK_KEY, JSON.stringify(hostDeckSpec));
    const guestId = getGuestId();
    const gameId = generateGameId();
    const placeholderState = autoAdvancePhase(createInitialState('human', 'human'));
    const { error } = await supabase.from('game_sessions').insert({
      id: gameId,
      player1_id: guestId,
      player1_auth_id: currentUser?.id ?? null,
      game_state: placeholderState,
      active_player: guestId,
      status: 'waiting',
      host_deck: hostDeckSpec,
    });
    setCreatingInvite(false);
    if (error) {
      console.error('[SendMatchInvite] Supabase insert error:', JSON.stringify(error, null, 2));
    } else {
      localStorage.setItem('gridholm_pending_custom_deck', '1');
      const base = window.location.href.replace(/#.*$/, '');
      setInviteLink(`${base}#/game/${gameId}`);
    }
  }

  function handleChampionSelect(attributeKey) {
    if (deckCount > 0) {
      setPendingChange({ type: 'champion', key: attributeKey });
      return;
    }
    setSelectedChampion(attributeKey);
    setStep('secondary');
  }

  function handleSecondarySelect(attributeKey) {
    if (deckCount > 0) {
      setPendingChange({ type: 'secondary', key: attributeKey });
      return;
    }
    setSecondaryAttr(attributeKey);
    setStep('browser');
  }

  function confirmPendingChange() {
    if (!pendingChange) return;
    setDeck({});
    if (pendingChange.type === 'champion') {
      setSelectedChampion(pendingChange.key);
      setSecondaryAttr(null);
      setStep('secondary');
    } else {
      setSecondaryAttr(pendingChange.key);
      setStep('browser');
    }
    setPendingChange(null);
  }

  function handleAddCard(cardId) {
    const card = CARD_DB[cardId];
    if (!card) return;
    const maxCopies = card.legendary ? 1 : 2;
    const current = deck[cardId] || 0;
    if (current >= maxCopies) return;
    setDeck(prev => ({ ...prev, [cardId]: current + 1 }));
  }

  function handleRemoveCard(cardId) {
    const current = deck[cardId] || 0;
    if (current <= 0) return;
    setDeck(prev => {
      const next = { ...prev, [cardId]: current - 1 };
      if (next[cardId] === 0) delete next[cardId];
      return next;
    });
  }

  function handleClearDeck() {
    setDeck({});
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#f9fafb',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: step === 'browser' ? 'flex-start' : 'center',
      padding: '16px',
      gap: '24px',
    }}>
      {/* Confirm deck-clear dialog */}
      {pendingChange && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}>
          <div style={{
            background: '#0d0d1a',
            border: '1px solid #2a2a3a',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '360px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: '16px', color: '#C9A84C', margin: 0 }}>
              {pendingChange.type === 'champion' ? 'Change Champion?' : 'Change Secondary Attribute?'}
            </h3>
            <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '15px', color: '#9ca3af', margin: 0, lineHeight: 1.6 }}>
              {pendingChange.type === 'champion'
                ? 'Changing your champion will clear all cards in your deck since the legal card pool will change.'
                : 'Changing your secondary attribute will clear all cards in your deck since some cards may no longer be legal.'}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                  color: '#0a0a0f',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  padding: '10px',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
                onClick={confirmPendingChange}
              >
                Clear &amp; Continue
              </button>
              <button
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: '#6a6a8a',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '12px',
                  border: '1px solid #2a2a3a',
                  borderRadius: '4px',
                  padding: '10px',
                  cursor: 'pointer',
                }}
                onClick={() => setPendingChange(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete deck confirmation modal */}
      {deleteConfirm !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div style={{
            background: '#0d0d1a', border: '1px solid #2a2a3a',
            borderRadius: '8px', padding: '24px',
            maxWidth: '320px', width: '100%',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: '15px', color: '#C9A84C', margin: 0, letterSpacing: '0.06em' }}>
              Delete saved deck?
            </h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                style={{
                  flex: 1, background: 'linear-gradient(135deg, #6a1a1a, #aa2a2a)',
                  color: '#f9fafb', fontFamily: "'Cinzel', serif",
                  fontSize: '12px', fontWeight: 600,
                  border: '1px solid #aa3a3a', borderRadius: '4px',
                  padding: '10px', cursor: 'pointer', letterSpacing: '0.04em',
                }}
                onClick={() => { handleDeleteSavedDeck(deleteConfirm); setDeleteConfirm(null); }}
              >
                Yes
              </button>
              <button
                style={{
                  flex: 1, background: 'transparent', color: '#6a6a8a',
                  fontFamily: "'Cinzel', serif", fontSize: '12px',
                  border: '1px solid #2a2a3a', borderRadius: '4px',
                  padding: '10px', cursor: 'pointer',
                }}
                onClick={() => setDeleteConfirm(null)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Play deck modal */}
      {playDeckModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div style={{
            background: '#0d0d1a', border: '1px solid #2a2a3a',
            borderRadius: '8px', padding: '24px',
            maxWidth: '340px', width: '100%',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#C9A84C', margin: 0, letterSpacing: '0.06em' }}>
              {playDeckModal.name}
            </h3>
            {!inviteLink ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  disabled={creatingInvite}
                  style={{
                    background: creatingInvite ? '#1a2a3a' : 'linear-gradient(135deg, #1a2a4a, #2a4a8a)',
                    color: '#e2e8f0', fontFamily: "'Cinzel', serif",
                    fontSize: '12px', fontWeight: 600,
                    border: '1px solid #3a5a9a', borderRadius: '4px',
                    padding: '12px', cursor: creatingInvite ? 'default' : 'pointer',
                    letterSpacing: '0.04em', opacity: creatingInvite ? 0.7 : 1,
                  }}
                  onClick={() => handleSendMatchInvite(playDeckModal)}
                >
                  {creatingInvite ? 'Creating...' : 'Send Match Invite'}
                </button>
                <button
                  style={{
                    background: 'linear-gradient(135deg, #1a3a2a, #2a6a4a)',
                    color: '#e2e8f0', fontFamily: "'Cinzel', serif",
                    fontSize: '12px', fontWeight: 600,
                    border: '1px solid #3a8a5a', borderRadius: '4px',
                    padding: '12px', cursor: 'pointer', letterSpacing: '0.04em',
                  }}
                  onClick={() => handlePlayDeckAI(playDeckModal)}
                >
                  Play vs AI
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#9ca3af', margin: 0 }}>
                  Share this link with your opponent:
                </p>
                <div style={{
                  background: '#141428', border: '1px solid #2a2a3a', borderRadius: '4px',
                  padding: '8px 12px', fontFamily: 'monospace', fontSize: '11px',
                  color: '#6a8ac9', wordBreak: 'break-all',
                }}>
                  {inviteLink}
                </div>
                <button
                  style={{
                    background: inviteLinkCopied ? 'linear-gradient(135deg, #1a3a2a, #2a6a4a)' : 'linear-gradient(135deg, #1a2a4a, #2a4a8a)',
                    color: '#e2e8f0', fontFamily: "'Cinzel', serif",
                    fontSize: '12px', fontWeight: 600,
                    border: `1px solid ${inviteLinkCopied ? '#3a8a5a' : '#3a5a9a'}`, borderRadius: '4px',
                    padding: '10px', cursor: 'pointer', letterSpacing: '0.04em',
                  }}
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink).then(() => {
                      setInviteLinkCopied(true);
                      setTimeout(() => setInviteLinkCopied(false), 2000);
                    });
                  }}
                >
                  {inviteLinkCopied ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  style={{
                    background: 'linear-gradient(135deg, #1a3a2a, #2a6a4a)',
                    color: '#e2e8f0', fontFamily: "'Cinzel', serif",
                    fontSize: '12px', fontWeight: 600,
                    border: '1px solid #3a8a5a', borderRadius: '4px',
                    padding: '10px', cursor: 'pointer', letterSpacing: '0.04em',
                  }}
                  onClick={() => window.location.hash = `/game/${inviteLink.split('/game/')[1]}`}
                >
                  Open Game
                </button>
              </div>
            )}
            <button
              style={{
                background: 'transparent', color: '#6a6a8a',
                fontFamily: "'Cinzel', serif", fontSize: '12px',
                border: '1px solid #2a2a3a', borderRadius: '4px',
                padding: '8px', cursor: 'pointer',
              }}
              onClick={() => { setPlayDeckModal(null); setInviteLink(null); setInviteLinkCopied(false); }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Save deck modal */}
      {saveModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div style={{
            background: '#0d0d1a', border: '1px solid #2a2a3a',
            borderRadius: '8px', padding: '24px',
            maxWidth: '360px', width: '100%',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#C9A84C', margin: 0, letterSpacing: '0.06em' }}>
              {saveModal.overwrite ? 'Choose Slot to Overwrite' : 'Name Your Deck'}
            </h3>
            {!saveModal.overwrite ? (
              <>
                <input
                  value={saveNameInput}
                  onChange={e => setSaveNameInput(e.target.value)}
                  placeholder={`My Deck ${savedDecks.length + 1}`}
                  autoFocus
                  style={{
                    background: '#141428', border: '1px solid #2a2a3a', borderRadius: '4px',
                    padding: '8px 12px', color: '#C9A84C',
                    fontFamily: "'Cinzel', serif", fontSize: '13px',
                    outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveDeckConfirm(saveNameInput); }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    style={{
                      flex: 1, background: 'linear-gradient(135deg, #8a6a00, #C9A84C)',
                      color: '#0a0a0f', fontFamily: "'Cinzel', serif",
                      fontSize: '11px', fontWeight: 600, border: 'none',
                      borderRadius: '4px', padding: '9px', cursor: 'pointer', letterSpacing: '0.04em',
                    }}
                    onClick={() => handleSaveDeckConfirm(saveNameInput)}
                  >
                    Save
                  </button>
                  <button
                    style={{
                      flex: 1, background: 'transparent', color: '#6a6a8a',
                      fontFamily: "'Cinzel', serif", fontSize: '11px',
                      border: '1px solid #2a2a3a', borderRadius: '4px',
                      padding: '9px', cursor: 'pointer',
                    }}
                    onClick={() => setSaveModal(null)}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '14px', color: '#9ca3af', margin: 0 }}>
                  All {maxDecks} slots are full. Choose a deck to overwrite:
                </p>
                {savedDecks.map((d, i) => {
                  const attr = ATTRIBUTES[d.champion] || {};
                  const tierLabel = d.resonance >= 42 ? 'Ascended' : d.resonance >= 20 ? 'Attuned' : 'Unaligned';
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#141428', borderRadius: '4px', padding: '8px 10px',
                      border: '1px solid #2a2a3a',
                    }}>
                      <div>
                        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: attr.color || '#C9A84C', fontWeight: 600 }}>{d.name}</div>
                        <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#4a4a6a', letterSpacing: '0.06em', marginTop: '2px' }}>
                          {attr.name || d.champion} · {tierLabel} · {d.cards.length} cards
                        </div>
                      </div>
                      <button
                        style={{
                          background: '#EF4444', color: '#fff',
                          fontFamily: "'Cinzel', serif", fontSize: '10px',
                          border: 'none', borderRadius: '3px',
                          padding: '5px 10px', cursor: 'pointer', letterSpacing: '0.03em',
                        }}
                        onClick={() => handleSaveDeckConfirm(null, i)}
                      >
                        Overwrite
                      </button>
                    </div>
                  );
                })}
                <button
                  style={{
                    background: 'transparent', color: '#6a6a8a',
                    fontFamily: "'Cinzel', serif", fontSize: '11px',
                    border: '1px solid #2a2a3a', borderRadius: '4px',
                    padding: '9px', cursor: 'pointer',
                  }}
                  onClick={() => setSaveModal(null)}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Load deck selection modal */}
      {loadModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div style={{
            background: '#0d0d1a', border: '1px solid #2a2a3a',
            borderRadius: '8px', padding: '24px',
            maxWidth: '640px', width: '100%',
            display: 'flex', flexDirection: 'column', gap: '16px',
            maxHeight: '80vh', overflowY: 'auto',
          }}>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: '14px', color: '#C9A84C', margin: 0, letterSpacing: '0.06em' }}>
              Select a Deck
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {savedDecks.map((d, i) => {
                const attr = ATTRIBUTES[d.champion] || {};
                const tierLabel = d.resonance >= 42 ? 'Ascended' : d.resonance >= 20 ? 'Attuned' : 'Unaligned';
                const tierColor = d.resonance >= 42 ? '#C9A84C' : d.resonance >= 20 ? '#ffffff' : '#4a4a6a';
                return (
                  <div key={i} style={{
                    background: '#141428', border: `1px solid ${attr.color || '#2a2a3a'}44`,
                    borderLeft: `3px solid ${attr.color || '#2a2a3a'}`,
                    borderRadius: '6px', padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    minWidth: '180px', flex: '1 1 180px', maxWidth: '260px',
                  }}>
                    <div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: attr.color || '#C9A84C' }}>{d.name}</div>
                      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#6a6a8a', marginTop: '3px', letterSpacing: '0.06em' }}>
                        {attr.name || d.champion} · <span style={{ color: tierColor }}>{tierLabel}</span> · {d.cards.length} cards
                      </div>
                    </div>
                    <button
                      style={{
                        background: 'linear-gradient(135deg, #1a3a6a, #2a5aaa)',
                        color: '#e2e8f0', fontFamily: "'Cinzel', serif",
                        fontSize: '10px', fontWeight: 600,
                        border: '1px solid #3a6aaa', borderRadius: '3px',
                        padding: '5px', cursor: 'pointer', letterSpacing: '0.03em',
                      }}
                      onClick={() => { handleLoadSavedDeck(d); setLoadModal(false); }}
                    >
                      Load
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              style={{
                background: 'transparent', color: '#6a6a8a',
                fontFamily: "'Cinzel', serif", fontSize: '11px',
                border: '1px solid #2a2a3a', borderRadius: '4px',
                padding: '9px', cursor: 'pointer',
              }}
              onClick={() => setLoadModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '32px',
          fontWeight: 600,
          color: '#C9A84C',
          letterSpacing: '0.2em',
          marginBottom: '4px',
        }}>GRIDHOLM</h1>
        <p style={{
          fontFamily: "'Crimson Text', serif",
          fontStyle: 'italic',
          color: '#e2e8f0',
          fontSize: '15px',
        }}>
          {step === 'champion' ? 'Choose your champion' :
           step === 'secondary' ? 'Choose a secondary attribute' :
           'Build your deck'}
        </p>
      </div>

      {/* My Decks section — shown at champion step when saves exist */}
      {step === 'champion' && savedDecks.length > 0 && (
        <div style={{ width: '100%', maxWidth: '860px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <h2 style={{
              fontFamily: "'Cinzel', serif", fontSize: '11px',
              color: '#4a4a6a', letterSpacing: '0.12em',
              textTransform: 'uppercase', margin: 0,
            }}>My Decks</h2>
            <span style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '9px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '2px 7px',
              borderRadius: '3px',
              background: currentUser ? '#0a2a1a' : '#1a1a2a',
              color: currentUser ? '#22C55E' : '#6a6a8a',
              border: `1px solid ${currentUser ? '#22C55E44' : '#2a2a3a'}`,
            }}>
              {currentUser ? 'Profile' : 'Local'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {savedDecks.map((d, i) => {
              const attr = ATTRIBUTES[d.champion] || {};
              const tierLabel = d.resonance >= 42 ? 'Ascended' : d.resonance >= 20 ? 'Attuned' : 'Unaligned';
              const tierColor = d.resonance >= 42 ? '#C9A84C' : d.resonance >= 20 ? '#ffffff' : '#4a4a6a';
              return (
                <div key={i} style={{
                  background: '#0d0d1a', border: `1px solid ${attr.color || '#2a2a3a'}44`,
                  borderLeft: `3px solid ${attr.color || '#2a2a3a'}`,
                  borderRadius: '6px', padding: '12px 14px',
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  minWidth: '180px', flex: '1 1 180px', maxWidth: '260px',
                }}>
                  <div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: attr.color || '#C9A84C' }}>{d.name}</div>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: '#6a6a8a', marginTop: '3px', letterSpacing: '0.06em' }}>
                      {attr.name || d.champion} · <span style={{ color: tierColor }}>{tierLabel}</span> · {d.cards.length} cards
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      style={{
                        flex: 1, background: 'linear-gradient(135deg, #1a3a2a, #2a6a4a)',
                        color: '#e2e8f0', fontFamily: "'Cinzel', serif",
                        fontSize: '10px', fontWeight: 600,
                        border: '1px solid #3a8a5a', borderRadius: '3px',
                        padding: '5px', cursor: 'pointer', letterSpacing: '0.03em',
                      }}
                      onClick={() => setPlayDeckModal(d)}
                    >
                      Play
                    </button>
                    <button
                      style={{
                        flex: 1, background: 'linear-gradient(135deg, #1a3a6a, #2a5aaa)',
                        color: '#e2e8f0', fontFamily: "'Cinzel', serif",
                        fontSize: '10px', fontWeight: 600,
                        border: '1px solid #3a6aaa', borderRadius: '3px',
                        padding: '5px', cursor: 'pointer', letterSpacing: '0.03em',
                      }}
                      onClick={() => handleLoadSavedDeck(d)}
                    >
                      Edit
                    </button>
                    <button
                      style={{
                        background: 'transparent', color: '#4a4a6a',
                        fontFamily: "'Cinzel', serif", fontSize: '10px',
                        border: '1px solid #2a2a3a', borderRadius: '3px',
                        padding: '5px 8px', cursor: 'pointer',
                      }}
                      onClick={() => setDeleteConfirm(i)}
                      title="Delete this deck"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 'champion' && (
        <ChampionStep onSelect={handleChampionSelect} onBack={onBack} onLoadDeck={savedDeckExists ? handleLoadDeck : null} />
      )}

      {step === 'secondary' && (
        <SecondaryStep
          primaryAttribute={selectedChampion}
          onSelect={handleSecondarySelect}
          onBack={() => setStep('champion')}
        />
      )}

      {step === 'browser' && (
        <CardBrowser
          primaryAttr={selectedChampion}
          secondaryAttr={secondaryAttr}
          deck={deck}
          deckName={deckName}
          onDeckNameChange={setDeckName}
          onAddCard={handleAddCard}
          onRemoveCard={handleRemoveCard}
          onClearDeck={handleClearDeck}
          onBack={() => setStep('secondary')}
          onSave={handleSaveDeck}
          onPlay={onNext ? handlePlay : null}
          savedDeckExists={savedDeckExists}
          onLoadDeck={handleLoadDeck}
          isValid={isValid}
          deckCount={deckCount}
          saveFlash={saveFlash}
        />
      )}
    </div>
  );
}

// ── Card Browser ──────────────────────────────────────────────────────────────

const ATTR_UNIT_TYPE = {
  light: 'Human',
  primal: 'Beast',
  mystic: 'Elf',
  dark: 'Demon',
};

const COST_RANGES = [
  { label: 'All', test: () => true },
  { label: '1–2', test: c => c.cost <= 2 },
  { label: '3–4', test: c => c.cost === 3 || c.cost === 4 },
  { label: '5+',  test: c => c.cost >= 5 },
];

function CardBrowser({ primaryAttr, secondaryAttr, deck, deckName, onDeckNameChange, onAddCard, onRemoveCard, onClearDeck, onBack, onSave, onPlay, savedDeckExists, onLoadDeck, isValid, deckCount, saveFlash }) {
  const [factionFilter, setFactionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [costFilter, setCostFilter] = useState(0); // index into COST_RANGES
  const [keywordFilter, setKeywordFilter] = useState('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 900);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const primaryUnitType = ATTR_UNIT_TYPE[primaryAttr];
  const secondaryUnitType = ATTR_UNIT_TYPE[secondaryAttr];
  const primaryAttrObj = ATTRIBUTES[primaryAttr];
  const secondaryAttrObj = ATTRIBUTES[secondaryAttr];

  // Compute tier for panel glow
  const deckTier = useMemo(() => {
    const deckCards = Object.entries(deck).flatMap(([id, count]) => {
      const card = CARD_DB[id];
      return card ? Array(count).fill(card) : [];
    });
    const res = calculateResonance(deckCards, primaryAttr);
    if (res >= RESONANCE_THRESHOLDS.ascended) return 'ascended';
    if (res >= RESONANCE_THRESHOLDS.attuned) return 'attuned';
    return 'none';
  }, [deck, primaryAttr]);

  const panelGlow = useMemo(() => {
    const color = primaryAttrObj?.color || '#ffffff';
    if (deckTier === 'ascended') return `0 0 0 1px #C9A84C50, 0 0 20px #C9A84C35, inset 0 0 12px #C9A84C15`;
    if (deckTier === 'attuned') return `0 0 0 1px ${color}40, 0 0 14px ${color}28`;
    return undefined;
  }, [deckTier, primaryAttrObj]);

  // Build legal card pool (no tokens)
  const legalCards = useMemo(() => {
    return Object.values(CARD_DB).filter(c => {
      if (c.token) return false;
      return c.attribute === primaryAttr || c.attribute === secondaryAttr || c.attribute === 'neutral';
    });
  }, [primaryAttr, secondaryAttr]);

  // Group: primary, secondary, neutral
  const groups = useMemo(() => {
    const primary = legalCards.filter(c => c.attribute === primaryAttr).sort((a, b) => a.cost - b.cost);
    const secondary = legalCards.filter(c => c.attribute === secondaryAttr).sort((a, b) => a.cost - b.cost);
    const neutral = legalCards.filter(c => c.attribute === 'neutral').sort((a, b) => a.cost - b.cost);
    return [
      { key: 'primary', label: FACTION_NAMES[primaryAttr], attr: primaryAttr, color: primaryAttrObj.color, cards: primary },
      { key: 'secondary', label: FACTION_NAMES[secondaryAttr], attr: secondaryAttr, color: secondaryAttrObj.color, cards: secondary },
      { key: 'neutral', label: 'Neutral', attr: 'neutral', color: '#9CA3AF', cards: neutral },
    ];
  }, [legalCards, primaryAttr, secondaryAttr, primaryAttrObj, secondaryAttrObj]);

  // Apply filters
  function applyFilters(cards) {
    return cards.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (!COST_RANGES[costFilter].test(c)) return false;
      if (keywordFilter !== 'all') {
        if (keywordFilter === 'rush' && !c.rush) return false;
        if (keywordFilter === 'hidden' && !c.hidden) return false;
        if (keywordFilter === 'aura' && !c.aura) return false;
        if (keywordFilter === 'action' && !c.action) return false;
        if (keywordFilter === 'legendary' && !c.legendary) return false;
      }
      return true;
    });
  }

  const filteredGroups = useMemo(() => {
    return groups
      .filter(g => factionFilter === 'all' || g.key === factionFilter)
      .map(g => ({ ...g, cards: applyFilters(g.cards) }))
      .filter(g => g.cards.length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, factionFilter, typeFilter, costFilter, keywordFilter]);



  const browserContent = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Champion summary bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        background: '#0d0d1a',
        border: '1px solid #2a2a3a',
        borderRadius: '8px',
        padding: '10px 16px',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Champion:</span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: primaryAttrObj.color }}>
          {CHAMPIONS[primaryAttr].name} · {primaryAttrObj.name}
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#4a4a6a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Secondary:</span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '13px', fontWeight: 600, color: secondaryAttrObj.color }}>
          {secondaryAttrObj.name}
        </span>
        {isMobile && (
          <button
            style={{
              marginLeft: 'auto',
              fontFamily: "'Cinzel', serif",
              fontSize: '11px',
              fontWeight: 600,
              color: '#C9A84C',
              background: 'transparent',
              border: '1px solid #C9A84C60',
              borderRadius: '4px',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
            onClick={() => setDrawerOpen(o => !o)}
          >
            Deck ({deckCount}/30) {drawerOpen ? '▼' : '▲'}
          </button>
        )}
        {!isMobile && (
          <span style={{ marginLeft: 'auto', fontFamily: "'Cinzel', serif", fontSize: '13px', color: deckCount >= 20 ? '#C9A84C' : '#6a6a8a' }}>
            {deckCount}/30 cards
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        background: '#0d0d1a',
        border: '1px solid #2a2a3a',
        borderRadius: '8px',
        padding: '10px 16px',
      }}>
        <FilterGroup label="Faction">
          {[
            { key: 'all', label: 'All' },
            { key: 'primary', label: FACTION_NAMES[primaryAttr] },
            { key: 'secondary', label: FACTION_NAMES[secondaryAttr] },
            { key: 'neutral', label: 'Neutral' },
          ].map(opt => (
            <FilterBtn key={opt.key} active={factionFilter === opt.key} onClick={() => setFactionFilter(opt.key)}>
              {opt.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        <FilterGroup label="Type">
          {[
            { key: 'all', label: 'All' },
            { key: 'unit', label: 'Unit' },
            { key: 'spell', label: 'Spell' },
            { key: 'relic', label: 'Relic' },
            { key: 'omen', label: 'Omen' },
            { key: 'terrain', label: 'Terrain' },
          ].map(opt => (
            <FilterBtn key={opt.key} active={typeFilter === opt.key} onClick={() => setTypeFilter(opt.key)}>
              {opt.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        <FilterGroup label="Cost">
          {COST_RANGES.map((r, i) => (
            <FilterBtn key={r.label} active={costFilter === i} onClick={() => setCostFilter(i)}>
              {r.label}
            </FilterBtn>
          ))}
        </FilterGroup>

        <FilterGroup label="Keyword">
          {[
            { key: 'all', label: 'All' },
            { key: 'rush', label: 'Rush' },
            { key: 'hidden', label: 'Hidden' },
            { key: 'aura', label: 'Aura' },
            { key: 'action', label: 'Action' },
            { key: 'legendary', label: 'Legendary' },
          ].map(opt => (
            <FilterBtn key={opt.key} active={keywordFilter === opt.key} onClick={() => setKeywordFilter(opt.key)}>
              {opt.label}
            </FilterBtn>
          ))}
        </FilterGroup>
      </div>

      {/* Card groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {filteredGroups.length === 0 && (
          <p style={{ fontFamily: "'Crimson Text', serif", color: '#4a4a6a', fontSize: '15px', textAlign: 'center', padding: '32px 0' }}>
            No cards match the current filters.
          </p>
        )}
        {filteredGroups.map(group => {
          const GroupCrystal = ATTR_SYMBOLS[group.attr];
          return (
          <div key={group.key}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '10px',
              paddingBottom: '6px',
              borderBottom: `1px solid ${group.color}33`,
            }}>
              {GroupCrystal && <GroupCrystal size={16} />}
              <h3 style={{
                fontFamily: "'Cinzel', serif",
                fontSize: '13px',
                fontWeight: 600,
                color: group.color,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                margin: 0,
              }}>
                {group.label}
              </h3>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {group.cards.map(card => {
                const copies = deck[card.id] || 0;
                const maxCopies = card.legendary ? 1 : 2;
                const atLimit = copies >= maxCopies;
                return (
                  <BrowserCard
                    key={card.id}
                    card={card}
                    copies={copies}
                    atLimit={atLimit}
                    onClick={() => onAddCard(card.id)}
                  />
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: isMobile ? '120px' : '32px' }}>
        <button
          style={backBtnStyle}
          onClick={onBack}
          onMouseEnter={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C60'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6a6a8a'; e.currentTarget.style.borderColor = '#2a2a3a'; }}
        >
          ← Back
        </button>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: deckCount === 30 ? '#22C55E' : deckCount > 30 ? '#EF4444' : '#6a6a8a' }}>
          {deckCount}/30 cards
          {deckCount < 30 && ` · need ${30 - deckCount} more`}
          {deckCount > 30 && ` · remove ${deckCount - 30}`}
        </span>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ width: '100%', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
        {browserContent}
        {/* Mobile bottom drawer */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transform: drawerOpen ? 'translateY(0)' : 'translateY(calc(100% - 48px))',
          transition: 'transform 0.3s ease',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <button
            style={{
              height: '48px',
              background: '#141428',
              border: '1px solid #2a2a3a',
              borderBottom: 'none',
              borderTopLeftRadius: '12px',
              borderTopRightRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            onClick={() => setDrawerOpen(o => !o)}
          >
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: '#C9A84C', letterSpacing: '0.06em' }}>
              DECK ({deckCount}/30)
            </span>
            <span style={{ color: '#C9A84C', fontSize: '10px' }}>{drawerOpen ? '▼' : '▲'}</span>
          </button>
          <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', background: '#0d0d1a', border: '1px solid #2a2a3a', borderTop: 'none', boxShadow: panelGlow, transition: 'box-shadow 0.6s ease' }}>
            <DeckPanel
              primaryAttr={primaryAttr}
              secondaryAttr={secondaryAttr}
              deck={deck}
              deckName={deckName}
              onDeckNameChange={onDeckNameChange}
              onRemoveCard={onRemoveCard}
              onClearDeck={onClearDeck}
              deckCount={deckCount}
              isValid={isValid}
              onSave={onSave}
              onPlay={onPlay}
              savedDeckExists={savedDeckExists}
              onLoadDeck={onLoadDeck}
              saveFlash={saveFlash}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '1280px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
      {browserContent}
      {/* Desktop sidebar */}
      <div className="no-scrollbar" style={{
        width: '280px',
        flexShrink: 0,
        position: 'sticky',
        top: '16px',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        background: '#0d0d1a',
        border: '1px solid #2a2a3a',
        borderRadius: '8px',
        boxShadow: panelGlow,
        transition: 'box-shadow 0.6s ease',
      }}>
        <DeckPanel
          primaryAttr={primaryAttr}
          secondaryAttr={secondaryAttr}
          deck={deck}
          deckName={deckName}
          onDeckNameChange={onDeckNameChange}
          onRemoveCard={onRemoveCard}
          onClearDeck={onClearDeck}
          deckCount={deckCount}
          isValid={isValid}
          onSave={onSave}
          onPlay={onPlay}
          savedDeckExists={savedDeckExists}
          onLoadDeck={onLoadDeck}
          saveFlash={saveFlash}
        />
      </div>
    </div>
  );
}

function BrowserCard({ card, copies, atLimit, onClick }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div
      style={{ position: 'relative', cursor: atLimit ? 'default' : 'pointer' }}
      onClick={atLimit ? undefined : onClick}
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <div style={{ opacity: atLimit ? 0.45 : 1, transition: 'opacity 0.15s' }}>
        <Card card={card} isSelected={false} isPlayable={!atLimit} onClick={undefined} />
      </div>
      {copies > 0 && (
        <div style={{
          position: 'absolute',
          top: '-6px',
          right: '-6px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: '#ffffff',
          color: '#0a0a0f',
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #0a0a0f',
          pointerEvents: 'none',
        }}>
          {copies}
        </div>
      )}
      {showPreview && <CardPreviewTooltip card={card} />}
    </div>
  );
}

function CardPreviewTooltip({ card }) {
  const imageUrl = getCardImageUrl(card.image);
  const keywords = [];
  if (card.rush) keywords.push({ label: 'Rush', color: '#22C55E' });
  if (card.flying) keywords.push({ label: 'Flying', color: '#38BDF8' });
  if (card.hidden) keywords.push({ label: 'Hidden', color: '#8B5CF6' });
  if (card.action) keywords.push({ label: 'Action', color: '#F97316' });
  if (card.aura) keywords.push({ label: `Aura ${card.aura.range}`, color: '#F0E6D2' });
  if (card.legendary) keywords.push({ label: 'Legendary', color: '#EAB308' });

  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 8px)',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 200,
      width: '180px',
      background: '#08080f',
      border: '1px solid #1e1e2e',
      borderTop: '1px solid #C9A84C30',
      borderRadius: '6px',
      padding: '8px',
      pointerEvents: 'none',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: '#C9A84C', marginBottom: '6px', fontVariant: 'small-caps', letterSpacing: '0.05em' }}>
        Card Detail
      </div>
      {imageUrl ? (
        <div style={{ height: '100px', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
          <img src={imageUrl} alt={card.name} onError={e => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      ) : (
        <div style={{ height: '60px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '6px', fontSize: '11px', color: 'rgba(156,163,175,1)', fontFamily: "'Cinzel', serif" }}>
          {card.type === 'spell' ? 'Spell' : card.type === 'omen' ? 'Omen' : card.type === 'terrain' ? 'Terrain' : card.type === 'relic' ? 'Relic' : (Array.isArray(card.unitType) && card.unitType.length > 0 ? card.unitType.join(' · ') : ATTRIBUTES[card.attribute]?.name || 'Unit')}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 700, color: card.legendary ? '#C9A84C' : '#ffffff', lineHeight: 1.2 }}>{card.name}</span>
        <span style={{ background: '#C9A84C', color: '#0a0a0f', fontFamily: 'var(--font-sans)', fontSize: '12px', fontWeight: 700, padding: '1px 6px', borderRadius: '99px', flexShrink: 0, marginLeft: '4px' }}>{card.cost}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: '10px', fontWeight: 500, color: '#9CA3AF', marginBottom: '4px' }}>
        {card.type === 'spell' ? 'Spell' : card.type === 'omen' ? 'Omen' : card.type === 'terrain' ? 'Terrain' : card.type === 'relic' ? 'Relic' : (Array.isArray(card.unitType) && card.unitType.length > 0 ? card.unitType.join(' · ') : ATTRIBUTES[card.attribute]?.name || 'Unit')}
      </div>
      {card.type === 'unit' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '3px', marginBottom: '4px', fontFamily: 'var(--font-sans)' }}>
          {[['ATK', card.atk], ['HP', card.hp], ['SPD', card.spd]].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: '9px', fontWeight: 500, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>{val}</div>
            </div>
          ))}
        </div>
      )}
      {keywords.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '4px' }}>
          {keywords.map(kw => (
            <span key={kw.label} style={{ fontSize: '10px', background: `${kw.color}22`, color: kw.color, border: `1px solid ${kw.color}55`, padding: '1px 5px', borderRadius: '3px', fontWeight: 600, fontFamily: 'var(--font-sans)' }}>
              {kw.label}
            </span>
          ))}
        </div>
      )}
      {card.rules && (
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: '#e2e8f0', lineHeight: 1.5, borderTop: '0.5px solid #1e1e2e', paddingTop: '4px' }}>
          {renderRules(card.rules)}
        </div>
      )}
    </div>
  );
}

// ── Attribute Wheel ───────────────────────────────────────────────────────────

const WHEEL_POSITIONS = {
  light:  { cx: 60, cy: 12 },
  primal: { cx: 12, cy: 60 },
  dark:   { cx: 60, cy: 108 },
  mystic: { cx: 108, cy: 60 },
};

function AttributeWheel({ primaryAttr, secondaryAttr }) {
  const primary = ATTRIBUTES[primaryAttr];
  // Derive all connections to draw from primary's perspective
  const allKeys = ['light', 'primal', 'dark', 'mystic'];
  const lines = [];
  const seen = new Set();
  for (const a of allKeys) {
    for (const b of allKeys) {
      if (a === b) continue;
      const key = [a, b].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const attrA = ATTRIBUTES[a];
      const isFriendly = attrA.friendly.includes(b);
      const isEnemy = attrA.enemy.includes(b);
      if (!isFriendly && !isEnemy) continue;
      lines.push({
        key,
        x1: WHEEL_POSITIONS[a].cx, y1: WHEEL_POSITIONS[a].cy,
        x2: WHEEL_POSITIONS[b].cx, y2: WHEEL_POSITIONS[b].cy,
        color: isFriendly ? '#22C55E' : '#EF4444',
        opacity: (a === primaryAttr || b === primaryAttr || a === secondaryAttr || b === secondaryAttr) ? 0.7 : 0.2,
      });
    }
  }

  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" style={{ display: 'block' }}>
      {/* Lines */}
      {lines.map(l => (
        <line
          key={l.key}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.color}
          strokeWidth="1.5"
          strokeOpacity={l.opacity}
        />
      ))}
      {/* Nodes */}
      {allKeys.map(key => {
        const pos = WHEEL_POSITIONS[key];
        const attr = ATTRIBUTES[key];
        const isPrimary = key === primaryAttr;
        const isSecondary = key === secondaryAttr;
        const r = isPrimary ? 11 : isSecondary ? 9 : 7;
        const opacity = isPrimary || isSecondary ? 1 : 0.3;
        return (
          <g key={key} opacity={opacity}>
            <circle
              cx={pos.cx} cy={pos.cy} r={r}
              fill={isPrimary ? attr.color : '#0d0d1a'}
              stroke={attr.color}
              strokeWidth={isPrimary ? 0 : 1.5}
            />
            <text
              x={pos.cx} y={pos.cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isPrimary ? '6' : '5'}
              fontFamily="Cinzel, serif"
              fill={isPrimary ? '#0a0a0f' : attr.color}
              fontWeight="600"
            >
              {attr.name[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Deck Panel ────────────────────────────────────────────────────────────────

function DeckPanel({ primaryAttr, secondaryAttr, deck, deckName, onDeckNameChange, onRemoveCard, onClearDeck, deckCount, isValid, onSave, onPlay, savedDeckExists, onLoadDeck, saveFlash }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [attunedPulse, setAttunedPulse] = useState(false);
  const [ascendedSweep, setAscendedSweep] = useState(false);
  const [burstParticles, setBurstParticles] = useState(null);
  const [headerFlash, setHeaderFlash] = useState(false);
  const prevTierRef = useRef(null);

  const primary = ATTRIBUTES[primaryAttr];
  const secondary = ATTRIBUTES[secondaryAttr];

  // Expand deck to card array for resonance calculation
  const deckCards = useMemo(() => {
    return Object.entries(deck).flatMap(([id, count]) => {
      const card = CARD_DB[id];
      return card ? Array(count).fill(card) : [];
    });
  }, [deck]);

  const resonance = useMemo(() => calculateResonance(deckCards, primaryAttr), [deckCards, primaryAttr]);
  const tier = resonance >= RESONANCE_THRESHOLDS.ascended ? 'ascended'
    : resonance >= RESONANCE_THRESHOLDS.attuned ? 'attuned'
    : 'none';

  const TIER_STYLE = {
    ascended: { color: '#C9A84C', label: 'Ascended' },
    attuned:  { color: '#ffffff', label: 'Attuned' },
    none:     { color: '#4a4a6a', label: 'Unaligned' },
  };

  // Detect threshold crossings for one-time animations
  useEffect(() => {
    const prev = prevTierRef.current;
    prevTierRef.current = tier;
    if (prev === null) return; // skip first render

    if (tier === 'attuned' && prev === 'none') {
      setAttunedPulse(true);
      setHeaderFlash(true);
      setBurstParticles('attuned');
      const t = setTimeout(() => {
        setAttunedPulse(false);
        setHeaderFlash(false);
        setBurstParticles(null);
      }, 900);
      return () => clearTimeout(t);
    }
    if (tier === 'ascended' && (prev === 'none' || prev === 'attuned')) {
      setAscendedSweep(true);
      setHeaderFlash(true);
      setBurstParticles('ascended');
      const t = setTimeout(() => {
        setAscendedSweep(false);
        setHeaderFlash(false);
        setBurstParticles(null);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [tier]);

  // Attribute breakdown
  const breakdown = useMemo(() => {
    const counts = { primary: 0, friendly: 0, enemy: 0, neutral: 0 };
    for (const card of deckCards) {
      if (card.attribute === primaryAttr) counts.primary++;
      else if (primary.friendly.includes(card.attribute)) counts.friendly++;
      else if (primary.enemy.includes(card.attribute)) counts.enemy++;
      else counts.neutral++;
    }
    return counts;
  }, [deckCards, primaryAttr, primary]);

  // Cards grouped by faction, sorted by cost
  const groupedCards = useMemo(() => {
    const groups = [
      { key: 'primary', label: primary.name, color: primary.color, attr: primaryAttr },
      { key: 'secondary', label: secondary.name, color: secondary.color, attr: secondaryAttr },
      { key: 'neutral', label: 'Neutral', color: '#9CA3AF', attr: 'neutral' },
    ];
    return groups.map(g => {
      const entries = Object.entries(deck)
        .filter(([id]) => CARD_DB[id]?.attribute === g.attr)
        .map(([id, count]) => ({ card: CARD_DB[id], count }))
        .filter(e => e.card)
        .sort((a, b) => a.card.cost - b.card.cost);
      return { ...g, entries };
    }).filter(g => g.entries.length > 0);
  }, [deck, primaryAttr, secondaryAttr, primary, secondary]);

  const maxResonance = 60; // 30 cards × max 2 pts

  return (
    <>
    <style>{DECK_PANEL_STYLES}</style>
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Deck name */}
      <input
        value={deckName}
        onChange={e => onDeckNameChange(e.target.value)}
        style={{
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid #2a2a3a',
          color: '#C9A84C',
          fontFamily: "'Cinzel', serif",
          fontSize: '14px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          width: '100%',
          padding: '4px 0',
          outline: 'none',
        }}
        onFocus={e => { e.target.style.borderBottomColor = '#C9A84C60'; }}
        onBlur={e => { e.target.style.borderBottomColor = '#2a2a3a'; }}
      />

      {/* Card count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '12px', color: deckCount >= 30 ? '#C9A84C' : '#6a6a8a' }}>
          {deckCount}/30
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', color: TIER_STYLE[tier].color, letterSpacing: '0.06em' }}>
          {TIER_STYLE[tier].label} · {resonance}
        </span>
      </div>

      {/* Attunement section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '-6px' }}>
        <span
          style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '9px',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: tier === 'ascended' ? '#FFD966' : '#c0b8d0',
            opacity: Math.min(1, 0.25 + (resonance / RESONANCE_THRESHOLDS.attuned) * 0.75),
            transition: 'opacity 0.5s ease, color 0.5s ease',
            animation: headerFlash ? 'db-header-flash 0.8s ease-out' : undefined,
          }}
        >
          {tier === 'ascended' ? 'Ascended' : 'Attunement'}
        </span>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '9px',
          color: tier === 'ascended' ? '#C9A84C80' : '#3a3a5a',
          letterSpacing: '0.04em',
          opacity: Math.min(1, 0.2 + (resonance / RESONANCE_THRESHOLDS.attuned) * 0.8),
          transition: 'opacity 0.5s ease, color 0.5s ease',
        }}>
          {resonance}/{RESONANCE_THRESHOLDS.ascended}
        </span>
      </div>

      {/* Resonance bar */}
      <div style={{ background: '#1a1a2a', borderRadius: '4px', height: '6px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          borderRadius: '4px',
          width: `${Math.min(100, (resonance / maxResonance) * 100)}%`,
          background: tier === 'ascended' ? 'linear-gradient(90deg, #F0E6D2, #C9A84C)'
            : tier === 'attuned' ? 'linear-gradient(90deg, #F0E6D2, #ffffff)'
            : '#F0E6D2',
          transition: 'width 0.3s ease',
          animation: attunedPulse ? 'db-bar-pulse 0.8s ease-out' : undefined,
          position: 'relative',
        }}>
          {/* Sweep shimmer overlay for ascended */}
          {ascendedSweep && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)',
              animation: 'db-bar-sweep 0.7s ease-out forwards',
              borderRadius: '4px',
            }} />
          )}
        </div>
        {/* Attuned threshold marker */}
        <div style={{
          position: 'absolute',
          top: '-2px',
          left: `${(RESONANCE_THRESHOLDS.attuned / maxResonance) * 100}%`,
          width: '1px',
          height: '10px',
          background: tier === 'attuned' || tier === 'ascended' ? '#ffffff88' : '#ffffff44',
          transition: 'background 0.3s ease',
          zIndex: 1,
        }} />
        {/* Ascended threshold marker */}
        <div style={{
          position: 'absolute',
          top: '-2px',
          left: `${(RESONANCE_THRESHOLDS.ascended / maxResonance) * 100}%`,
          width: '1px',
          height: '10px',
          background: tier === 'ascended' ? '#C9A84CAA' : '#C9A84C66',
          transition: 'background 0.3s ease',
          zIndex: 1,
        }} />
        {/* Particle bursts */}
        {burstParticles && PARTICLE_DIRS.map((dir, i) => {
          const pct = burstParticles === 'attuned'
            ? (RESONANCE_THRESHOLDS.attuned / maxResonance) * 100
            : (RESONANCE_THRESHOLDS.ascended / maxResonance) * 100;
          const color = burstParticles === 'attuned' ? '#ffffff' : '#C9A84C';
          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '50%',
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              background: color,
              '--pdx': dir.dx,
              '--pdy': dir.dy,
              animation: `db-particle 0.7s ease-out forwards`,
              animationDelay: `${i * 30}ms`,
              zIndex: 2,
            }} />
          );
        })}
      </div>

      {/* Attribute wheel */}
      <div style={{ width: '80px', margin: '0 auto' }}>
        <AttributeWheel primaryAttr={primaryAttr} secondaryAttr={secondaryAttr} />
      </div>

      {/* Attribute breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
        {[
          { label: 'Primary', count: breakdown.primary, color: primary.color },
          { label: 'Friendly', count: breakdown.friendly, color: '#22C55E' },
          { label: 'Enemy', count: breakdown.enemy, color: '#EF4444' },
          { label: 'Neutral', count: breakdown.neutral, color: '#9CA3AF' },
        ].map(b => (
          <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: '#141428', borderRadius: '3px' }}>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '9px', color: b.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{b.label}</span>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: '10px', color: b.count > 0 ? b.color : '#2a2a4a' }}>{b.count}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: '#1a1a2a' }} />

      {/* Card list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {groupedCards.length === 0 && (
          <p style={{ fontFamily: "'Crimson Text', serif", fontSize: '13px', color: '#2a2a4a', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
            No cards yet
          </p>
        )}
        {groupedCards.map(group => (
          <div key={group.key}>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '9px',
              color: group.color,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '4px',
              opacity: 0.8,
            }}>
              {group.label}
            </div>
            {group.entries.map(({ card, count }) => (
              <div
                key={card.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onClick={() => onRemoveCard(card.id)}
                onMouseEnter={e => { e.currentTarget.style.background = '#1a1a2a'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                title="Click to remove one copy"
              >
                <span style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '3px',
                  background: '#141428',
                  border: `1px solid ${group.color}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Cinzel', serif",
                  fontSize: '9px',
                  color: '#6a6a8a',
                  flexShrink: 0,
                }}>
                  {card.cost}
                </span>
                <span style={{
                  flex: 1,
                  fontFamily: "'Cinzel', serif",
                  fontSize: '10px',
                  color: '#b0b0c8',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {card.name}
                </span>
                <span style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: '10px',
                  color: count === 2 ? '#C9A84C' : '#4a4a6a',
                  flexShrink: 0,
                }}>
                  ×{count}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Clear deck */}
      {deckCount > 0 && (
        <div style={{ marginTop: '4px' }}>
          {confirmClear ? (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                style={{ flex: 1, background: '#EF4444', color: '#fff', fontFamily: "'Cinzel', serif", fontSize: '10px', border: 'none', borderRadius: '3px', padding: '5px', cursor: 'pointer' }}
                onClick={() => { onClearDeck(); setConfirmClear(false); }}
              >
                Clear All
              </button>
              <button
                style={{ flex: 1, background: 'transparent', color: '#6a6a8a', fontFamily: "'Cinzel', serif", fontSize: '10px', border: '1px solid #2a2a3a', borderRadius: '3px', padding: '5px', cursor: 'pointer' }}
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              style={{ width: '100%', background: 'transparent', color: '#4a4a6a', fontFamily: "'Cinzel', serif", fontSize: '10px', border: '1px solid #1a1a2a', borderRadius: '3px', padding: '5px', cursor: 'pointer', letterSpacing: '0.04em' }}
              onClick={() => setConfirmClear(true)}
              onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = '#EF444430'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#4a4a6a'; e.currentTarget.style.borderColor = '#1a1a2a'; }}
            >
              Clear Deck
            </button>
          )}
        </div>
      )}

      {/* Divider */}
      <div style={{ height: '1px', background: '#1a1a2a', marginTop: '8px' }} />

      {/* Validation message */}
      <div style={{ fontFamily: "'Crimson Text', serif", fontSize: '12px', fontStyle: 'italic', textAlign: 'center', color: isValid ? '#22C55E' : deckCount > 30 ? '#EF4444' : '#6a6a8a', padding: '4px 0' }}>
        {isValid ? 'Deck is ready!' : deckCount < 30 ? `Add ${30 - deckCount} more card${30 - deckCount === 1 ? '' : 's'}` : `Remove ${deckCount - 30} card${deckCount - 30 === 1 ? '' : 's'}`}
      </div>

      {/* Save Deck */}
      <button
        style={{
          width: '100%',
          background: isValid ? (saveFlash ? '#22C55E' : 'linear-gradient(135deg, #C9A84C, #a07830)') : '#1a1a2a',
          color: isValid ? '#0a0a0f' : '#3a3a5a',
          fontFamily: "'Cinzel', serif",
          fontSize: '11px',
          fontWeight: 600,
          border: 'none',
          borderRadius: '3px',
          padding: '7px',
          cursor: isValid ? 'pointer' : 'default',
          letterSpacing: '0.04em',
          transition: 'background 0.3s',
        }}
        onClick={isValid ? onSave : undefined}
        disabled={!isValid}
      >
        {saveFlash ? 'Saved!' : 'Save Deck'}
      </button>

      {/* Play with this Deck */}
      {onPlay && (
        <button
          style={{
            width: '100%',
            background: isValid ? 'linear-gradient(135deg, #1a3a6a, #2a5aaa)' : '#1a1a2a',
            color: isValid ? '#e2e8f0' : '#3a3a5a',
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            fontWeight: 600,
            border: isValid ? '1px solid #3a6aaa' : '1px solid #1a1a2a',
            borderRadius: '3px',
            padding: '8px',
            cursor: isValid ? 'pointer' : 'default',
            letterSpacing: '0.04em',
          }}
          onClick={isValid ? onPlay : undefined}
          disabled={!isValid}
          onMouseEnter={e => { if (isValid) { e.currentTarget.style.background = 'linear-gradient(135deg, #2a4a7a, #3a6acc)'; } }}
          onMouseLeave={e => { if (isValid) { e.currentTarget.style.background = 'linear-gradient(135deg, #1a3a6a, #2a5aaa)'; } }}
        >
          Play with this Deck →
        </button>
      )}
    </div>
    </>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
      <span style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '10px',
        color: '#4a4a6a',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginRight: '4px',
        whiteSpace: 'nowrap',
      }}>{label}:</span>
      {children}
    </div>
  );
}

function FilterBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '11px',
        fontWeight: active ? 600 : 400,
        color: active ? '#0a0a0f' : '#6a6a8a',
        background: active ? '#C9A84C' : 'transparent',
        border: `1px solid ${active ? '#C9A84C' : '#2a2a3a'}`,
        borderRadius: '4px',
        padding: '3px 10px',
        cursor: 'pointer',
        transition: 'color 0.12s, background 0.12s, border-color 0.12s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// ── Champion Selection Step ──────────────────────────────────────────────────

function ChampionStep({ onSelect, onBack, onLoadDeck }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {ATTRIBUTE_ORDER.map(attrKey => {
          const champ = CHAMPIONS[attrKey];
          const attr = ATTRIBUTES[attrKey];
          const imageUrl = getCardImageUrl(champ.image);
          return (
            <ChampionCard
              key={attrKey}
              champion={champ}
              attribute={attr}
              attributeKey={attrKey}
              imageUrl={imageUrl}
              description={CHAMPION_DESCRIPTIONS[attrKey]}
              onSelect={() => onSelect(attrKey)}
            />
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          style={backBtnStyle}
          onClick={onBack}
          onMouseEnter={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C60'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6a6a8a'; e.currentTarget.style.borderColor = '#2a2a3a'; }}
        >
          ← Back to Lobby
        </button>
      </div>
    </>
  );
}

function ChampionCard({ champion, attribute, attributeKey, imageUrl, description, onSelect }) {
  const AttrCrystal = ATTR_SYMBOLS[attributeKey];
  return (
    <div
      style={{
        background: '#0d0d1a',
        border: `1px solid ${attribute.color}55`,
        borderLeft: `3px solid ${attribute.color}`,
        borderRadius: '8px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onClick={onSelect}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = `inset 0 0 16px ${attribute.color}33`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '';
      }}
    >
      {imageUrl && (
        <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={imageUrl}
            alt={champion.name}
            onError={e => { e.target.style.display = 'none'; }}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
          {AttrCrystal && <AttrCrystal size={20} />}
          <h2 style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '16px',
            fontWeight: 600,
            color: attribute.color,
            margin: 0,
          }}>
            {champion.name}
          </h2>
        </div>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '10px',
          color: '#4a4a6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {attribute.name}
        </span>
      </div>

      <p style={{
        fontFamily: "'Crimson Text', serif",
        fontSize: '14px',
        color: '#8a8aaa',
        lineHeight: 1.6,
        flex: 1,
      }}>
        {description}
      </p>

      <button
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '4px',
          fontFamily: "'Cinzel', serif",
          fontSize: '12px',
          fontWeight: 600,
          color: '#0a0a0f',
          background: ATTR_GRADIENTS[attributeKey] || attribute.color,
          border: 'none',
          boxShadow: `0 2px 8px ${attribute.color}60`,
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        Select
      </button>
    </div>
  );
}

// ── Secondary Attribute Step ──────────────────────────────────────────────────

function SecondaryStep({ primaryAttribute, onSelect, onBack }) {
  const primaryAttr = ATTRIBUTES[primaryAttribute];

  return (
    <>
      <div style={{
        background: '#0d0d1a',
        border: `1px solid ${primaryAttr.color}55`,
        borderRadius: '8px',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '12px',
          color: '#4a4a6a',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>Champion:</span>
        <span style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '14px',
          fontWeight: 600,
          color: primaryAttr.color,
        }}>
          {CHAMPIONS[primaryAttribute].name} · {primaryAttr.name}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-4xl">
        {ATTRIBUTE_ORDER.map(attrKey => {
          const attr = ATTRIBUTES[attrKey];
          const isPrimary = attrKey === primaryAttribute;
          const isFriendly = primaryAttr.friendly.includes(attrKey);
          const isEnemy = primaryAttr.enemy.includes(attrKey);

          return (
            <SecondaryAttrCard
              key={attrKey}
              attributeKey={attrKey}
              attribute={attr}
              isPrimary={isPrimary}
              isFriendly={isFriendly}
              isEnemy={isEnemy}
              onSelect={isPrimary ? null : () => onSelect(attrKey)}
            />
          );
        })}
      </div>

      <button
        style={backBtnStyle}
        onClick={onBack}
        onMouseEnter={e => { e.currentTarget.style.color = '#C9A84C'; e.currentTarget.style.borderColor = '#C9A84C60'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#6a6a8a'; e.currentTarget.style.borderColor = '#2a2a3a'; }}
      >
        ← Back to Champion
      </button>
    </>
  );
}

function SecondaryAttrCard({ attributeKey, attribute, isPrimary, isFriendly, isEnemy, onSelect }) {
  const isSelectable = !isPrimary;
  const AttrCrystal = ATTR_SYMBOLS[attributeKey];

  let relationLabel = null;
  let relationColor = null;
  let relationIcon = null;
  if (isPrimary) {
    relationLabel = 'Primary';
    relationColor = attribute.color;
    relationIcon = '★';
  } else if (isFriendly) {
    relationLabel = 'Friendly';
    relationColor = '#22C55E';
    relationIcon = '✓';
  } else if (isEnemy) {
    relationLabel = 'Enemy';
    relationColor = '#EF4444';
    relationIcon = '✕';
  }

  return (
    <div
      style={{
        background: '#0d0d1a',
        border: isPrimary
          ? `2px solid ${attribute.color}`
          : `1px solid ${attribute.color}55`,
        borderLeft: `3px solid ${attribute.color}`,
        borderRadius: '8px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: isSelectable ? 'pointer' : 'default',
        opacity: isPrimary ? 0.7 : 1,
        transition: isSelectable ? 'transform 0.15s, box-shadow 0.15s' : 'none',
      }}
      onClick={isSelectable ? onSelect : undefined}
      onMouseEnter={isSelectable ? e => {
        e.currentTarget.style.transform = 'scale(1.02)';
        e.currentTarget.style.boxShadow = `inset 0 0 16px ${attribute.color}33`;
      } : undefined}
      onMouseLeave={isSelectable ? e => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '';
      } : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            {AttrCrystal && <AttrCrystal size={20} />}
            <h2 style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '16px',
              fontWeight: 600,
              color: attribute.color,
              margin: 0,
            }}>
              {attribute.name}
            </h2>
          </div>
          <span style={{
            fontFamily: "'Cinzel', serif",
            fontSize: '10px',
            color: '#4a4a6a',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {FACTION_NAMES[attributeKey]}
          </span>
        </div>

        {relationLabel && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '99px',
            border: `1px solid ${relationColor}55`,
            background: `${relationColor}11`,
          }}>
            <span style={{ color: relationColor, fontSize: '11px' }}>{relationIcon}</span>
            <span style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '10px',
              color: relationColor,
              letterSpacing: '0.06em',
            }}>
              {relationLabel}
            </span>
          </div>
        )}
      </div>

      {isPrimary ? (
        <p style={{
          fontFamily: "'Crimson Text', serif",
          fontSize: '14px',
          color: '#4a4a6a',
          lineHeight: 1.6,
          fontStyle: 'italic',
        }}>
          Primary attribute (locked)
        </p>
      ) : (
        <button
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '4px',
            fontFamily: "'Cinzel', serif",
            fontSize: '12px',
            fontWeight: 600,
            color: '#0a0a0f',
            background: ATTR_GRADIENTS[attributeKey] || attribute.color,
            border: 'none',
            boxShadow: `0 2px 8px ${attribute.color}60`,
            cursor: 'pointer',
            letterSpacing: '0.04em',
          }}
          onClick={e => { e.stopPropagation(); onSelect(); }}
        >
          Select
        </button>
      )}
    </div>
  );
}

const backBtnStyle = {
  background: 'transparent',
  color: '#6a6a8a',
  fontFamily: "'Cinzel', serif",
  fontSize: '13px',
  border: '1px solid #2a2a3a',
  borderRadius: '4px',
  padding: '8px 24px',
  cursor: 'pointer',
  transition: 'color 0.15s, border-color 0.15s',
};
