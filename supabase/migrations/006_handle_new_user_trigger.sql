-- Trigger to create a profile row automatically when a new auth user is created.
-- This is more reliable than client-side insertion because it runs server-side
-- with security definer privileges, bypassing RLS and avoiding session-timing issues.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
