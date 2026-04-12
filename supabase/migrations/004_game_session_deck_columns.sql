-- Add deck ID columns for multiplayer deck selection (if not present from prior setup)
alter table game_sessions
  add column if not exists player1_deck text,
  add column if not exists player2_deck text;

-- Add JSONB deck columns so both clients initialise from server-stored specs
-- rather than re-deriving from local state.
-- host_deck  = full deck spec for player1 (the game creator)
-- guest_deck = full deck spec for player2 (the joiner)
alter table game_sessions
  add column if not exists host_deck jsonb,
  add column if not exists guest_deck jsonb;
