import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.124/examples/jsm/controls/OrbitControls.js';
import { player } from './player.js';
import { math } from './math.js';
import { hp } from './hp.js'; // hp.js 임포트
import { WEAPON_DATA, loadWeaponData, spawnWeaponOnMap, getRandomWeaponName } from './weapon.js';
import { AttackSystem } from './attackSystem.js';

const socket = io();

export class GameStage1 {
  constructor(socket, players, map, spawnedWeapons) {
    this.socket = socket;
    this.players = {}; // To store other players' objects
    this.localPlayerId = socket.id;
    this.playerInfo = players;
    this.map = map;
    this.spawnedWeapons = spawnedWeapons; // Store spawned weapons data
    this.spawnedWeaponObjects = []; // Store actual Weapon instances

    // Initialize가 완료되면 resolve하는 Promise
    this.initialized = this.Initialize().then(() => {
      this.RAF();
      this.SetupSocketEvents();
    });
  }

  async Initialize() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.gammaFactor = 2.2;
    document.getElementById('container').appendChild(this.renderer.domElement);

    const fov = 60;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 1.0;
    const far = 2000.0;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.camera.position.set(-8, 6, 12);
    this.camera.lookAt(0, 2, 0);

    this.scene = new THREE.Scene();

    this.SetupLighting();
    this.SetupSkyAndFog();
    this.CreateGround();
    this.attackSystem = new AttackSystem(this.scene); // AttackSystem 인스턴스 생성

    // 맵에 따라 다른 오브젝트 파일 로드
    console.log('[GameStage1] 로딩 맵:', this.map);
    const objectModule = this.map === 'map2'
      ? await import('./island-object.js')
      : await import('./object.js');
    this.objectClass = objectModule.object;
    console.log('[GameStage1] 맵 오브젝트 로드 완료:', this.map);

    await this.CreateLocalPlayer(); // 플레이어 생성을 기다림



    await loadWeaponData(); // 무기 데이터 로드를 기다립니다.
    for (const weaponData of this.spawnedWeapons) {
      let x, y, z;

      // 섬 맵일 때는 타일 위로 재배치
      if (this.map === 'map2') {
        const newPos = this.getRandomWeaponSpawnPosition();
        x = newPos.x;
        y = newPos.y;
        z = newPos.z;
      } else {
        // 도시 맵은 서버 위치 사용
        x = weaponData.x;
        y = weaponData.y;
        z = weaponData.z;
      }

      const weapon = spawnWeaponOnMap(this.scene, weaponData.weaponName, x, y, z, weaponData.uuid);
      this.spawnedWeaponObjects.push(weapon);
    }
    // 맵에 따른 데미지 설정
    if (this.map === 'map2') {
      // 섬 맵: 경계 없음, y < 2일 때 데미지
      this.mapBounds = null; // 경계 없음
      this.fallDamageY = 2; // 이 높이 이하로 떨어지면 데미지
    } else {
      // 도시 맵: 경계 밖에서 데미지
      this.mapBounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
      this.fallDamageY = null; // 낙하 데미지 없음
    }
    this.damageTimer = 0;
    this.damageInterval = 0.5; // 0.5초마다 데미지
    this.damageAmount = 25; // 데미지량
    this.isRespawning = false;

