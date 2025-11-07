const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { getRandomWeaponName, WEAPON_DATA } = require('./weaponUtils');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const rooms = {}; // { roomId: { players: [...], gameState: {...} } }
const BOT_PREFIX = 'bot-';
const BOT_NAMES = ['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Ghost','Hunter','Ivy','Jester','Kilo','Luna','Maverick','Nova','Orion'];
const BOT_CHARACTERS = [
  'BlueSoldier_Female','Casual_Male','Casual2_Female','Casual3_Female','Chef_Hat','Cowboy_Female',
  'Doctor_Female_Young','Goblin_Female','Goblin_Male','Kimono_Female','Knight_Golden_Male','Knight_Male',
  'Ninja_Male','Ninja_Sand','OldClassy_Male','Pirate_Male','Pug','Soldier_Male','Elf','Suit_Male',
  'Viking_Male','VikingHelmet','Wizard','Worker_Female','Zombie_Male','Cow'
];

function makeRandomBot(roomId, difficulty = 'normal') {
  const id = BOT_PREFIX + Math.random().toString(36).substring(2, 10);
  const nickname = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)] + '#' + Math.floor(Math.random()*90+10);
  const character = BOT_CHARACTERS[Math.floor(Math.random()*BOT_CHARACTERS.length)];
  const bot = { id, ready: true, nickname, character, equippedWeapon: null, isAttacking: false, hp: 100, kills: 0, deaths: 0, isBot: true, difficulty };

  // 난이도별 설정 - 더 공격적으로 (fleeThreshold 감소)
  const difficultySettings = {
    easy: { reactionTime: 20, damage: 10, accuracy: 0.6, fleeThreshold: 15 },
    normal: { reactionTime: 15, damage: 15, accuracy: 0.8, fleeThreshold: 20 },
    hard: { reactionTime: 10, damage: 20, accuracy: 0.95, fleeThreshold: 25 }
  };

  bot.aiSettings = difficultySettings[difficulty] || difficultySettings.normal;

  // minimal bot runtime state
  // AI 개성 (전투 스타일) - 공격적 성향 증가
  const personalities = ['aggressive', 'aggressive', 'aggressive', 'balanced', 'defensive'];
  bot.personality = personalities[Math.floor(Math.random() * personalities.length)];

  bot.runtime = {
    x: Math.random()*80-40,
    y: 0.5,
    z: Math.random()*80-40,
    rotY: 0,
    targetId: null,
    tick: 0,
    state: 'seeking_weapon', // 시작 시 무기 찾기 우선
    targetWeaponId: null,
    fleeTarget: null,
    // 넉백/경직 시스템
    isStunned: false,
    stunTimer: 0,
    knockbackVelocityX: 0,
    knockbackVelocityZ: 0,
    knockbackTimer: 0,
    // 점프 시스템
    isJumping: false,
    velocityY: 0,
    stuckCounter: 0, // 같은 위치에 머무른 카운터
    lastX: Math.random()*80-40,
    lastZ: Math.random()*80-40,
    // 롤 시스템
    isRolling: false,
    rollTimer: 0,
    rollCooldown: 0,
    rollDirection: { x: 0, z: 0 },
    // 공격 애니메이션 시스템
    attackAnimTimer: 0, // 공격 애니메이션 중 이동 제한
    attackCd: 0,
    // 행동 패턴
    lookAroundTimer: Math.random() * 50 + 50, // 5-10초마다 주변 둘러봄
    idleActionTimer: Math.random() * 30 + 20, // 2-5초마다 랜덤 행동
    lastDamageTick: 0 // 마지막 피격 시간
  };
  return bot;
}

function broadcastBotState(roomId, bot) {
  io.to(roomId).emit('gameUpdate', {
    playerId: bot.id,
    position: [bot.runtime.x, bot.runtime.y, bot.runtime.z],
    rotation: [0, bot.runtime.rotY, 0],
    animation: 'Walk',
    hp: bot.hp,
    equippedWeapon: bot.equippedWeapon,
    isAttacking: bot.isAttacking
  });
}

function randomSpawn() {
  return {
    x: (Math.random() * 78) - 39,
    y: 0,
    z: (Math.random() * 78) - 39
  };
}

// 간단한 AABB 충돌 체크 함수
function checkAABBCollision(box1, box2) {
  return (
    box1.minX <= box2.maxX &&
    box1.maxX >= box2.minX &&
    box1.minZ <= box2.maxZ &&
    box1.maxZ >= box2.minZ
  );
}

// 봇이 이동 가능한지 체크 (맵 오브젝트와 충돌 체크)
// 맵1의 주요 오브젝트 위치 (간단한 근사치)
const MAP1_OBSTACLES = [
  // 중앙 건물들
  { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  // 좌측 건물
  { minX: -30, maxX: -20, minZ: -15, maxZ: -5 },
  // 우측 건물
  { minX: 20, maxX: 30, minZ: -15, maxZ: -5 },
  // 상단 건물
  { minX: -15, maxX: -5, minZ: 20, maxZ: 30 },
  // 하단 건물
  { minX: -15, maxX: -5, minZ: -30, maxZ: -20 }
];

// 맵2(아일랜드)의 주요 오브젝트 - 추후 확장 가능
const MAP2_OBSTACLES = [
  // 중앙 섬
  { minX: -15, maxX: 15, minZ: -15, maxZ: 15 }
];

function canBotMoveTo(x, z, mapType = 'map1', currentBot = null, allPlayers = []) {
  const BOT_RADIUS = 0.65; // 플레이어와 동일한 크기
  const botBox = {
    minX: x - BOT_RADIUS,
    maxX: x + BOT_RADIUS,
    minZ: z - BOT_RADIUS,
    maxZ: z + BOT_RADIUS
  };

  // 맵 오브젝트 충돌 체크
  const obstacles = mapType === 'map2' ? MAP2_OBSTACLES : MAP1_OBSTACLES;
  for (const obstacle of obstacles) {
    if (checkAABBCollision(botBox, obstacle)) {
      return false; // 충돌 발생
    }
  }

  // 다른 플레이어/봇과의 충돌 체크
  if (allPlayers && allPlayers.length > 0) {
    for (const player of allPlayers) {
      // 자기 자신은 제외
      if (currentBot && player.id === currentBot.id) continue;
      // HP가 0인 플레이어는 제외
      if (player.hp <= 0) continue;

      if (player.runtime) {
        const px = player.runtime.x;
        const pz = player.runtime.z;
        const PLAYER_RADIUS = 0.65;

        const playerBox = {
          minX: px - PLAYER_RADIUS,
          maxX: px + PLAYER_RADIUS,
          minZ: pz - PLAYER_RADIUS,
          maxZ: pz + PLAYER_RADIUS
        };

        if (checkAABBCollision(botBox, playerBox)) {
          return false; // 다른 플레이어와 충돌
        }
      }
    }
  }

  return true; // 이동 가능
}

function scheduleBotRespawn(roomId, bot, delayMs = 3000) {
  if (!rooms[roomId] || !bot || !bot.isBot) return;
  if (!bot.runtime) bot.runtime = { x: 0, y: 0, z: 0, rotY: 0 };
  if (bot.runtime.respawning) return;
  bot.runtime.respawning = true;
  bot.runtime.respawnTO = setTimeout(() => {
    if (!rooms[roomId]) return;
    const pos = randomSpawn();
    bot.hp = 100;
    bot.runtime.x = pos.x;
    bot.runtime.y = pos.y;
    bot.runtime.z = pos.z;
    bot.runtime.rotY = 0;
    bot.isAttacking = false;
    bot.killProcessed = false; // 리스폰 시 킬 처리 플래그 초기화
    bot.lastHitBy = null; // lastHitBy 초기화
    // notify clients: hp restored and position set
    io.to(roomId).emit('hpUpdate', { playerId: bot.id, hp: bot.hp, attackerId: bot.id });
    io.to(roomId).emit('gameUpdate', {
      playerId: bot.id,
      position: [bot.runtime.x, bot.runtime.y, bot.runtime.z],
      rotation: [0, bot.runtime.rotY, 0],
      animation: 'Idle',
      hp: bot.hp,
      equippedWeapon: bot.equippedWeapon,
      isAttacking: false
    });
    bot.runtime.respawning = false;
    bot.runtime.respawnTO = null;
  }, delayMs);
}

// Helper function to update all players in a room
function updateRoomPlayers(roomId) {
  if (rooms[roomId]) {
    const playersData = rooms[roomId].players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      ready: p.ready,
      character: p.character,
      kills: p.kills,
      deaths: p.deaths
    }));
    io.to(roomId).emit('updatePlayers', playersData, rooms[roomId].maxPlayers);
  }
}

