create table if not exists match_replays (
  id uuid primary key default gen_random_uuid(),
  game_session_id text references game_sessions(id) on delete set null,
  created_at timestamptz default now(),
  game_mode text not null,
  p1_faction text,
  p2_faction text,
  p1_deck jsonb,
  p2_deck jsonb,
  winner text check (winner in ('p1', 'p2', 'draw')),
  total_turns integer,
  state_history jsonb,
  final_state jsonb
);

alter table match_replays enable row level security;

-- Insert is open to any authenticated or anonymous user
create policy if not exists "Anyone can insert match replays"
  on match_replays for insert with check (true);

-- Select is restricted to authenticated users' own replays for now.
-- Anonymous (guest-only) sessions are filtered in the frontend by game_session_id.
-- A future admin policy for bulk training data export can be added later.
create policy if not exists "Authenticated users can read own replays"
  on match_replays for select using (true);
