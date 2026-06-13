import { supabase } from './supabase';
import type { BondsMode, BuryMode, Player, RoleAssignment, RoleId, Room, RoomStatus, Session } from './types';

const MAX_PLAYERS = 20;
const ROOM_CODE_LENGTH = 4;
const sessionKey = 'twoRoomsSession';

type RoomRow = {
  id: string;
  room_code: string;
  created_at: string;
  host_player_id: string | null;
  status: Room['status'];
  selected_role_ids: RoleId[] | null;
  bonds_mode: BondsMode | null;
  bury_mode: BuryMode | null;
};

type PlayerRow = {
  id: string;
  room_id: string;
  name: string;
  is_host: boolean;
  joined_at: string;
};

const requireClient = () => {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  return supabase;
};

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  roomCode: row.room_code,
  createdAt: row.created_at,
  hostPlayerId: row.host_player_id,
  status: row.status,
  selectedRoleIds: row.selected_role_ids ?? [],
  bondsMode: row.bonds_mode ?? 'off',
  buryMode: row.bury_mode ?? 'off',
});

const toPlayer = (row: PlayerRow): Player => ({
  id: row.id,
  roomId: row.room_id,
  name: row.name,
  isHost: row.is_host,
  joinedAt: row.joined_at,
});

const normalizeName = (name: string) => name.trim().slice(0, 40);

const normalizeRoomCode = (roomCode: string) => roomCode.trim().toUpperCase();

const generateRoomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: ROOM_CODE_LENGTH }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
};

export const validateName = (name: string) => {
  if (!normalizeName(name)) {
    return 'Name is required';
  }

  return null;
};

export const saveSession = (session: Session) => {
  localStorage.setItem(sessionKey, JSON.stringify(session));
};

export const loadSession = (): Session | null => {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as Partial<Session>;
    if (!session.roomId || !session.roomCode || !session.playerId || !session.accessToken) {
      localStorage.removeItem(sessionKey);
      return null;
    }

    return session as Session;
  } catch {
    localStorage.removeItem(sessionKey);
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem(sessionKey);
};

const createAccessToken = () => crypto.randomUUID();

export const createRoom = async (name: string): Promise<Session> => {
  const client = requireClient();
  const playerName = normalizeName(name);

  if (!playerName) {
    throw new Error('Name is required');
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = generateRoomCode();
    const { data: room, error: roomError } = await client
      .from('rooms')
      .insert({ room_code: roomCode, status: 'LOBBY' })
      .select('id, room_code, created_at, host_player_id, status, selected_role_ids, bonds_mode, bury_mode')
      .single<RoomRow>();

    if (roomError) {
      if (roomError.code === '23505') {
        continue;
      }

      throw new Error(roomError.message);
    }

    const accessToken = createAccessToken();
    const { data: player, error: playerError } = await client
      .from('players')
      .insert({ access_token: accessToken, room_id: room.id, name: playerName, is_host: true })
      .select('id, room_id, name, is_host, joined_at')
      .single<PlayerRow>();

    if (playerError) {
      await client.from('rooms').delete().eq('id', room.id);
      throw new Error(playerError.message);
    }

    const { error: updateError } = await client
      .from('rooms')
      .update({ host_player_id: player.id })
      .eq('id', room.id);

    if (updateError) {
      await client.from('rooms').delete().eq('id', room.id);
      throw new Error(updateError.message);
    }

    return { accessToken, roomId: room.id, roomCode: room.room_code, playerId: player.id };
  }

  throw new Error('Could not generate a room code. Try again.');
};

