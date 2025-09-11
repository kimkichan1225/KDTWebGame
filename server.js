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
  console.log('A user connected:', socket.id);

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
    console.log(`Room created: ${roomId} by ${socket.id} with settings:`, roomSettings);
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
      console.log(`${socket.id} joined room: ${roomId}`);
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

          // Start simple bot simulation loop per room
          if (!room.gameState.botInterval) {
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
                  bot.runtime.x += (dx/len) * step;
                  bot.runtime.z += (dz/len) * step;
                  bot.runtime.rotY = Math.atan2(dx, dz);
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
                      victim.hp = Math.max(0, victim.hp - damage);
                      io.to(socket.roomId).emit('hpUpdate', { playerId: victim.id, hp: victim.hp, attackerId: bot.id });
                      if (victim.hp === 0) {
                        if (victim.id !== bot.id) bot.kills++;
                        victim.deaths++;
                        io.to(socket.roomId).emit('updateScores', room.players.map(p => ({ id: p.id, nickname: p.nickname, kills: p.kills, deaths: p.deaths })));
                        io.to(socket.roomId).emit('killFeed', { attackerName: bot.nickname, victimName: victim.nickname, attackerCharacter: bot.character, victimCharacter: victim.character });
                        if (victim.isBot) scheduleBotRespawn(socket.roomId, victim, 3000);
                      }
                    }
                  }
                  setTimeout(()=>{ bot.isAttacking = false; }, 400);
                  bot.runtime.attackCd = 0.9; // ~0.9s cooldown
                }
              }
            }, 100);
          }

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
    if (socket.roomId && rooms[socket.roomId]) {
        const room = rooms[socket.roomId];
        const victim = room.players.find(p => p.id === victimId);
        const attacker = room.players.find(p => p.id === attackerId);

        if (victim) {
            victim.deaths++;
        }
        if (attacker && attacker.id !== victim.id) {
            attacker.kills++;
        }

        let attackerName = 'World';
        if (attacker) {
            if (attacker.id === victim.id) {
                attackerName = victim.nickname; // 자살 시 자신의 닉네임 표시
            } else {
                attackerName = attacker.nickname;
            }
        }
        io.to(socket.roomId).emit('updateScores', room.players.map(p => ({ id: p.id, nickname: p.nickname, kills: p.kills, deaths: p.deaths })));
        io.to(socket.roomId).emit('killFeed', { attackerName: attackerName, victimName: victim.nickname, attackerCharacter: attacker ? attacker.character : 'Default', victimCharacter: victim ? victim.character : 'Default' });
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
    console.log(`[AddBot] request from ${socket.id} in room ${roomId}`);
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
    console.log(`[AddBot] added bot ${bot.nickname} (${bot.id}) to room ${roomId}`);
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
    console.log(`[Server] Received playerDamage: targetId=${data.targetId}, damage=${data.damage}, attackerId=${data.attackerId}`);
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const targetPlayer = room.players.find(p => p.id === data.targetId);
      if (targetPlayer) {
        console.log(`[Server] Target player found: ${targetPlayer.nickname} (HP: ${targetPlayer.hp})`);
        targetPlayer.hp -= data.damage;
        if (targetPlayer.hp < 0) targetPlayer.hp = 0;
        console.log(`[Server] ${targetPlayer.nickname} new HP: ${targetPlayer.hp}`);

        io.to(socket.roomId).emit('hpUpdate', { playerId: targetPlayer.id, hp: targetPlayer.hp, attackerId: data.attackerId });
        console.log(`[Server] Emitted hpUpdate: playerId=${targetPlayer.id}, hp=${targetPlayer.hp}, attackerId=${data.attackerId}`);

        if (targetPlayer.hp === 0) {
          console.log(`${targetPlayer.nickname} (${targetPlayer.id}) has been defeated!`);
          // If a bot died, handle killfeed/score and schedule respawn here (clients don't emit playerKilled for bots)
          if (targetPlayer.isBot) {
            const attacker = room.players.find(p => p.id === data.attackerId);
            targetPlayer.deaths++;
            if (attacker && attacker.id !== targetPlayer.id) {
              attacker.kills++;
            }
            io.to(socket.roomId).emit('updateScores', room.players.map(p => ({ id: p.id, nickname: p.nickname, kills: p.kills, deaths: p.deaths })));
            const attackerName = attacker ? attacker.nickname : 'World';
            const attackerCharacter = attacker ? attacker.character : 'Default';
            io.to(socket.roomId).emit('killFeed', { attackerName, victimName: targetPlayer.nickname, attackerCharacter, victimCharacter: targetPlayer.character });
            scheduleBotRespawn(socket.roomId, targetPlayer, 3000);
          }
        }
      } else {
        console.log(`[Server] Target player ${data.targetId} not found in room ${socket.roomId}`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.roomId && rooms[socket.roomId]) {
      rooms[socket.roomId].players = rooms[socket.roomId].players.filter(
        (p) => p.id !== socket.id
      );
      if (rooms[socket.roomId].players.length === 0) {
        delete rooms[socket.roomId];
        console.log(`Room ${socket.roomId} deleted.`);
      } else {
        updateRoomPlayers(socket.roomId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
