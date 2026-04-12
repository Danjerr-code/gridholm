-- Store authenticated user IDs alongside guest IDs so win/loss records
-- can be updated in the profiles table when both players are signed in.
alter table game_sessions
  add column if not exists player1_auth_id uuid,
  add column if not exists player2_auth_id uuid;