    window.addEventListener('resize', () => this.OnWindowResize(), false);
    document.addEventListener('keydown', (e) => this._OnKeyDown(e), false);
    document.addEventListener('keyup', (e) => this._OnKeyUp(e), false);
  }

  SetupLighting() {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(60, 100, 10);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1.0;
    directionalLight.shadow.camera.far = 200.0;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    this.scene.add(directionalLight);
    this.scene.add(directionalLight.target);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0xf6f47f, 0.6);
    this.scene.add(hemisphereLight);
  }

  SetupSkyAndFog() {
    const skyUniforms = {
      topColor: { value: new THREE.Color(0x0077ff) },
      bottomColor: { value: new THREE.Color(0x89b2eb) },
      offset: { value: 33 },
      exponent: { value: 0.6 }
    };

    const skyGeometry = new THREE.SphereGeometry(1000, 32, 15);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize( vWorldPosition + offset ).y;
          gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h, 0.0), exponent ), 0.0 ) ), 1.0 );
        }`,
      side: THREE.BackSide,
    });

    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(skyMesh);
    this.scene.fog = new THREE.FogExp2(0x89b2eb, 0.002);
  }

  CreateGround() {
    const textureLoader = new THREE.TextureLoader();
    const capitalizedMapName = this.map.charAt(0).toUpperCase() + this.map.slice(1);
    const grassTexture = textureLoader.load(`./resources/${capitalizedMapName}.png`);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(1, 1);

    const groundGeometry = new THREE.PlaneGeometry(80, 80, 10, 10);
    const groundMaterial = new THREE.MeshLambertMaterial({ map: grassTexture });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  getRandomPosition() {
    const maxAttempts = 100; // 최대 시도 횟수
    const playerHalfWidth = 0.65; // player.js의 halfWidth
    const playerHalfDepth = 0.65; // player.js의 halfDepth
    const playerHeight = 3.2; // player.js의 halfHeight * 2

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let x, z;

      // 맵에 따라 다른 스폰 방식
      if (this.map === 'map2') {
        // 섬 맵: 타일 위의 랜덤한 위치
        const tileSpawnAreas = this.npc_.GetTileSpawnAreas();
        if (!tileSpawnAreas || tileSpawnAreas.length === 0) {
          // 타일 정보가 없으면 기본 위치 반환
          console.warn('[getRandomPosition] 타일 정보 없음, 기본 위치 사용');
          return new THREE.Vector3(0, 5, 0);
        }

        // 랜덤한 타일 선택
        const randomTile = tileSpawnAreas[Math.floor(Math.random() * tileSpawnAreas.length)];

        // 타일의 바운딩박스 범위 계산
        const halfWidth = randomTile.boundingBoxSize.width / 2;
        const halfDepth = randomTile.boundingBoxSize.depth / 2;

        // 타일 범위 내에서 랜덤한 위치 생성 (플레이어가 타일 밖으로 나가지 않도록 약간 안쪽으로)
        const margin = 0.5; // 타일 가장자리에서 떨어진 거리
        x = randomTile.position.x + (Math.random() * 2 - 1) * (halfWidth - margin);
        z = randomTile.position.z + (Math.random() * 2 - 1) * (halfDepth - margin);
      } else {
        // 도시 맵: 전체 맵
        const xRange = { min: -40, max: 40 };
        const zRange = { min: -40, max: 40 };
        x = Math.random() * (xRange.max - xRange.min) + xRange.min;
        z = Math.random() * (zRange.max - zRange.min) + zRange.min;
      }

      let y = 0.5; // Default y position

      const collidables = this.npc_.GetCollidables();
      const checkPosition = new THREE.Vector3(x, 100, z); // Check from a high position
      const raycaster = new THREE.Raycaster(checkPosition, new THREE.Vector3(0, -1, 0));

      let highestY = -Infinity;
      let objectFound = false;

      for (const collidable of collidables) {
        const intersects = raycaster.intersectObject(collidable.model, true); // true for recursive
        if (intersects.length > 0) {
          const intersection = intersects[0];
          if (intersection.point.y > highestY) {
            highestY = intersection.point.y;
            objectFound = true;
          }
        }
      }

      if (objectFound) {
        y = highestY + 0.1; // Place slightly above the object
      }

      // 플레이어의 임시 바운딩 박스 생성
      const tempPlayerBox = new THREE.Box3(
        new THREE.Vector3(x - playerHalfWidth, y, z - playerHalfDepth),
        new THREE.Vector3(x + playerHalfWidth, y + playerHeight, z + playerHalfDepth)
      );

      let isColliding = false;
      for (const collidable of collidables) {
        if (tempPlayerBox.intersectsBox(collidable.boundingBox)) {
          isColliding = true;
          break;
        }
      }

      if (!isColliding) {
        return new THREE.Vector3(x, y, z);
      }
    }

    // 최대 시도 횟수를 초과하면 기본 위치 반환 (최후의 수단)

    return new THREE.Vector3(0, 0.5, 0);
  }

  getRandomWeaponSpawnPosition() {
    // 무기 스폰용 위치 생성
    let x, y, z;

    if (this.map === 'map2') {
      // 섬 맵: 실제 타일 위에서 스폰
      const tileSpawnAreas = this.npc_.GetTileSpawnAreas();
      if (!tileSpawnAreas || tileSpawnAreas.length === 0) {
        // 타일 정보가 없으면 기본 위치 반환
        console.warn('[getRandomWeaponSpawnPosition] 타일 정보 없음, 기본 위치 사용');
        return new THREE.Vector3(0, 5, 0);
      }

      // 랜덤한 타일 선택
      const randomTile = tileSpawnAreas[Math.floor(Math.random() * tileSpawnAreas.length)];

      // 타일의 바운딩박스 범위 계산
      const halfWidth = randomTile.boundingBoxSize.width / 2;
      const halfDepth = randomTile.boundingBoxSize.depth / 2;

      // 타일 범위 내에서 랜덤한 위치 생성
      const margin = 0.3; // 타일 가장자리에서 떨어진 거리
      x = randomTile.position.x + (Math.random() * 2 - 1) * (halfWidth - margin);
      z = randomTile.position.z + (Math.random() * 2 - 1) * (halfDepth - margin);
      y = 5; // 약간 높게 스폰하여 타일 위에 떨어지도록
    } else {
      // 도시 맵: 전체 맵
      x = Math.random() * 80 - 40;
      y = 1;
      z = Math.random() * 80 - 40;
    }

    return new THREE.Vector3(x, y, z);
  }

  async CreateLocalPlayer() {
    const npcPos = new THREE.Vector3(0, 0, -4);
    this.npc_ = new this.objectClass.NPC(this.scene, npcPos);

    // 섬 맵인 경우 타일 로딩이 완료될 때까지 대기
    if (this.map === 'map2' && this.npc_.loadingPromise_) {
      console.log('[CreateLocalPlayer] 타일 로딩 대기 중...');
      await this.npc_.loadingPromise_;
      console.log('[CreateLocalPlayer] 타일 로딩 완료');
    }

    const localPlayerData = this.playerInfo.find(p => p.id === this.localPlayerId);

    this.player_ = new player.Player({
      scene: this.scene,
      onDebugToggle: (visible) => this.npc_.ToggleDebugVisuals(visible),
      character: localPlayerData.character,
      nickname: localPlayerData.nickname, // 닉네임 추가
      hpUI: new hp.HPUI(this.scene, this.renderer, localPlayerData.nickname), // HPUI 인스턴스 생성 및 전달
      getRespawnPosition: () => this.getRandomPosition(),
      attackSystem: this.attackSystem, // AttackSystem 인스턴스 전달
      socket: this.socket, // socket 인스턴스 전달
      map: this.map, // 맵 정보 전달
      onLoad: () => {
        const initialPosition = this.getRandomPosition();
        console.log('[CreateLocalPlayer] 초기 스폰 위치:', initialPosition);
        this.player_.SetPosition([initialPosition.x, initialPosition.y, initialPosition.z]);
      }
    });

    this.cameraTargetOffset = new THREE.Vector3(0, 15, 10);
    this.rotationAngle = 4.715;
  }

  OnWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  UpdateCamera() {
    if (!this.player_ || !this.player_.mesh_) return;

    const target = this.player_.mesh_.position.clone();
    const offset = this.cameraTargetOffset.clone();
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationAngle);
    const cameraPos = target.clone().add(offset);
    this.camera.position.copy(cameraPos);

    const headOffset = new THREE.Vector3(0, 2, 0);
    const headPosition = target.clone().add(headOffset);
    this.camera.lookAt(headPosition);
  }

  SetupSocketEvents() {
    this.socket.on('gameUpdate', (data) => {
      // Update other players' positions
      if (data.playerId === this.localPlayerId) return; // Don't update self

      let otherPlayer = this.players[data.playerId];
      if (!otherPlayer) {
        const remotePlayerData = this.playerInfo.find(p => p.id === data.playerId);
        // Create a new player object for the new player
        otherPlayer = new player.Player({
          scene: this.scene,
          character: remotePlayerData.character,
          nickname: remotePlayerData.nickname, // 닉네임 추가
          isRemote: true,
          playerId: remotePlayerData.id, // playerId 추가
          hpUI: new hp.HPUI(this.scene, this.renderer, remotePlayerData.nickname), // 원격 플레이어 HPUI 생성
          attackSystem: this.attackSystem, // AttackSystem 인스턴스 전달
          socket: this.socket // socket 인스턴스 전달
        });
        this.players[data.playerId] = otherPlayer;
      }
      otherPlayer.SetPosition(data.position);
      otherPlayer.SetRotation(data.rotation);
      if (data.animation) {
        otherPlayer.SetRemoteAnimation(data.animation);
      }
      // 원격 플레이어 HP 업데이트
      if (data.hp !== undefined) {
        otherPlayer.hp_ = data.hp;
        if (otherPlayer.hpUI) {
          otherPlayer.hpUI.updateHP(data.hp);
        }
        if (data.hp <= 0 && !otherPlayer.isDead_) {
          otherPlayer.isDead_ = true;
          otherPlayer.SetRemoteAnimation('Death');
        } else if (data.hp > 0 && otherPlayer.isDead_) {
          otherPlayer.isDead_ = false;
          otherPlayer.SetRemoteAnimation('Idle');
        }
      }
      // 원격 플레이어 무기 장착/해제 업데이트
      if (data.equippedWeapon !== undefined) {
        const currentEquippedWeapon = otherPlayer.currentWeaponModel ? otherPlayer.currentWeaponModel.userData.weaponName : null;
        if (data.equippedWeapon !== currentEquippedWeapon) {
          if (data.equippedWeapon) {
            otherPlayer.EquipWeapon(data.equippedWeapon);
          } else {
            otherPlayer.UnequipWeapon();
          }
        }
      }
    });

    this.socket.on('playerJoined', (playerId) => {
      
      // Optionally, request initial state from the new player
    });

    this.socket.on('playerLeft', (playerId) => {
      
      const otherPlayer = this.players[playerId];
      if (otherPlayer) {
        this.scene.remove(otherPlayer.mesh_);
        delete this.players[playerId];
      }
    });

    this.socket.on('weaponPickedUp', (weaponUuid) => {
      const pickedUpWeapon = this.spawnedWeaponObjects.find(w => w.uuid === weaponUuid);
      if (pickedUpWeapon) {
        this.scene.remove(pickedUpWeapon.model_);
        this.spawnedWeaponObjects = this.spawnedWeaponObjects.filter(w => w.uuid !== weaponUuid);
        
      }
    });

    this.socket.on('weaponSpawned', (weaponData) => {
      const weapon = spawnWeaponOnMap(this.scene, weaponData.weaponName, weaponData.x, weaponData.y, weaponData.z, weaponData.uuid);
      this.spawnedWeaponObjects.push(weapon);
      
    });

    this.socket.on('playerAttack', (data) => {
      if (data.playerId === this.localPlayerId) return; // Don't update self
      const otherPlayer = this.players[data.playerId];
      if (otherPlayer) {
        otherPlayer.PlayAttackAnimation(data.animationName);
      }
    });

    this.socket.on('hpUpdate', (data) => {

      const targetPlayer = (data.playerId === this.localPlayerId) ? this.player_ : this.players[data.playerId];
      if (targetPlayer) {
        const oldHp = targetPlayer.hp_;
        targetPlayer.hp_ = data.hp; // 서버에서 받은 HP로 직접 설정
        targetPlayer.hpUI.updateHP(data.hp); // UI 업데이트


        if (data.hp <= 0 && !targetPlayer.isDead_) {
          targetPlayer.isDead_ = true;
          targetPlayer.SetAnimation_('Death');
          console.log('[킬/데스] 플레이어 사망:', data.playerId, '공격자:', data.attackerId);
          if (data.playerId === this.localPlayerId) { // 로컬 플레이어인 경우에만 사망 UI 및 타이머 트리거
            console.log('[킬/데스] playerKilled 이벤트 전송:', { victimId: data.playerId, attackerId: data.attackerId });
            this.socket.emit('playerKilled', { victimId: data.playerId, attackerId: data.attackerId });
            targetPlayer.DisableInput_();
            targetPlayer.respawnTimer_ = targetPlayer.respawnDelay_;
            if (targetPlayer.overlay) {
              targetPlayer.overlay.style.visibility = 'visible';
              targetPlayer.startCountdown();
            }
          }
        } else if (data.hp > 0 && targetPlayer.isDead_) { // 리스폰
          targetPlayer.isDead_ = false;
          targetPlayer.Respawn_(); // Respawn_ 함수 호출하여 상태 및 위치 재설정

          // 서버에 리스폰 알림 (킬 처리 플래그 초기화용)
          if (data.playerId === this.localPlayerId) {
            this.socket.emit('playerRespawned', { playerId: data.playerId });
          }
        } else if (data.hp < oldHp) { // HP가 실제로 감소했을 때만 피격 효과 트리거
          // 로컬 플레이어인 경우 피격 효과 (빨간 화면) 트리거
          if (data.playerId === this.localPlayerId && targetPlayer.hitEffect) {
            targetPlayer.hitEffect.style.opacity = '1';
            setTimeout(() => {
              targetPlayer.hitEffect.style.opacity = '0';
            }, 100);
          }
          // 죽지 않았을 경우 RecieveHit 애니메이션 트리거
          if (targetPlayer.hp_ > 0) {
            targetPlayer.SetAnimation_('RecieveHit');
          }

          // 무기 효과 적용 (넉백 및 경직)
          if (data.weaponEffects && targetPlayer.hp_ > 0) {
            // 넉백 적용
            if (data.weaponEffects.knockbackStrength > 0 && data.attackerPosition) {
              const targetPos = new THREE.Vector3();
              targetPlayer.mesh_.getWorldPosition(targetPos);
              const attackerPos = new THREE.Vector3(data.attackerPosition[0], data.attackerPosition[1], data.attackerPosition[2]);
              const knockbackDirection = targetPos.clone().sub(attackerPos).normalize();

              targetPlayer.ApplyKnockback(
                knockbackDirection,
                data.weaponEffects.knockbackStrength * 10, // 강도 조절
                data.weaponEffects.knockbackDuration
              );
            }

            // 경직 적용
            if (data.weaponEffects.stunDuration > 0) {
              targetPlayer.ApplyStun(data.weaponEffects.stunDuration);
            }
          }
        }
      }
    });
  }

  _OnKeyDown(event) {
    if (event.code === 'Tab') {
        event.preventDefault();
        document.getElementById('scoreboard').style.display = 'block';
    }
    switch (event.keyCode) {
      case 69: // E key
        if (this.player_ && this.player_.mesh_) {
          const playerPosition = this.player_.mesh_.position;
          let pickedUp = false;
          for (let i = 0; i < this.spawnedWeaponObjects.length; i++) {
            const weapon = this.spawnedWeaponObjects[i];
            if (weapon.model_) {
              const distance = playerPosition.distanceTo(weapon.model_.position);
              if (distance < 2.0) { // Pickup range
                this.scene.remove(weapon.model_);
                this.spawnedWeaponObjects.splice(i, 1);
                this.socket.emit('weaponPickedUp', weapon.uuid);
                this.player_.EquipWeapon(weapon.weaponName); // Equip the weapon
                this.socket.emit('weaponEquipped', weapon.weaponName); // 서버에 무기 장착 정보 전송
                pickedUp = true;

                // 새로운 무기 스폰 로직 추가
                const newWeaponName = getRandomWeaponName();
                if (newWeaponName) {
                  const newSpawnPosition = this.getRandomWeaponSpawnPosition();
                  const newWeaponUuid = THREE.MathUtils.generateUUID(); // 새로운 무기 UUID 생성
                  const newWeapon = spawnWeaponOnMap(this.scene, newWeaponName, newSpawnPosition.x, newSpawnPosition.y, newSpawnPosition.z, newWeaponUuid);
                  this.spawnedWeaponObjects.push(newWeapon);
                  this.socket.emit('weaponSpawned', {
                    weaponName: newWeaponName,
                    x: newSpawnPosition.x,
                    y: newSpawnPosition.y,
                    z: newSpawnPosition.z,
                    uuid: newWeaponUuid
                  });
                }
                break;
              }
            }
          }
        }
        break;
      case 74: // J key
        if (this.player_ && this.player_.mesh_) {
          let attackAnimation = 'Punch'; // 기본값 (맨손)

          // 무기 종류에 따라 애니메이션 선택
          if (this.player_.currentWeaponModel && this.player_.currentWeaponModel.userData.weaponName) {
            const weaponName = this.player_.currentWeaponModel.userData.weaponName;

            // 원거리 무기
            if (/Pistol|Shotgun|SniperRifle|AssaultRifle|Bow/i.test(weaponName)) {
              attackAnimation = 'Shoot_OneHanded';
            }
            // 대검
            else if (/Sword_big/i.test(weaponName)) {
              attackAnimation = 'GreatSwordAttack';
            }
            // 단검
            else if (/Dagger/i.test(weaponName)) {
              attackAnimation = 'DaggerAttack';
            }
            // 양날도끼
            else if (/Axe_Double/i.test(weaponName)) {
              attackAnimation = 'DoubleAxeAttack';
            }
            // 한손도끼 (양날도끼보다 먼저 체크하면 안됨)
            else if (/Axe_small/i.test(weaponName) || /Axe(?!_)/i.test(weaponName)) {
              attackAnimation = 'HandAxeAttack';
            }
            // 망치
            else if (/Hammer_Double/i.test(weaponName) || /Hammer/i.test(weaponName)) {
              attackAnimation = 'HammerAttack';
            }
            // 일반 검
            else if (/Sword/i.test(weaponName)) {
              attackAnimation = 'SwordAttack';
            }
          }

          this.player_.PlayAttackAnimation(attackAnimation);
          this.socket.emit('playerAttack', attackAnimation); // 서버에 공격 애니메이션 정보 전송
        }
        break;
    }
  }

  _OnKeyUp(event) {
    if (!this.player_.isGameInputEnabled_) return;
    if (event.code === 'Tab') {
        document.getElementById('scoreboard').style.display = 'none';
    }
  }

  RAF(time) {
    requestAnimationFrame((t) => this.RAF(t));

    if (!this.prevTime) this.prevTime = time || performance.now();
    const delta = ((time || performance.now()) - this.prevTime) * 0.001;
    this.prevTime = time || performance.now();

    if (this.player_ && this.player_.mesh_) {
      // 충돌 대상: 맵 오브젝트 + 다른 플레이어들
      const mapCollidables = this.npc_.GetCollidables();

      // 다른 플레이어들을 충돌 대상에 추가
      const playerCollidables = Object.values(this.players)
        .filter(p => p.mesh_ && !p.isDead_) // 메시가 있고 살아있는 플레이어만
        .map(p => ({
          boundingBox: p.boundingBox_,
          isPlayer: true, // 플레이어임을 표시
          playerId: p.params_.playerId
        }));

      const allCollidables = [...mapCollidables, ...playerCollidables];

      this.player_.Update(delta, this.rotationAngle, allCollidables);
      this.UpdateCamera();

      // Send player position to server
      this.socket.emit('gameUpdate', {
        playerId: this.localPlayerId,
        position: this.player_.mesh_.position.toArray(),
        rotation: this.player_.mesh_.rotation.toArray(),
        animation: this.player_.currentAnimationName_, // Add animation state
        hp: this.player_.hp_, // Add HP state
        equippedWeapon: this.player_.currentWeaponModel ? this.player_.currentWeaponModel.userData.weaponName : null, // Add equipped weapon state
        isAttacking: this.player_.isAttacking_ // Add attacking state
      });

      // 맵에 따른 데미지 로직
      const playerPos = this.player_.mesh_.position;
      let shouldTakeDamage = false;

      if (this.map === 'map2') {
        // 섬 맵: y < 2일 때 데미지 (물에 빠짐)
        if (playerPos.y < this.fallDamageY) {
          shouldTakeDamage = true;
        }
      } else {
        // 도시 맵: 경계 밖에서 데미지
        if (
          playerPos.x < this.mapBounds.minX ||
          playerPos.x > this.mapBounds.maxX ||
          playerPos.z < this.mapBounds.minZ ||
          playerPos.z > this.mapBounds.maxZ
        ) {
          shouldTakeDamage = true;
        }
      }

      if (shouldTakeDamage) {
        this.damageTimer += delta;
        if (this.damageTimer >= this.damageInterval) {
          if (!this.player_.isDead_) { // 플레이어가 죽은 상태가 아닐 때만 데미지 적용
            this.socket.emit('playerDamage', { targetId: this.localPlayerId, damage: this.damageAmount, attackerId: this.localPlayerId });
          }
          this.damageTimer = 0;
        }
      } else {
        this.damageTimer = 0; // 안전한 구역으로 들어오면 타이머 초기화
      }

      // HP UI 업데이트
      if (this.player_.hpUI) {
        this.player_.hpUI.updateHP(this.player_.hp_);
      }
    }

    for (const id in this.players) {
      this.players[id].Update(delta);
    }

    if (this.npc_) {
      this.npc_.Update(delta);
    }

    // AttackSystem 업데이트
    this.attackSystem.update(delta, Object.values(this.players), [this.npc_]);

    this.renderer.render(this.scene, this.camera);
  }
}

const menu = document.getElementById('menu');
const controls = document.getElementById('controls');
const createRoomButton = document.getElementById('createRoomButton');
const joinRoomMainButton = document.getElementById('joinRoomMainButton');
const joinRoomPopup = document.getElementById('joinRoomPopup');
const publicRoomList = document.getElementById('publicRoomList');
const privateRoomCodeInput = document.getElementById('privateRoomCodeInput');
const popupJoinButton = document.getElementById('popupJoinButton');
const popupCloseButton = document.getElementById('popupCloseButton');
const refreshRoomListButton = document.getElementById('refreshRoomListButton');
const waitingRoom = document.getElementById('waitingRoom');
const waitingRoomIdDisplay = document.getElementById('waitingRoomIdDisplay');
const playerList = document.getElementById('playerList');
const readyButton = document.getElementById('readyButton');
const addAIBotButton = document.getElementById('addAIBotButton');
const startGameButton = document.getElementById('startGameButton');

// const maxPlayersInput = document.getElementById('maxPlayersInput'); // This input is now part of the create room popup

// New elements for create room popup
const createRoomSettingsPopup = document.getElementById('createRoomSettingsPopup');
const characterNicknamePopup = document.getElementById('characterNicknamePopup');

let roomSettings = {}; // Global variable to store room creation settings
let joinRoomId = null; // Global variable to store room ID for joining
let isRoomCreator = false; // Track if the current client is the room creator
let currentRoomMap = 'map1'; // 현재 방의 맵을 저장

const mapSelectionContainer = document.getElementById('mapSelectionContainer');
const mapThumbnails = document.querySelectorAll('.map-thumbnail');
const maxPlayersCreate = document.getElementById('maxPlayersCreate');
const roomVisibility = document.getElementById('roomVisibility');

const createRoomConfirmButton = document.getElementById('createRoomConfirmButton');
const createRoomCancelButton = document.getElementById('createRoomCancelButton');


const playerSlotsContainer = document.getElementById('playerSlotsContainer');

const waitingRoomTitle = document.getElementById('waitingRoomTitle');
const currentMapImage = document.getElementById('currentMapImage');
const mapPlaceholderText = document.getElementById('mapPlaceholderText');

// 맵 변경 팝업 관련
const changeMapPopup = document.getElementById('changeMapPopup');
const changeMapConfirmButton = document.getElementById('changeMapConfirmButton');
const changeMapCancelButton = document.getElementById('changeMapCancelButton');
const mapThumbnailsChange = document.querySelectorAll('.map-thumbnail-change');
let selectedMapInPopup = 'map1'; // 팝업에서 선택된 맵

function updatePlayers(players, maxPlayers) {
  playerSlotsContainer.innerHTML = '';
  const totalSlots = 8; // Always show 8 slots

  for (let i = 0; i < totalSlots; i++) {
    const playerSlot = document.createElement('div');
    playerSlot.classList.add('player-slot');

    const playerInfo = players[i];
    if (i < maxPlayers) { // Open slots
      if (playerInfo) {
        playerSlot.style.border = '2px solid #4CAF50';
        playerSlot.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
        const characterName = playerInfo.character.replace('.glb', '').replace('.gltf', '');
        playerSlot.innerHTML = `
          <img src="./resources/character/${characterName}.png" alt="${playerInfo.nickname}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 5px;">
          <p style="margin: 0;">${playerInfo.nickname}</p>
          <p style="margin: 0; font-size: 12px; color: #eee;">${playerInfo.ready ? '(준비)' : '(대기)'}</p>
        `;
        if (isRoomCreator) {
          const closeBtn = document.createElement('div');
          closeBtn.classList.add('close-slot-btn');
          closeBtn.textContent = 'X';
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from propagating to the slot itself
            socket.emit('closePlayerSlot', i); // Send slot index
          });
          playerSlot.appendChild(closeBtn);
        }
      } else {
        playerSlot.style.border = '2px dashed #aaa';
        playerSlot.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        playerSlot.innerHTML = `<p>슬롯 ${i + 1}</p><p>(비어있음)</p>`;
        if (isRoomCreator) {
          const closeBtn = document.createElement('div');
          closeBtn.classList.add('close-slot-btn');
          closeBtn.textContent = 'X';
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            socket.emit('closePlayerSlot', i);
          });
          playerSlot.appendChild(closeBtn);
        }
      }
    } else { // Closed slots
      playerSlot.classList.add('closed');
      playerSlot.innerHTML = `<p>슬롯 ${i + 1}</p>`;
      if (isRoomCreator) {
        playerSlot.addEventListener('click', () => {
          socket.emit('increaseMaxPlayers');
        });
      }
    }
    playerSlotsContainer.appendChild(playerSlot);
  }
}

createRoomButton.addEventListener('click', () => {
  createRoomSettingsPopup.style.display = 'flex'; // Show create room settings popup
});

const roomNameCreate = document.getElementById('roomNameCreate');

  createRoomConfirmButton.addEventListener('click', () => {
    const selectedMapElement = document.querySelector('.map-thumbnail.selected');
    const selectedMap = selectedMapElement ? selectedMapElement.dataset.map : 'map1'; // Default to map1 if none selected
    const maxPlayers = parseInt(maxPlayersCreate.value, 10);
    const visibility = roomVisibility.value;
    const selectedRoundTimeButton = document.querySelector('#roundTimeOptions .round-time-btn.selected');
    const roundDuration = selectedRoundTimeButton ? parseInt(selectedRoundTimeButton.dataset.value, 10) : 180; // 기본값 180초
    const roomName = roomNameCreate.value.trim();

  if (!roomName) {
    alert('방 이름을 입력해주세요.');
    return;
  }

  if (isNaN(maxPlayers) || maxPlayers < 2 || maxPlayers > 8) {
    alert('최대 인원은 2에서 8 사이의 숫자로 설정해주세요.');
    return;
  }
  if (isNaN(roundDuration) || roundDuration < 60 || roundDuration > 600) {
    alert('라운드 시간은 60초에서 600초 사이로 설정해주세요.');
    return;
  }

  roomSettings = { map: selectedMap, maxPlayers: maxPlayers, visibility: visibility, roundTime: roundDuration, roomName: roomName };

  createRoomSettingsPopup.style.display = 'none'; // Hide create room settings popup
  characterNicknamePopup.style.display = 'flex'; // Show character and nickname popup
  initializeCharacterSelection(); // Initialize the character selection UI
});

createRoomCancelButton.addEventListener('click', () => {
  createRoomSettingsPopup.style.display = 'none'; // Hide popup
});

// Custom event listener for character selection
document.addEventListener('characterSelected', (event) => {
  const { character, nickname } = event.detail;

  if (!nickname) {
    alert('닉네임을 입력해주세요.');
    return;
  }

  menu.style.display = 'none'; // Hide main menu
  waitingRoom.style.display = 'flex'; // Show waiting room

  // 방 생성 또는 참가 로직 분기
  if (roomSettings.map) { // 방 생성 흐름
    socket.emit('createRoom', { ...roomSettings, nickname: nickname, character: character });
    roomSettings = {}; // Reset room settings after use
  } else if (joinRoomId) { // 방 참가 흐름
    socket.emit('joinRoom', joinRoomId, nickname, character);
    waitingRoomIdDisplay.textContent = `방 ID: ${joinRoomId}`;
    joinRoomId = null; // Reset joinRoomId
  } else {
    alert('방 생성 또는 참가 정보가 없습니다.');
    // 에러 처리 또는 초기 화면으로 돌아가는 로직 추가
    menu.style.display = 'flex';
    waitingRoom.style.display = 'none';
    return;
  }
});

// Map selection logic
mapThumbnails.forEach(thumbnail => {
  thumbnail.addEventListener('click', () => {
    mapThumbnails.forEach(t => t.classList.remove('selected'));
    thumbnail.classList.add('selected');
  });
});

joinRoomMainButton.addEventListener('click', () => {
  joinRoomPopup.style.display = 'flex'; // Show popup
  socket.emit('getPublicRooms'); // Request public rooms
});

// 새로고침 버튼 클릭 이벤트
refreshRoomListButton.addEventListener('click', () => {
  console.log('[방 목록] 새로고침 버튼 클릭');
  selectedPublicRoomId = null; // 선택 초기화
  socket.emit('getPublicRooms'); // 공개방 목록 다시 요청
});

let selectedPublicRoomId = null;

socket.on('publicRoomsList', (rooms) => {
  publicRoomList.innerHTML = '';
  if (rooms.length === 0) {
    publicRoomList.innerHTML = '<li style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">공개방이 없습니다.</li>';
    return;
  }
  rooms.forEach(room => {
    const li = document.createElement('li');
    li.style.cssText = 'padding: 10px; border-bottom: 1px solid #eee; text-align: left; cursor: pointer; background-color: #f9f9f9;';
    const statusText = room.status === 'playing' ? '게임중' : '대기중';
    const statusColor = room.status === 'playing' ? 'red' : 'green';
    li.innerHTML = `${room.name} (ID: ${room.id.substring(0, 4)}, 인원: ${room.players}/${room.maxPlayers}, 맵: ${room.map}) <span style="color: ${statusColor}; float: right;">${statusText}</span>`;
    li.dataset.roomId = room.id;

    if (room.status === 'playing') {
      li.style.cursor = 'not-allowed';
      li.style.color = '#aaa';
    } else {
      li.addEventListener('click', () => {
        if (selectedPublicRoomId === room.id) {
          selectedPublicRoomId = null;
          li.style.backgroundColor = '#f9f9f9';
        } else {
          const prevSelected = document.querySelector('#publicRoomList li[style*="background-color: #e0e0e0"]');
          if (prevSelected) {
            prevSelected.style.backgroundColor = '#f9f9f9';
          }
          selectedPublicRoomId = room.id;
          li.style.backgroundColor = '#e0e0e0';
        }
      });
    }
    publicRoomList.appendChild(li);
  });
});

popupJoinButton.addEventListener('click', () => {
  let roomIdToJoin = null;
  if (selectedPublicRoomId) {
    roomIdToJoin = selectedPublicRoomId;
  } else {
    roomIdToJoin = privateRoomCodeInput.value.trim();
  }

  if (roomIdToJoin) {
    joinRoomId = roomIdToJoin; // Store room ID for later use
    joinRoomPopup.style.display = 'none'; // Hide join room popup
    characterNicknamePopup.style.display = 'flex'; // Show character and nickname popup
    initializeCharacterSelection(); // Initialize the character selection UI
    selectedPublicRoomId = null; // Reset selected room
  } else {
    alert('공개방을 선택하거나 비밀방 코드를 입력해주세요.');
  }
});

popupCloseButton.addEventListener('click', () => {
  joinRoomPopup.style.display = 'none'; // Hide popup
});

readyButton.addEventListener('click', () => {
  // 닉네임과 캐릭터 정보는 이미 enterWaitingRoomButton에서 서버로 보냈으므로,
  // 여기서는 단순히 '준비' 상태를 서버에 알립니다.
  socket.emit('ready');
});

startGameButton.addEventListener('click', () => {
  if (!startGameButton.disabled) {
    socket.emit('startGameRequest');
  }
});

// Add AI bot to current room
addAIBotButton.addEventListener('click', () => {
  
  addAIBotButton.disabled = true;
  addAIBotButton.textContent = 'AI 추가 중...';
  socket.emit('addBot');
  // 3초 타임아웃으로 복구
  setTimeout(() => {
    addAIBotButton.disabled = false;
    addAIBotButton.textContent = 'AI 생성';
  }, 3000);
});

// 맵 이름을 이미지 파일명으로 변환하는 함수
function getMapImageName(mapId) {
  const mapImageMapping = {
    'map1': 'Map1',
    'map2': 'Map3'  // map2는 Map3.png 사용
  };
  return mapImageMapping[mapId] || 'Map1';
}

socket.on('roomCreated', (roomInfo) => {
  waitingRoomIdDisplay.textContent = `ID: ${roomInfo.id}`;
  waitingRoomTitle.textContent = `${roomInfo.name} (ID: ${roomInfo.id})`;
  waitingRoomIdDisplay.style.display = 'none';
  const mapImageName = getMapImageName(roomInfo.map);
  currentMapImage.src = `./resources/${mapImageName}.png`;
  currentMapImage.style.display = 'block';
  mapPlaceholderText.style.display = 'none';
  isRoomCreator = true; // Set to true for the room creator
  currentRoomMap = roomInfo.map; // 현재 방의 맵 저장
  startGameButton.style.display = 'block'; // Show start game button
  if (addAIBotButton) addAIBotButton.style.display = 'inline-block';
});

socket.on('roomJoined', (roomInfo) => {
  waitingRoomIdDisplay.textContent = `ID: ${roomInfo.id}`;
  waitingRoomTitle.textContent = `${roomInfo.name} (ID: ${roomInfo.id})`;
  waitingRoomIdDisplay.style.display = 'none';
  const mapImageName = getMapImageName(roomInfo.map);
  currentMapImage.src = `./resources/${mapImageName}.png`;
  currentMapImage.style.display = 'block';
  mapPlaceholderText.style.display = 'none';
  isRoomCreator = false;
  currentRoomMap = roomInfo.map; // 현재 방의 맵 저장
  if (addAIBotButton) addAIBotButton.style.display = 'none';
});

socket.on('updatePlayers', (players, maxPlayers) => {
  
  updatePlayers(players, maxPlayers);
  if (isRoomCreator) {
    const allReady = players.every(p => p.ready);
    startGameButton.disabled = !allReady;
  }
  if (addAIBotButton) {
    addAIBotButton.disabled = false;
    addAIBotButton.textContent = 'AI 생성';
  }
});

  socket.on('startGame', async (gameInfo) => {
    console.log('[게임 시작] 맵:', gameInfo.map);
    waitingRoom.style.display = 'none';
    controls.style.display = 'block';
    document.getElementById('gameUiContainer').style.display = 'block';
    const countdownOverlay = document.getElementById('countdownOverlay');
    const gameStartCountdown = document.getElementById('gameStartCountdown');
    countdownOverlay.style.display = 'flex'; // 카운트다운 오버레이 표시
    let count = 3;
    gameStartCountdown.textContent = `잠시 후 게임이 시작됩니다... ${count}`;

    // GameStage1 인스턴스를 생성하고 초기화 완료를 기다림
    const gameStage = new GameStage1(socket, gameInfo.players, gameInfo.map, gameInfo.spawnedWeapons);
    window.currentGame = gameStage; // 모바일 컨트롤에서 접근 가능하도록 전역 변수에 할당
    await gameStage.initialized; // 초기화 완료 대기
    gameStage.player_.SetGameInputEnabled(false); // 플레이어 입력 비활성화

    // 모바일 컨트롤 활성화
    initializeMobileControls();

    const countdownInterval = setInterval(() => {
      count--;
      gameStartCountdown.textContent = `잠시 후 게임이 시작됩니다... ${count}`;
      if (count === 0) {
        clearInterval(countdownInterval);
        countdownOverlay.style.display = 'none'; // 카운트다운 오버레이 숨기기
        gameStage.player_.SetGameInputEnabled(true); // 플레이어 입력 활성화
      }
    }, 1000);
  });

socket.on('updateTimer', (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

socket.on('updateScores', (scores) => {
    console.log('[킬/데스] updateScores 이벤트 수신:', scores);
    const scoreboardBody = document.querySelector('#scoreboardTable tbody');
    scoreboardBody.innerHTML = '';
    scores.forEach(player => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding: 10px;">${player.nickname}</td>
            <td style="padding: 10px;">${player.kills}</td>
            <td style="padding: 10px;">${player.deaths}</td>
        `;
        scoreboardBody.appendChild(row);
    });
});

