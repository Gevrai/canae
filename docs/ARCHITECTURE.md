# Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Phaser 3                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │BootScene │→ │MenuScene │→ │BattleScene│→ │GameOver│  │
│  └──────────┘  └──────────┘  └─────┬─────┘  └────────┘  │
│                                    │                     │
│                    ┌───────────────┼───────────────┐     │
│                    ▼               ▼               ▼     │
│              ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│              │  Systems  │   │ Entities │   │    UI    │  │
│              └──────────┘   └──────────┘   └──────────┘  │
│                    │               ▲               ▲     │
│                    ▼               │               │     │
│              ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│              │  Config   │   │Multiplayer│  │  Utils   │  │
│              └──────────┘   └──────────┘   └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Scenes

The game progresses through four Phaser scenes:

| Scene | Purpose |
|---|---|
| **BootScene** | Loading screen with animated title fade |
| **MenuScene** | Main menu — solo play, multiplayer lobby (create/join with room codes), settings |
| **BattleScene** | Core gameplay loop — manages all systems, turn phases, combat events, and multiplayer sync |
| **GameOverScene** | Victory/defeat screen with stats (kills, losses, MVP, duration) |

## Systems

Systems encapsulate game logic and run within `BattleScene`. Each system is a class instantiated with a reference to the scene.

| System | Responsibility |
|---|---|
| **MapSystem** | Procedurally generates a 30×20 tile map using Perlin-like noise. Places terrain (grass, hills, forest), carves a river, and draws a road. Renders tiles with a parchment aesthetic. |
| **UnitSystem** | Creates and destroys units. Manages unit visuals (colored blocks with type icons), health bars, and selection glow. Sets up initial armies (4 infantry + 2 cavalry + 2 archers per side). |
| **MovementSystem** | Continuous per-frame movement toward target (x, y) world coordinates. No pathfinding; units move at speed defined by unit type and terrain. Drains stamina based on terrain (via `speedMultiplier` and `staminaDrainMultiplier`). Recovers stamina when idle. Handles collision detection with other units. |
| **SelectionSystem** | Handles pointer input for selecting units and click-to-move commands (world coordinates). No reachable tile overlay. Displays attack overlays. Syncs commands in multiplayer. |
| **CombatSystem** | Resolves melee and ranged combat. Calculates damage from attack/defense stats and situational modifiers: **cavalry charge** (1.5× when moving fast into enemy), **infantry brace** (1.35× defense when stationary ≥2s), **archer proximity** (bonus near friendlies, penalty when isolated). Stamina below 50% reduces stats. Manages morale, routing, auto-engagement, death, and visual effects. |
| **AISystem** | Controls enemy units with difficulty-scaled tactics. Evaluates decisions (attack, hold, flank, retreat, support) using Euclidean distance and unit advantages. Calls `setTarget()` to command movement. Uses a seeded RNG for reproducible behavior. |
| **CameraSystem** | Pans and zooms the viewport via keyboard, mouse drag, and pinch gestures. Clamps to map bounds. Zoom range: 0.4×–2×. |
| **AudioSystem** | Synthesizes sound effects using the Web Audio API — sword clashes, arrow launches, unit deaths, selection clicks, and victory/defeat fanfares. Respects the sound setting from `localStorage`. |

### System Interaction

```
SelectionSystem ──move/attack──▶ MovementSystem
                                 CombatSystem
AISystem ──────decide actions──▶ MovementSystem
                                 CombatSystem
CombatSystem ──────events──────▶ AudioSystem
                                 UnitSystem (death)
                                 HUD (combat log)
MapSystem ──────terrain data──▶ MovementSystem (pathfinding costs)
                                CombatSystem (defense bonuses)
```

## Entities

### Unit

Core data class representing a single unit on the battlefield.

- **Properties:** id, type, faction, x, y (world coordinates), hp, stamina, attack, defense, speed, range, morale, sightRange, brace, charge, collision radius; col/row are computed getters
- **Status flags:** charging (fast movement into enemy), braced (stationary ≥2s, +defense), routing, inCombat
- **Key methods:** `takeDamage()`, `heal()`, `isAlive()`, `setTarget(x, y)` (command movement), `updateStamina(delta, terrain)` (drain/recover based on movement and terrain), `getEffectiveStats()` (applies stamina/brace/charge modifiers)

### Terrain

Lightweight wrapper around terrain configuration.

