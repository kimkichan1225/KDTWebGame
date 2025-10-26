import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124/examples/jsm/loaders/FBXLoader.js';
import { AttackSystem } from './attackSystem.js';

// 무기 데이터를 저장할 변수
let WEAPON_DATA = {};

// 무기 데이터 로드 함수
async function loadWeaponData() {
  try {
    const response = await fetch('./resources/data/weapon_data.json');
    WEAPON_DATA = await response.json();
    console.log('무기 데이터 로드 완료:', Object.keys(WEAPON_DATA).length, '개');
  } catch (error) {
    console.error('무기 데이터 로드 실패:', error);
  }
}

// 무기 클래스
class Weapon {
  constructor(scene, weaponName, position) {
    this.uuid = THREE.MathUtils.generateUUID();
    this.scene = scene;
    this.weaponName = weaponName;
    this.model = null;
    this.position = position.clone();

    this.LoadModel(weaponName, position);
  }

  LoadModel(weaponName, position) {
    const loader = new FBXLoader();
    loader.setPath('./resources/weapon/FBX/');

    loader.load(weaponName, (fbx) => {
      this.model = fbx;

      // 스케일 조정
      if (/AssaultRifle|Pistol|Shotgun|SniperRifle|SubmachineGun/i.test(weaponName)) {
        this.model.scale.setScalar(0.005);
      } else {
        this.model.scale.setScalar(0.01);
      }

      this.model.position.copy(position);

      // Y축 회전 애니메이션을 위한 초기 회전값
      this.model.userData.rotationY = 0;

      this.model.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });

      this.scene.add(this.model);
    }, undefined, (error) => {
      console.error('무기 로드 실패:', weaponName, error);
    });
  }

  update(delta) {
    if (this.model) {
      // 무기가 맵에 떨어져 있을 때 회전 애니메이션
      this.model.userData.rotationY += delta * 2;
      this.model.rotation.y = this.model.userData.rotationY;
    }
  }

  destroy() {
    if (this.model) {
      this.scene.remove(this.model);
      this.model = null;
    }
  }
}

// 더미 타겟 클래스 (테스트용 NPC)
class DummyTarget {
  constructor(scene, position) {
    this.scene = scene;
    this.hp = 100;
    this.maxHp = 100;
    this.isDead_ = false;

    // 간단한 박스 메시 생성
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    this.mesh_ = new THREE.Mesh(geometry, material);
    this.mesh_.position.copy(position);
    this.mesh_.castShadow = true;
    this.mesh_.receiveShadow = true;
    this.scene.add(this.mesh_);

    // HP 바 생성
    this.hpBarBg = this.createHPBar(0x000000, 1.2);
    this.hpBarFill = this.createHPBar(0xff0000, 1.0);
    this.updateHPBar();
  }

  createHPBar(color, width) {
    const barGeometry = new THREE.PlaneGeometry(width, 0.1);
    const barMaterial = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide });
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    bar.position.set(this.mesh_.position.x, this.mesh_.position.y + 1.5, this.mesh_.position.z);
    this.scene.add(bar);
    return bar;
  }

  updateHPBar() {
    const hpPercent = this.hp / this.maxHp;
    this.hpBarFill.scale.x = hpPercent;
    this.hpBarFill.position.x = this.mesh_.position.x - (1.0 * (1 - hpPercent)) / 2;

    // HP 바 색상 변경
    if (hpPercent > 0.5) {
      this.hpBarFill.material.color.setHex(0x00ff00);
    } else if (hpPercent > 0.25) {
      this.hpBarFill.material.color.setHex(0xffff00);
    } else {
      this.hpBarFill.material.color.setHex(0xff0000);
    }
  }

  TakeDamage(damage) {
    if (this.isDead_) return;

    this.hp -= damage;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDead_ = true;
      this.mesh_.material.color.setHex(0x666666);

      // 3초 후 리스폰
      setTimeout(() => {
        this.hp = this.maxHp;
        this.isDead_ = false;
        this.mesh_.material.color.setHex(0xff0000);
        this.updateHPBar();
      }, 3000);
    }

    this.updateHPBar();
    console.log(`더미 타겟이 ${damage} 데미지를 받았습니다! (현재 HP: ${this.hp})`);
  }

  destroy() {
    this.scene.remove(this.mesh_);
    this.scene.remove(this.hpBarBg);
    this.scene.remove(this.hpBarFill);
  }
}