socket.on('killFeed', (data) => {
    console.log('[킬/데스] killFeed 이벤트 수신:', data);
    const killFeed = document.getElementById('killFeed');
    const killMessage = document.createElement('div');
    killMessage.style.display = 'flex';
    killMessage.style.alignItems = 'center';
    killMessage.style.color = 'white';
    killMessage.style.marginBottom = '5px';

    const attackerCharName = data.attackerCharacter.replace('.glb', '').replace('.gltf', '');
    const victimCharName = data.victimCharacter.replace('.glb', '').replace('.gltf', '');

    killMessage.innerHTML = `
        <img src="./resources/character/${attackerCharName}.png" alt="${data.attackerName}" style="width: 40px; height: 40px; margin-right: 10px; border-radius: 50%;">
        <span style="font-size: 22px;">${data.attackerName}</span>
        <img src="./resources/knife_icon.png" alt="killed" style="width: 40px; height: 40px; margin: 0 10px;">
        <img src="./resources/character/${victimCharName}.png" alt="${data.victimName}" style="width: 40px; height: 40px; margin-right: 10px; border-radius: 50%;">
        <span style="font-size: 22px;">${data.victimName}</span>
    `;

    killFeed.appendChild(killMessage);
    setTimeout(() => {
        killFeed.removeChild(killMessage);
    }, 5000);
});

