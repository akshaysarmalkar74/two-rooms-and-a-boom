-- ============================================================
-- Bury Cards
-- Run this after supabase-phase-1.sql
-- ============================================================

-- 1. Add bury_mode column to rooms
alter table public.rooms
  add column if not exists bury_mode text not null default 'off';

alter table public.rooms
  drop constraint if exists rooms_bury_mode_check;

alter table public.rooms
  add constraint rooms_bury_mode_check
  check (bury_mode in ('off', 'on', 'random'));

-- 2. Updated start_game — handles both bury and bonds logic
create or replace function public.start_game(p_room_id uuid, p_host_player_id uuid, p_access_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room            rooms%rowtype;
  v_player_count    integer;
  v_selected_count  integer;
  v_bonds_mode      text;
  v_bury_mode       text;
  v_bury_active     boolean := false;
  v_roles_to_assign text[];
  v_bond_player_1   uuid;
  v_bond_player_2   uuid;
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

  -- Read modes explicitly to avoid rowtype caching issues
  select bonds_mode, bury_mode
  into v_bonds_mode, v_bury_mode
  from public.rooms
  where id = p_room_id;

  -- Determine if bury is active
  if v_bury_mode = 'on' then
    v_bury_active := true;
  elsif v_bury_mode = 'random' then
    -- In random mode the host decides by card count:
    -- selecting N+2 cards activates bury, selecting exactly N cards skips it.
    if v_selected_count = v_player_count + 2 then
      v_bury_active := true;
    end if;
  end if;

  -- Validate card count
  if v_bury_active then
    -- With bury: deck must have exactly player_count + 2 cards
    -- (the extra 2 being President and Bomber, which will be buried)
    if v_selected_count <> v_player_count + 2 then
      raise exception 'With bury enabled, select exactly 2 more cards than players (President and Bomber will be buried)';
    end if;

    -- Build the assignment pool without President and Bomber
    select array_agg(role_id)
    into v_roles_to_assign
    from unnest(v_room.selected_role_ids) as role_id
    where role_id not in ('president', 'bomber');
  else
    -- Without bury: standard count check
    if v_selected_count <> v_player_count then
      raise exception 'Selected cards count must match player count';
    end if;

    v_roles_to_assign := v_room.selected_role_ids;
  end if;

  -- Clear any previous assignments and bonds
  delete from public.role_assignments
  where room_id = p_room_id;

  delete from public.bonds
  where room_id = p_room_id;

  -- Assign roles randomly from the resolved pool
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
    from unnest(v_roles_to_assign) as role_id
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
    select id
    into v_bond_player_1
    from public.players
    where room_id = p_room_id
    order by random()
    limit 1;

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
