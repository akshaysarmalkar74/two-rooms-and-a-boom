import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clearSession, createRoom, getMyAssignment, getPlayers, getRoom, joinRoom, leaveRoom, loadSession, maxPlayers, resetGame, saveSession, startGame, updateBondsMode, updateBuryMode, updateRoomStatus, updateSelectedRoleIds, validateName } from './roomService';
import { generateRandomDeck, getDeckStatus, getPairedRoleId, getRoleCounts, getRoleQuantity, pairedRoleIds, roleCatalog, rolesById } from './roles';
import { isSupabaseConfigured, supabase } from './supabase';
import type { BondsMode, BuryMode, Player, Role, RoleAssignment, RoleId, Room, Session, Team } from './types';

type Icons = {
  ArrowLeft: LucideIcon;
  Crown: LucideIcon;
  Eye: LucideIcon;
  EyeOff: LucideIcon;
  LogIn: LucideIcon;
  Minus: LucideIcon;
  Play: LucideIcon;
  Plus: LucideIcon;
  RotateCcw: LucideIcon;
  Save: LucideIcon;
  Settings: LucideIcon;
  Shuffle: LucideIcon;
  Users: LucideIcon;
};

type AppProps = {
  icons: Icons;
};

export function App({ icons }: AppProps) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const handleSession = (nextSession: Session) => {
    saveSession(nextSession);
    setSession(nextSession);
  };

  const handleExit = () => {
    clearSession();
    setSession(null);
  };

  if (!isSupabaseConfigured) {
    return <MissingConfig />;
  }

  return (
    <main className="app-shell">
      {session ? (
        <Lobby icons={icons} session={session} onExit={handleExit} />
      ) : (
        <Home icons={icons} onSession={handleSession} />
      )}
    </main>
  );
}

function MissingConfig() {
  return (
    <main className="app-shell">
      <section className="panel narrow-panel">
        <p className="eyebrow">Setup required</p>
        <h1>Connect Supabase</h1>
        <p className="muted">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to a local <code>.env</code> file,
          then restart the dev server.
        </p>
      </section>
    </main>
  );
}

function Home({ icons, onSession }: { icons: Icons; onSession: (session: Session) => void }) {
  const [createName, setCreateName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<'create' | 'join' | null>(null);
  const { LogIn, Plus } = icons;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    const nameError = validateName(createName);
    if (nameError) {
      setError(nameError);
      return;
    }

    setLoading('create');
    try {
      onSession(await createRoom(createName));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create room');
    } finally {
      setLoading(null);
    }
  };

  const handleJoin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    const nameError = validateName(joinName);
    if (nameError) {
      setError(nameError);
      return;
    }

    setLoading('join');
    try {
      onSession(await joinRoom(joinName, roomCode));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join room');
    } finally {
      setLoading(null);
    }
  };

  return (
    <section className="home-layout">
      <div className="intro">
        <p className="eyebrow">Two Rooms Companion</p>
        <h1>Create or join a lobby</h1>
        <p className="muted">Create a room, invite players, and build the role deck together.</p>
      </div>

      <div className="form-grid">
        <form className="panel" onSubmit={handleCreate}>
          <h2>Create Room</h2>
          <label>
            Display Name
            <input
              autoComplete="name"
              maxLength={40}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="Akshay"
              value={createName}
            />
          </label>
          <button disabled={loading !== null} type="submit">
            <Plus size={18} />
            {loading === 'create' ? 'Creating...' : 'Create Room'}
          </button>
        </form>

        <form className="panel" onSubmit={handleJoin}>
          <h2>Join Room</h2>
          <label>
            Display Name
            <input
              autoComplete="name"
              maxLength={40}
              onChange={(event) => setJoinName(event.target.value)}
              placeholder="Rahul"
              value={joinName}
            />
          </label>
          <label>
            Room Code
            <input
              autoCapitalize="characters"
              className="room-code-input"
              maxLength={4}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              placeholder="ABXJ"
              value={roomCode}
            />
          </label>
          <button disabled={loading !== null} type="submit">
            <LogIn size={18} />
            {loading === 'join' ? 'Joining...' : 'Join Room'}
          </button>
        </form>
      </div>

      {error ? <div className="error-message">{error}</div> : null}
    </section>
  );
}

