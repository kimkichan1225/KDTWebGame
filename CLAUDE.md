# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KDT-Game is a real-time multiplayer 3D combat game built with Node.js, Express, Socket.IO, and Three.js. Players can join rooms, select characters, pick up weapons, and battle each other in a third-person arena with AI bots.

## Running the Project

### Development Commands
```bash
# Install dependencies
npm install

# Start the server (runs on port 3000 by default)
npm start

# Access the game
http://localhost:3000
```

The server runs on port 3000 by default, but can be configured via the `PORT` environment variable.

## Architecture

### Server Architecture (server.js)

The server is built using Express with Socket.IO for real-time communication:

- **Room Management System**: Each room (`rooms` object) tracks players, game state, spawn positions, and configuration (map, max players, visibility, round time)
- **Bot System**: AI bots are created with `makeRandomBot()` and run on a 100ms tick interval. Bots use simple pathfinding to chase targets and attack within 2-unit range with ~0.9s cooldown
- **Game State Synchronization**: Server is authoritative for HP, kills, deaths, and weapon spawns. Position/rotation updates are broadcast to all clients in the room
- **Kill Attribution**: Uses `lastHitBy` tracking on each player to attribute kills correctly even with multiple attackers

Key server patterns:
- Bot respawning is handled server-side with `scheduleBotRespawn()` (3 second delay)
- Weapon spawns are managed server-side and synchronized to all clients via Socket.IO events
- Each room has independent game timers and bot simulation loops

### Client Architecture

The client is organized into modular ES6 modules:

**Core Game Loop (main.js)**:
- `GameStage1` class manages the Three.js scene, renderer, camera, and game loop
- Imports and coordinates all game systems (player, objects, weapons, HP, attack system)
- Handles Socket.IO events for multiplayer synchronization

**Key Client Modules**:
- `player.js`: Local and remote player management, character loading (GLTF), animations, movement controls
- `weapon.js`: Weapon data loading, spawning, pickup detection, and equipping logic
- `attackSystem.js`: Handles attack animations and hit detection
- `hp.js`: HP bar UI rendering and updates
- `meleeProjectile.js`: Projectile system for ranged weapons
- `object.js`: Scene object management and GLTF model loading (default map)
- `island-object.js`: Scene object management for island map (map2)
- `math.js`: Utility math functions for game calculations

**Character System**:
- Characters are loaded from GLTF files in `public/resources/Ultimate Animated Character Pack - Nov 2019/glTF/`
- Character selection happens in `index.html` with a preview panel using Three.js
- Character data is stored in localStorage and passed via Socket.IO when joining rooms

**Weapon System**:
- Weapon definitions are stored in `public/resources/data/weapon_data.json`
- Server-side: `weaponUtils.js` loads weapon data and provides `getRandomWeaponName()`
- Client-side: `weapon.js` handles weapon rendering, pickup collision detection, and equipping
- Weapons have various stats: damage, attack speed, range, tier (Common/Rare/Epic/Legendary), and special effects (knockback, stun, bleed, armor shred)

### Module System

**Client-side**: All client code uses ES6 modules loaded from CDN:
- Three.js (v0.124) and its loaders (GLTFLoader, FBXLoader, OrbitControls) are imported from `jsdelivr.net`
- All client modules use `export` and `import` syntax
- Main entry point is `main.js` which imports and coordinates other modules

**Server-side**: Uses CommonJS (`require`/`module.exports`)
- `weaponUtils.js` is the only shared utility module loaded server-side
- Server loads weapon data synchronously on startup via `loadWeaponData()`

### Socket.IO Events

**Room Management**:
- `createRoom`: Create a new game room with settings (map, max players, visibility, round time, room name)
- `joinRoom`: Join an existing room by ID
- `getPublicRooms`: Request list of public rooms
- `ready`: Toggle ready status in waiting room
- `startGameRequest`: Room creator starts the game (only when all players ready)
- `addBot`: Add an AI bot to the room (room creator only)
- `increaseMaxPlayers`: Increase room capacity (max 8 players)
- `closePlayerSlot`: Kick a player and reduce max capacity