// 정적 파일 서빙을 위한 디렉토리 설정
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  

  socket.on('getPublicRooms', () => {
    const publicRooms = Object.values(rooms).filter(room => room.visibility === 'public').map(room => ({
      id: room.id,
      players: room.players.length,
      maxPlayers: room.maxPlayers,
      map: room.map,
      name: room.name,
      status: room.status
    }));
    socket.emit('publicRoomsList', publicRooms);
  });

  socket.on('createRoom', (roomSettings) => {
    const roomId = Math.random().toString(36).substring(2, 8);
    const { map, maxPlayers, visibility, roundTime, nickname, character, roomName } = roomSettings;

    console.log('[방 생성 서버] 방 생성됨. ID:', roomId, '맵:', map);

    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, ready: false, nickname: nickname, character: character, equippedWeapon: null, isAttacking: false, hp: 100, kills: 0, deaths: 0, runtime: { x: 0, y: 0, z: 0, rotY: 0 } }],
      gameState: { timer: roundTime, gameStarted: false },
      map: map,
      maxPlayers: maxPlayers,
      visibility: visibility,
      roundTime: roundTime,
      name: roomName,
      status: 'waiting'
    };
    socket.join(roomId);
    socket.roomId = roomId;

    console.log('[방 생성 서버] room.map 확인:', rooms[roomId].map);
    socket.emit('roomCreated', { id: roomId, name: rooms[roomId].name, map: rooms[roomId].map });
    updateRoomPlayers(roomId);
  });

  socket.on('joinRoom', (roomId, nickname, character) => {
    if (rooms[roomId]) {
      if (rooms[roomId].players.some(p => p.id === socket.id)) {
        socket.emit('roomError', 'Already in this room');
        return;
      }
      if (rooms[roomId].players.length >= rooms[roomId].maxPlayers) {
        socket.emit('roomError', 'Room is full');
        return;
      }
      if (rooms[roomId].status === 'playing') {
        socket.emit('roomError', 'Game is already in progress');
        return;
      }
      if (rooms[roomId].visibility === 'private' && roomId !== rooms[roomId].id) {
        socket.emit('roomError', 'Invalid private room code');
        return;
      }
      socket.join(roomId);
      rooms[roomId].players.push({ id: socket.id, ready: false, nickname: nickname, character: character, equippedWeapon: null, isAttacking: false, hp: 100, kills: 0, deaths: 0, runtime: { x: 0, y: 0, z: 0, rotY: 0 } });
      socket.roomId = roomId;
      
      socket.emit('roomJoined', { id: roomId, name: rooms[roomId].name, map: rooms[roomId].map });
      updateRoomPlayers(roomId);
    } else {
      socket.emit('roomError', 'Room not found');
    }
  });

  socket.on('ready', () => {
    if (socket.roomId && rooms[socket.roomId]) {
      const playerIndex = rooms[socket.roomId].players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        rooms[socket.roomId].players[playerIndex].ready = !rooms[socket.roomId].players[playerIndex].ready;
        updateRoomPlayers(socket.roomId);

        const allReady = rooms[socket.roomId].players.every(p => p.ready);
        if (allReady && rooms[socket.roomId].players.length > 0) {
          const roomCreator = rooms[socket.roomId].players[0];
          if (roomCreator.id === socket.id) {
            socket.emit('allPlayersReady');
          }
        }
      }
    }
  });

  socket.on('gameUpdate', (data) => {
    if (socket.roomId && rooms[socket.roomId]) {
      const playerInRoom = rooms[socket.roomId].players.find(p => p.id === socket.id);
      if (playerInRoom) {
        playerInRoom.equippedWeapon = data.equippedWeapon;
        playerInRoom.isAttacking = data.isAttacking;
        playerInRoom.hp = data.hp;
        if (!playerInRoom.runtime) playerInRoom.runtime = { x: 0, y: 0, z: 0, rotY: 0 };
        if (Array.isArray(data.position)) {
          playerInRoom.runtime.x = data.position[0];
          playerInRoom.runtime.y = data.position[1];
          playerInRoom.runtime.z = data.position[2];
        }
        if (Array.isArray(data.rotation)) {
          playerInRoom.runtime.rotY = data.rotation[1] || 0;
        }
      }
      socket.to(socket.roomId).emit('gameUpdate', data);
    }
  });

  socket.on('startGameRequest', () => {
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const roomCreator = room.players[0];

      if (roomCreator.id === socket.id) {
        const allReady = room.players.every(p => p.ready);
        if (allReady && room.players.length > 0) {
          room.status = 'playing';
          room.gameState.gameStarted = true;

          console.log('[게임 시작 서버] 방:', socket.roomId, '현재 맵:', room.map);

          const spawnedWeapons = [];
          for (let i = 0; i < 10; i++) {
            const weaponName = getRandomWeaponName();
            if (weaponName) {
              const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

              // 맵에 따라 다른 스폰 범위
              let x, y, z;
              if (room.map === 'map2') {
                // 섬 맵: 타일 범위 내에서 스폰 (X: 0~58, Z: -40~19)
                x = Math.random() * 54 + 2; // 2 ~ 56 범위 (타일 가장자리 피함)
                y = 5; // 약간 높게 스폰하여 타일 위에 떨어지도록
                z = Math.random() * 54 - 36; // -36 ~ 18 범위 (타일 가장자리 피함)
              } else {
                // 도시 맵: 전체 맵
                x = Math.random() * 80 - 40;
                y = 1;
                z = Math.random() * 80 - 40;
              }

              spawnedWeapons.push({ uuid, weaponName, x, y, z });
            }
          }
          room.gameState.spawnedWeapons = spawnedWeapons;

          console.log('[게임 시작 서버] startGame 이벤트 전송, 맵:', room.map);
          io.to(socket.roomId).emit('startGame', { players: room.players, map: room.map, spawnedWeapons: spawnedWeapons });

          // Start bot simulation after 3s (client countdown)
          if (room.gameState.botIntervalStartTO) {
            clearTimeout(room.gameState.botIntervalStartTO);
            room.gameState.botIntervalStartTO = null;
          }
          room.gameState.botIntervalStartTO = setTimeout(() => {
            if (room.gameState.botInterval) return;
            room.gameState.botInterval = setInterval(() => {
              const bots = room.players.filter(p => p.isBot);
              const humanPlayers = room.players.filter(p => !p.isBot);
              for (const bot of bots) {
                if (bot.hp <= 0) continue;
                bot.runtime.tick++;

                const dt = 0.1; // 100ms

                // 롤 쿨다운 업데이트
                if (bot.runtime.rollCooldown > 0) {
                  bot.runtime.rollCooldown -= dt;
                }

                // 롤 중일 때
                if (bot.runtime.isRolling) {
                  bot.runtime.rollTimer -= dt;
                  // 롤 이동
                  const rollSpeed = 18;
                  const rollX = bot.runtime.x + bot.runtime.rollDirection.x * rollSpeed * dt;
                  const rollZ = bot.runtime.z + bot.runtime.rollDirection.z * rollSpeed * dt;
                  if (canBotMoveTo(rollX, rollZ, room.map, bot, room.players)) {
                    bot.runtime.x = rollX;
                    bot.runtime.z = rollZ;
                  }
                  if (bot.runtime.rollTimer <= 0) {
                    bot.runtime.isRolling = false;
                    bot.runtime.rollTimer = 0;
                  }
                }

                // 넉백/경직 타이머 업데이트
                if (bot.runtime.stunTimer > 0) {
                  bot.runtime.stunTimer -= dt;
                  if (bot.runtime.stunTimer <= 0) {
                    bot.runtime.isStunned = false;
                    bot.runtime.stunTimer = 0;
                  }
                }

                if (bot.runtime.knockbackTimer > 0) {
                  bot.runtime.knockbackTimer -= dt;
                  // 넉백 적용
                  const kbX = bot.runtime.x + bot.runtime.knockbackVelocityX * dt;
                  const kbZ = bot.runtime.z + bot.runtime.knockbackVelocityZ * dt;
                  if (canBotMoveTo(kbX, kbZ, room.map, bot, room.players)) {
                    bot.runtime.x = kbX;
                    bot.runtime.z = kbZ;
                  }
                  if (bot.runtime.knockbackTimer <= 0) {
                    bot.runtime.knockbackTimer = 0;
                    bot.runtime.knockbackVelocityX = 0;
                    bot.runtime.knockbackVelocityZ = 0;
                  }
                }

                // 경직 중이거나 롤 중이면 AI 행동 스킵
                if (bot.runtime.isStunned || bot.runtime.isRolling) {
                  // 애니메이션만 업데이트
                  const stunAnim = bot.runtime.isRolling ? 'Roll' : 'Idle';
                  io.to(socket.roomId).emit('gameUpdate', {
                    playerId: bot.id,
                    position: [bot.runtime.x, bot.runtime.y, bot.runtime.z],
                    rotation: [0, bot.runtime.rotY, 0],
                    animation: stunAnim,
                    hp: bot.hp,
                    equippedWeapon: bot.equippedWeapon,
                    isAttacking: bot.isAttacking
                  });
                  continue;
                }

                // AI 상태 머신 결정
                const reactionTicks = bot.aiSettings.reactionTime;

                // 피격 반응: 최근에 맞았으면 회피 롤 (개성에 따라) - 전반적으로 롤 확률 감소
                const ticksSinceHit = bot.runtime.tick - bot.runtime.lastDamageTick;
                if (ticksSinceHit < 5 && ticksSinceHit > 0 && bot.runtime.rollCooldown <= 0 && !bot.runtime.isRolling) {
                  // defensive 성격: 40% 확률로 롤 (60% → 40%)
                  // balanced 성격: 20% 확률로 롤 (40% → 20%)
                  // aggressive 성격: 5% 확률로 롤 (20% → 5%)
                  const rollChance = bot.personality === 'defensive' ? 0.4 : (bot.personality === 'balanced' ? 0.2 : 0.05);
                  if (Math.random() < rollChance) {
                    // 적 반대 방향으로 롤
                    const enemies = room.players.filter(p => p.id !== bot.id && p.hp > 0 && p.runtime);
                    if (enemies.length > 0) {
                      let nearestEnemy = enemies[0];
                      let nearestDist = 1e9;
                      for (const e of enemies) {
                        const dist = Math.hypot(e.runtime.x - bot.runtime.x, e.runtime.z - bot.runtime.z);
                        if (dist < nearestDist) { nearestDist = dist; nearestEnemy = e; }
                      }
                      const dx = bot.runtime.x - nearestEnemy.runtime.x;
                      const dz = bot.runtime.z - nearestEnemy.runtime.z;
                      const len = Math.hypot(dx, dz);
                      if (len > 0.01) {
                        bot.runtime.rollDirection = { x: dx/len, z: dz/len };
                        bot.runtime.isRolling = true;
                        bot.runtime.rollTimer = 0.5;
                        bot.runtime.rollCooldown = 1.0;
                      }
                    }
                  }
                }

                // 1. HP가 매우 낮거나 주변에 적이 압도적으로 많을 때만 도망
                const nearbyEnemies = room.players.filter(p => {
                  if (p.id === bot.id || p.hp <= 0) return false;
                  if (!p.runtime) return false;
                  const dist = Math.hypot(p.runtime.x - bot.runtime.x, p.runtime.z - bot.runtime.z);
                  return dist < 8; // 8유닛 내의 적
                });

                // 도망 조건 강화: HP가 매우 낮거나 (threshold) 4명 이상에게 포위됨
                // aggressive 성격은 도망 안 감 (HP 5 이하만)
                let shouldFlee = false;
                if (bot.personality === 'aggressive') {
                  shouldFlee = bot.hp <= 5; // 거의 안 도망
                } else if (bot.personality === 'balanced') {
                  shouldFlee = bot.hp < bot.aiSettings.fleeThreshold || nearbyEnemies.length >= 4;
                } else { // defensive
                  shouldFlee = bot.hp < bot.aiSettings.fleeThreshold + 10 || nearbyEnemies.length >= 3;
                }

                if (shouldFlee && bot.runtime.state !== 'fleeing') {
                  bot.runtime.state = 'fleeing';
                  const enemies = room.players.filter(p => p.id !== bot.id && p.hp > 0);
                  if (enemies.length > 0) {
                    let nearestEnemy = enemies[0];
                    let nearestDist = 1e9;
                    for (const e of enemies) {
                      const ex = e.runtime ? e.runtime.x : 0;
                      const ez = e.runtime ? e.runtime.z : 0;
                      const dist = Math.hypot(ex - bot.runtime.x, ez - bot.runtime.z);
                      if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestEnemy = e;
                      }
                    }
                    bot.runtime.fleeTarget = nearestEnemy.id;
                  }
                }

                // 2. HP가 회복되고 주변 적이 적으면 도망 상태 해제
                // 단, HP가 너무 낮으면(5 이하) 도망 대신 최후의 반격
                if (bot.runtime.state === 'fleeing') {
                  if (bot.hp <= 5) {
                    // 최후의 반격: HP가 거의 없으면 가장 가까운 적 공격
                    bot.runtime.state = 'chasing';
                    bot.runtime.fleeTarget = null;
                  } else if (bot.hp >= bot.aiSettings.fleeThreshold + 10 && nearbyEnemies.length < 2) {
                    bot.runtime.state = 'idle';
                    bot.runtime.fleeTarget = null;
                  }
                }

                // 3. 무기가 없거나 더 좋은 무기를 찾으면 교체
                if (bot.runtime.state !== 'fleeing' && bot.runtime.tick % reactionTicks === 0) {
                  const weapons = room.gameState.spawnedWeapons || [];

                  // 무기 레어도 점수
                  const rarityScore = { 'common': 1, 'uncommon': 2, 'rare': 3, 'epic': 4, 'legendary': 5 };

                  // 현재 무기 점수
                  let currentScore = 0;
                  if (bot.equippedWeapon && WEAPON_DATA[bot.equippedWeapon]) {
                    const currentRarity = WEAPON_DATA[bot.equippedWeapon].rarity || 'common';
                    currentScore = rarityScore[currentRarity] || 0;
                  }

                  // 무기가 없으면 무조건 가장 가까운 무기 찾기
                  if (!bot.equippedWeapon && weapons.length > 0) {
                    let nearestWeapon = null;
                    let nearestDist = 1e9;
                    for (const w of weapons) {
                      const dist = Math.hypot(w.x - bot.runtime.x, w.z - bot.runtime.z);
                      if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestWeapon = w;
                      }
                    }
                    if (nearestWeapon) {
                      bot.runtime.state = 'seeking_weapon';
                      bot.runtime.targetWeaponId = nearestWeapon.uuid;
                    }
                  } else if (weapons.length > 0) {
                    // 무기가 있으면 더 좋은 무기만 찾기
                    let bestWeapon = null;
                    let bestScore = -1e9;
                    for (const w of weapons) {
                      const dist = Math.hypot(w.x - bot.runtime.x, w.z - bot.runtime.z);
                      if (dist > 30) continue; // 30 유닛 밖은 무시

                      // 무기 점수 계산
                      const weaponData = WEAPON_DATA[w.weaponName];
                      if (!weaponData) continue;

                      const rarity = weaponData.rarity || 'common';
                      const weaponScore = rarityScore[rarity] || 0;

                      // 더 좋은 무기면 선택
                      if (weaponScore > currentScore) {
                        // 거리와 레어도를 모두 고려 (레어도 우선, 거리 부차적)
                        const totalScore = weaponScore * 100 - dist;
                        if (totalScore > bestScore) {
                          bestScore = totalScore;
                          bestWeapon = w;
                        }
                      }
                    }
                    if (bestWeapon) {
                      bot.runtime.state = 'seeking_weapon';
                      bot.runtime.targetWeaponId = bestWeapon.uuid;
                    }
                  }
                }

                // 4. 무기 줍기
                if (bot.runtime.state === 'seeking_weapon' && bot.runtime.targetWeaponId) {
                  const targetWeapon = (room.gameState.spawnedWeapons || []).find(w => w.uuid === bot.runtime.targetWeaponId);
                  if (targetWeapon) {
                    const dist = Math.hypot(targetWeapon.x - bot.runtime.x, targetWeapon.z - bot.runtime.z);
                    if (dist < 1.5) {
                      // 무기 주웠음
                      bot.equippedWeapon = targetWeapon.weaponName;
                      room.gameState.spawnedWeapons = room.gameState.spawnedWeapons.filter(w => w.uuid !== bot.runtime.targetWeaponId);
                      io.to(socket.roomId).emit('weaponPickedUp', bot.runtime.targetWeaponId);
                      io.to(socket.roomId).emit('playerEquippedWeapon', { playerId: bot.id, weaponName: bot.equippedWeapon });
                      bot.runtime.state = 'idle';
                      bot.runtime.targetWeaponId = null;

                      // 새 무기 스폰
                      const newWeaponName = getRandomWeaponName();
                      if (newWeaponName) {
                        const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                        let wx, wy, wz;
                        if (room.map === 'map2') {
                          wx = Math.random() * 54 + 2;
                          wy = 5;
                          wz = Math.random() * 54 - 36;
                        } else {
                          wx = Math.random() * 80 - 40;
                          wy = 1;
                          wz = Math.random() * 80 - 40;
                        }
                        const newWeapon = { uuid, weaponName: newWeaponName, x: wx, y: wy, z: wz };
                        room.gameState.spawnedWeapons.push(newWeapon);
                        io.to(socket.roomId).emit('weaponSpawned', newWeapon);
                      }
                    }
                  } else {
                    // 무기가 사라짐 (누가 먼저 주웠음)
                    bot.runtime.state = 'idle';
                    bot.runtime.targetWeaponId = null;
                  }
                }

                // 5. 적 타겟 선정 (난이도별 반응속도) - 전략적 타겟팅
                if (bot.runtime.state !== 'fleeing' && bot.runtime.state !== 'seeking_weapon') {
                  if (!bot.runtime.targetId || bot.runtime.tick % reactionTicks === 0) {
                    const candidates = room.players.filter(p => p.id !== bot.id && p.hp > 0);
                    if (candidates.length) {
                      // 전략적 타겟 선정: HP가 낮은 적 우선, 그 다음 가까운 적
                      let best = null;
                      let bestScore = -1e9;

                      for (const c of candidates) {
                        const cx = c.runtime ? c.runtime.x : 0;
                        const cz = c.runtime ? c.runtime.z : 0;
                        const dist = Math.hypot(cx - bot.runtime.x, cz - bot.runtime.z);

                        // 점수 계산: HP가 낮을수록 높은 점수, 거리가 가까울수록 높은 점수
                        const hpScore = (100 - c.hp) * 2; // HP가 낮을수록 높은 점수
                        const distScore = Math.max(0, 20 - dist) * 1; // 가까울수록 높은 점수
                        const totalScore = hpScore + distScore;

                        // 더 공격적으로: 추격 범위 확대 (15 → 25 유닛)
                        if (dist < 25 && totalScore > bestScore) {
                          bestScore = totalScore;
                          best = c;
                        }
                      }

                      if (best) {
                        bot.runtime.targetId = best.id;
                        bot.runtime.state = 'chasing';
                      } else {
                        bot.runtime.targetId = null;
                        bot.runtime.state = 'idle';
                      }
                    } else {
                      bot.runtime.targetId = null;
                      bot.runtime.state = 'idle';
                    }
                  }
                }

                // 목적지 결정
                let tx, tz, targetSpeed;
                if (bot.runtime.state === 'fleeing' && bot.runtime.fleeTarget) {
                  // 도망가기: 적 반대 방향으로
                  const fleeFrom = room.players.find(p => p.id === bot.runtime.fleeTarget);
                  if (fleeFrom && fleeFrom.runtime) {
                    const dx = bot.runtime.x - fleeFrom.runtime.x;
                    const dz = bot.runtime.z - fleeFrom.runtime.z;
                    const len = Math.hypot(dx, dz);
                    if (len > 0.01) {
                      tx = bot.runtime.x + (dx/len) * 10;
                      tz = bot.runtime.z + (dz/len) * 10;
                      targetSpeed = 4.5; // 빠르게 도망
                    }
                  }
                } else if (bot.runtime.state === 'seeking_weapon' && bot.runtime.targetWeaponId) {
                  // 무기로 이동 - 무기가 없으면 빠르게 달려감
                  const targetWeapon = (room.gameState.spawnedWeapons || []).find(w => w.uuid === bot.runtime.targetWeaponId);
                  if (targetWeapon) {
                    tx = targetWeapon.x;
                    tz = targetWeapon.z;
                    // 무기 없으면 전력질주, 있으면 조금 빠르게
                    targetSpeed = bot.equippedWeapon ? 3.5 : 4.5;
                  }
                } else if (bot.runtime.state === 'chasing' && bot.runtime.targetId) {
                  // 적 추적
                  const target = room.players.find(p => p.id === bot.runtime.targetId && p.hp > 0);
                  if (target && target.runtime) {
                    tx = target.runtime.x;
                    tz = target.runtime.z;
                    targetSpeed = 3.0;
                  }
                }

                // 배회 (기본 상태)
                if (!tx && !tz) {
                  if (!bot.runtime.wander || bot.runtime.wander.ttl <= 0) {
                    bot.runtime.wander = {
                      x: (Math.random()*78)-39,
                      z: (Math.random()*78)-39,
                      ttl: Math.floor(30 + Math.random()*30)
                    };
                  } else {
                    bot.runtime.wander.ttl--;
                  }
                  tx = bot.runtime.wander.x;
                  tz = bot.runtime.wander.z;
                  targetSpeed = 2.0;
                }

                // 공격 애니메이션 타이머 감소
                if (bot.runtime.attackAnimTimer && bot.runtime.attackAnimTimer > 0) {
                  bot.runtime.attackAnimTimer -= 0.1;
                }

                // 이동 (공격 중이 아닐 때만)
                const dx = tx - bot.runtime.x;
                const dz = tz - bot.runtime.z;
                const len = Math.hypot(dx, dz);
                const speed = targetSpeed || 2.0;

                // 공격 애니메이션 중에는 이동과 회전 불가
                const isAttackingNow = bot.runtime.attackAnimTimer && bot.runtime.attackAnimTimer > 0;

                if (len > 0.01 && !isAttackingNow) {
                  const step = Math.min(len, speed * dt);
                  const newX = bot.runtime.x + (dx/len) * step;
                  const newZ = bot.runtime.z + (dz/len) * step;

                  let moved = false;

                  if (canBotMoveTo(newX, newZ, room.map, bot, room.players)) {
                    bot.runtime.x = newX;
                    bot.runtime.z = newZ;
                    bot.runtime.rotY = Math.atan2(dx, dz);
                    moved = true;
                  } else {
                    // 막혔을 때 우회 시도
                    const altDx = -dz;
                    const altDz = dx;
                    const altLen = Math.hypot(altDx, altDz);
                    if (altLen > 0.01) {
                      const altStep = Math.min(altLen, speed * dt);
                      const altX = bot.runtime.x + (altDx/altLen) * altStep;
                      const altZ = bot.runtime.z + (altDz/altLen) * altStep;
                      if (canBotMoveTo(altX, altZ, room.map, bot, room.players)) {
                        bot.runtime.x = altX;
                        bot.runtime.z = altZ;
                        bot.runtime.rotY = Math.atan2(altDx, altDz);
                        moved = true;
                      }
                    }
                  }

                  // 막혔는지 체크 (움직이지 못했으면)
                  const distMoved = Math.hypot(bot.runtime.x - bot.runtime.lastX, bot.runtime.z - bot.runtime.lastZ);
                  if (!moved || distMoved < 0.05) {
                    bot.runtime.stuckCounter++;
                    // 15틱 이상 막혔으면 목표 재설정 (점프 제거)
                    if (bot.runtime.stuckCounter > 15) {
                      // 현재 목표 포기하고 새로운 행동 선택
                      if (bot.runtime.state === 'seeking_weapon') {
                        // 다른 무기 찾기
                        bot.runtime.targetWeaponId = null;
                      } else if (bot.runtime.state === 'chasing') {
                        // 다른 타겟 찾기
                        bot.runtime.targetId = null;
                      }
                      // idle 상태로 전환하여 새로운 목표 찾기
                      bot.runtime.state = 'idle';
                      bot.runtime.stuckCounter = 0;
                    }
                  } else {
                    bot.runtime.stuckCounter = 0;
                  }

                  // 위치 업데이트 (매 틱마다)
                  bot.runtime.lastX = bot.runtime.x;
                  bot.runtime.lastZ = bot.runtime.z;
                } else if (isAttackingNow && bot.runtime.targetId) {
                  // 공격 중에는 타겟 방향만 바라봄 (회전만)
                  const target = room.players.find(p => p.id === bot.runtime.targetId);
                  if (target && target.runtime) {
                    const tdx = target.runtime.x - bot.runtime.x;
                    const tdz = target.runtime.z - bot.runtime.z;
                    bot.runtime.rotY = Math.atan2(tdx, tdz);
                  }
                }

                // 경계 유지 (점프 제거, 항상 지면에 고정)
                bot.runtime.y = 0.5;
                bot.runtime.x = Math.max(-39, Math.min(39, bot.runtime.x));
                bot.runtime.z = Math.max(-39, Math.min(39, bot.runtime.z));

                // 애니메이션 (속도에 따라 걷기/달리기 선택)
                let anim = 'Idle';

                // 공격 애니메이션 중에는 Idle 상태 유지 (공격 애니메이션은 playerAttack 이벤트로 처리됨)
                if (isAttackingNow) {
                  anim = 'Idle';
                } else if (len > 0.05) {
                  // 속도가 3.5 이상이면 달리기, 아니면 걷기
                  if (speed >= 3.5) {
                    anim = 'Run';
                  } else {
                    anim = 'Walk';
                  }
                }

                // 점프 중이면 점프 애니메이션
                if (bot.runtime.isJumping) {
                  anim = 'Jump';
                }

                io.to(socket.roomId).emit('gameUpdate', {
                  playerId: bot.id,
                  position: [bot.runtime.x, bot.runtime.y, bot.runtime.z],
                  rotation: [0, bot.runtime.rotY, 0],
                  animation: anim,
                  hp: bot.hp,
                  equippedWeapon: bot.equippedWeapon,
                  isAttacking: bot.isAttacking
                });

                // 공격 (추적 중이거나 타겟이 가까이 있을 때)
                if (bot.runtime.attackCd && bot.runtime.attackCd > 0) bot.runtime.attackCd -= 0.1;

                // 타겟이 죽었거나 없으면 재선정
                let target = room.players.find(p => p.id === bot.runtime.targetId && p.hp > 0);
                if (!target && bot.runtime.state === 'chasing') {
                  bot.runtime.state = 'idle';
                  bot.runtime.targetId = null;
                }

                if (bot.runtime.targetId && target) {
                  const dist = target && target.runtime ? Math.hypot(target.runtime.x - bot.runtime.x, target.runtime.z - bot.runtime.z) : 999;

                  // 난이도별 명중률 적용
                  const shouldHit = Math.random() < bot.aiSettings.accuracy;

                  // 공격 조건: 거리 2.0 이내, 쿨다운 없음, 명중 판정 성공, 공격 애니메이션 중이 아님
                  if (target && dist < 2.0 && (!bot.runtime.attackCd || bot.runtime.attackCd <= 0) && shouldHit && (!bot.runtime.attackAnimTimer || bot.runtime.attackAnimTimer <= 0)) {
                    bot.isAttacking = true;

                    // 무기별 공격 애니메이션 선택
                    let attackAnimation = 'Punch'; // 기본값 (맨손)
                    const weaponName = bot.equippedWeapon || '';

                    if (/Pistol|Shotgun|SniperRifle|AssaultRifle|Bow/i.test(weaponName)) {
                      attackAnimation = 'Shoot_OneHanded';
                    } else if (/Sword_big/i.test(weaponName)) {
                      attackAnimation = 'GreatSwordAttack';
                    } else if (/Dagger/i.test(weaponName)) {
                      attackAnimation = 'DaggerAttack';
                    } else if (/Axe_Double/i.test(weaponName)) {
                      attackAnimation = 'DoubleAxeAttack';
                    } else if (/Axe_small|Axe(?!_)/i.test(weaponName)) {
                      attackAnimation = 'HandAxeAttack';
                    } else if (/Hammer_Double|Hammer/i.test(weaponName)) {
                      attackAnimation = 'HammerAttack';
                    } else if (/Sword/i.test(weaponName)) {
                      attackAnimation = 'SwordAttack';
                    }

                    // 공격 애니메이션 타이머 설정 (약 0.8초 동안 이동 불가)
                    bot.runtime.attackAnimTimer = 0.8;

                    io.to(socket.roomId).emit('playerAttack', { playerId: bot.id, animationName: attackAnimation });
                    const victimId = target ? target.id : null;
                    if (victimId) {
                      const damage = bot.aiSettings.damage;
                      const victim = room.players.find(p => p.id === victimId);
                      if (victim) {
                        if (victim.id !== bot.id) {
                          victim.lastHitBy = bot.id;
                        }
                        victim.hp = Math.max(0, victim.hp - damage);

                        // 봇이 봇을 공격한 경우 피격 타이밍 기록
                        if (victim.isBot && victim.runtime) {
                          victim.runtime.lastDamageTick = victim.runtime.tick;
                        }

                        io.to(socket.roomId).emit('hpUpdate', {
                          playerId: victim.id,
                          hp: victim.hp,
                          attackerId: bot.id,
                          weaponEffects: {
                            knockbackStrength: 3,
                            knockbackDuration: 0.2,
                            specialEffect: null,
                            stunDuration: 0.2
                          },
                          attackerPosition: [bot.runtime.x, bot.runtime.y, bot.runtime.z]
                        });
                        if (victim.hp === 0) {
                          if (!victim.killProcessed) {
                            victim.killProcessed = true;
                            const killerId = victim.lastHitBy || bot.id;
                            const killer = room.players.find(p => p.id === killerId);
                            if (killer && killer.id !== victim.id) killer.kills++;
                            victim.deaths++;
                            io.to(socket.roomId).emit('updateScores', room.players.map(p => ({ id: p.id, nickname: p.nickname, kills: p.kills, deaths: p.deaths })));
                            io.to(socket.roomId).emit('killFeed', { attackerName: (killer ? killer.nickname : 'World'), victimName: victim.nickname, attackerCharacter: (killer ? killer.character : 'Default'), victimCharacter: victim.character });
                          }
                          if (victim.isBot) scheduleBotRespawn(socket.roomId, victim, 3000);
                        }
                      }
                    }
                    setTimeout(() => { bot.isAttacking = false; }, 400);
                    // 공격 쿨다운 감소 (0.9 → 0.6초) - 더 공격적
                    bot.runtime.attackCd = 0.6;
                  }
                }
              }
            }, 100);
          }, 3000);

          // Start game timer
          const gameTimer = setInterval(() => {
            if (room.gameState.timer > 0) {
              room.gameState.timer--;
              io.to(socket.roomId).emit('updateTimer', room.gameState.timer);
            } else {
              clearInterval(gameTimer);
              const finalScores = room.players.map(p => ({
                nickname: p.nickname,
                kills: p.kills,
                deaths: p.deaths,
                score: p.kills - p.deaths,
                character: p.character
              }));
              console.log('[gameEnd] Sending final scores:', finalScores);
              io.to(socket.roomId).emit('gameEnd', finalScores);
              if (room.gameState.botInterval) {
                clearInterval(room.gameState.botInterval);
                room.gameState.botInterval = null;
              }
              if (room.gameState.botIntervalStartTO) {
                clearTimeout(room.gameState.botIntervalStartTO);
                room.gameState.botIntervalStartTO = null;
              }
            }
          }, 1000);

        } else {
          socket.emit('roomError', '모든 플레이어가 준비되지 않았습니다.');
        }
      } else {
        socket.emit('roomError', '방장만 게임을 시작할 수 있습니다.');
      }
    }
  });

  socket.on('playerKilled', ({ victimId, attackerId }) => {
    console.log('[킬/데스 서버] playerKilled 이벤트 수신:', { victimId, attackerId, roomId: socket.roomId });
    if (socket.roomId && rooms[socket.roomId]) {
        const room = rooms[socket.roomId];
        const victim = room.players.find(p => p.id === victimId);

        if (!victim) {
            console.log('[킬/데스 서버] 피해자를 찾을 수 없음:', victimId);
            return;
        }

        // 중복 처리 방지: 이미 킬/데스가 처리되었으면 무시
        if (victim.killProcessed) {
            console.log('[킬/데스 서버] 이미 처리된 킬:', victimId);
            return;
        }
        victim.killProcessed = true; // 처리 플래그 설정

        // lastHitBy를 우선 사용 (서버에 저장된 마지막 공격자)
        const killerId = victim.lastHitBy || attackerId;
        const attacker = room.players.find(p => p.id === killerId);

        victim.deaths++;

        if (attacker && attacker.id !== victim.id) {
            attacker.kills++;
        }

        let attackerName = 'World';
        let attackerCharacter = 'Default';
        if (attacker) {
            if (attacker.id === victim.id) {
                attackerName = victim.nickname; // 자살 시 자신의 닉네임 표시
                attackerCharacter = victim.character;
            } else {
                attackerName = attacker.nickname;
                attackerCharacter = attacker.character;
            }
        }

        console.log('[킬/데스 서버] 킬/데스 집계:', { attacker: attackerName, victim: victim.nickname, kills: attacker ? attacker.kills : 0, deaths: victim.deaths });
        const scoresData = room.players.map(p => ({ id: p.id, nickname: p.nickname, kills: p.kills, deaths: p.deaths }));
        console.log('[킬/데스 서버] updateScores 전송:', scoresData);
        io.to(socket.roomId).emit('updateScores', scoresData);
        console.log('[킬/데스 서버] killFeed 전송:', { attackerName, victimName: victim.nickname });
        io.to(socket.roomId).emit('killFeed', { attackerName: attackerName, victimName: victim.nickname, attackerCharacter: attackerCharacter, victimCharacter: victim.character });
    } else {
        console.log('[킬/데스 서버] 방을 찾을 수 없음:', socket.roomId);
    }
  });

  socket.on('playerRespawned', ({ playerId }) => {
    console.log('[킬/데스 서버] playerRespawned 이벤트 수신:', { playerId, roomId: socket.roomId });
    if (socket.roomId && rooms[socket.roomId]) {
        const room = rooms[socket.roomId];
        const player = room.players.find(p => p.id === playerId);

        if (player) {
            console.log('[킬/데스 서버] killProcessed 플래그 초기화:', player.nickname);
            player.killProcessed = false; // 리스폰 시 킬 처리 플래그 초기화
            player.lastHitBy = null; // lastHitBy 초기화
        } else {
            console.log('[킬/데스 서버] 플레이어를 찾을 수 없음:', playerId);
        }
    } else {
        console.log('[킬/데스 서버] 방을 찾을 수 없음:', socket.roomId);
    }
  });

  socket.on('increaseMaxPlayers', () => {
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const roomCreator = room.players[0];

      if (roomCreator.id === socket.id) {
        if (room.maxPlayers < 8) {
          room.maxPlayers++;
          updateRoomPlayers(socket.roomId);
        } else {
          socket.emit('roomError', '최대 인원은 8명까지 설정할 수 있습니다.');
        }
      } else {
        socket.emit('roomError', '방장만 인원수를 변경할 수 있습니다.');
      }
    }
  });

  socket.on('closePlayerSlot', (slotIndex) => {
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const roomCreator = room.players[0];

      if (roomCreator.id === socket.id) {
        if (slotIndex < room.maxPlayers) {
          const playerToKick = room.players[slotIndex];
          if (playerToKick) {
            io.to(playerToKick.id).emit('roomError', '방장에 의해 강제 퇴장되었습니다.');
            io.sockets.sockets.get(playerToKick.id)?.leave(socket.roomId);
            room.players.splice(slotIndex, 1);
          }
          room.maxPlayers = Math.max(room.players.length, room.maxPlayers - 1);
          updateRoomPlayers(socket.roomId);
        } else {
          socket.emit('roomError', '유효하지 않은 슬롯입니다.');
        }
      } else {
        socket.emit('roomError', '방장만 슬롯을 닫을 수 있습니다.');
      }
    }
  });

  // Add AI Bot to the creator's current room
  socket.on('addBot', (difficulty = 'normal') => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    const roomCreator = room.players[0];

    if (room.status === 'playing') {
      socket.emit('roomError', '게임이 시작된 후에는 AI를 추가할 수 없습니다.');
      return;
    }
    if (!roomCreator || roomCreator.id !== socket.id) {
      socket.emit('roomError', '방장만 AI를 추가할 수 있습니다.');
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      socket.emit('roomError', '방 인원이 가득 찼습니다.');
      return;
    }
    const bot = makeRandomBot(roomId, difficulty);
    room.players.push(bot);

    updateRoomPlayers(roomId);
  });

  // 맵 변경 (방장만)
  socket.on('changeMap', (newMap) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) {
      console.log('[맵 변경 서버] 방을 찾을 수 없음:', roomId);
      return;
    }
    const room = rooms[roomId];
    const roomCreator = room.players[0];

    console.log('[맵 변경 서버] 요청 받음. 방:', roomId, '기존 맵:', room.map, '새 맵:', newMap);

    if (room.status === 'playing') {
      socket.emit('roomError', '게임이 시작된 후에는 맵을 변경할 수 없습니다.');
      return;
    }
    if (!roomCreator || roomCreator.id !== socket.id) {
      socket.emit('roomError', '방장만 맵을 변경할 수 있습니다.');
      return;
    }

    // 맵 유효성 검사
    if (newMap !== 'map1' && newMap !== 'map2') {
      socket.emit('roomError', '유효하지 않은 맵입니다.');
      return;
    }

    room.map = newMap;
    console.log('[맵 변경 서버] 맵 변경 완료. 방:', roomId, '현재 room.map:', room.map);

    // 모든 플레이어에게 맵 변경 알림
    io.to(roomId).emit('mapChanged', newMap);
  });

  socket.on('weaponPickedUp', (weaponUuid) => {
    if (socket.roomId && rooms[socket.roomId]) {
      let spawnedWeapons = rooms[socket.roomId].gameState.spawnedWeapons;
      if (spawnedWeapons) {
        rooms[socket.roomId].gameState.spawnedWeapons = spawnedWeapons.filter(weapon => weapon.uuid !== weaponUuid);
        io.to(socket.roomId).emit('weaponPickedUp', weaponUuid);
      }
    }
  });

  socket.on('weaponSpawned', (weaponData) => {
    if (socket.roomId && rooms[socket.roomId]) {
      let spawnedWeapons = rooms[socket.roomId].gameState.spawnedWeapons;
      if (spawnedWeapons) {
        spawnedWeapons.push(weaponData);
        io.to(socket.roomId).emit('weaponSpawned', weaponData);
      }
    }
  });

  socket.on('weaponEquipped', (weaponName) => {
    if (socket.roomId && rooms[socket.roomId]) {
      const playerInRoom = rooms[socket.roomId].players.find(p => p.id === socket.id);
      if (playerInRoom) {
        playerInRoom.equippedWeapon = weaponName;
        socket.to(socket.roomId).emit('playerEquippedWeapon', { playerId: socket.id, weaponName: weaponName });
      }
    }
  });

  socket.on('playerAttack', (animationName) => {
    if (socket.roomId && rooms[socket.roomId]) {
      socket.to(socket.roomId).emit('playerAttack', { playerId: socket.id, animationName: animationName });
    }
  });

  socket.on('playerDamage', (data) => {

    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const attacker = room.players.find(p => p.id === data.attackerId);
      const targetPlayer = room.players.find(p => p.id === data.targetId);

      // 공격자가 봇이면 무시 (봇의 공격은 서버에서 직접 처리됨)
      if (attacker && attacker.isBot) {
        return;
      }

      if (targetPlayer) {

        // 기록: 마지막 가해자 (자살/자해는 제외, 공격자가 실제 플레이어인 경우만)
        if (data.attackerId && data.attackerId !== targetPlayer.id && attacker && !attacker.isBot) {
          targetPlayer.lastHitBy = data.attackerId;
        }
        targetPlayer.hp -= data.damage;
        if (targetPlayer.hp < 0) targetPlayer.hp = 0;

        // 봇에게 넉백/경직 적용
        if (targetPlayer.isBot && targetPlayer.runtime && data.weaponEffects) {
          const effects = data.weaponEffects;

          // 피격 타이밍 기록 (롤 회피 판단용)
          targetPlayer.runtime.lastDamageTick = targetPlayer.runtime.tick;

          // 경직 적용
          if (effects.stunDuration && effects.stunDuration > 0) {
            targetPlayer.runtime.isStunned = true;
            targetPlayer.runtime.stunTimer = effects.stunDuration;
          }

          // 넉백 적용
          if (effects.knockbackStrength && effects.knockbackStrength > 0 && data.attackerPosition) {
            const attacker = room.players.find(p => p.id === data.attackerId);
            if (attacker && attacker.runtime) {
              const dx = targetPlayer.runtime.x - attacker.runtime.x;
              const dz = targetPlayer.runtime.z - attacker.runtime.z;
              const len = Math.hypot(dx, dz);
              if (len > 0.01) {
                const normalizedDx = dx / len;
                const normalizedDz = dz / len;
                targetPlayer.runtime.knockbackVelocityX = normalizedDx * effects.knockbackStrength * 10;
                targetPlayer.runtime.knockbackVelocityZ = normalizedDz * effects.knockbackStrength * 10;
                targetPlayer.runtime.knockbackTimer = effects.knockbackDuration || 0.2;
              }
            }
          }
        }

        // 무기 효과 정보를 포함하여 hpUpdate 전송
        io.to(socket.roomId).emit('hpUpdate', {
          playerId: targetPlayer.id,
          hp: targetPlayer.hp,
          attackerId: data.attackerId,
          weaponEffects: data.weaponEffects || {},
          attackerPosition: data.attackerPosition || null
        });
        

        if (targetPlayer.hp === 0) {

          // If a bot died, handle killfeed/score and schedule respawn here (clients don't emit playerKilled for bots)
          if (targetPlayer.isBot) {
            // 중복 처리 방지: 이미 킬/데스가 처리되었으면 무시
            if (!targetPlayer.killProcessed) {
              targetPlayer.killProcessed = true; // 처리 플래그 설정

              const killerId = targetPlayer.lastHitBy || data.attackerId;
              const attacker = room.players.find(p => p.id === killerId);
              targetPlayer.deaths++;
              if (attacker && attacker.id !== targetPlayer.id) {
                attacker.kills++;
              }
              console.log('[킬/데스 서버] 봇 사망 처리:', { attacker: attacker ? attacker.nickname : 'World', victim: targetPlayer.nickname });
              const scoresData = room.players.map(p => ({ id: p.id, nickname: p.nickname, kills: p.kills, deaths: p.deaths }));
              console.log('[킬/데스 서버] updateScores 전송 (봇):', scoresData);
              io.to(socket.roomId).emit('updateScores', scoresData);
              const attackerName = attacker ? attacker.nickname : 'World';
              const attackerCharacter = attacker ? attacker.character : 'Default';
              console.log('[킬/데스 서버] killFeed 전송 (봇):', { attackerName, victimName: targetPlayer.nickname });
              io.to(socket.roomId).emit('killFeed', { attackerName, victimName: targetPlayer.nickname, attackerCharacter, victimCharacter: targetPlayer.character });
            }
            scheduleBotRespawn(socket.roomId, targetPlayer, 3000);
          }
        }
      } else {
        
      }
    }
  });

  socket.on('disconnect', () => {
    
    if (socket.roomId && rooms[socket.roomId]) {
      rooms[socket.roomId].players = rooms[socket.roomId].players.filter(
        (p) => p.id !== socket.id
      );
      if (rooms[socket.roomId].players.length === 0) {
        delete rooms[socket.roomId];
        
      } else {
        updateRoomPlayers(socket.roomId);
      }
    }
  });
});

server.listen(PORT, () => {
  
});
