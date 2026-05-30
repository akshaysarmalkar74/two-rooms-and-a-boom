import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clearSession, createRoom, getPlayers, getRoom, joinRoom, leaveRoom, loadSession, maxPlayers, saveSession, validateName } from './roomService';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Player, Room, Session } from './types';

type Icons = {
  Crown: LucideIcon;
  LogIn: LucideIcon;
  Plus: LucideIcon;
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
        <p className="muted">Phase 1 manages rooms and live player lists only.</p>
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
  const [error, setError] = useState('');
  const [isLeaving, setIsLeaving] = useState(false);
  const { Crown, Users } = icons;

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

  return (
    <section className="lobby">
      <div className="lobby-header">
        <div>
          <p className="eyebrow">Room</p>
          <h1>{room.roomCode}</h1>
        </div>
        <button className="secondary-button" disabled={isLeaving} onClick={handleLeave} type="button">
          {isHost ? 'Close Room' : 'Leave Room'}
        </button>
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
