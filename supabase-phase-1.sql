create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  created_at timestamptz not null default now(),
  host_player_id uuid null,
  status text not null default 'LOBBY' check (status in ('LOBBY', 'ROLE_SELECTION', 'ROLE_ASSIGNED')),
  selected_role_ids text[] not null default '{}'
);

alter table public.rooms
  add column if not exists selected_role_ids text[] not null default '{}';

alter table public.rooms
  drop constraint if exists rooms_status_check;

alter table public.rooms
  add constraint rooms_status_check
  check (status in ('LOBBY', 'ROLE_SELECTION', 'ROLE_ASSIGNED'));

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  access_token text not null default encode(gen_random_bytes(32), 'hex'),
  joined_at timestamptz not null default now()
);

alter table public.players
  add column if not exists access_token text not null default encode(gen_random_bytes(32), 'hex');

create table if not exists public.role_assignments (
  player_id uuid primary key references public.players(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  role_id text not null,
  assigned_at timestamptz not null default now()
);

alter table public.role_assignments replica identity full;

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
alter table public.role_assignments enable row level security;

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

revoke select (access_token) on public.players from anon, authenticated;

drop function if exists public.start_game(uuid, uuid);
drop function if exists public.reset_game(uuid, uuid);
drop function if exists public.get_my_assignment(uuid, uuid);

create or replace function public.start_game(p_room_id uuid, p_host_player_id uuid, p_access_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
  v_player_count integer;
  v_selected_count integer;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room does not exist';
  end if;

  if v_room.host_player_id is distinct from p_host_player_id then
    raise exception 'Only the host can start the game';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_host_player_id
      and room_id = p_room_id
      and is_host = true
      and access_token = p_access_token
  ) then
    raise exception 'Only the host can start the game';
  end if;

  if v_room.status not in ('LOBBY', 'ROLE_SELECTION') then
    raise exception 'Game has already started';
  end if;

  select count(*)
  into v_player_count
  from public.players
  where room_id = p_room_id;

  v_selected_count := coalesce(array_length(v_room.selected_role_ids, 1), 0);

  if v_selected_count <> v_player_count then
    raise exception 'Selected cards count must match player count';
  end if;

  delete from public.role_assignments
  where room_id = p_room_id;

  with shuffled_players as (
    select
      id,
      row_number() over (order by random()) as assignment_index
    from public.players
    where room_id = p_room_id
  ),
  shuffled_roles as (
    select
      role_id,
      row_number() over (order by random()) as assignment_index
    from unnest(v_room.selected_role_ids) as role_id
  )
  insert into public.role_assignments (player_id, room_id, role_id)
  select shuffled_players.id, p_room_id, shuffled_roles.role_id
  from shuffled_players
  inner join shuffled_roles using (assignment_index);

  update public.rooms
  set status = 'ROLE_ASSIGNED'
  where id = p_room_id;
end;
$$;

create or replace function public.reset_game(p_room_id uuid, p_host_player_id uuid, p_access_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room does not exist';
  end if;

  if v_room.host_player_id is distinct from p_host_player_id then
    raise exception 'Only the host can reset the game';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_host_player_id
      and room_id = p_room_id
      and is_host = true
      and access_token = p_access_token
  ) then
    raise exception 'Only the host can reset the game';
  end if;

  delete from public.role_assignments
  where room_id = p_room_id;

  update public.rooms
  set status = 'ROLE_SELECTION'
  where id = p_room_id;
end;
$$;

drop function if exists public.get_my_assignment(uuid, uuid, text);

create function public.get_my_assignment(p_room_id uuid, p_player_id uuid, p_access_token text)
returns table (
  player_id uuid,
  role_id text,
  assigned_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select role_assignments.player_id, role_assignments.role_id, role_assignments.assigned_at
  from public.role_assignments
  inner join public.players
    on players.id = role_assignments.player_id
  where role_assignments.room_id = p_room_id
    and role_assignments.player_id = p_player_id
    and players.access_token = p_access_token
  limit 1;
$$;

grant execute on function public.start_game(uuid, uuid, text) to anon;
grant execute on function public.reset_game(uuid, uuid, text) to anon;
grant execute on function public.get_my_assignment(uuid, uuid, text) to anon;

-- ============================================================
-- Companions (Bonded Pairs)
-- ============================================================

-- 1. Add bonds_mode column to rooms
alter table public.rooms
  add column if not exists bonds_mode text not null default 'off';

alter table public.rooms
  drop constraint if exists rooms_bonds_mode_check;

alter table public.rooms
  add constraint rooms_bonds_mode_check
  check (bonds_mode in ('off', 'on', 'random'));

-- 2. Bonds table — one row per game, stores the two bonded player IDs
create table if not exists public.bonds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id_1 uuid not null references public.players(id) on delete cascade,
  player_id_2 uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.bonds enable row level security;

drop policy if exists "Phase 1 bonds are public" on public.bonds;
create policy "Phase 1 bonds are public"
  on public.bonds
  for all
  to anon
  using (true)
  with check (true);

-- 3. Updated start_game — assigns roles and optionally creates a bonded pair
create or replace function public.start_game(p_room_id uuid, p_host_player_id uuid, p_access_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room        rooms%rowtype;
  v_player_count   integer;
  v_selected_count integer;
  v_bonds_mode     text;
  v_bond_player_1  uuid;
  v_bond_player_2  uuid;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room does not exist';
  end if;

  if v_room.host_player_id is distinct from p_host_player_id then
    raise exception 'Only the host can start the game';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_host_player_id
      and room_id = p_room_id
      and is_host = true
      and access_token = p_access_token
  ) then
    raise exception 'Only the host can start the game';
  end if;

  if v_room.status not in ('LOBBY', 'ROLE_SELECTION') then
    raise exception 'Game has already started';
  end if;

  select count(*)
  into v_player_count
  from public.players
  where room_id = p_room_id;

  v_selected_count := coalesce(array_length(v_room.selected_role_ids, 1), 0);

  if v_selected_count <> v_player_count then
    raise exception 'Selected cards count must match player count';
  end if;

  -- Read bonds_mode explicitly to avoid any rowtype caching issues
  select bonds_mode
  into v_bonds_mode
  from public.rooms
  where id = p_room_id;

  -- Clear any previous assignments and bonds
  delete from public.role_assignments
  where room_id = p_room_id;

  delete from public.bonds
  where room_id = p_room_id;

  -- Assign roles randomly
  with shuffled_players as (
    select
      id,
      row_number() over (order by random()) as assignment_index
    from public.players
    where room_id = p_room_id
  ),
  shuffled_roles as (
    select
      role_id,
      row_number() over (order by random()) as assignment_index
    from unnest(v_room.selected_role_ids) as role_id
  )
  insert into public.role_assignments (player_id, room_id, role_id)
  select shuffled_players.id, p_room_id, shuffled_roles.role_id
  from shuffled_players
  inner join shuffled_roles using (assignment_index);

  -- Create a bonded pair if companions mode is active and there are at least 6 players
  if v_player_count >= 6 and (
    v_bonds_mode = 'on' or
    (v_bonds_mode = 'random' and random() > 0.5)
  ) then
    -- Pick first random player
    select id
    into v_bond_player_1
    from public.players
    where room_id = p_room_id
    order by random()
    limit 1;

    -- Pick a second random player that is different from the first
    select id
    into v_bond_player_2
    from public.players
    where room_id = p_room_id
      and id <> v_bond_player_1
    order by random()
    limit 1;

    if v_bond_player_1 is not null and v_bond_player_2 is not null then
      insert into public.bonds (room_id, player_id_1, player_id_2)
      values (p_room_id, v_bond_player_1, v_bond_player_2);
    end if;
  end if;

  update public.rooms
  set status = 'ROLE_ASSIGNED'
  where id = p_room_id;
end;
$$;

-- 4. Updated reset_game — also clears bonds on reset
create or replace function public.reset_game(p_room_id uuid, p_host_player_id uuid, p_access_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms%rowtype;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'Room does not exist';
  end if;

  if v_room.host_player_id is distinct from p_host_player_id then
    raise exception 'Only the host can reset the game';
  end if;

  if not exists (
    select 1
    from public.players
    where id = p_host_player_id
      and room_id = p_room_id
      and is_host = true
      and access_token = p_access_token
  ) then
    raise exception 'Only the host can reset the game';
  end if;

  delete from public.role_assignments
  where room_id = p_room_id;

  delete from public.bonds
  where room_id = p_room_id;

  update public.rooms
  set status = 'ROLE_SELECTION'
  where id = p_room_id;
end;
$$;

-- 5. Updated get_my_assignment — return type changes so must drop and recreate
drop function if exists public.get_my_assignment(uuid, uuid, text);

create function public.get_my_assignment(p_room_id uuid, p_player_id uuid, p_access_token text)
returns table (
  player_id uuid,
  role_id text,
  assigned_at timestamptz,
  bonded_partner_name text
)
language sql
security definer
set search_path = public
as $$
  select
    ra.player_id,
    ra.role_id,
    ra.assigned_at,
    partner.name as bonded_partner_name
  from public.role_assignments ra
  inner join public.players p
    on p.id = ra.player_id
  left join public.bonds b
    on b.room_id = ra.room_id
    and (b.player_id_1 = ra.player_id or b.player_id_2 = ra.player_id)
  left join public.players partner
    on partner.id = case
      when b.player_id_1 = ra.player_id then b.player_id_2
      when b.player_id_2 = ra.player_id then b.player_id_1
      else null
    end
  where ra.room_id = p_room_id
    and ra.player_id = p_player_id
    and p.access_token = p_access_token
  limit 1;
$$;

grant execute on function public.get_my_assignment(uuid, uuid, text) to anon;