function Lobby({ icons, session, onExit }: { icons: Icons; session: Session; onExit: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<Set<string>>(new Set());
  const [screen, setScreen] = useState<'lobby' | 'roles'>('lobby');
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const { Crown, Play, Settings, Users } = icons;

  const connectedPlayers = useMemo(() => {
    if (onlinePlayerIds.size === 0) {
      return players;
    }

    return players.filter((player) => onlinePlayerIds.has(player.id));
  }, [onlinePlayerIds, players]);
  const currentPlayer = useMemo(
    () => players.find((player) => player.id === session.playerId) ?? null,
    [players, session.playerId],
  );
  const isHost = Boolean(currentPlayer?.isHost);
  const selectedRoleIds = room?.selectedRoleIds ?? [];
  const teamCounts = useMemo(() => getRoleCounts(selectedRoleIds), [selectedRoleIds]);
  const deckStatus = getDeckStatus(selectedRoleIds.length, connectedPlayers.length);
  const buryWillActivate = !!room && (room.buryMode === 'on' || (room.buryMode === 'random' && selectedRoleIds.length === connectedPlayers.length + 2));
  const buryRequirementsMet = !buryWillActivate || (selectedRoleIds.includes('princess') && selectedRoleIds.includes('killer'));
  const canStartGame = buryRequirementsMet && (deckStatus === 'Ready' || buryWillActivate);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const [nextRoom, nextPlayers] = await Promise.all([getRoom(session.roomId), getPlayers(session.roomId)]);

        if (!active) {
          return;
        }

        if (!nextRoom) {
          clearSession();
          onExit();
          return;
        }

        setRoom(nextRoom);
        setPlayers(nextPlayers);
        setError('');
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Could not load lobby');
        }
      }
    };

    void refresh();

    const roomChannel = supabase!
      .channel(`room-${session.roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${session.roomId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${session.roomId}` },
        () => void refresh(),
      )
      .subscribe();

    const presenceChannel = supabase!
      .channel(`presence-${session.roomId}`, { config: { presence: { key: session.playerId } } })
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presenceChannel.presenceState<{ playerId: string }>();
        const nextOnlineIds = new Set(
          Object.values(presenceState)
            .flat()
            .map((presence) => presence.playerId),
        );
        setOnlinePlayerIds(nextOnlineIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ playerId: session.playerId, onlineAt: new Date().toISOString() });
        }
      });

    return () => {
      active = false;
      void supabase!.removeChannel(roomChannel);
      void supabase!.removeChannel(presenceChannel);
    };
  }, [onExit, session.playerId, session.roomId]);

  const handleLeave = async () => {
    if (!currentPlayer) {
      onExit();
      return;
    }

    setIsLeaving(true);
    try {
      await leaveRoom(session, currentPlayer.isHost);
    } finally {
      clearSession();
      onExit();
    }
  };

  const openRoleSelection = async () => {
    if (room && isHost) {
      try {
        await updateRoomStatus(room.id, 'ROLE_SELECTION');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not open role selection');
        return;
      }
    }

    setScreen('roles');
  };

  const returnToLobby = async () => {
    if (room && isHost && room.status === 'ROLE_SELECTION') {
      try {
        await updateRoomStatus(room.id, 'LOBBY');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not return to lobby');
        return;
      }
    }

    setScreen('lobby');
  };

  const handleStartGame = async () => {
    if (!room || !currentPlayer?.isHost) {
      return;
    }

    if (!canStartGame) {
      setError('Selected cards count must match player count');
      return;
    }

    setIsStarting(true);
    setError('');
    try {
      await startGame(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start game');
    } finally {
      setIsStarting(false);
    }
  };

  if (!room) {
    return (
      <section className="panel narrow-panel">
        <p className="muted">{error || 'Loading lobby...'}</p>
      </section>
    );
  }

  if (room.status === 'ROLE_ASSIGNED') {
    return <MyRoleScreen icons={icons} isHost={isHost} room={room} session={session} />;
  }

  if (room.status === 'ROLE_SELECTION' || screen === 'roles') {
    return (
      <RoleSelection
        connectedPlayerCount={connectedPlayers.length}
        icons={icons}
        isHost={isHost}
        onBack={() => void returnToLobby()}
        room={room}
        session={session}
      />
    );
  }

  return (
    <section className="lobby">
      <div className="lobby-header">
        <div>
          <p className="eyebrow">Room</p>
          <h1>{room.roomCode}</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => void openRoleSelection()} type="button">
            <Settings size={18} />
            Role Selection
          </button>
          {isHost ? (
            <button className="primary-outline-button" disabled={isStarting || !canStartGame} onClick={() => void handleStartGame()} type="button">
              <Play size={18} />
              {isStarting ? 'Starting...' : 'Start Game'}
            </button>
          ) : null}
          <button className="secondary-button" disabled={isLeaving} onClick={handleLeave} type="button">
            {isHost ? 'Close Room' : 'Leave Room'}
          </button>
        </div>
      </div>

      {error ? <div className="error-message">{error}</div> : null}

      <div className="deck-summary-grid">
        <SummaryTile label="Players" value={connectedPlayers.length.toString()} />
        <SummaryTile label="Selected Cards" value={selectedRoleIds.length.toString()} />
        <SummaryTile label="Blue" value={teamCounts.Blue.toString()} team="Blue" />
        <SummaryTile label="Red" value={teamCounts.Red.toString()} team="Red" />
        <SummaryTile label="Grey" value={teamCounts.Grey.toString()} team="Grey" />
        <SummaryTile label="Deck Status" value={canStartGame ? 'Ready' : deckStatus} tone={canStartGame ? 'ready' : 'warning'} />
      </div>

      <div className="panel player-panel">
        <div className="player-summary">
          <div>
            <p className="eyebrow">Connected Players</p>
            <h2>{connectedPlayers.length} / {maxPlayers}</h2>
          </div>
          <Users aria-hidden="true" size={26} />
        </div>

        <ol className="player-list">
          {connectedPlayers.map((player) => (
            <li key={player.id}>
              <span>{player.name}</span>
              {player.isHost ? (
                <span className="host-badge">
                  <Crown size={14} />
                  Host
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

    </section>
  );
}

function SummaryTile({ label, value, team, tone }: { label: string; value: string; team?: Team; tone?: 'ready' | 'warning' }) {
  return (
    <div className={`summary-tile ${team ? `team-${team.toLowerCase()}` : ''} ${tone ? `summary-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RoleSelection({
  connectedPlayerCount,
  icons,
  isHost,
  onBack,
  room,
  session,
}: {
  connectedPlayerCount: number;
  icons: Icons;
  isHost: boolean;
  onBack: () => void;
  room: Room;
  session: Session;
}) {
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const { ArrowLeft, Minus, Play, Plus, Save, Shuffle } = icons;
  const selectedRoleIds = room.selectedRoleIds;
  const teamCounts = getRoleCounts(selectedRoleIds);
  const deckStatus = getDeckStatus(selectedRoleIds.length, connectedPlayerCount);
  const buryWillActivate = room.buryMode === 'on' || (room.buryMode === 'random' && selectedRoleIds.length === connectedPlayerCount + 2);
  const buryRequirementsMet = !buryWillActivate || (selectedRoleIds.includes('princess') && selectedRoleIds.includes('killer'));
  const canStartGame = buryRequirementsMet && (deckStatus === 'Ready' || buryWillActivate);

  const persistDeck = async (nextSelectedRoleIds: RoleId[]) => {
    setError('');
    setIsSaving(true);
    try {
      await updateSelectedRoleIds(room.id, nextSelectedRoleIds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update deck');
    } finally {
      setIsSaving(false);
    }
  };

  const addRole = async (role: Role) => {
    if (!isHost) {
      return;
    }

    if (pairedRoleIds.has(role.id)) {
      const pairedRoleId = getPairedRoleId(role);
      if (!pairedRoleId) {
        return;
      }

      const withoutPair = selectedRoleIds.filter((roleId) => roleId !== role.id && roleId !== pairedRoleId);
      await persistDeck([...withoutPair, role.id, pairedRoleId]);
      return;
    }

    if (role.id === 'gambler' && selectedRoleIds.includes(role.id)) {
      return;
    }

    await persistDeck([...selectedRoleIds, role.id]);
  };

  const removeRole = async (role: Role) => {
    if (!isHost) {
      return;
    }

    if (pairedRoleIds.has(role.id)) {
      const pairedRoleId = getPairedRoleId(role);
      if (!pairedRoleId) {
        return;
      }

      await persistDeck(selectedRoleIds.filter((roleId) => roleId !== role.id && roleId !== pairedRoleId));
      return;
    }

    const indexToRemove = selectedRoleIds.lastIndexOf(role.id);
    if (indexToRemove === -1) {
      return;
    }

    await persistDeck(selectedRoleIds.filter((_, index) => index !== indexToRemove));
  };

  const handleGenerateRandomDeck = async () => {
    if (!isHost) {
      return;
    }

    const nextDeck = generateRandomDeck(connectedPlayerCount, room.buryMode);
    if (nextDeck.length === 0) {
      setError('At least 2 players are required for a random deck');
      return;
    }

    await persistDeck(nextDeck);
  };

  const handleStartGame = async () => {
    if (!isHost) {
      return;
    }

    if (!canStartGame) {
      setError('Selected cards count must match player count');
      return;
    }

    setIsStarting(true);
    setError('');
    try {
      await startGame(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start game');
    } finally {
      setIsStarting(false);
    }
  };

  const handleBondsModeChange = async (mode: BondsMode) => {
    if (!isHost) {
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      await updateBondsMode(room.id, mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update companions setting');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBuryModeChange = async (mode: BuryMode) => {
    if (!isHost) {
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      await updateBuryMode(room.id, mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update bury setting');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="role-selection">
      <div className="lobby-header">
        <div>
          <p className="eyebrow">Role Selection</p>
          <h1>{room.roomCode}</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onBack} type="button">
            <ArrowLeft size={18} />
            Return To Lobby
          </button>
          {isHost ? (
            <button className="secondary-button" disabled={isSaving || connectedPlayerCount < 2} onClick={() => void handleGenerateRandomDeck()} type="button">
              <Shuffle size={18} />
              Generate Random Deck
            </button>
          ) : null}
          {isHost ? (
            <button className="primary-outline-button" disabled={isStarting || !canStartGame} onClick={() => void handleStartGame()} type="button">
              <Play size={18} />
              {isStarting ? 'Starting...' : 'Start Game'}
            </button>
          ) : null}
          <button className="primary-outline-button" onClick={onBack} type="button">
            <Save size={18} />
            Save Deck
          </button>
        </div>
      </div>

      {error ? <div className="error-message">{error}</div> : null}
      {buryWillActivate && (!selectedRoleIds.includes('princess') || !selectedRoleIds.includes('killer')) ? (
        <div className="error-message">Bury is active — Princess and Killer must be in the deck as the alternate main characters.</div>
      ) : null}

      <div className="deck-summary-grid">
        <SummaryTile label="Players" value={connectedPlayerCount.toString()} />
        <SummaryTile label="Selected Cards" value={selectedRoleIds.length.toString()} />
        <SummaryTile label="Blue" value={teamCounts.Blue.toString()} team="Blue" />
        <SummaryTile label="Red" value={teamCounts.Red.toString()} team="Red" />
        <SummaryTile label="Grey" value={teamCounts.Grey.toString()} team="Grey" />
        <SummaryTile label="Deck Status" value={canStartGame ? 'Ready' : deckStatus} tone={canStartGame ? 'ready' : 'warning'} />
      </div>

      <div className="panel bonds-panel">
        <div className="bonds-panel-header">
          <div>
            <p className="eyebrow">Optional Rule</p>
            <h2>Companions</h2>
          </div>
          <span className={`bonds-mode-badge bonds-mode-${room.bondsMode}`}>
            {room.bondsMode === 'off' ? 'Off' : room.bondsMode === 'on' ? 'On' : 'Random (50%)'}
          </span>
        </div>
        <p className="muted">Two randomly chosen players will be secretly bonded. Their only objective becomes ending the game in the same room — their team goal no longer applies. Not revealed during shares. Requires at least 6 players.</p>
        {isHost ? (
          <div className="bonds-mode-buttons">
            <button
              className={room.bondsMode === 'off' ? 'primary-outline-button' : 'secondary-button'}
              disabled={isSaving}
              onClick={() => void handleBondsModeChange('off')}
              type="button"
            >
              Off
            </button>
            <button
              className={room.bondsMode === 'on' ? 'primary-outline-button' : 'secondary-button'}
              disabled={isSaving || connectedPlayerCount < 6}
              onClick={() => void handleBondsModeChange('on')}
              type="button"
            >
              On
            </button>
            <button
              className={room.bondsMode === 'random' ? 'primary-outline-button' : 'secondary-button'}
              disabled={isSaving || connectedPlayerCount < 6}
              onClick={() => void handleBondsModeChange('random')}
              type="button"
            >
              Random (50%)
            </button>
          </div>
        ) : null}
        {connectedPlayerCount < 6 && room.bondsMode !== 'off' ? (
          <p className="muted">Companions will be disabled at game start — need at least 6 players.</p>
        ) : null}
      </div>

      <div className="panel bury-panel">
        <div className="bury-panel-header">
          <div>
            <p className="eyebrow">Optional Rule</p>
            <h2>Bury Cards</h2>
          </div>
          <span className={`bury-mode-badge bury-mode-${room.buryMode}`}>
            {room.buryMode === 'off' ? 'Off' : room.buryMode === 'on' ? 'On' : 'Random (50%)'}
          </span>
        </div>
        <p className="muted">
          When on, President and Bomber are buried — set aside and not assigned to any player. Add Princess and Killer as the alternate main characters.
          Build your deck with 2 more cards than players (the extras being President and Bomber).
          {room.buryMode === 'random' ? ' In Random mode, Generate Random Deck has a 50% chance of creating a bury deck (N+2 cards) or a normal deck (N cards).' : ''}
        </p>
        {isHost ? (
          <div className="bury-mode-buttons">
            <button
              className={room.buryMode === 'off' ? 'primary-outline-button' : 'secondary-button'}
              disabled={isSaving}
              onClick={() => void handleBuryModeChange('off')}
              type="button"
            >
              Off
            </button>
            <button
              className={room.buryMode === 'on' ? 'primary-outline-button' : 'secondary-button'}
              disabled={isSaving}
              onClick={() => void handleBuryModeChange('on')}
              type="button"
            >
              On
            </button>
            <button
              className={room.buryMode === 'random' ? 'primary-outline-button' : 'secondary-button'}
              disabled={isSaving}
              onClick={() => void handleBuryModeChange('random')}
              type="button"
            >
              Random (50%)
            </button>
          </div>
        ) : null}
      </div>

      {!isHost ? <p className="viewer-note">Only the host can modify the deck. Updates appear here in real time.</p> : null}

      <div className="role-grid">
        {roleCatalog.map((role) => {
          const quantity = getRoleQuantity(selectedRoleIds, role.id);
          const pairedRoleId = getPairedRoleId(role);
          const pairedRole = pairedRoleId ? rolesById.get(pairedRoleId) : null;
          const isPairSelected = pairedRoleId ? selectedRoleIds.includes(role.id) && selectedRoleIds.includes(pairedRoleId) : false;
          const canAdd = isHost && !isSaving && (!pairedRoleIds.has(role.id) || !isPairSelected) && (role.id !== 'gambler' || quantity === 0);
          const canRemove = isHost && !isSaving && quantity > 0;

          return (
            <article className={`role-card team-${role.team.toLowerCase()}`} key={role.id}>
              <div className="role-card-header">
                <div>
                  <span className="role-team">{role.team}</span>
                  <h2>{role.name}</h2>
                </div>
                <span className="role-quantity" data-count={quantity}>{quantity}</span>
              </div>
              <p>{role.description}</p>
              <div className="role-meta">
                <span>{role.category}</span>
                <span>{role.difficulty}</span>
              </div>
              {pairedRole ? <p className="pair-note">Pairs with {pairedRole.name}</p> : null}
              <div className="role-actions">
                <button className="icon-button" disabled={!canRemove} onClick={() => void removeRole(role)} title={`Remove ${role.name}`} type="button">
                  <Minus size={18} />
                </button>
                <button className="icon-button" disabled={!canAdd} onClick={() => void addRole(role)} title={`Add ${role.name}`} type="button">
                  <Plus size={18} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

    </section>
  );
}

function MyRoleScreen({ icons, isHost, room, session }: { icons: Icons; isHost: boolean; room: Room; session: Session }) {
  const [assignment, setAssignment] = useState<RoleAssignment | null>(null);
  const [showRole, setShowRole] = useState(false);
  const [shareView, setShareView] = useState<'team' | 'card' | null>(null);
  const [error, setError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const { Eye, EyeOff, RotateCcw } = icons;
  const role = assignment ? rolesById.get(assignment.roleId) : null;

  useEffect(() => {
    let active = true;

    const loadAssignment = async () => {
      try {
        const nextAssignment = await getMyAssignment(session);
        if (active) {
          setAssignment(nextAssignment);
          setError(nextAssignment ? '' : 'No role assignment found for this player');
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Could not load your role');
        }
      }
    };

    void loadAssignment();

    return () => {
      active = false;
    };
  }, [room.id, session.playerId]);

  const handleReset = async () => {
    if (!isHost) {
      return;
    }

    setIsResetting(true);
    setError('');
    try {
      await resetGame(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset game');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <section className="role-screen">
      <div className="lobby-header">
        <div>
          <p className="eyebrow">My Role</p>
          <h1>{room.roomCode}</h1>
        </div>
        {isHost ? (
          <button className="secondary-button" disabled={isResetting} onClick={() => void handleReset()} type="button">
            <RotateCcw size={18} />
            {isResetting ? 'Resetting...' : 'Reset Game'}
          </button>
        ) : null}
      </div>

      <div className={`panel my-role-card ${role && showRole && !shareView ? `team-${role.team.toLowerCase()}` : ''}`}>
        {!assignment ? (
          <p className="muted">{error || 'Loading your role...'}</p>
        ) : !showRole ? (
          <>
            <p className="eyebrow">Private Card</p>
            <h2>Role assigned</h2>
            <p className="muted">Reveal only when your screen is private.</p>
            <button onClick={() => setShowRole(true)} type="button">
              <Eye size={18} />
              Reveal My Role
            </button>
          </>
        ) : role && shareView ? (
          <SharePanel role={role} shareView={shareView} onStopSharing={() => setShareView(null)} />
        ) : role ? (
          <>
            <div className="my-role-header">
              <span className="role-team">{role.team} Team</span>
              <h2 className="my-role-name">{role.name}</h2>
              <div className={`win-condition win-condition-${role.team.toLowerCase()}`}>
                <span className="win-condition-label">Win If</span>
                {role.winCondition}
              </div>
            </div>
            <p>{role.description}</p>
            <div className="role-meta">
              <span>{role.category}</span>
              <span>{role.difficulty}</span>
            </div>
            {assignment.bondedPartnerName ? (
              <div className="bond-info">
                <p className="eyebrow">Companions</p>
                <h3>Bonded with {assignment.bondedPartnerName}</h3>
                <p className="muted">Your only objective is to end the game in the same room as your companion. Your team goal no longer applies.</p>
              </div>
            ) : null}
            <div className="share-actions">
              <button className="secondary-button" onClick={() => setShareView('team')} type="button">
                <Eye size={18} />
                Share Team Color
              </button>
              <button className="secondary-button" onClick={() => setShareView('card')} type="button">
                <Eye size={18} />
                Share Full Card
              </button>
              <button className="secondary-button" onClick={() => setShowRole(false)} type="button">
                <EyeOff size={18} />
                Hide Role
              </button>
            </div>
          </>
        ) : (
          <p className="muted">Assigned role is not in the current catalog.</p>
        )}
      </div>

      {error && assignment ? <div className="error-message">{error}</div> : null}
    </section>
  );
}

function SharePanel({ onStopSharing, role, shareView }: { onStopSharing: () => void; role: Role; shareView: 'team' | 'card' }) {
  if (role.id === 'red-conman' || role.id === 'blue-conman') {
    return (
      <div className="share-panel team-grey">
        <div className="conman-other-player">
          <p className="eyebrow">Share Result</p>
          <h2>Conman</h2>
          <p>You have encountered the Conman! You must now reveal your ENTIRE role card to them.</p>
        </div>
        <button className="secondary-button" onClick={onStopSharing} type="button">
          Stop Sharing
        </button>
      </div>
    );
  }

  const isTeamOnly = shareView === 'team';

  return (
    <div className={`share-panel team-${role.team.toLowerCase()}`}>
      <p className="eyebrow">{isTeamOnly ? 'Team Color' : 'Full Card'}</p>
      {isTeamOnly ? (
        <>
          <h2>{role.team}</h2>
          <p className="muted">Team only.</p>
        </>
      ) : (
        <>
          <span className="role-team">{role.team}</span>
          <h2>{role.name}</h2>
          <p>{role.description}</p>
          <div className="role-meta">
            <span>Team: {role.team}</span>
            <span>{role.category}</span>
            <span>{role.difficulty}</span>
          </div>
        </>
      )}
      <button className="secondary-button" onClick={onStopSharing} type="button">
        Stop Sharing
      </button>
    </div>
  );
}