socket.on('gameEnd', (finalScores) => {
    const gameEndScreen = document.getElementById('gameEndScreen');
    const finalScoreboard = document.getElementById('finalScoreboard');
    const finalScoreboardTable = document.createElement('table');
    finalScoreboardTable.style.color = 'white';
    finalScoreboardTable.style.width = '400px';
    finalScoreboardTable.style.borderCollapse = 'collapse';
    finalScoreboardTable.innerHTML = `
        <thead>
            <tr>
                <th style="padding: 10px; border-bottom: 1px solid white;">Player</th>
                <th style="padding: 10px; border-bottom: 1px solid white;">Kills</th>
                <th style="padding: 10px; border-bottom: 1px solid white;">Deaths</th>
            </tr>
        </thead>
        <tbody>
            ${finalScores.map(player => `
                <tr>
                    <td style="padding: 10px;">${player.nickname}</td>
                    <td style="padding: 10px;">${player.kills}</td>
                    <td style="padding: 10px;">${player.deaths}</td>
                </tr>
            `).join('')}
        </tbody>
    `;
    finalScoreboard.innerHTML = '';
    finalScoreboard.appendChild(finalScoreboardTable);
    gameEndScreen.style.display = 'flex';
    document.getElementById('backToLobbyButton').addEventListener('click', () => {
        window.location.reload();
    });
});

