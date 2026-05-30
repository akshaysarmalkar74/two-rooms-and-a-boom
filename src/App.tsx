import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clearSession, createRoom, getPlayers, getRoom, joinRoom, leaveRoom, loadSession, maxPlayers, saveSession, updateSelectedRoleIds, validateName } from './roomService';
import { getDeckStatus, getPairedRoleId, getRoleCounts, getRoleQuantity, pairedRoleIds, roleCatalog, rolesById } from './roles';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Player, Role, RoleId, Room, Session, Team } from './types';

type Icons = {
  ArrowLeft: LucideIcon;
  Crown: LucideIcon;
  LogIn: LucideIcon;
  Minus: LucideIcon;
  Plus: LucideIcon;
  Save: LucideIcon;
  Settings: LucideIcon;
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
  const [isLeaving, setIsLeaving] = useState(false);
  const { Crown, Settings, Users } = icons;

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

  useEffect(() => {
    if (!currentPlayer) {
      return;
    }

    const handleBeforeUnload = () => {
      if (currentPlayer.isHost) {
        void supabase!.from('rooms').delete().eq('id', session.roomId);
      } else {
        void supabase!.from('players').delete().eq('id', session.playerId);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentPlayer, session.playerId, session.roomId]);

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

  if (!room) {
    return (
      <section className="panel narrow-panel">
        <p className="muted">{error || 'Loading lobby...'}</p>
      </section>
    );
  }

  if (screen === 'roles') {
    return (
      <RoleSelection
        connectedPlayerCount={connectedPlayers.length}
        icons={icons}
        isHost={isHost}
        onBack={() => setScreen('lobby')}
        room={room}
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
          <button className="secondary-button" onClick={() => setScreen('roles')} type="button">
            <Settings size={18} />
            Role Selection
          </button>
          <button className="secondary-button" disabled={isLeaving} onClick={handleLeave} type="button">
            {isHost ? 'Close Room' : 'Leave Room'}
          </button>
        </div>
      </div>

      <div className="deck-summary-grid">
        <SummaryTile label="Players" value={connectedPlayers.length.toString()} />
        <SummaryTile label="Selected Cards" value={selectedRoleIds.length.toString()} />
        <SummaryTile label="Blue" value={teamCounts.Blue.toString()} team="Blue" />
        <SummaryTile label="Red" value={teamCounts.Red.toString()} team="Red" />
        <SummaryTile label="Grey" value={teamCounts.Grey.toString()} team="Grey" />
        <SummaryTile label="Deck Status" value={deckStatus} tone={deckStatus === 'Ready' ? 'ready' : 'warning'} />
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

      {error ? <div className="error-message">{error}</div> : null}
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
}: {
  connectedPlayerCount: number;
  icons: Icons;
  isHost: boolean;
  onBack: () => void;
  room: Room;
}) {
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { ArrowLeft, Minus, Plus, Save } = icons;
  const selectedRoleIds = room.selectedRoleIds;
  const teamCounts = getRoleCounts(selectedRoleIds);
  const deckStatus = getDeckStatus(selectedRoleIds.length, connectedPlayerCount);

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
          <button className="primary-outline-button" onClick={onBack} type="button">
            <Save size={18} />
            Save Deck
          </button>
        </div>
      </div>

      <div className="deck-summary-grid">
        <SummaryTile label="Players" value={connectedPlayerCount.toString()} />
        <SummaryTile label="Selected Cards" value={selectedRoleIds.length.toString()} />
        <SummaryTile label="Blue" value={teamCounts.Blue.toString()} team="Blue" />
        <SummaryTile label="Red" value={teamCounts.Red.toString()} team="Red" />
        <SummaryTile label="Grey" value={teamCounts.Grey.toString()} team="Grey" />
        <SummaryTile label="Deck Status" value={deckStatus} tone={deckStatus === 'Ready' ? 'ready' : 'warning'} />
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
                <span className="role-quantity">{quantity}</span>
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

      {error ? <div className="error-message">{error}</div> : null}
    </section>
  );
}
