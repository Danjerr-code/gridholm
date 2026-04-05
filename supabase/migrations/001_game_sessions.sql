create table if not exists game_sessions (
  id text primary key,
  player1_id text not null,
  player2_id text,
  game_state jsonb not null,
  active_player text not null,
  status text not null default 'waiting',
  winner text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table game_sessions enable row level security;

create policy if not exists "Anyone can read game sessions"
  on game_sessions for select using (true);

create policy if not exists "Anyone can insert game sessions"
  on game_sessions for insert with check (true);

create policy if not exists "Anyone can update game sessions"
  on game_sessions for update using (true);

alter publication supabase_realtime add table game_sessions;