socket.on('roomError', (message) => {
  // show toast only, keep current screen
  const toast = document.createElement('div');
  toast.textContent = `방 오류: ${message}`;
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.background = 'rgba(0,0,0,0.8)';
  toast.style.color = '#fff';
  toast.style.padding = '10px 16px';
  toast.style.borderRadius = '8px';
  toast.style.zIndex = '1000';
  toast.style.fontSize = '16px';
  document.body.appendChild(toast);
  setTimeout(() => {
    if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2500);

  if (addAIBotButton) {
    addAIBotButton.disabled = false;
    addAIBotButton.textContent = 'AI 생성';
  }
});

// 맵 클릭으로 팝업 열기 (방장만)
currentMapImage.addEventListener('click', () => {
  if (!isRoomCreator) {
    const toast = document.createElement('div');
    toast.textContent = '방장만 맵을 변경할 수 있습니다.';
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = 'rgba(255, 0, 0, 0.8)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 16px';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = '1000';
    toast.style.fontSize = '16px';
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2000);
    return;
  }

  // 팝업 열기
  selectedMapInPopup = currentRoomMap; // 현재 맵으로 초기화
  changeMapPopup.style.display = 'flex';

  // 현재 선택된 맵 하이라이트
  mapThumbnailsChange.forEach(thumb => {
    if (thumb.dataset.map === selectedMapInPopup) {
      thumb.style.border = '3px solid #4CAF50';
      thumb.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
    } else {
      thumb.style.border = '3px solid transparent';
      thumb.style.backgroundColor = 'transparent';
    }
  });
});

