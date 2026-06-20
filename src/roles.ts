import type { BuryMode, Role, RoleId } from './types';

export const roleCatalog = [
  {
    id: 'president',
    name: 'President',
    team: 'Blue',
    category: 'Core',
    pair: 'Bomber',
    description: 'Stay alive. Blue Team wins if you survive to the end.',
    winCondition: 'Survive to the end',
    difficulty: 'Beginner',
  },
  {
    id: 'bomber',
    name: 'Bomber',
    team: 'Red',
    category: 'Core',
    pair: 'President',
    description: 'Kill everyone in your room at game end. Red wins if the President dies.',
    winCondition: 'Kill everyone in your room',
    difficulty: 'Beginner',
  },
  {
    id: 'igniter',
    name: 'Igniter',
    team: 'Blue',
    category: 'Support',
    pair: 'Remote Detonator',
    description: 'Card share with the Bomber to trigger an immediate explosion.',
    winCondition: 'Trigger early explosion',
    difficulty: 'Expert',
  },
  {
    id: 'remote-detonator',
    name: 'Remote Detonator',
    team: 'Red',
    category: 'Support',
    pair: 'Igniter',
    description: 'Card share with the President to trigger an immediate explosion.',
    winCondition: 'Trigger early explosion',
    difficulty: 'Expert',
  },
  {
    id: 'blue-spy',
    name: 'Blue Spy',
    team: 'Red',
    category: 'Spy',
    pair: 'Red Spy',
    description: 'You play for Blue, but your card shows Red.',
    winCondition: 'Blue Team wins',
    difficulty: 'Intermediate',
  },
  {
    id: 'red-spy',
    name: 'Red Spy',
    team: 'Blue',
    category: 'Spy',
    pair: 'Blue Spy',
    description: 'You play for Red, but your card shows Blue.',
    winCondition: 'Red Team wins',
    difficulty: 'Intermediate',
  },
  {
    id: 'blue-traitor',
    name: 'Blue Traitor',
    team: 'Blue',
    category: 'Traitor',
    pair: 'Red Traitor',
    description: 'You win if Blue loses. Sabotage your own team.',
    winCondition: 'Blue Team must lose',
    difficulty: 'Expert',
  },
  {
    id: 'red-traitor',
    name: 'Red Traitor',
    team: 'Red',
    category: 'Traitor',
    pair: 'Blue Traitor',
    description: 'You win if Red loses. Sabotage your own team.',
    winCondition: 'Red Team must lose',
    difficulty: 'Expert',
  },
  {
    id: 'blue-civilian',
    name: 'Blue Civilian',
    team: 'Blue',
    category: 'Civilian',
    pair: null,
    description: 'No special abilities. Help Blue Team win.',
    winCondition: 'Blue Team wins',
    difficulty: 'Beginner',
  },
  {
    id: 'red-civilian',
    name: 'Red Civilian',
    team: 'Red',
    category: 'Civilian',
    pair: null,
    description: 'No special abilities. Help Red Team win.',
    winCondition: 'Red Team wins',
    difficulty: 'Beginner',
  },
  {
    id: 'gambler',
    name: 'Gambler',
    team: 'Grey',
    category: 'Independent',
    pair: null,
    description: 'Predict the winning team before the final reveal.',
    winCondition: 'Correctly predict the winner',
    difficulty: 'Expert',
  },
  {
    id: 'victim',
    name: 'Victim',
    team: 'Grey',
    category: 'Independent',
    pair: null,
    description: 'Win by ending the game in the same room as the Bomber.',
    winCondition: 'End in the Bomber\'s room',
    difficulty: 'Expert',
  },
  {
    id: 'red-conman',
    name: 'Red Conman',
    team: 'Red',
    category: 'Conman',
    pair: 'Blue Conman',
    description: 'You only ever reveal "Conman" when sharing — they must show you their full card in return.',
    winCondition: 'Red Team wins',
    difficulty: 'Intermediate',
  },
  {
    id: 'blue-conman',
    name: 'Blue Conman',
    team: 'Blue',
    category: 'Conman',
    pair: 'Red Conman',
    description: 'You only ever reveal "Conman" when sharing — they must show you their full card in return.',
    winCondition: 'Blue Team wins',
    difficulty: 'Intermediate',
  },
  {
    id: 'princess',
    name: 'Princess',
    team: 'Blue',
    category: 'Core',
    pair: 'Killer',
    description: 'Alternate Blue leader when President is buried. Blue wins if you survive.',
    winCondition: 'Survive to the end',
    difficulty: 'Beginner',
  },
  {
    id: 'killer',
    name: 'Killer',
    team: 'Red',
    category: 'Core',
    pair: 'Princess',
    description: 'Alternate Red threat when Bomber is buried. Kills everyone in your room at game end.',
    winCondition: 'Kill everyone in your room',
    difficulty: 'Beginner',
  },
] as const satisfies Role[];