// 테스트 게임 클래스
class TestGame {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    this.character = null;
    this.mixer = null;
    this.animations = {};
    this.currentAnimation = null;
    this.currentAnimationName = 'Idle';

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      shift: false
    };

    // 이동 관련
    this.speed = 5;
    this.runSpeed = 10;
    this.jumpPower = 12;
    this.gravity = -30;
    this.velocityY = 0;
    this.isOnGround = true;

    // 카메라 관련
    this.cameraOffset = new THREE.Vector3(0, 15, 10);
    this.cameraRotation = 4.715; // 270도 (4.71239 radians)

    // 공격 관련
    this.isAttacking = false;
    this.attackCooldown = 0.5;
    this.attackCooldownTimer = 0;

    // 대쉬(Roll) 관련
    this.isRolling = false;
    this.rollDuration = 0.5;
    this.rollTimer = 0;
    this.rollSpeed = 18;
    this.rollDirection = new THREE.Vector3(0, 0, 0);
    this.rollCooldown = 1.0;
    this.rollCooldownTimer = 0;

    // 부드러운 회전을 위한 변수
    this.lastRotationAngle = this.cameraRotation;

    // HP 관련
    this.hp = 100;
    this.maxHp = 100;

    // 무기 관련
    this.weapons = []; // 맵에 떨어진 무기들
    this.equippedWeapon = null; // 장착된 무기 데이터
    this.equippedWeaponModel = null; // 장착된 무기 모델
    this.weaponBone = null; // 무기를 부착할 본

    // 공격 시스템
    this.attackSystem = null;
    this.dummyTargets = []; // 테스트용 더미 타겟들
    this.originalWeaponRotation = null; // 무기 원래 회전 값 저장
    this.onAnimationFinished = null; // 애니메이션 종료 콜백
    this.currentAttackProjectile = null; // 현재 공격으로 생성된 투사체

    this.clock = new THREE.Clock();

    this.Initialize();
  }

  async Initialize() {
    // 무기 데이터 로드
    await loadWeaponData();

    // Renderer 설정
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.gammaFactor = 2.2;
    document.getElementById('container').appendChild(this.renderer.domElement);

    // Scene 생성
    this.scene = new THREE.Scene();

    // Camera 설정
    const fov = 60;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 1.0;
    const far = 2000.0;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    // 조명 설정
    this.SetupLighting();

    // Sky 및 Fog 설정
    this.SetupSkyAndFog();

    // Ground 생성
    this.CreateGround();

    // 공격 시스템 초기화
    this.attackSystem = new AttackSystem(this.scene);

    // 캐릭터 로드
    await this.LoadCharacter();

    // 무기 스폰
    this.SpawnWeapons(10);

    // 테스트용 더미 타겟 생성 (플레이어 주변에 3개)
    this.dummyTargets.push(new DummyTarget(this.scene, new THREE.Vector3(5, 0, 0)));
    this.dummyTargets.push(new DummyTarget(this.scene, new THREE.Vector3(-5, 0, 0)));
    this.dummyTargets.push(new DummyTarget(this.scene, new THREE.Vector3(0, 0, 5)));

    // 이벤트 리스너
    window.addEventListener('resize', () => this.OnWindowResize(), false);
    document.addEventListener('keydown', (e) => this.OnKeyDown(e), false);
    document.addEventListener('keyup', (e) => this.OnKeyUp(e), false);

    // 게임 루프 시작
    this.Animate();
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
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }`,
      side: THREE.BackSide
    });

    const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(skyMesh);

    this.scene.fog = new THREE.FogExp2(0x89b2eb, 0.002);
  }

  CreateGround() {
    const groundGeometry = new THREE.PlaneGeometry(80, 80, 10, 10);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x3d8b3d });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  async LoadCharacter() {
    // Cow.glb 캐릭터 사용
    const glbPath = './resources/New Character/Cow.glb';

    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        glbPath,
        (gltf) => {
          this.character = gltf.scene;
          this.character.scale.setScalar(1);
          this.character.position.set(0, 0, 0);

          // 그림자 설정
          this.character.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              if (child.isSkinnedMesh && child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(mat => mat.skinning = true);
                } else {
                  child.material.skinning = true;
                }
              }
            }

            // 무기 부착 본 찾기 (FistR)
            if (child.isBone && child.name === 'FistR') {
              this.weaponBone = child;
              console.log('FistR 본 찾음!');
            }
          });

          this.scene.add(this.character);

          // 애니메이션 설정
          this.mixer = new THREE.AnimationMixer(this.character);

          if (gltf.animations && gltf.animations.length > 0) {
            for (const clip of gltf.animations) {
              this.animations[clip.name] = this.mixer.clipAction(clip);
            }

            console.log('=== 사용 가능한 애니메이션 목록 ===');
            console.log(`총 ${Object.keys(this.animations).length}개의 애니메이션`);
            Object.keys(this.animations).forEach((name, index) => {
              console.log(`${index + 1}. ${name}`);
            });
            console.log('================================');

            // 기본 Idle 애니메이션 재생
            this.SetAnimation('Idle');
          }

          // 카메라 초기 위치 설정
          this.UpdateCamera();

          console.log('캐릭터 로드 완료: Cow.glb');
          resolve();
        },
        undefined,
        (error) => {
          console.error('캐릭터 로드 실패:', error);
          reject(error);
        }
      );
    });
  }

  SetAnimation(name) {
    // 애니메이션 이름 검색
    let animationName = this.FindAnimation([name]);

    if (!animationName || this.currentAnimationName === animationName) {
      return;
    }

    // 공격 애니메이션 목록
    const attackAnimations = ['SwordAttack', 'GreatSwordAttack', 'DaggerAttack', 'DoubleAxeAttack',
                              'HammerAttack', 'HandAxeAttack', 'Shoot_OneHanded', 'Punch', 'SwordSlash'];

    // 현재 공격 애니메이션이고, 새 애니메이션이 공격 애니메이션이 아니면 투사체 제거
    const isCurrentAttack = attackAnimations.some(anim => this.currentAnimationName.includes(anim));
    const isNewAttack = attackAnimations.some(anim => animationName.includes(anim));

    if (isCurrentAttack && !isNewAttack) {
      this.ClearAttackProjectile();
    }

    this.currentAnimationName = animationName;

    // 이전 애니메이션 페이드 아웃
    if (this.currentAnimation) {
      this.currentAnimation.fadeOut(0.3);
    }

    // 새 애니메이션 재생
    const newAction = this.animations[animationName];
    if (newAction) {
      this.currentAnimation = newAction;
      this.currentAnimation.reset().fadeIn(0.3).play();

      // 특정 애니메이션 설정
      if (name === 'Jump') {
        this.currentAnimation.setLoop(THREE.LoopOnce);
        this.currentAnimation.clampWhenFinished = true;
        this.currentAnimation.time = 0.25;
        this.currentAnimation.timeScale = 0.5;
      } else if (name === 'Roll') {
        this.currentAnimation.setLoop(THREE.LoopOnce);
        this.currentAnimation.clampWhenFinished = true;
        this.currentAnimation.time = 0.0;
        this.currentAnimation.timeScale = 1.2;
      } else if (name.includes('Attack') || name.includes('Punch') || name.includes('Slash')) {
        this.currentAnimation.setLoop(THREE.LoopOnce);
        this.currentAnimation.clampWhenFinished = true;
        this.currentAnimation.timeScale = 1.5;

        // 공격 애니메이션이 끝나면 Idle로 돌아가기
        const onFinished = () => {
          this.isAttacking = false;
          this.currentAnimation.getMixer().removeEventListener('finished', onFinished);
          this.SetAnimation('Idle');
        };
        this.currentAnimation.getMixer().addEventListener('finished', onFinished);
      } else {
        this.currentAnimation.timeScale = 1.0;
      }
    }
  }

  FindAnimation(keywords) {
    const animNames = Object.keys(this.animations);
    for (const keyword of keywords) {
      // 정확한 매칭
      const found = animNames.find(name => {
        const parts = name.split('|');
        const lastPart = parts[parts.length - 1];
        return lastPart.toLowerCase() === keyword.toLowerCase();
      });
      if (found) return found;

      // 부분 매칭
      const fallback = animNames.find(name =>
        name.toLowerCase().includes(keyword.toLowerCase())
      );
      if (fallback) return fallback;
    }
    return null;
  }

  SpawnWeapons(count) {
    // 다양한 무기 스폰 (각 무기 타입별 애니메이션 테스트용)
    const testWeapons = [
      'Sword_big.fbx',        // GreatSwordAttack
      'Sword_big_Golden.fbx', // GreatSwordAttack
      'Sword.fbx',            // SwordAttack
      'Dagger.fbx',           // DaggerAttack
      'Axe_Double.fbx',       // DoubleAxeAttack
      'Hammer_Double.fbx',    // HammerAttack
      'Axe_small_Golden.fbx', // HandAxeAttack (Axe_small.fbx는 weapon_data.json에 없음)
      'Bow_Wooden.fbx',       // Shoot_OneHanded
    ];

    for (let i = 0; i < count; i++) {
      const weaponName = testWeapons[i % testWeapons.length];
      const x = Math.random() * 60 - 30;
      const z = Math.random() * 60 - 30;
      const position = new THREE.Vector3(x, 1, z);

      const weapon = new Weapon(this.scene, weaponName, position);
      this.weapons.push(weapon);
    }

    console.log('다양한 무기 스폰 완료:', count, '개');
  }

  PickupWeapon() {
    if (!this.character) return;

    const playerPos = this.character.position;
    const pickupRange = 2.0; // 인게임과 동일한 거리

    // 가장 가까운 무기 찾기
    let nearestWeapon = null;
    let nearestDistance = pickupRange;

    for (const weapon of this.weapons) {
      if (weapon.model) {
        const distance = playerPos.distanceTo(weapon.model.position);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestWeapon = weapon;
        }
      }
    }

    if (nearestWeapon) {
      // 무기 장착 (이전 무기는 UnequipWeapon에서 처리)
      this.EquipWeapon(nearestWeapon);

      // 맵에서 제거
      this.weapons = this.weapons.filter(w => w !== nearestWeapon);
      nearestWeapon.destroy();

      console.log('무기 획득:', nearestWeapon.weaponName);
    }
  }

  EquipWeapon(weapon) {
    if (!this.weaponBone) {
      console.error('FistR 본을 찾을 수 없습니다.');
      return;
    }

    const weaponName = weapon.weaponName;

    // 이미 같은 무기를 들고 있으면 리턴
    if (this.equippedWeaponModel && this.equippedWeaponModel.userData.weaponName === weaponName) {
      console.log('이미 같은 무기를 들고 있습니다:', weaponName);
      return;
    }

    const weaponData = WEAPON_DATA[weaponName];
    if (!weaponData) {
      console.error('무기 데이터를 찾을 수 없습니다:', weaponName);
      return;
    }
    this.equippedWeapon = weaponData;

    // 무기 모델 로드
    const loader = new FBXLoader();
    loader.setPath('./resources/weapon/FBX/');

    loader.load(weaponName, (fbx) => {
      // 새로운 무기가 로드되기 직전에 이전 무기를 확실히 제거
      this.UnequipWeapon();

      const weaponModel = fbx;

      // 스케일 조정 (인게임과 동일)
      if (/AssaultRifle|Pistol|Shotgun|SniperRifle|SubmachineGun/i.test(weaponName)) {
        weaponModel.scale.setScalar(0.005);
      } else {
        weaponModel.scale.setScalar(0.01);
      }

      // 무기 위치 및 회전 조정 (인게임과 동일)
      weaponModel.position.set(0, 0, 0); // 뼈대 기준으로 위치 조정

      // 근접 무기인 경우 Y축으로 90도 회전
      if (/Sword|Axe|Dagger|Hammer/i.test(weaponName)) {
        weaponModel.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      } else if (/Bow/i.test(weaponName)) { // 활인 경우 X축으로 -90도 회전
        weaponModel.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
      } else if (/AssaultRifle|Pistol|Shotgun|SniperRifle/i.test(weaponName)) { // 나머지 원거리 무기
        weaponModel.rotation.set(Math.PI / 2, Math.PI / 2, 0);
      } else {
        weaponModel.rotation.set(0, 0, 0); // 뼈대 기준으로 회전 조정
      }

      this.weaponBone.add(weaponModel);
      this.equippedWeaponModel = weaponModel;
      this.equippedWeaponModel.userData.weaponName = weaponName; // 무기 이름 저장

      // UI 업데이트
      this.UpdateWeaponUI();
    }, undefined, (error) => {
      console.error('무기 로드 실패:', weaponName, error);
    });
  }

  UnequipWeapon() {
    if (this.equippedWeaponModel) {
      this.weaponBone.remove(this.equippedWeaponModel);
      this.equippedWeaponModel = null;
    }
  }

  DropWeapon() {
    if (!this.equippedWeapon || !this.character) return;

    // 현재 위치 앞에 무기 드롭
    const dropPosition = this.character.position.clone();
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(this.character.quaternion);
    dropPosition.add(forward.multiplyScalar(2));
    dropPosition.y = 1;

    // 무기 객체 생성하여 맵에 추가
    const weaponName = this.equippedWeaponModel ? this.equippedWeaponModel.userData.weaponName : null;

    if (weaponName) {
      const weapon = new Weapon(this.scene, weaponName, dropPosition);
      this.weapons.push(weapon);
    }

    // 장착된 무기 제거
    this.UnequipWeapon();
    this.equippedWeapon = null;

    // UI 업데이트
    this.UpdateWeaponUI();

    console.log('무기 버림:', weaponName);
  }

  ClearAttackProjectile() {
    // 현재 공격으로 생성된 투사체 제거
    if (this.currentAttackProjectile && !this.currentAttackProjectile.isDestroyed) {
      this.currentAttackProjectile.destroy();
      console.log('공격 애니메이션 중단으로 투사체 제거');
    }
    this.currentAttackProjectile = null;
  }

  PlayAttackAnimation(animationName) {
    if (this.isAttacking) return; // 이미 공격 중이면 무시

    this.isAttacking = true;
    this.attackCooldownTimer = this.attackCooldown;
    this.SetAnimation(animationName);

    // 애니메이션 종료 시점 처리
    const action = this.animations[animationName];
    if (action) {
      action.reset();
      action.setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      action.play();

      // 공격 판정 발생 시점 (애니메이션에 따라 조절 필요)
      if (this.attackSystem) {
        let actualAttackDelay = 0.2; // 기본값 (원거리)
        if (this.equippedWeapon && this.equippedWeapon.type === 'melee') {
          actualAttackDelay = 0.4; // 근접 무기
        } else if (!this.equippedWeapon) { // 맨손 공격
          actualAttackDelay = 0.4;
        }

        setTimeout(() => {
          if (!this.isAttacking) return; // 공격이 취소되었으면 실행하지 않음

          let weapon = this.equippedWeapon; // 현재 장착된 무기 데이터
          if (!weapon) { // 무기가 장착되지 않았을 경우 weapon_data.json에서 맨손 데이터 로드
            weapon = WEAPON_DATA['Fist'];
          }

          // 공격 위치를 항상 플레이어의 중앙으로 설정
          const attackPosition = new THREE.Vector3();
          this.character.getWorldPosition(attackPosition);
          attackPosition.y += 1.5; // 캐릭터의 가슴 높이 정도로 조정

          // 공격 방향 계산 (플레이어의 현재 바라보는 방향)
          const attackDirection = new THREE.Vector3();
          this.character.getWorldDirection(attackDirection);
          attackDirection.negate(); // 모델의 Z축이 반대 방향이므로 뒤집음
          attackDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // Y축 기준으로 180도 회전

          // 모든 무기 타입을 circle(구체)로 통일
          const projectile = this.attackSystem.spawnMeleeProjectile({
            position: attackPosition,
            direction: attackDirection,
            weapon: weapon,
            attacker: this,
            type: 'circle', // 근거리/원거리 모두 구체 사용
            radius: weapon.radius || weapon.projectileSize,
            speed: weapon.projectileSpeed,
            onHit: (target) => {
              console.log('타겟 히트!', weapon.damage, '데미지');
            }
          });

          // 생성된 투사체 저장
          this.currentAttackProjectile = projectile;

          console.log(`공격 발사! 타입: ${weapon.type}, 데미지: ${weapon.damage}`);
        }, actualAttackDelay * 1000);
      }

      // 근접 무기 애니메이션 시작 시 무기 회전 초기화
      const meleeAttacks = ['SwordAttack', 'GreatSwordAttack', 'DaggerAttack', 'DoubleAxeAttack', 'HammerAttack', 'HandAxeAttack', 'SwordSlash'];
      if (meleeAttacks.includes(animationName) && this.equippedWeaponModel) {
        const weaponName = this.equippedWeaponModel.userData.weaponName;
        if (/Sword|Axe|Dagger|Hammer/i.test(weaponName)) {
          this.originalWeaponRotation = this.equippedWeaponModel.rotation.clone();
          this.equippedWeaponModel.rotation.set(0, 0, 0);
        }
      }

      // 기존 리스너가 있다면 제거
      if (this.onAnimationFinished) {
        this.mixer.removeEventListener('finished', this.onAnimationFinished);
      }

      // 새로운 리스너 추가
      this.onAnimationFinished = (e) => {
        if (e.action === action) {
          this.isAttacking = false;

          // 투사체 참조 정리 (이미 자동으로 제거되었거나 타겟에 맞았을 경우)
          this.currentAttackProjectile = null;

          // 공격 애니메이션이 끝나면 Idle 또는 이동 애니메이션으로 전환
          const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
          const isRunning = isMoving && this.keys.shift;
          this.SetAnimation(isMoving ? (isRunning ? 'Run' : 'Walk') : 'Idle');

          // 근접 무기 애니메이션 종료 시 무기 회전 복원
          const meleeAttacks = ['SwordAttack', 'GreatSwordAttack', 'DaggerAttack', 'DoubleAxeAttack', 'HammerAttack', 'HandAxeAttack', 'SwordSlash'];
          if (meleeAttacks.includes(animationName) && this.equippedWeaponModel && this.originalWeaponRotation) {
            this.equippedWeaponModel.rotation.copy(this.originalWeaponRotation);
            this.originalWeaponRotation = null; // 초기화
          }
          this.mixer.removeEventListener('finished', this.onAnimationFinished);
          this.onAnimationFinished = null;
        }
      };
      this.mixer.addEventListener('finished', this.onAnimationFinished);
    }
  }

  OnKeyDown(event) {
    switch (event.code) {
      case 'KeyW':
        this.keys.forward = true;
        break;
      case 'KeyS':
        this.keys.backward = true;
        break;
      case 'KeyA':
        this.keys.left = true;
        break;
      case 'KeyD':
        this.keys.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.shift = true;
        break;
      case 'KeyK': // 점프
        if (this.isOnGround && !this.isRolling && !this.isAttacking) {
          this.velocityY = this.jumpPower;
          this.isOnGround = false;
          this.SetAnimation('Jump');
        }
        break;
      case 'KeyL': // 대쉬
        if (!this.isOnGround || this.isRolling || this.rollCooldownTimer > 0) break;

        // 공격 중 구르기 시 공격 취소 및 투사체 제거
        if (this.isAttacking) {
          this.isAttacking = false;
          this.ClearAttackProjectile();
        }

        this.isRolling = true;
        this.rollTimer = this.rollDuration;

        // 대쉬 방향 계산
        const moveDir = new THREE.Vector3();
        if (this.keys.forward) moveDir.z -= 1;
        if (this.keys.backward) moveDir.z += 1;
        if (this.keys.left) moveDir.x -= 1;
        if (this.keys.right) moveDir.x += 1;

        if (moveDir.length() > 0) {
          moveDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lastRotationAngle || 0);
        } else {
          // 방향키 입력이 없으면 현재 바라보는 방향으로 대쉬
          moveDir.set(0, 0, -1);
          moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.character.rotation.y);
        }

        this.rollDirection.copy(moveDir);
        this.SetAnimation('Roll');
        this.rollCooldownTimer = this.rollCooldown;
        break;
      case 'KeyJ': // 공격
        if (!this.isAttacking && this.isOnGround && !this.isRolling && this.attackCooldownTimer <= 0) {
          let attackAnimation = 'Punch'; // 기본값 (맨손)

          // 무기 종류에 따라 애니메이션 선택
          if (this.equippedWeaponModel && this.equippedWeaponModel.userData.weaponName) {
            const weaponName = this.equippedWeaponModel.userData.weaponName;

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

          this.PlayAttackAnimation(attackAnimation);
        }
        break;
      case 'KeyE': // 무기 획득
        this.PickupWeapon();
        break;
      case 'KeyQ': // 무기 버리기
        this.DropWeapon();
        break;
    }
  }

  OnKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
        this.keys.forward = false;
        break;
      case 'KeyS':
        this.keys.backward = false;
        break;
      case 'KeyA':
        this.keys.left = false;
        break;
      case 'KeyD':
        this.keys.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.shift = false;
        break;
    }
  }

  UpdateCamera() {
    if (!this.character) return;

    const target = this.character.position.clone();
    const offset = this.cameraOffset.clone();
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotation);
    const cameraPos = target.clone().add(offset);

    this.camera.position.copy(cameraPos);

    const headOffset = new THREE.Vector3(0, 2, 0);
    const headPosition = target.clone().add(headOffset);
    this.camera.lookAt(headPosition);
  }

  Update(deltaTime) {
    if (!this.character) return;

    // 쿨다운 타이머 업데이트
    if (this.attackCooldownTimer > 0) {
      this.attackCooldownTimer -= deltaTime;
    }
    if (this.rollCooldownTimer > 0) {
      this.rollCooldownTimer -= deltaTime;
    }

    this.lastRotationAngle = this.cameraRotation;

    // 이동 방향 계산 (카메라 회전 고려)
    let velocity = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    // 공격 중에는 이동 및 회전 불가
    if (!this.isAttacking) {
      if (this.keys.forward) velocity.add(forward);
      if (this.keys.backward) velocity.sub(forward);
      if (this.keys.left) velocity.sub(right);
      if (this.keys.right) velocity.add(right);
      velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraRotation);

      // 부드러운 회전 처리
      if (velocity.length() > 0.01) {
        const angle = Math.atan2(velocity.x, velocity.z);
        const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0), angle
        );
        this.character.quaternion.slerp(targetQuaternion, 0.3);
      }
    }

    // 대쉬 중일 때
    if (this.isRolling) {
      this.rollTimer -= deltaTime;
      const rollMove = this.rollDirection.clone().multiplyScalar(this.rollSpeed * deltaTime);

      this.character.position.x += rollMove.x;
      this.character.position.z += rollMove.z;

      // 중력 적용
      this.velocityY += this.gravity * deltaTime;
      this.character.position.y += this.velocityY * deltaTime;

      // 바닥 체크
      if (this.character.position.y <= 0) {
        this.character.position.y = 0;
        this.velocityY = 0;
        this.isOnGround = true;
      }

      // 대쉬 종료
      if (this.rollTimer <= 0) {
        this.isRolling = false;
        const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
        const isRunning = isMoving && this.keys.shift;
        this.SetAnimation(isMoving ? (isRunning ? 'Run' : 'Walk') : 'Idle');
      }
    } else {
      // 일반 이동
      const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;
      const isRunning = this.keys.shift && isMoving;

      if (isMoving && this.isOnGround && !this.isAttacking) {
        if (isRunning) {
          this.SetAnimation('Run');
        } else {
          this.SetAnimation('Walk');
        }
      } else if (this.isOnGround && !isMoving && !this.isAttacking) {
        this.SetAnimation('Idle');
      }

      // 공격 중이 아닐 때만 이동 적용
      if (!this.isAttacking) {
        let moveSpeed = isRunning ? this.runSpeed : this.speed;
        velocity.normalize().multiplyScalar(moveSpeed * deltaTime);

        this.character.position.x += velocity.x;
        this.character.position.z += velocity.z;
      }

      // 중력 적용
      this.velocityY += this.gravity * deltaTime;
      this.character.position.y += this.velocityY * deltaTime;

      // 바닥 체크
      if (this.character.position.y <= 0) {
        this.character.position.y = 0;
        this.isOnGround = true;
        this.velocityY = 0;
      }
    }

    // 무기 회전 애니메이션
    for (const weapon of this.weapons) {
      weapon.update(deltaTime);
    }

    // 공격 시스템 업데이트 (투사체 이동 및 충돌 검사)
    if (this.attackSystem) {
      this.attackSystem.update(deltaTime, [], this.dummyTargets);
    }

    // 카메라 업데이트
    this.UpdateCamera();

    // 애니메이션 업데이트
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }

    // HP UI 업데이트
    this.UpdateHPUI();
  }

  UpdateHPUI() {
    const hpFill = document.getElementById('hp-fill');
    const hpText = document.getElementById('hp-text');

    if (hpFill && hpText) {
      const hpPercent = (this.hp / this.maxHp) * 100;
      hpFill.style.width = hpPercent + '%';
      hpText.textContent = `HP: ${this.hp} / ${this.maxHp}`;
    }
  }

  UpdateWeaponUI() {
    const weaponNameEl = document.getElementById('weapon-name');
    const weaponDamageEl = document.getElementById('weapon-damage');
    const weaponSpeedEl = document.getElementById('weapon-speed');
    const weaponRangeEl = document.getElementById('weapon-range');

    if (this.equippedWeapon) {
      const weapon = this.equippedWeapon;

      // 무기 이름 (파일명에서 .fbx 제거)
      const weaponNames = Object.keys(WEAPON_DATA);
      const weaponFileName = weaponNames.find(name => WEAPON_DATA[name] === weapon) || '';
      const displayName = weaponFileName.replace('.fbx', '').replace(/_/g, ' ');

      weaponNameEl.textContent = displayName;
      // tier가 없으면 기본값 'common' 사용
      weaponNameEl.className = `tier-${(weapon.tier || 'common').toLowerCase()}`;

      weaponDamageEl.textContent = `데미지: ${weapon.damage || 0}`;
      weaponSpeedEl.textContent = `공격 속도: ${weapon.attackSpeed ? weapon.attackSpeed.toFixed(2) : '-'}초`;
      weaponRangeEl.textContent = `사거리: ${weapon.range || weapon.radius || '-'}`;
    } else {
      weaponNameEl.textContent = '없음';
      weaponNameEl.className = '';
      weaponDamageEl.textContent = '데미지: -';
      weaponSpeedEl.textContent = '공격 속도: -';
      weaponRangeEl.textContent = '사거리: -';
    }
  }

  OnWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  Animate() {
    requestAnimationFrame(() => this.Animate());

    const deltaTime = this.clock.getDelta();
    this.Update(deltaTime);

    this.renderer.render(this.scene, this.camera);
  }
}

// 게임 시작
const game = new TestGame();
