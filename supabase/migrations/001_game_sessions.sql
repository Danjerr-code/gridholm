create table game_sessions (
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

create policy "Anyone can read game sessions"
  on game_sessions for select using (true);

create policy "Anyone can insert game sessions"
  on game_sessions for insert with check (true);

create policy "Players can update their own game sessions"
  on game_sessions for update using (true);