// 맵 변경 팝업에서 맵 썸네일 클릭
mapThumbnailsChange.forEach(thumbnail => {
  thumbnail.addEventListener('click', () => {
    selectedMapInPopup = thumbnail.dataset.map;

    // 모든 썸네일 스타일 초기화
    mapThumbnailsChange.forEach(thumb => {
      thumb.style.border = '3px solid transparent';
      thumb.style.backgroundColor = 'transparent';
    });

    // 선택된 썸네일 하이라이트
    thumbnail.style.border = '3px solid #4CAF50';
    thumbnail.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
  });
});

// 맵 변경 확인 버튼
changeMapConfirmButton.addEventListener('click', () => {
  if (selectedMapInPopup !== currentRoomMap) {
    currentRoomMap = selectedMapInPopup;

    // 이미지 업데이트
    const mapImageName = getMapImageName(selectedMapInPopup);
    currentMapImage.src = `./resources/${mapImageName}.png`;

    // 서버에 맵 변경 알림
    socket.emit('changeMap', selectedMapInPopup);

    console.log('[맵 변경] 맵이 변경되었습니다:', selectedMapInPopup);
  }

  // 팝업 닫기
  changeMapPopup.style.display = 'none';
});

// 맵 변경 취소 버튼
changeMapCancelButton.addEventListener('click', () => {
  changeMapPopup.style.display = 'none';
});