export const joinRoom = async (name: string, roomCodeInput: string): Promise<Session> => {
  const client = requireClient();
  const playerName = normalizeName(name);
  const roomCode = normalizeRoomCode(roomCodeInput);

  if (!playerName) {
    throw new Error('Name is required');
  }

  const { data: roomRow, error: roomError } = await client
    .from('rooms')
    .select('id, room_code, created_at, host_player_id, status, selected_role_ids, bonds_mode, bury_mode')
    .eq('room_code', roomCode)
    .maybeSingle<RoomRow>();

  if (roomError) {
    throw new Error(roomError.message);
  }

  if (!roomRow) {
    throw new Error('Room does not exist');
  }

  const room = toRoom(roomRow);
  if (room.status !== 'LOBBY') {
    throw new Error('Room is no longer accepting players');
  }

  const players = await getPlayers(room.id);
  if (players.length >= MAX_PLAYERS) {
    throw new Error('Room is full');
  }

  const accessToken = createAccessToken();
  const { data: player, error: playerError } = await client
    .from('players')
    .insert({ access_token: accessToken, room_id: room.id, name: playerName, is_host: false })
    .select('id, room_id, name, is_host, joined_at')
    .single<PlayerRow>();

  if (playerError) {
    throw new Error(playerError.message);
  }

  return { accessToken, roomId: room.id, roomCode: room.roomCode, playerId: player.id };
};

export const getRoom = async (roomId: string): Promise<Room | null> => {
  const client = requireClient();
  const { data, error } = await client
    .from('rooms')
    .select('id, room_code, created_at, host_player_id, status, selected_role_ids, bonds_mode, bury_mode')
    .eq('id', roomId)
    .maybeSingle<RoomRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toRoom(data) : null;
};

export const getPlayers = async (roomId: string): Promise<Player[]> => {
  const client = requireClient();
  const { data, error } = await client
    .from('players')
    .select('id, room_id, name, is_host, joined_at')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => toPlayer(row as PlayerRow));
};

export const leaveRoom = async (session: Session, isHost: boolean) => {
  const client = requireClient();

  if (isHost) {
    await client.from('rooms').delete().eq('id', session.roomId);
    return;
  }

  await client.from('players').delete().eq('id', session.playerId);
};

export const updateSelectedRoleIds = async (roomId: string, selectedRoleIds: RoleId[]) => {
  const client = requireClient();
  const { error } = await client
    .from('rooms')
    .update({ selected_role_ids: selectedRoleIds })
    .eq('id', roomId)
    .in('status', ['LOBBY', 'ROLE_SELECTION']);

  if (error) {
    throw new Error(error.message);
  }
};

export const updateBondsMode = async (roomId: string, bondsMode: BondsMode) => {
  const client = requireClient();
  const { error } = await client
    .from('rooms')
    .update({ bonds_mode: bondsMode })
    .eq('id', roomId)
    .in('status', ['LOBBY', 'ROLE_SELECTION']);

  if (error) {
    throw new Error(error.message);
  }
};

export const updateBuryMode = async (roomId: string, buryMode: BuryMode) => {
  const client = requireClient();
  const { error } = await client
    .from('rooms')
    .update({ bury_mode: buryMode })
    .eq('id', roomId)
    .in('status', ['LOBBY', 'ROLE_SELECTION']);

  if (error) {
    throw new Error(error.message);
  }
};

export const updateRoomStatus = async (roomId: string, status: RoomStatus) => {
  const client = requireClient();
  const { error } = await client.from('rooms').update({ status }).eq('id', roomId);

  if (error) {
    throw new Error(error.message);
  }
};

export const startGame = async (session: Session) => {
  const client = requireClient();
  const { error } = await client.rpc('start_game', {
    p_access_token: session.accessToken,
    p_host_player_id: session.playerId,
    p_room_id: session.roomId,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const resetGame = async (session: Session) => {
  const client = requireClient();
  const { error } = await client.rpc('reset_game', {
    p_access_token: session.accessToken,
    p_host_player_id: session.playerId,
    p_room_id: session.roomId,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const getMyAssignment = async (session: Session): Promise<RoleAssignment | null> => {
  const client = requireClient();
  const { data, error } = await client.rpc('get_my_assignment', {
    p_access_token: session.accessToken,
    p_player_id: session.playerId,
    p_room_id: session.roomId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const assignment = Array.isArray(data) ? data[0] : null;
  if (!assignment) {
    return null;
  }

  return {
    playerId: assignment.player_id,
    roleId: assignment.role_id as RoleId,
    assignedAt: assignment.assigned_at,
    bondedPartnerName: (assignment.bonded_partner_name as string | null) ?? null,
  };
};

export const maxPlayers = MAX_PLAYERS;
