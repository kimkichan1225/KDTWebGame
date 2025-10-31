const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { getRandomWeaponName } = require('./weaponUtils');

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

function makeRandomBot(roomId) {
  const id = BOT_PREFIX + Math.random().toString(36).substring(2, 10);
  const nickname = BOT_NAMES[Math.floor(Math.random()*BOT_NAMES.length)] + '#' + Math.floor(Math.random()*90+10);
  const character = BOT_CHARACTERS[Math.floor(Math.random()*BOT_CHARACTERS.length)];
  const bot = { id, ready: true, nickname, character, equippedWeapon: null, isAttacking: false, hp: 100, kills: 0, deaths: 0, isBot: true };
  // minimal bot runtime state
  bot.runtime = { x: Math.random()*80-40, y: 0.5, z: Math.random()*80-40, rotY: 0, targetId: null, tick: 0 };
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

function canBotMoveTo(x, z, mapType = 'map1') {
  const BOT_RADIUS = 0.65; // 플레이어와 동일한 크기
  const botBox = {
    minX: x - BOT_RADIUS,
    maxX: x + BOT_RADIUS,
    minZ: z - BOT_RADIUS,
    maxZ: z + BOT_RADIUS
  };

  const obstacles = mapType === 'map2' ? MAP2_OBSTACLES : MAP1_OBSTACLES;

  for (const obstacle of obstacles) {
    if (checkAABBCollision(botBox, obstacle)) {
      return false; // 충돌 발생
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

          const spawnedWeapons = [];
          for (let i = 0; i < 10; i++) {
            const weaponName = getRandomWeaponName();
            if (weaponName) {
              const uuid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
              const x = Math.random() * 80 - 40;
              const y = 1;
              const z = Math.random() * 80 - 40;
              spawnedWeapons.push({ uuid, weaponName, x, y, z });
            }
          }
          room.gameState.spawnedWeapons = spawnedWeapons;

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
                // choose or refresh target every 1.5s
                bot.runtime.tick++;
                if (!bot.runtime.targetId || bot.runtime.tick % 15 === 0) { // 15 ticks * 100ms = 1.5s
                  const candidates = room.players.filter(p => p.id !== bot.id && p.hp > 0);
                  if (candidates.length) {
                    // pick nearest
                    let best = candidates[0];
                    let bestD = 1e9;
                    for (const c of candidates) {
                      const cx = c.runtime ? c.runtime.x : 0;
                      const cz = c.runtime ? c.runtime.z : 0;
                      const d = Math.hypot(cx - bot.runtime.x, cz - bot.runtime.z);
                      if (d < bestD) { bestD = d; best = c; }
                    }
                    bot.runtime.targetId = best.id;
                  } else {
                    bot.runtime.targetId = null;
                  }
                }
                const target = room.players.find(p=>p.id===bot.runtime.targetId && p.hp>0);
                // determine desired point
                if (!bot.runtime.wander || bot.runtime.wander.ttl <= 0) {
                  bot.runtime.wander = {
                    x: (Math.random()*78)-39,
                    z: (Math.random()*78)-39,
                    ttl: Math.floor(30 + Math.random()*30) // 3-6s
                  };
                } else {
                  bot.runtime.wander.ttl--;
                }
                const tx = target && target.runtime ? target.runtime.x : bot.runtime.wander.x;
                const tz = target && target.runtime ? target.runtime.z : bot.runtime.wander.z;
                // move toward point
                const dx = tx - bot.runtime.x;
                const dz = tz - bot.runtime.z;
                const len = Math.hypot(dx,dz);
                const dt = 0.1; // 100ms
                const speed = target ? 3.0 : 2.0; // units/sec
                if (len > 0.01) {
                  const step = Math.min(len, speed * dt);
                  const newX = bot.runtime.x + (dx/len) * step;
                  const newZ = bot.runtime.z + (dz/len) * step;

                  // 충돌 체크: 이동 가능한 경우에만 위치 업데이트
                  if (canBotMoveTo(newX, newZ, room.map)) {
                    bot.runtime.x = newX;
                    bot.runtime.z = newZ;
                    bot.runtime.rotY = Math.atan2(dx, dz);
                  } else {
                    // 충돌 시 우회 시도 (90도 회전하여 재시도)
                    const altDx = -dz; // 90도 회전
                    const altDz = dx;
                    const altLen = Math.hypot(altDx, altDz);
                    if (altLen > 0.01) {
                      const altStep = Math.min(altLen, speed * dt);
                      const altX = bot.runtime.x + (altDx/altLen) * altStep;
                      const altZ = bot.runtime.z + (altDz/altLen) * altStep;
                      if (canBotMoveTo(altX, altZ, room.map)) {
                        bot.runtime.x = altX;
                        bot.runtime.z = altZ;
                        bot.runtime.rotY = Math.atan2(altDx, altDz);
                      }
                    }
                  }
                }
                // keep on ground & bounds
                bot.runtime.y = 0; // ground level for remote
                bot.runtime.x = Math.max(-39, Math.min(39, bot.runtime.x));
                bot.runtime.z = Math.max(-39, Math.min(39, bot.runtime.z));

                // equip a random weapon once in a while
                if (!bot.equippedWeapon && Math.random() < 0.05) {
                  const w = getRandomWeaponName();
                  if (w) bot.equippedWeapon = w;
                }

                // animation hint via broadcast (Idle/Walk)
                const anim = len > 0.05 ? 'Walk' : 'Idle';
                io.to(socket.roomId).emit('gameUpdate', {
                  playerId: bot.id,
                  position: [bot.runtime.x, bot.runtime.y, bot.runtime.z],
                  rotation: [0, bot.runtime.rotY, 0],
                  animation: anim,
                  hp: bot.hp,
                  equippedWeapon: bot.equippedWeapon,
                  isAttacking: bot.isAttacking
                });

                // attack if near target with simple cooldown
                if (bot.runtime.attackCd && bot.runtime.attackCd > 0) bot.runtime.attackCd -= 0.1; // 100ms
                const dist = target && target.runtime ? Math.hypot(target.runtime.x-bot.runtime.x, target.runtime.z-bot.runtime.z) : 999;
                if (dist < 2.0 && (!bot.runtime.attackCd || bot.runtime.attackCd <= 0)) {
                  bot.isAttacking = true;
                  io.to(socket.roomId).emit('playerAttack', { playerId: bot.id, animationName: 'SwordSlash' });
                  const victimId = target ? target.id : null;
                  if (victimId) {
                    const damage = 15;
                    const victim = room.players.find(p=>p.id===victimId);
                    if (victim) {
                      if (victim.id !== bot.id) {
                        victim.lastHitBy = bot.id;
                      }
                      victim.hp = Math.max(0, victim.hp - damage);
                      // 봇 공격도 무기 효과 포함 (기본 넉백 + 경직)
                      io.to(socket.roomId).emit('hpUpdate', {
                        playerId: victim.id,
                        hp: victim.hp,
                        attackerId: bot.id,
                        weaponEffects: {
                          knockbackStrength: 3,
                          knockbackDuration: 0.2,
                          specialEffect: null,
                          stunDuration: 0.2 // 봇도 0.2초 경직 적용
                        },
                        attackerPosition: [bot.runtime.x, bot.runtime.y, bot.runtime.z]
                      });
                      if (victim.hp === 0) {
                        // 중복 처리 방지: 이미 킬/데스가 처리되었으면 무시
                        if (!victim.killProcessed) {
                          victim.killProcessed = true; // 처리 플래그 설정

                          // 최종 킬은 lastHitBy 기준으로 계산
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
                  setTimeout(()=>{ bot.isAttacking = false; }, 400);
                  bot.runtime.attackCd = 0.9; // ~0.9s cooldown
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
              io.to(socket.roomId).emit('gameEnd', room.players.map(p => ({ nickname: p.nickname, kills: p.kills, deaths: p.deaths })));
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
  socket.on('addBot', () => {
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
    const bot = makeRandomBot(roomId);
    room.players.push(bot);
    
    updateRoomPlayers(roomId);
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
      const targetPlayer = room.players.find(p => p.id === data.targetId);
      if (targetPlayer) {

        // 기록: 마지막 가해자 (자살/자해는 제외)
        if (data.attackerId && data.attackerId !== targetPlayer.id) {
          targetPlayer.lastHitBy = data.attackerId;
        }
        targetPlayer.hp -= data.damage;
        if (targetPlayer.hp < 0) targetPlayer.hp = 0;


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