**Game Events**:
- `gameUpdate`: Broadcast player position, rotation, animation, HP, equipped weapon
- `playerAttack`: Notify clients of attack animation
- `playerDamage`: Apply damage to a target player (server updates HP)
- `hpUpdate`: Broadcast HP changes to all clients
- `weaponPickedUp`: Remove weapon from world when picked up
- `weaponSpawned`: Add new weapon to world
- `weaponEquipped`: Notify clients when player equips a weapon
- `playerKilled`: Handle kill/death attribution and scoreboard updates
- `updateScores`: Broadcast updated kills/deaths to all clients
- `killFeed`: Display kill notifications in UI
- `updateTimer`: Sync game timer across clients
- `gameEnd`: Display final scoreboard when round ends

### Map Boundaries

The game world has fixed boundaries at -40 to 40 units on X and Z axes. Players and bots are constrained within these bounds. Going outside triggers damage over time (25 HP every 0.5 seconds) until the player returns or dies.

## File Organization

```
.
├── server.js              # Express + Socket.IO server, room/bot management
├── weaponUtils.js         # Server-side weapon data loading
├── package.json           # Dependencies and npm scripts
├── public/
│   ├── index.html         # Main HTML with character selection UI
│   ├── main.js            # Game initialization and Three.js scene setup
│   ├── player.js          # Player movement, animations, character loading
│   ├── weapon.js          # Client weapon system, pickup logic
│   ├── attackSystem.js    # Attack animations and hit detection
│   ├── hp.js              # HP bar UI rendering
│   ├── meleeProjectile.js # Projectile physics for ranged weapons
│   ├── object.js          # GLTF model loading and object management (map1)
│   ├── island-object.js   # GLTF model loading for map2 (island)
│   ├── math.js            # Math utility functions
│   └── resources/
│       ├── data/
│       │   └── weapon_data.json  # Weapon stats and configurations
│       └── Ultimate Animated Character Pack - Nov 2019/
│           └── glTF/      # Character GLTF models
```

## Important Development Notes

### Working with the Bot System
- Bots are spawned with random names from `BOT_NAMES` and random characters from `BOT_CHARACTERS`
- Bot AI runs in `room.gameState.botInterval` (100ms tick) after game starts
- Bots use `runtime` object for position/rotation tracking separate from synced player data
- Bot targeting refreshes every 1.5 seconds (15 ticks), picking nearest alive target
- When no target, bots wander to random points that refresh every 3-6 seconds

### Working with Weapons
- Weapon data must exist in `public/resources/data/weapon_data.json` before server spawn
- Server spawns 10 random weapons at game start via `getRandomWeaponName()`
- Each weapon has a unique UUID for tracking across network
- Potion items are excluded from random spawns (filtered in `getRandomWeaponName()`)
- When a weapon is picked up, a new weapon immediately spawns at a random position to maintain 10 weapons on the map
- Weapon models are loaded from `public/resources/weapon/FBX/` and attached to the player's `FistR` bone

### Working with Multiplayer Sync
- Server is authoritative for HP, kills, deaths - never trust client damage calculations directly
- Position/rotation updates are sent from clients but validated server-side for bots
- Use `socket.to(roomId).emit()` to broadcast to others, `io.to(roomId).emit()` to broadcast to all including sender
- `lastHitBy` tracking ensures correct kill attribution when multiple players damage one target

### Working with the Character System
- Character GLTF files must be in `public/resources/Ultimate Animated Character Pack - Nov 2019/glTF/`
- Character selection stores filename (without .gltf extension) in localStorage
- Character preview uses Three.js with OrbitControls for 3D rotation
- Victory animation plays in character preview if available in GLTF

### Working with Maps
- The game supports multiple maps: `map1` (default) and `map2` (island)
- Map selection is done in the room creation UI via thumbnail selection
- Map-specific object loaders: `object.js` for map1, `island-object.js` for map2
- The `GameStage1` constructor dynamically imports the correct object module based on `this.map` value
- Map textures are loaded from `public/resources/` with capitalized map names (e.g., `Map1.png`, `Map2.png`)

### Working with Game Input Controls
- **Movement**: W/A/S/D keys for directional movement
- **Jump**: K key (only when not rolling)
- **Roll**: L key (has 1 second cooldown)
- **Attack**: J key (triggers weapon-specific attack animation)
- **Weapon Pickup**: E key (picks up weapon within 2.0 units range)
- **Scoreboard**: Hold Tab key to display, release to hide
- Dead players have input disabled until respawn (3 second countdown)

