export type RoomStatus = 'LOBBY' | 'ROLE_SELECTION' | 'ROLE_ASSIGNED';
export type Team = 'Blue' | 'Red' | 'Grey';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Expert';
export type RoleCategory = 'Core' | 'Support' | 'Spy' | 'Traitor' | 'Civilian' | 'Independent' | 'Conman';
export type BondsMode = 'off' | 'on' | 'random';
export type BuryMode = 'off' | 'on' | 'random';
export type RoleId =
  | 'president'
  | 'bomber'
  | 'igniter'
  | 'remote-detonator'
  | 'blue-spy'
  | 'red-spy'
  | 'blue-traitor'
  | 'red-traitor'
  | 'blue-civilian'
  | 'red-civilian'
  | 'gambler'
  | 'victim'
  | 'red-conman'
  | 'blue-conman'
  | 'princess'
  | 'killer';

export type Role = {
  id: RoleId;
  name: string;
  team: Team;
  category: RoleCategory;
  pair: string | null;
  description: string;
  difficulty: Difficulty;
};

export type Room = {
  id: string;
  roomCode: string;
  createdAt: string;
  hostPlayerId: string | null;
  status: RoomStatus;
  selectedRoleIds: RoleId[];
  bondsMode: BondsMode;
  buryMode: BuryMode;
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
  accessToken: string;
};

export type RoleAssignment = {
  playerId: string;
  roleId: RoleId;
  assignedAt: string;
  bondedPartnerName: string | null;
};
