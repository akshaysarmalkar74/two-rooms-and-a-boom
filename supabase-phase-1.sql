create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  created_at timestamptz not null default now(),
  host_player_id uuid null,
  status text not null default 'LOBBY' check (status in ('LOBBY', 'ROLE_SELECTION', 'IN_GAME', 'FINISHED'))
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_host_player_id_fkey'
  ) then
    alter table public.rooms
      add constraint rooms_host_player_id_fkey
      foreign key (host_player_id)
      references public.players(id)
      on delete set null
      deferrable initially deferred;
  end if;
end $$;

alter table public.rooms replica identity full;
alter table public.players replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.players;
exception
  when duplicate_object then null;
end $$;

alter table public.rooms enable row level security;
alter table public.players enable row level security;

drop policy if exists "Phase 1 rooms are public lobby data" on public.rooms;
drop policy if exists "Phase 1 players are public lobby data" on public.players;

create policy "Phase 1 rooms are public lobby data"
  on public.rooms
  for all
  to anon
  using (true)
  with check (true);

create policy "Phase 1 players are public lobby data"
  on public.players
  for all
  to anon
  using (true)
  with check (true);
