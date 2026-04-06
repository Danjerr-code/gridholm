-- Allow game_state to be null during deck_select phase (between games)
alter table game_sessions alter column game_state drop not null;
