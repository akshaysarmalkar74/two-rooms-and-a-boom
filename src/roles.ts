import type { Role, RoleId } from './types';

export const roleCatalog = [
  {
    id: 'president',
    name: 'President',
    team: 'Blue',
    category: 'Core',
    pair: 'Bomber',
    description: 'Primary Blue Team role.',
    difficulty: 'Beginner',
  },
  {
    id: 'bomber',
    name: 'Bomber',
    team: 'Red',
    category: 'Core',
    pair: 'President',
    description: 'Primary Red Team role.',
    difficulty: 'Beginner',
  },
  {
    id: 'igniter',
    name: 'Igniter',
    team: 'Red',
    category: 'Support',
    pair: 'Remote Detonator',
    description: 'Advanced support role.',
    difficulty: 'Expert',
  },
  {
    id: 'remote-detonator',
    name: 'Remote Detonator',
    team: 'Red',
    category: 'Support',
    pair: 'Igniter',
    description: 'Advanced support role.',
    difficulty: 'Expert',
  },
  {
    id: 'blue-spy',
    name: 'Blue Spy',
    team: 'Blue',
    category: 'Spy',
    pair: 'Red Spy',
    description: 'Blue Team deception role.',
    difficulty: 'Intermediate',
  },
  {
    id: 'red-spy',
    name: 'Red Spy',
    team: 'Red',
    category: 'Spy',
    pair: 'Blue Spy',
    description: 'Red Team deception role.',
    difficulty: 'Intermediate',
  },
  {
    id: 'blue-traitor',
    name: 'Blue Traitor',
    team: 'Blue',
    category: 'Traitor',
    pair: 'Red Traitor',
    description: 'Blue Team sabotage role.',
    difficulty: 'Expert',
  },
  {
    id: 'red-traitor',
    name: 'Red Traitor',
    team: 'Red',
    category: 'Traitor',
    pair: 'Blue Traitor',
    description: 'Red Team sabotage role.',
    difficulty: 'Expert',
  },
  {
    id: 'blue-civilian',
    name: 'Blue Civilian',
    team: 'Blue',
    category: 'Civilian',
    pair: null,
    description: 'Basic Blue Team role.',
    difficulty: 'Beginner',
  },
  {
    id: 'red-civilian',
    name: 'Red Civilian',
    team: 'Red',
    category: 'Civilian',
    pair: null,
    description: 'Basic Red Team role.',
    difficulty: 'Beginner',
  },
  {
    id: 'gambler',
    name: 'Gambler',
    team: 'Grey',
    category: 'Independent',
    pair: null,
    description: 'Independent Grey Team role.',
    difficulty: 'Expert',
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