// 서버로부터 맵 변경 업데이트 받기
socket.on('mapChanged', (newMap) => {
  currentRoomMap = newMap;
  const mapImageName = getMapImageName(newMap);
  currentMapImage.src = `./resources/${mapImageName}.png`;
  console.log('[맵 변경] 서버로부터 맵 업데이트:', newMap);
});

// ============== Mobile Controls ==============

// 모바일 디바이스 감지
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         (window.innerWidth <= 768);
}

// 모바일 컨트롤 초기화
function initializeMobileControls() {
  const mobileControls = document.getElementById('mobileControls');

  if (isMobileDevice()) {
    mobileControls.style.display = 'block';
    console.log('[모바일] 모바일 컨트롤 활성화');
  } else {
    mobileControls.style.display = 'none';
  }
}

// 가상 조이스틱 로직
let joystickActive = false;
let joystickStartX = 0;
let joystickStartY = 0;

const leftJoystickContainer = document.getElementById('leftJoystickContainer');
const leftJoystickStick = document.getElementById('leftJoystickStick');

function handleJoystickStart(e) {
  e.preventDefault();
  joystickActive = true;

  const touch = e.touches ? e.touches[0] : e;
  const rect = leftJoystickContainer.getBoundingClientRect();
  joystickStartX = rect.left + rect.width / 2;
  joystickStartY = rect.top + rect.height / 2;
}

function handleJoystickMove(e) {
  if (!joystickActive) return;
  e.preventDefault();

  const touch = e.touches ? e.touches[0] : e;
  const deltaX = touch.clientX - joystickStartX;
  const deltaY = touch.clientY - joystickStartY;

  const maxDistance = 35;
  const actualDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  const distance = Math.min(maxDistance, actualDistance);
  const angle = Math.atan2(deltaY, deltaX);

  const stickX = Math.cos(angle) * distance;
  const stickY = Math.sin(angle) * distance;

  leftJoystickStick.style.left = `${35 + stickX}px`;
  leftJoystickStick.style.top = `${35 + stickY}px`;

  // 플레이어 이동 입력 시뮬레이션
  if (window.currentGame && window.currentGame.player_) {
    const threshold = 10;
    const runThreshold = 28; // 조이스틱을 끝까지 당기면 뛰기 (80% 이상)

    window.currentGame.player_.keys_.forward = deltaY < -threshold;
    window.currentGame.player_.keys_.backward = deltaY > threshold;
    window.currentGame.player_.keys_.left = deltaX < -threshold;
    window.currentGame.player_.keys_.right = deltaX > threshold;

    // 조이스틱 거리에 따라 shift 키(뛰기) 활성화
    window.currentGame.player_.keys_.shift = actualDistance > runThreshold;
  }
}