export const rolesById = new Map<RoleId, Role>(roleCatalog.map((role) => [role.id, role]));

export const roleIdByName = new Map<string, RoleId>(roleCatalog.map((role) => [role.name, role.id]));

export const pairedRoleIds = new Set<RoleId>(
  roleCatalog.filter((role) => role.pair).map((role) => role.id),
);

export const getPairedRoleId = (role: Role) => (role.pair ? roleIdByName.get(role.pair) ?? null : null);

export const getRoleCounts = (selectedRoleIds: RoleId[]) =>
  selectedRoleIds.reduce(
    (counts, roleId) => {
      const role = rolesById.get(roleId);
      if (role) {
        counts[role.team] += 1;
      }

      return counts;
    },
    { Blue: 0, Red: 0, Grey: 0 },
  );

export const getRoleQuantity = (selectedRoleIds: RoleId[], roleId: RoleId) =>
  selectedRoleIds.filter((selectedRoleId) => selectedRoleId === roleId).length;

export const getDeckStatus = (selectedCount: number, playerCount: number) => {
  if (selectedCount === playerCount && playerCount > 0) {
    return 'Ready';
  }

  if (selectedCount < playerCount) {
    return 'Needs Cards';
  }

  return 'Too Many Cards';
};

const shuffle = <Value,>(values: Value[]) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
};

export const generateRandomDeck = (playerCount: number, buryMode: BuryMode = 'off'): RoleId[] => {
  if (playerCount < 2) {
    return [];
  }

  const buryActive = buryMode === 'on' || (buryMode === 'random' && Math.random() > 0.5);

  // playerDeck holds the roles that will actually be assigned to players (always playerCount slots).
  // When bury is active, president+bomber are appended separately as the 2 buried extras.
  const playerDeck: RoleId[] = buryActive
    ? ['princess', 'killer']   // alternate main characters — mandatory when burying
    : ['president', 'bomber'];  // standard main characters — mandatory in normal games

  // Optional paired roles — added together or not at all.
  // Princess/Killer are included as a random pair only when bury is NOT active
  // (when bury is active they are already mandatory above).
  const optionalPairs: Array<[RoleId, RoleId]> = shuffle([
    ['blue-spy', 'red-spy'],
    ['blue-traitor', 'red-traitor'],
    ['igniter', 'remote-detonator'],
    ['blue-conman', 'red-conman'],
    ...(!buryActive ? [['princess', 'killer'] as [RoleId, RoleId]] : []),
  ]);

  for (const pair of optionalPairs) {
    if (playerDeck.length + pair.length <= playerCount && Math.random() > 0.5) {
      playerDeck.push(...pair);
    }
  }

  // Optional single roles
  if (playerCount - playerDeck.length > 0 && Math.random() > 0.5) {
    playerDeck.push('victim');
  }

  if (playerCount - playerDeck.length > 0 && Math.random() > 0.5) {
    playerDeck.push('gambler');
  }

  // Fill remaining slots with civilians, balancing Blue vs Red
  const fillerRoles: RoleId[] = ['blue-civilian', 'red-civilian'];
  while (playerDeck.length < playerCount) {
    const { Blue: blueCount, Red: redCount } = getRoleCounts(playerDeck);
    const nextCivilian = blueCount <= redCount ? 'blue-civilian' : 'red-civilian';
    const alternateCivilian = fillerRoles[Math.floor(Math.random() * fillerRoles.length)];
    playerDeck.push(Math.random() > 0.25 ? nextCivilian : alternateCivilian);
  }

  // Append the buried extras at the end; the SQL will filter them out of assignment
  if (buryActive) {
    playerDeck.push('president', 'bomber');
  }

  return shuffle(playerDeck);
};