### Working with the Attack System
- The `AttackSystem` class (in `attackSystem.js`) manages all projectiles and hit detection
- Attacks spawn `MeleeProjectile` instances with a 0.2-0.4 second delay after animation starts
- All weapons use circular hit detection (not sector-based), with radius defined in weapon data
- Melee weapons: instant hit detection at spawn position with defined radius
- Ranged weapons: projectiles travel at defined speed and check collision each frame
- Hit detection only applies to remote players (local damage is client-side visual only)
- Damage is sent to server via `playerDamage` event, server is authoritative for HP updates
- Players cannot damage themselves, enforced both client-side and server-side

### Working with Knockback and Stun System
- Player class tracks knockback state: `isKnockback_`, `knockbackVelocity_`, `knockbackTimer_`
- Stun state: `isStunned_`, `stunTimer_` - prevents all input during stun duration
- `ApplyKnockback(direction, strength, duration)` method applies directional knockback force
- Knockback is applied when `hpUpdate` event contains `weaponEffects.knockbackStrength` and `knockbackDuration`
- Stun is applied when `weaponEffects.stunDuration` is present (typically 0.2s for basic attacks)
- Direction for knockback is calculated from attacker position to victim position (away from attacker)
- Dead players ignore knockback effects

### Working with Collision Detection
- Players use fixed-size bounding boxes (width: 1.3, height: 3.2, depth: 1.3) defined in `player.js:304-310`
- Collision detection uses AABB (Axis-Aligned Bounding Box) intersection tests
- Players can slide along walls when one direction is blocked (X or Z axis tested separately)
- Players can stand on top of objects if positioned correctly (checked via Y-axis position)
- Maximum step height is 0.5 units for climbing small obstacles
- NPC/object collidables are provided by `object.js` or `island-object.js` via `GetCollidables()`
- **Bot Collision**: Server-side bot movement uses simplified obstacle maps (`MAP1_OBSTACLES`, `MAP2_OBSTACLES` in `server.js:64-81`)
- Bots have a 0.65 unit radius for collision and use `canBotMoveTo()` to validate positions before moving
- When bots collide with obstacles, they attempt a 90-degree rotation alternative path

### Working with HP and Death System
- HP damage flow: Client attack → `playerDamage` event → Server updates HP → `hpUpdate` broadcast → All clients update visuals
- Death triggers when HP reaches 0, handled differently for bots vs players:
  - **Bots**: Server handles death, scoreboard update, and schedules respawn (3 seconds)
  - **Players**: Client emits `playerKilled` event, server updates scoreboard, client shows death overlay with countdown
- Players respawn at a random position calculated by `getRandomPosition()` which uses raycasting to avoid spawning inside objects
- `lastHitBy` tracking ensures correct kill attribution even if multiple players attack the same target
- Dead players have all input disabled and play only the Death animation until respawn
- **Duplicate Kill Prevention**: `killProcessed` flag prevents double-counting deaths. Reset on respawn via `playerRespawned` event
- **Weapon Effects on Hit**: `hpUpdate` event includes `weaponEffects` object with knockback, stun, bleed, and armor shred data
- Bots deal 15 damage with basic knockback (3 strength, 0.2s duration) and 0.2s stun

### Common Gotchas and Debugging Tips

**Bot System Issues**:
- Bots require `runtime` object initialization with position/rotation tracking
- Bot intervals start 3 seconds after game start (matching player countdown)
- Always check `!bot.isBot` guards when handling player-only logic

**Weapon Spawning Issues**:
- Weapons must be defined in `weapon_data.json` before server can spawn them
- Weapon UUIDs must match between server and client for pickup synchronization
- Weapon models scale differently: guns use 0.005, melee weapons use 0.01

**Socket Event Flow**:
- `socket.to(roomId).emit()` sends to everyone in room EXCEPT sender
- `io.to(roomId).emit()` sends to everyone in room INCLUDING sender
- Always verify room existence before emitting events to prevent crashes

**Animation System**:
- GLTF character files may have different animation names - check available clips in browser console
- `onAnimationFinished_` callback is used for attack animations to know when to spawn projectiles
- Remote players animate based on `gameUpdate` events with animation names

**Map Loading**:
- Map modules are dynamically imported based on `this.map` value in `GameStage1`
- Map textures require capitalized names: `Map1.png`, `Map2.png`
- Each map has separate obstacle definitions for bot pathfinding

### Korean Language
This codebase uses Korean (한글) for UI text, comments, and user-facing strings. When adding new features, maintain Korean for consistency:
- Button labels, error messages, and UI text should be in Korean
- Code comments can be in English for technical clarity
- User-facing room names, character names, and game messages should be in Korean
