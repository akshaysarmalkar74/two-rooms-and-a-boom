export type RoomStatus = 'LOBBY' | 'ROLE_SELECTION' | 'IN_GAME' | 'FINISHED';

export type Room = {
  id: string;
  roomCode: string;
  createdAt: string;
  hostPlayerId: string | null;
  status: RoomStatus;
};

export type Player = {
  id: string;
  roomId: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
};

export type Session = {
  roomId: string;
  roomCode: string;
  playerId: string;
};
