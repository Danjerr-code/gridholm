-- Profiles: one row per authenticated user
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz default now(),
  wins int not null default 0,
  losses int not null default 0
);

alter table profiles enable row level security;

create policy if not exists "Users can read their own profile"
  on profiles for select using (auth.uid() = id);

create policy if not exists "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

create policy if not exists "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

create policy if not exists "Users can delete their own profile"
  on profiles for delete using (auth.uid() = id);

-- Decks: up to 5 decks per player stored server-side
create table if not exists decks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  cards jsonb not null,
  faction text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table decks enable row level security;

create policy if not exists "Users can read their own decks"
  on decks for select using (auth.uid() = player_id);

create policy if not exists "Users can insert their own decks"
  on decks for insert with check (auth.uid() = player_id);

create policy if not exists "Users can update their own decks"
  on decks for update using (auth.uid() = player_id);

create policy if not exists "Users can delete their own decks"
  on decks for delete using (auth.uid() = player_id);