function handleJoystickEnd(e) {
  e.preventDefault();
  joystickActive = false;

  leftJoystickStick.style.left = '35px';
  leftJoystickStick.style.top = '35px';

  // 모든 이동 키 해제
  if (window.currentGame && window.currentGame.player_) {
    window.currentGame.player_.keys_.forward = false;
    window.currentGame.player_.keys_.backward = false;
    window.currentGame.player_.keys_.left = false;
    window.currentGame.player_.keys_.right = false;
    window.currentGame.player_.keys_.shift = false;
  }
}

// 조이스틱 이벤트 리스너
leftJoystickContainer.addEventListener('touchstart', handleJoystickStart, { passive: false });
leftJoystickContainer.addEventListener('touchmove', handleJoystickMove, { passive: false });
leftJoystickContainer.addEventListener('touchend', handleJoystickEnd, { passive: false });

// 모바일 버튼 이벤트
const mobileAttackBtn = document.getElementById('mobileAttackBtn');
const mobileJumpBtn = document.getElementById('mobileJumpBtn');
const mobileRollBtn = document.getElementById('mobileRollBtn');
const mobilePickupBtn = document.getElementById('mobilePickupBtn');

mobileAttackBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (window.currentGame && window.currentGame.player_) {
    // J 키 공격 로직 실행
    if (!window.currentGame.player_.isAttacking_ && !window.currentGame.player_.isJumping_ &&
        !window.currentGame.player_.isRolling_ && window.currentGame.player_.attackCooldownTimer_ <= 0) {
      let attackAnimation = 'SwordSlash'; // 기본값
      // 무기 종류에 따라 애니메이션 선택
      if (window.currentGame.player_.currentWeaponModel && window.currentGame.player_.currentWeaponModel.userData.weaponName) {
        const weaponName = window.currentGame.player_.currentWeaponModel.userData.weaponName;

        // 무기별 애니메이션 매칭
        if (/Pistol|Shotgun|SniperRifle|AssaultRifle|Bow/i.test(weaponName)) {
          attackAnimation = 'Shoot_OneHanded';
        } else if (/Sword_big|GreatSword/i.test(weaponName)) {
          attackAnimation = 'GreatSwordAttack';
        } else if (/Axe_Double/i.test(weaponName)) {
          attackAnimation = 'DoubleAxeAttack';
        } else if (/Axe_small|Axe/i.test(weaponName)) {
          attackAnimation = 'HandAxeAttack';
        } else if (/Hammer/i.test(weaponName)) {
          attackAnimation = 'HammerAttack';
        } else if (/Dagger/i.test(weaponName)) {
          attackAnimation = 'DaggerAttack';
        } else if (/Sword/i.test(weaponName)) {
          attackAnimation = 'SwordAttack';
        }
      }
      window.currentGame.player_.PlayAttackAnimation(attackAnimation);
    }
  }
});

mobileJumpBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (window.currentGame && window.currentGame.player_) {
    // K 키 점프 로직 실행
    if (!window.currentGame.player_.isJumping_ && !window.currentGame.player_.isRolling_) {
      window.currentGame.player_.isJumping_ = true;
      window.currentGame.player_.velocityY_ = window.currentGame.player_.jumpPower_;
      window.currentGame.player_.SetAnimation_('Jump');
    }
  }
});

mobileRollBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (window.currentGame && window.currentGame.player_) {
    // L 키 구르기 로직 실행
    if (!window.currentGame.player_.isJumping_ &&
        !window.currentGame.player_.isRolling_ &&
        window.currentGame.player_.animations_['Roll'] &&
        window.currentGame.player_.rollCooldownTimer_ <= 0) {

      // 공격 중 구르기 시 공격 취소 및 투사체 제거
      if (window.currentGame.player_.isAttacking_) {
        window.currentGame.player_.isAttacking_ = false;
        window.currentGame.player_.ClearAttackProjectile_();
        // 진행 중인 공격 애니메이션의 콜백 제거
        if (window.currentGame.player_.onAnimationFinished_) {
          window.currentGame.player_.mixer_.removeEventListener('finished', window.currentGame.player_.onAnimationFinished_);
          window.currentGame.player_.onAnimationFinished_ = null;
        }
        // 현재 애니메이션 액션 정리
        if (window.currentGame.player_.currentAction_) {
          window.currentGame.player_.currentAction_.stop();
        }
      }

      window.currentGame.player_.isRolling_ = true;
      window.currentGame.player_.rollTimer_ = window.currentGame.player_.rollDuration_;
      const moveDir = new THREE.Vector3();
      if (window.currentGame.player_.keys_.forward) moveDir.z -= 1;
      if (window.currentGame.player_.keys_.backward) moveDir.z += 1;
      if (window.currentGame.player_.keys_.left) moveDir.x -= 1;
      if (window.currentGame.player_.keys_.right) moveDir.x += 1;

      if (moveDir.lengthSq() === 0) {
        // 이동 입력이 없으면 캐릭터가 바라보는 방향으로 구르기
        window.currentGame.player_.mesh_.getWorldDirection(moveDir);
        moveDir.y = 0;
        moveDir.normalize();
      } else {
        // 이동 입력이 있으면 카메라 방향을 고려하여 구르기
        moveDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), window.currentGame.player_.lastRotationAngle_ || 0);
      }
      window.currentGame.player_.rollDirection_.copy(moveDir);
      window.currentGame.player_.SetAnimation_('Roll');
      window.currentGame.player_.rollCooldownTimer_ = window.currentGame.player_.rollCooldown_;
    }
  }
});

mobilePickupBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  // E 키 픽업 로직 (main.js의 keydown 이벤트와 동일한 로직)
  if (window.currentGame && window.currentGame.player_ && window.currentGame.player_.mesh_) {
    const playerPosition = window.currentGame.player_.mesh_.position;
    let pickedUp = false;
    for (let i = 0; i < window.currentGame.spawnedWeaponObjects.length; i++) {
      const weapon = window.currentGame.spawnedWeaponObjects[i];
      if (weapon.model_) {
        const distance = playerPosition.distanceTo(weapon.model_.position);
        if (distance < 2.0) {
          window.currentGame.scene.remove(weapon.model_);
          window.currentGame.spawnedWeaponObjects.splice(i, 1);
          socket.emit('weaponPickedUp', weapon.uuid);
          window.currentGame.player_.EquipWeapon(weapon.weaponName);
          socket.emit('weaponEquipped', weapon.weaponName);
          pickedUp = true;

          const newWeaponName = getRandomWeaponName();
          if (newWeaponName) {
            const newSpawnPosition = window.currentGame.getRandomWeaponSpawnPosition();
            const newWeaponUuid = THREE.MathUtils.generateUUID();
            const newWeapon = spawnWeaponOnMap(window.currentGame.scene, newWeaponName, newSpawnPosition.x, newSpawnPosition.y, newSpawnPosition.z, newWeaponUuid);
            window.currentGame.spawnedWeaponObjects.push(newWeapon);
            socket.emit('weaponSpawned', {
              weaponName: newWeaponName,
              x: newSpawnPosition.x,
              y: newSpawnPosition.y,
              z: newSpawnPosition.z,
              uuid: newWeaponUuid
            });
          }
          break;
        }
      }
    }
  }
});

// 창 크기 변경 시 모바일 컨트롤 재초기화
window.addEventListener('resize', () => {
  initializeMobileControls();
});

console.log('[모바일] Mobile controls initialized');
