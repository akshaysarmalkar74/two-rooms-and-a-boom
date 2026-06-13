# Two Rooms Companion

A real-time web companion app for the social deduction game **Two Rooms and a Boom**. Players create or join a lobby, collaboratively build a role deck, and receive secret role assignments — all synchronized live via Supabase.

## What It Does

- **Create or join a room** using a 4-character room code
- **Build a role deck** collaboratively — the host adds/removes role cards, and all players see updates in real time
- **Generate a random deck** balanced for the current player count
- **Start the game** — roles are shuffled and secretly assigned to each player
- **Reveal your role** privately on your own device, with options to share just your team color or your full card
- **Reset the game** to play another round with the same lobby

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite |
| Icons | Lucide React |
| Backend / DB | Supabase (PostgreSQL + Realtime + RPC) |

## Project Structure

```
src/
  main.tsx        # App entry point, icon injection
  App.tsx         # All UI screens (Home, Lobby, Role Selection, My Role)
  roles.ts        # Role catalog, deck utilities, random deck generator
  roomService.ts  # Supabase API calls, session management
  supabase.ts     # Supabase client initialization
  types.ts        # Shared TypeScript types
  styles.css      # Global styles
```

## Roles

| Role | Team | Category | Difficulty | Notes |
|---|---|---|---|---|
| President | Blue | Core | Beginner | Blue wins if President survives |
| Bomber | Red | Core | Beginner | Kills everyone in their room at game end |
| Igniter | Blue | Support | Expert | Pairs with Remote Detonator |
| Remote Detonator | Red | Support | Expert | Pairs with Igniter |
| Blue Spy | Red | Spy | Intermediate | Pairs with Red Spy — card color is opposite to allegiance |
| Red Spy | Blue | Spy | Intermediate | Pairs with Blue Spy — card color is opposite to allegiance |
| Blue Traitor | Blue | Traitor | Expert | Pairs with Red Traitor — wins if Blue Team loses |
| Red Traitor | Red | Traitor | Expert | Pairs with Blue Traitor — wins if Red Team loses |
| Blue Civilian | Blue | Civilian | Beginner | Filler role |
| Red Civilian | Red | Civilian | Beginner | Filler role |
| Gambler | Grey | Independent | Expert | Predicts winning team before reveal |
| Victim | Grey | Independent | Expert | Wins if in the same room as the Bomber at game end |

Paired roles (e.g. President/Bomber) are always added and removed together.

## Game Flow

```
Home → Create/Join Room
       ↓
     Lobby (see players, deck summary)
       ↓
     Role Selection (host configures deck, non-hosts view in real time)
       ↓
     Start Game (host triggers role assignment via Supabase RPC)
       ↓
     My Role (each player reveals their secret card privately)
       ↓
     Reset Game → back to Lobby
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project with the required tables and RPC functions

### Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd TwoRooms
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the project root:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

### Required Supabase Schema

The app expects the following tables and RPC functions in Supabase:

**Tables:**
- `rooms` — `id`, `room_code`, `status`, `host_player_id`, `selected_role_ids`, `created_at`
- `players` — `id`, `room_id`, `name`, `is_host`, `access_token`, `joined_at`
- `role_assignments` — `player_id`, `role_id`, `room_id`, `assigned_at`

**RPC Functions:**
- `start_game(p_room_id, p_host_player_id, p_access_token)` — shuffles and assigns roles to all players
- `reset_game(p_room_id, p_host_player_id, p_access_token)` — clears assignments and resets room to LOBBY
- `get_my_assignment(p_room_id, p_player_id, p_access_token)` — returns the calling player's role assignment

**Realtime** must be enabled on `rooms` and `players` tables for live lobby updates.

## Key Behaviors

- **Max players:** 20 per room
- **Room codes:** 4 uppercase alphanumeric characters (ambiguous characters like `0`, `O`, `1`, `I` excluded)
- **Session persistence:** Stored in `localStorage` so refreshing the page keeps you in your room
- **Presence tracking:** Uses Supabase Presence to show only currently connected players
- **Host controls:** Only the host can modify the deck, start the game, or reset it. Non-hosts see the deck in read-only mode with live updates.