- **Properties:** type, movementCost, defenseModifier, blocksLineOfSight, isPassable

## Configuration

All game constants and data-driven definitions live in `src/config/`.

| File | Contents |
|---|---|
| `game.config.ts` | Canvas size (1280×720), tile size (64px), map dimensions (30×20), camera speed, turn time limit |
| `units.config.ts` | Stats for Infantry, Cavalry, Archer: hp, attack, defense, speed (px/s), range (px), stamina (max resource), collision radius. Faction colors. |
| `terrain.config.ts` | Six terrain types: movementCost (deprecated), speedMultiplier (% of unit speed), staminaDrainMultiplier (% drain per px moved), defenseModifier, blocksLineOfSight, isPassable. |
| `settings.ts` | Loads/saves user preferences (difficulty, sound, fullscreen) to `localStorage`. |

## Data Flow

```
Config (units, terrain, settings)
  │
  ▼
Entities (Unit, Terrain instances)
  │
  ▼
Systems (AI, Combat, Movement, Selection, Map, Camera, Audio)
  │
  ▼
Scenes (BattleScene orchestrates systems per frame)
  │
  ▼
UI (HUD, UnitPanel render current state)
```

1. **Config** defines static data — unit stats, terrain properties, game constants.
2. **MapSystem** reads terrain config to procedurally generate the map.
3. **UnitSystem** reads unit config to spawn armies as `Unit` entities.
4. **Each frame**, `BattleScene` updates all systems. `SelectionSystem` processes input, `MovementSystem` moves units, `CombatSystem` resolves fights, `AISystem` decides enemy actions.
5. **UI** components query current unit/game state and render overlays, bars, and info panels.

## Multiplayer Architecture

Canae uses a **host-authoritative** model over WebRTC peer-to-peer connections.

```
┌──────────┐   PeerJS / WebRTC   ┌──────────┐
│   Host   │◄───────────────────▶│   Guest  │
│ (Player) │   DataChannel msgs  │ (Player) │
└────┬─────┘                     └────┬─────┘
     │                                │
  PeerManager                    PeerManager
     │                                │
  GameSync ◄─────── messages ───────▶ GameSync
     │                                │
  BattleScene                    BattleScene
  (authoritative)                (mirrors state)
```

### Connection Flow

1. **Host** calls `PeerManager.createLobby()` which generates a 5-character room code.
2. **Guest** enters the room code and calls `PeerManager.joinLobby(code)`.
3. PeerJS brokers the WebRTC connection. Once established, the host sends a `GAME_START` message with the map seed.
4. Both players run the same `BattleScene`, but the host's state is authoritative.

### Message Types

| Message | Direction | Purpose |
|---|---|---|
| `GAME_START` | Host → Guest | Start game with shared map seed |
| `UNIT_MOVE` | Both | Player issued a move command (world coordinates) |
| `UNIT_ATTACK` | Both | Player issued an attack command |
| `STATE_SYNC` | Host → Guest | Periodic full unit state snapshot: position (x, y), stamina, brace/charge state |
| `GAME_OVER` | Host → Guest | Game result |
| `PING` / `PONG` | Both | Latency measurement |

### Resilience

- **10-second connection timeout** on join attempts.
- **15-second idle disconnect** if no messages are received.
- Disconnect overlay displayed in `BattleScene` when connection drops.

## How to Extend

### Adding a New Unit Type

1. Add the unit definition to `src/config/units.config.ts` with stats (hp, attack, defense, speed, movement, range, morale).
2. Update `UnitSystem.ts` to handle the new type's visual representation (icon, color).
3. If the unit has special combat behavior, add logic in `CombatSystem.ts`.
4. Update `AISystem.ts` so the AI can evaluate and use the new unit type.

### Adding a New Terrain Type

1. Add the terrain definition to `src/config/terrain.config.ts` with movement cost, defense modifier, LoS blocking, and passability.
2. Update `MapSystem.ts` to include the terrain in procedural generation or place it at specific map features.
3. The rest of the systems (movement, combat) automatically pick up the new terrain via config lookups.

### Adding a New Game Mode

1. Create a new scene in `src/scenes/` (e.g., `SiegeScene.ts`).
2. Register it in the Phaser config in `src/main.ts`.
3. Add a menu entry in `MenuScene.ts` to launch the new mode.
4. Reuse or extend existing systems — most logic (combat, movement, AI) is scene-agnostic.
