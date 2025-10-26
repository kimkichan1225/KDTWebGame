import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124/examples/jsm/loaders/FBXLoader.js';
import { WEAPON_DATA } from './weapon.js';

export const player = (() => {
  class Player {
    constructor(params) {
      this.position_ = new THREE.Vector3(0, 0, 0);
      this.velocity_ = new THREE.Vector3(0, 0, 0);
      this.speed_ = 5;
      this.params_ = params;
      this.nickname_ = params.nickname; // 닉네임 추가
      this.socket_ = params.socket; // socket 인스턴스 추가
      this.mesh_ = null;
      this.mixer_ = null;
      this.animations_ = {};
      this.currentAction_ = null;
      this.currentAnimationName_ = 'Idle';
      this.keys_ = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        shift: false,
        debug: false,
      };
      this.jumpPower_ = 12;
      this.gravity_ = -30;
      this.isJumping_ = false;
      this.velocityY_ = 0;
      this.jumpSpeed_ = 0.5;
      this.maxStepHeight_ = 0.5;
      this.boundingBox_ = new THREE.Box3();
      this.boundingBoxHelper_ = null;
      this.isRolling_ = false;
      this.rollDuration_ = 0.5;
      this.rollTimer_ = 0;
      this.rollSpeed_ = 18;
      this.rollDirection_ = new THREE.Vector3(0, 0, 0);
      this.rollCooldown_ = 1.0;
      this.rollCooldownTimer_ = 0;

      this.isAttacking_ = false; // 공격 애니메이션 재생 여부
      this.attackCooldown_ = 0.5; // 공격 쿨다운 (초)
      this.attackCooldownTimer_ = 0; // 공격 쿨다운 타이머

      this.hp_ = 100; // HP 속성 추가
      this.hpUI = params.hpUI || null; // HPUI 인스턴스 받기
      this.isDead_ = false; // 죽음 상태 플래그 추가
      this.respawnDelay_ = 3; // 리스폰 딜레이 (초) 5초에서 4초로 변경
      this.respawnTimer_ = 0; // 리스폰 타이머
      this.currentWeaponModel = null; // 현재 장착된 무기 모델
      this.equippedWeaponData_ = null; // 현재 장착된 무기 데이터
      this.originalWeaponRotation_ = null; // 무기 원래 회전 값 저장
      this.onAnimationFinished_ = null; // 애니메이션 종료 시 실행될 콜백
      this.attackSystem_ = params.attackSystem; // AttackSystem 인스턴스
      this.currentAttackProjectile_ = null; // 현재 공격으로 생성된 투사체

      this.LoadModel_(params.character);
      if (!params.isRemote) {
        // 사망 오버레이 (상단: "또 죽었어?", 중앙: 카운트다운)
        this.overlay = document.createElement('div');
        this.overlay.style.position = 'fixed';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.width = '100vw';
        this.overlay.style.height = '100vh';
        this.overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.overlay.style.zIndex = '999';
        this.overlay.style.display = 'flex';
        this.overlay.style.flexDirection = 'column';
        this.overlay.style.justifyContent = 'center';
        this.overlay.style.alignItems = 'center';
        this.overlay.style.visibility = 'hidden';

        // 오버레이 상단 문구
        this.overlayTopMsg = document.createElement('div');
        this.overlayTopMsg.innerText = 'Died';
        this.overlayTopMsg.style.position = 'absolute';
        this.overlayTopMsg.style.top = '40px';
        this.overlayTopMsg.style.left = '50%';
        this.overlayTopMsg.style.transform = 'translateX(-50%)';
        this.overlayTopMsg.style.fontSize = '90px';
        this.overlayTopMsg.style.fontWeight = '900';
        this.overlayTopMsg.style.fontFamily = 'Impact, Arial Black, sans-serif';
        this.overlayTopMsg.style.color = '#ff2222';
        this.overlayTopMsg.style.textShadow =
          '0 0 16px #ff4444, 0 4px 16px #000, 2px 2px 0 #fff, 0 0 2px #fff';
        this.overlayTopMsg.style.letterSpacing = '2px';
        this.overlayTopMsg.style.userSelect = 'none';
        this.overlayTopMsg.style.animation = 'shake 0.5s infinite alternate';
        this.overlay.appendChild(this.overlayTopMsg);

        // CSS 애니메이션(흔들림 효과) 추가
        const style = document.createElement('style');
        style.innerHTML = `
@keyframes shake {
  0% { transform: translateX(-50%) rotate(-2deg); }
  100% { transform: translateX(-50%) rotate(2deg); }
}`;
        document.head.appendChild(style);

        // 오버레이 중앙 카운트다운
        this.overlayCountdown = document.createElement('div');
        this.overlayCountdown.innerText = '3';
        this.overlayCountdown.style.fontSize = '150px';
        this.overlayCountdown.style.fontWeight = 'bold';
        this.overlayCountdown.style.color = '#000000';
        this.overlayCountdown.style.textShadow = '2px 2px 8px #000';
        this.overlayCountdown.style.marginBottom = '0';
        this.overlayCountdown.style.marginTop = '0';
        this.overlay.appendChild(this.overlayCountdown);

        document.body.appendChild(this.overlay);

        // 피격 효과 빨간 화면
        this.hitEffect = document.createElement('div');
        this.hitEffect.style.position = 'fixed';
        this.hitEffect.style.top = '0';
        this.hitEffect.style.left = '0';
        this.hitEffect.style.width = '100vw';
        this.hitEffect.style.height = '100vh';
        this.hitEffect.style.backgroundColor = 'rgba(255, 0, 0, 0.25)';
        this.hitEffect.style.zIndex = '998';
        this.hitEffect.style.pointerEvents = 'none';
        this.hitEffect.style.opacity = '0';
        this.hitEffect.style.transition = 'opacity 0.1s ease-out';
        document.body.appendChild(this.hitEffect);

        this.countdownTimer = null; // New variable

        this.InitInput_();
      }
    }

    TakeDamage(newHp) {
      // HP 값은 main.js에서 서버로부터 받은 값으로 직접 업데이트되므로, 여기서는 시각적 효과만 처리
      // this.hp_ = newHp; // 이 줄은 main.js에서 처리

      // 피격 효과 (로컬 플레이어에게만 적용)
      if (!this.params_.isRemote && this.hitEffect) {
        this.hitEffect.style.opacity = '1';
        setTimeout(() => {
          this.hitEffect.style.opacity = '0';
        }, 100); // 0.1초 동안 표시
      }

      // HP가 0보다 클 때만 RecieveHit 애니메이션 재생
      if (newHp > 0) {
        this.SetAnimation_('RecieveHit'); // RecieveHit 애니메이션 재생
      }

      // 사망 처리 (HP가 0이 되었을 때만)
      if (newHp === 0 && !this.isDead_) {
        this.isDead_ = true; // 죽음 상태로 설정
        this.isAttacking_ = false; // 공격 중단
        this.SetAnimation_('Death'); // Death 애니메이션 재생
        if (!this.params_.isRemote) {
          this.DisableInput_(); // 키 입력 비활성화
          this.respawnTimer_ = this.respawnDelay_;

          if (this.overlay) {
            this.overlay.style.visibility = 'visible';
            this.startCountdown();
          }
        }
      }
    }

    InitInput_() {
      window.addEventListener('keydown', (e) => this.OnKeyDown_(e), false);
      window.addEventListener('keyup', (e) => this.OnKeyUp_(e), false);
    }

    DisableInput_() {
      window.removeEventListener('keydown', (e) => this.OnKeyDown_(e), false);
      window.removeEventListener('keyup', (e) => this.OnKeyUp_(e), false);
      // 모든 키 상태 초기화
      this.keys_ = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        shift: false,
        debug: false,
      };
    }

    OnKeyDown_(event) {
      if (this.isDead_) return; // 죽었으면 입력 무시
      switch (event.code) {
        case 'KeyW': this.keys_.forward = true; break;
        case 'KeyS': this.keys_.backward = true; break;
        case 'KeyA': this.keys_.left = true; break;
        case 'KeyD': this.keys_.right = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.keys_.shift = true; break;
        case 'KeyK':
          if (!this.isJumping_ && !this.isRolling_) {
            this.isJumping_ = true;
            this.velocityY_ = this.jumpPower_;
            this.SetAnimation_('Jump');
          }
          break;
        case 'KeyL':
          if (
            !this.isJumping_ &&
            !this.isRolling_ &&
            this.animations_['Roll'] &&
            this.rollCooldownTimer_ <= 0
          ) {
            // 공격 중 구르기 시 공격 취소 및 투사체 제거
            if (this.isAttacking_) {
              this.isAttacking_ = false;
              this.ClearAttackProjectile_();
              // 진행 중인 공격 애니메이션의 콜백 제거
              if (this.onAnimationFinished_) {
                this.mixer_.removeEventListener('finished', this.onAnimationFinished_);
                this.onAnimationFinished_ = null;
              }
              // 현재 공격 애니메이션을 빠르게 페이드 아웃
              if (this.currentAction_) {
                this.currentAction_.fadeOut(0.1);
              }
            }

            this.isRolling_ = true;
            this.rollTimer_ = this.rollDuration_;
            const moveDir = new THREE.Vector3();
            if (this.keys_.forward) moveDir.z -= 1;
            if (this.keys_.backward) moveDir.z += 1;
            if (this.keys_.left) moveDir.x -= 1;
            if (this.keys_.right) moveDir.x += 1;
            if (moveDir.lengthSq() === 0) {
              this.mesh_.getWorldDirection(moveDir);
              moveDir.y = 0;
              moveDir.normalize();
            } else {
              moveDir.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lastRotationAngle_ || 0);
            }
            this.rollDirection_.copy(moveDir);
            this.SetAnimation_('Roll');
            this.rollCooldownTimer_ = this.rollCooldown_;
          }
          break;
        case 'KeyJ':
          if (!this.isAttacking_ && !this.isJumping_ && !this.isRolling_ && this.attackCooldownTimer_ <= 0) {
            let attackAnimation = 'SwordSlash'; // 기본값
            // 무기 종류에 따라 애니메이션 선택
            if (this.currentWeaponModel && this.currentWeaponModel.userData.weaponName) {
              const weaponName = this.currentWeaponModel.userData.weaponName;
              if (/Pistol|Shotgun|SniperRifle|AssaultRifle|Bow/i.test(weaponName)) {
                attackAnimation = 'Shoot_OneHanded';
              } else if (/Sword|Axe|Dagger|Hammer/i.test(weaponName)) {
                attackAnimation = 'SwordSlash';
              }
            }
            this.PlayAttackAnimation(attackAnimation);
          }
          break;
          /*
        case 'KeyB':
          this.keys_.debug = !this.keys_.debug;
          this.UpdateDebugVisuals();
          break;*/
      }
    }

    OnKeyUp_(event) {
      if (this.isDead_) return; // 죽었으면 입력 무시
      switch (event.code) {
        case 'KeyW': this.keys_.forward = false; break;
        case 'KeyS': this.keys_.backward = false; break;
        case 'KeyA': this.keys_.left = false; break;
        case 'KeyD': this.keys_.right = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.keys_.shift = false; break;
      }
    }

    LoadModel_(characterName = 'Knight_Male') { // 기본값으로 Knight_Male 설정
      const loader = new GLTFLoader();
      loader.setPath('./resources/New Character/');
      loader.load(`${characterName}.glb`, (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(1);
        model.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
        this.mesh_ = model;
        this.params_.scene.add(model);

        model.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
          if (c.isBone && c.name === 'Head') { // Head bone 찾기
            this.headBone = c;
          }
          if (c.isBone && c.name === 'FistR') { // FistR bone 찾기
            this.rightHandBone = c;
          }
        });

        // 고정된 크기의 바운딩 박스 초기화
        const halfWidth = 0.65; // 너비: 1.0
        const halfHeight = 3.2; // 높이: 2.5
        const halfDepth = 0.65; // 깊이: 1.0
        this.boundingBox_.set(
          new THREE.Vector3(-halfWidth, 0, -halfDepth),
          new THREE.Vector3(halfWidth, halfHeight, halfDepth)
        );
        this.boundingBox_.translate(this.position_);
        this.boundingBoxHelper_ = new THREE.Box3Helper(this.boundingBox_, 0xff0000);
        this.boundingBoxHelper_.visible = false;
        this.params_.scene.add(this.boundingBoxHelper_);

        this.mixer_ = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          this.animations_[clip.name] = this.mixer_.clipAction(clip);
        }
        this.SetAnimation_('Idle');

        // HPUI에 플레이어 mesh와 headBone 연결
        if (this.hpUI) {
          this.hpUI.setPlayerTarget(this.mesh_, this.headBone);
        }

        if (this.params_.onLoad) {
          this.params_.onLoad();
        }
      });
    }

    FindAnimation_(keywords) {
      const animNames = Object.keys(this.animations_);
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

    SetAnimation_(name) {
      // 공격 애니메이션 목록
      const attackAnimations = ['SwordAttack', 'GreatSwordAttack', 'DaggerAttack', 'DoubleAxeAttack',
                                'HammerAttack', 'HandAxeAttack', 'Shoot_OneHanded', 'Punch', 'SwordSlash'];

      // 애니메이션 이름 검색
      let animationName = this.FindAnimation_([name]);
      if (!animationName) {
        animationName = name; // FindAnimation이 실패하면 원래 이름 사용
      }

      // 현재 공격 애니메이션이고, 새 애니메이션이 공격 애니메이션이 아니면 투사체 제거
      const isCurrentAttack = attackAnimations.some(anim => this.currentAnimationName_.includes(anim));
      const isNewAttack = attackAnimations.some(anim => animationName.includes(anim));

      if (isCurrentAttack && !isNewAttack) {
        this.ClearAttackProjectile_();
      }

      if (this.currentAnimationName_ === animationName) return;
      if (animationName === 'Death') { // Death 애니메이션은 항상 재생
        this.currentAnimationName_ = animationName;
        if (this.currentAction_) {
          this.currentAction_.fadeOut(0.3);
        }
        const newAction = this.animations_[animationName];
        if (newAction) {
          this.currentAction_ = newAction;
          this.currentAction_.reset().fadeIn(0.3).play();
          this.currentAction_.setLoop(THREE.LoopOnce);
          this.currentAction_.clampWhenFinished = true;
        } else {

          this.currentAction_ = this.animations_['Idle']; // Fallback to Idle
          if (this.currentAction_) {
            this.currentAction_.reset().fadeIn(0.3).play();
          }
          this.currentAnimationName_ = 'Idle'; // Update current animation name to Idle
        }
        return;
      }
      if (this.isDead_) return; // 죽은 상태에서는 Death 애니메이션 외 다른 애니메이션 재생 방지
      if (this.isAttacking_ && !isNewAttack) return; // 공격 중에는 다른 애니메이션 재생 방지

      this.currentAnimationName_ = animationName;
      if (this.currentAction_) {
        this.currentAction_.fadeOut(0.3);
      }

      const newAction = this.animations_[animationName];
      if (newAction) {
        this.currentAction_ = newAction;
        this.currentAction_.reset().fadeIn(0.3).play();
        if (name === 'Jump') {
          this.currentAction_.setLoop(THREE.LoopOnce);
          this.currentAction_.clampWhenFinished = true;
          this.currentAction_.time = 0.25;
          this.currentAction_.timeScale = this.jumpSpeed_;
        } else if (name === 'Roll') {
          this.currentAction_.setLoop(THREE.LoopOnce);
          this.currentAction_.clampWhenFinished = true;
          this.currentAction_.time = 0.0;
          this.currentAction_.timeScale = 1.2;
        } else if (name === 'Death') {
          this.currentAction_.setLoop(THREE.LoopOnce);
          this.currentAction_.clampWhenFinished = true;
        } else if (name.includes('Attack') || name.includes('Punch') || name.includes('Slash') || name === 'Shoot_OneHanded') {
          this.currentAction_.setLoop(THREE.LoopOnce);
          this.currentAction_.clampWhenFinished = true;
          this.currentAction_.timeScale = 1.5;
        } else {
          this.currentAction_.timeScale = 1.0;
        }
      } else {


        this.currentAction_ = this.animations_['Idle']; // Fallback to Idle
        if (this.currentAction_) {
          this.currentAction_.reset().fadeIn(0.3).play();
        }
        this.currentAnimationName_ = 'Idle'; // Update current animation name to Idle
      }
    }

    ClearAttackProjectile_() {
      // 현재 공격으로 생성된 투사체 제거
      if (this.currentAttackProjectile_ && !this.currentAttackProjectile_.isDestroyed) {
        this.currentAttackProjectile_.destroy();
      }
      this.currentAttackProjectile_ = null;
    }

    SetGameInputEnabled(enabled) {
      this.isGameInputEnabled_ = enabled;
      if (!enabled) {
        // 모든 키 상태 초기화
        this.keys_ = {
          forward: false,
          backward: false,
          left: false,
          right: false,
          shift: false,
          debug: false,
        };
      }
    }

    Respawn_() {
      this.hp_ = 100; // 체력 초기화
      this.isDead_ = false; // 죽음 상태 해제

      // 현재 재생 중인 애니메이션이 있다면 즉시 중지
      if (this.currentAction_) {
        this.currentAction_.stop();
      }

      if (this.hpUI) {
        this.hpUI.updateHP(this.hp_); // HPUI 업데이트
      }
      this.InitInput_(); // 입력 활성화
      this.SetAnimation_('Idle'); // Idle 애니메이션으로 설정
      this.UnequipWeapon(); // 무기 장착 해제
      this.equippedWeaponData_ = null; // 장착된 무기 데이터 초기화
      if (this.params_.getRespawnPosition) {
        const respawnPosition = this.params_.getRespawnPosition();
        this.SetPosition([respawnPosition.x, respawnPosition.y, respawnPosition.z]);
      } else {
        this.SetPosition([0, 0, 0]); // Fallback to default position
      }

      if (this.overlay) {
        this.overlay.style.visibility = 'hidden';
      }
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    }

    SetPosition(position) {
      this.position_.set(position[0], position[1], position[2]);
      if (this.mesh_) {
        this.mesh_.position.copy(this.position_);
        // 위치가 업데이트될 때 HPUI도 업데이트
        if (this.hpUI) {
          this.hpUI.updatePosition();
        }
      }
    }

    SetRotation(rotation) {
      if (this.mesh_) {
        this.mesh_.rotation.set(rotation[0], rotation[1], rotation[2]);
      }
    }

    SetRemoteAnimation(animationName) {
      this.SetAnimation_(animationName);
    }

    startCountdown() {
      let count = Math.floor(this.respawnDelay_); // 3초부터 시작
      this.overlayCountdown.innerText = count;

      this.countdownTimer = setInterval(() => {
        count--;
        if (count >= 1) { // 1까지만 표시
          this.overlayCountdown.innerText = count;
        } else {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
        }
      }, 1000);
    }

    UpdateDebugVisuals() {
      if (this.boundingBoxHelper_) {
        this.boundingBoxHelper_.visible = this.keys_.debug;
      }
      if (this.params_.onDebugToggle) {
        this.params_.onDebugToggle(this.keys_.debug);
      }
    }

    UpdateDebugVisuals() {
      if (this.boundingBoxHelper_) {
        this.boundingBoxHelper_.visible = this.keys_.debug;
      }
      if (this.params_.onDebugToggle) {
        this.params_.onDebugToggle(this.keys_.debug);
      }
    }

    PlayAttackAnimation(animationName) {
      if (this.isDead_) return; // 죽은 상태에서는 공격 불가
      if (this.isAttacking_) return; // 이미 공격 중이면 무시

      this.isAttacking_ = true;
      this.attackCooldownTimer_ = this.attackCooldown_;
      this.SetAnimation_(animationName);

      // 애니메이션 종료 시점 처리
      const action = this.animations_[animationName];
      if (action) {
        action.reset();
        action.setLoop(THREE.LoopOnce);
        action.clampWhenFinished = true;
        action.play();

        // 공격 판정 발생 시점 (애니메이션에 따라 조절 필요)
        // 예: SwordSlash 애니메이션의 0.2초 지점에서 공격 판정
        if (this.attackSystem_) {
          let actualAttackDelay = 0.2; // 기본값 (원거리)
          if (this.equippedWeaponData_ && this.equippedWeaponData_.type === 'melee') {
              actualAttackDelay = 0.4; // 근접 무기
          } else if (!this.equippedWeaponData_) { // 맨손 공격
              actualAttackDelay = 0.4;
          }

          setTimeout(() => {
            if (!this.isAttacking_) return; // 공격이 취소되었으면 실행하지 않음

            let weapon = this.equippedWeaponData_; // 현재 장착된 무기 데이터
            if (!weapon) { // 무기가 장착되지 않았을 경우 weapon_data.json에서 맨손 데이터 로드
              weapon = WEAPON_DATA['Fist'];
            }
            const attacker = this; // 공격자 자신

            // 공격 위치를 항상 플레이어의 중앙으로 설정
            const attackPosition = new THREE.Vector3();
            this.mesh_.getWorldPosition(attackPosition);
            attackPosition.y += 1.5; // 캐릭터의 가슴 높이 정도로 조정

            // 공격 방향 계산 (플레이어의 현재 바라보는 방향)
            const attackDirection = new THREE.Vector3();
            this.mesh_.getWorldDirection(attackDirection);
            attackDirection.negate(); // 모델의 Z축이 반대 방향이므로 뒤집음
            attackDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // Y축 기준으로 180도 회전

            // 모든 무기 타입을 circle(구체)로 통일 (test-main.js와 동일)
            const projectile = this.attackSystem_.spawnMeleeProjectile({
              position: attackPosition,
              direction: attackDirection,
              weapon: weapon,
              attacker: attacker,
              type: 'circle', // 근거리/원거리 모두 구체 사용
              radius: weapon.radius || weapon.projectileSize,
              speed: weapon.projectileSpeed,
              onHit: (target) => {

                if (this.socket_ && target.params_.isRemote) { // 원격 플레이어에게만 데미지 이벤트 전송

                  this.socket_.emit('playerDamage', { targetId: target.params_.playerId, damage: weapon.damage, attackerId: this.socket_.id });
                }
              }
            });
            // 생성된 투사체 저장
            this.currentAttackProjectile_ = projectile;
          }, actualAttackDelay * 1000);
        }

        // 근접 무기 애니메이션 시작 시 무기 회전 초기화
        const meleeAttacks = ['SwordAttack', 'GreatSwordAttack', 'DaggerAttack', 'DoubleAxeAttack', 'HammerAttack', 'HandAxeAttack', 'SwordSlash'];
        if (meleeAttacks.some(anim => animationName.includes(anim)) && this.currentWeaponModel) {
          const weaponName = this.currentWeaponModel.userData.weaponName;
          if (/Sword|Axe|Dagger|Hammer/i.test(weaponName)) {
            this.originalWeaponRotation_ = this.currentWeaponModel.rotation.clone();
            this.currentWeaponModel.rotation.set(0, 0, 0);
          }
        }

        // 기존 리스너가 있다면 제거
        if (this.onAnimationFinished_) {
          this.mixer_.removeEventListener('finished', this.onAnimationFinished_);
        }

        // 새로운 리스너 추가
        this.onAnimationFinished_ = (e) => {
          if (e.action === action) {
            this.isAttacking_ = false;

            // 투사체 참조 정리 (이미 자동으로 제거되었거나 타겟에 맞았을 경우)
            this.currentAttackProjectile_ = null;

            // 공격 애니메이션이 끝나면 Idle 또는 이동 애니메이션으로 전환
            const isMoving = this.keys_.forward || this.keys_.backward || this.keys_.left || this.keys_.right;
            const isRunning = isMoving && this.keys_.shift;
            this.SetAnimation_(isMoving ? (isRunning ? 'Run' : 'Walk') : 'Idle');

            // 근접 무기 애니메이션 종료 시 무기 회전 복원
            const meleeAttacks = ['SwordAttack', 'GreatSwordAttack', 'DaggerAttack', 'DoubleAxeAttack', 'HammerAttack', 'HandAxeAttack', 'SwordSlash'];
            if (meleeAttacks.some(anim => animationName.includes(anim)) && this.currentWeaponModel && this.originalWeaponRotation_) {
              this.currentWeaponModel.rotation.copy(this.originalWeaponRotation_);
              this.originalWeaponRotation_ = null; // 초기화
            }
            this.mixer_.removeEventListener('finished', this.onAnimationFinished_);
            this.onAnimationFinished_ = null;
          }
        };
        this.mixer_.addEventListener('finished', this.onAnimationFinished_);
      }
    }

    EquipWeapon(weaponName) {
      if (!this.rightHandBone) {
        
        return;
      }

      if (this.currentWeaponModel && this.currentWeaponModel.userData.weaponName === weaponName) {
        
        return;
      }

      const weaponData = WEAPON_DATA[weaponName];
      if (!weaponData) {
        
        return;
      }
      this.equippedWeaponData_ = weaponData;

      const loader = new FBXLoader();
      loader.setPath('./resources/weapon/FBX/');

      loader.load(weaponName, (fbx) => {
        // 새로운 무기가 로드되기 직전에 이전 무기를 확실히 제거
        this.UnequipWeapon(); 

        const weaponModel = fbx;

        // KDTgames-main/item.js의 스케일 로직 참고
        if (/AssaultRifle|Pistol|Shotgun|SniperRifle|SubmachineGun/i.test(weaponName)) {
          weaponModel.scale.setScalar(0.005);
        } else {
          weaponModel.scale.setScalar(0.01);
        }

        // 무기 위치 및 회전 조정 (캐릭터 모델에 따라 다를 수 있음)
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

        this.rightHandBone.add(weaponModel);
        this.currentWeaponModel = weaponModel;
        this.currentWeaponModel.userData.weaponName = weaponName; // 무기 이름 저장
        
      }, undefined, (error) => {
        
      });
    }

    UnequipWeapon() {
      if (this.currentWeaponModel) {
        this.rightHandBone.remove(this.currentWeaponModel);
        this.currentWeaponModel = null;
      }
    }

    Update(timeElapsed, rotationAngle = 0, collidables = []) {
      if (this.params_.isRemote) {
        if (this.mixer_) {
          this.mixer_.update(timeElapsed);
        }
        // 원격 플레이어의 HPUI 위치 업데이트
        if (this.hpUI) {
          this.hpUI.updatePosition();
        }
        return;
      }
      if (!this.mesh_) return;

      if (!this.isGameInputEnabled_) { // 게임 입력 비활성화 시 업데이트 로직 건너뛰기
        // 애니메이션 업데이트는 계속 진행 (Idle 애니메이션 유지)
        if (this.mixer_) {
          this.mixer_.update(timeElapsed);
        }
        // HPUI 위치 업데이트
        if (this.hpUI) {
          this.hpUI.updatePosition();
        }
        return;
      }

      if (this.isDead_) {
        this.respawnTimer_ -= timeElapsed;
        if (this.respawnTimer_ <= 0) {
          this.Respawn_();
        }
        if (this.mixer_) {
          this.mixer_.update(timeElapsed);
        }
        return; // 죽은 상태에서는 다른 업데이트 로직을 건너뜀
      }

      this.lastRotationAngle_ = rotationAngle;

      if (this.rollCooldownTimer_ > 0) {
        this.rollCooldownTimer_ -= timeElapsed;
        if (this.rollCooldownTimer_ < 0) this.rollCooldownTimer_ = 0;
      }

      if (this.attackCooldownTimer_ > 0) {
        this.attackCooldownTimer_ -= timeElapsed;
        if (this.attackCooldownTimer_ < 0) this.attackCooldownTimer_ = 0;
      }

      

      let newPosition = this.position_.clone();
      let velocity = new THREE.Vector3();
      const forward = new THREE.Vector3(0, 0, -1);
      const right = new THREE.Vector3(1, 0, 0);

      // 공격 중에는 이동 및 회전 불가
      if (!this.isAttacking_) {
        // 입력에 따른 방향 계산
        if (this.keys_.forward) velocity.add(forward);
        if (this.keys_.backward) velocity.sub(forward);
        if (this.keys_.left) velocity.sub(right);
        if (this.keys_.right) velocity.add(right);
        velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotationAngle);

        // 회전 업데이트 (충돌과 무관하게 항상 처리)
        if (velocity.length() > 0.01) {
          const angle = Math.atan2(velocity.x, velocity.z);
          const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), angle
          );
          this.mesh_.quaternion.slerp(targetQuaternion, 0.3);
        }
      }

      if (this.isRolling_) {
        this.rollTimer_ -= timeElapsed;
        const rollMove = this.rollDirection_.clone().multiplyScalar(this.rollSpeed_ * timeElapsed);
        newPosition.add(rollMove);

        // 중력 적용
        this.velocityY_ += this.gravity_ * timeElapsed;
        newPosition.y += this.velocityY_ * timeElapsed;

        // 구르기 중 충돌 체크 및 슬라이딩 처리
        const tempBox = this.boundingBox_.clone();
        tempBox.translate(rollMove);
        tempBox.translate(new THREE.Vector3(0, this.velocityY_ * timeElapsed, 0));

        let canMove = true;
        let adjustedRollMove = rollMove.clone();
        let isOnTop = false;
        let topY = 0;

        for (const collidable of collidables) {
          if (tempBox.intersectsBox(collidable.boundingBox)) {
            // 플레이어가 오브젝트 위에 있는지 확인
            const playerBottom = this.boundingBox_.min.y + this.velocityY_ * timeElapsed;
            const collidableTop = collidable.boundingBox.max.y;
            if (playerBottom >= collidableTop - 0.1 && this.position_.y >= collidableTop - 0.1) {
              isOnTop = true;
              topY = Math.max(topY, collidableTop);
              // X/Z 이동은 허용하되, 바운딩 박스 경계 체크
              const newTempBox = this.boundingBox_.clone();
              newTempBox.translate(rollMove);
              if (
                newTempBox.min.x > collidable.boundingBox.max.x ||
                newTempBox.max.x < collidable.boundingBox.min.x ||
                newTempBox.min.z > collidable.boundingBox.max.z ||
                newTempBox.max.z < collidable.boundingBox.min.z
              ) {
                isOnTop = false; // 경계를 벗어나면 떨어져야 함
              }
              if (isOnTop) continue; // 오브젝트 위에 있으면 X/Z 이동 허용
            }

            // 충돌 발생 시 이전 위치로 되돌리고 Y 속도 0으로 설정
            // newPosition.copy(this.position_);
            // this.velocityY_ = 0;
            canMove = false;
            // X와 Z 방향을 개별적으로 테스트
            let canMoveX = true;
            let canMoveZ = true;

            // X 방향 테스트
            const tempBoxX = this.boundingBox_.clone();
            tempBoxX.translate(new THREE.Vector3(rollMove.x, this.velocityY_ * timeElapsed, 0));
            if (tempBoxX.intersectsBox(collidable.boundingBox)) {
              canMoveX = false;
            }

            // Z 방향 테스트
            const tempBoxZ = this.boundingBox_.clone();
            tempBoxZ.translate(new THREE.Vector3(0, this.velocityY_ * timeElapsed, rollMove.z));
            if (tempBoxZ.intersectsBox(collidable.boundingBox)) {
              canMoveZ = false;
            }

            // 슬라이딩: 충돌하지 않는 방향으로만 이동
            if (!canMoveX && canMoveZ) {
              adjustedRollMove.x = 0; // X 방향 이동 차단
            } else if (canMoveX && !canMoveZ) {
              adjustedRollMove.z = 0; // Z 방향 이동 차단
            } else {
              adjustedRollMove.set(0, 0, 0); // 둘 다 충돌 시 이동 차단
            }
            break; // 첫 번째 충돌 처리 후 종료
          }
        }

        if (canMove || adjustedRollMove.length() > 0) {
          this.position_.add(adjustedRollMove);
          if (isOnTop) {
            this.position_.y = topY; // 오브젝트 위에 고정
            this.velocityY_ = 0;
            this.isJumping_ = false;
          } else {
            this.position_.y = newPosition.y; // 중력에 따라 Y 이동
          }
        } else {
          this.position_.y = newPosition.y; // Y 이동은 허용
        }

        // 바닥 체크
        if (this.position_.y <= 0 && !isOnTop) {
          this.position_.y = 0;
          this.velocityY_ = 0;
          this.isJumping_ = false;
        }

        if (this.rollTimer_ <= 0) {
          this.isRolling_ = false;
          const isMoving = this.keys_.forward || this.keys_.backward || this.keys_.left || this.keys_.right;
          const isRunning = isMoving && this.keys_.shift;
          this.SetAnimation_(isMoving ? (isRunning ? 'Run' : 'Walk') : 'Idle');
        }
      } else {
        const isMoving = this.keys_.forward || this.keys_.backward || this.keys_.left || this.keys_.right;
        const isRunning = isMoving && this.keys_.shift;
        const moveSpeed = isRunning ? this.speed_ * 2 : this.speed_;

        // 공격 중이 아닐 때만 이동 적용
        if (!this.isAttacking_) {
          velocity.normalize().multiplyScalar(moveSpeed * timeElapsed);
          newPosition.add(velocity);
        }

        // 중력 적용
        this.velocityY_ += this.gravity_ * timeElapsed;
        newPosition.y += this.velocityY_ * timeElapsed;

        // 충돌 감지 및 슬라이딩 처리
        const tempBox = this.boundingBox_.clone();
        tempBox.translate(velocity);
        tempBox.translate(new THREE.Vector3(0, this.velocityY_ * timeElapsed, 0));

        let canMove = true;
        let stepUpHeight = 0;
        let adjustedVelocity = velocity.clone();
        let isOnTop = false;
        let topY = 0;

        for (const collidable of collidables) {
          if (tempBox.intersectsBox(collidable.boundingBox)) {
            // 플레이어가 오브젝트 위에 있는지 확인
            const playerBottom = this.boundingBox_.min.y + this.velocityY_ * timeElapsed;
            const collidableTop = collidable.boundingBox.max.y;
            if (playerBottom >= collidableTop - 0.1 && this.position_.y >= collidableTop - 0.1) {
              isOnTop = true;
              topY = Math.max(topY, collidableTop);
              // X/Z 이동은 허용하되, 바운딩 박스 경계 체크
              const newTempBox = this.boundingBox_.clone();
              newTempBox.translate(velocity);
              if (
                newTempBox.min.x > collidable.boundingBox.max.x ||
                newTempBox.max.x < collidable.boundingBox.min.x ||
                newTempBox.min.z > collidable.boundingBox.max.z ||
                newTempBox.max.z < collidable.boundingBox.min.z
              ) {
                isOnTop = false; // 경계를 벗어나면 떨어져야 함
              }
              if (isOnTop) continue; // 오브젝트 위에 있으면 X/Z 이동 허용
            }

            const boxMaxY = collidable.boundingBox.max.y;
            if (boxMaxY <= this.position_.y + this.maxStepHeight_ && boxMaxY > this.position_.y) {
              stepUpHeight = Math.max(stepUpHeight, boxMaxY - this.position_.y);
            } else {
              // 충돌 발생 시 이전 위치로 되돌리고 Y 속도 0으로 설정
              // newPosition.copy(this.position_);
              // this.velocityY_ = 0;
              canMove = false;
              // X와 Z 방향을 개별적으로 테스트
              let canMoveX = true;
              let canMoveZ = true;

              // X 방향 테스트
              const tempBoxX = this.boundingBox_.clone();
              tempBoxX.translate(new THREE.Vector3(velocity.x, this.velocityY_ * timeElapsed, 0));
              if (tempBoxX.intersectsBox(collidable.boundingBox)) {
                canMoveX = false;
              }

              // Z 방향 테스트
              const tempBoxZ = this.boundingBox_.clone();
              tempBoxZ.translate(new THREE.Vector3(0, this.velocityY_ * timeElapsed, velocity.z));
              if (tempBoxZ.intersectsBox(collidable.boundingBox)) {
                canMoveZ = false;
              }

              // 슬라이딩: 충돌하지 않는 방향으로만 이동
              if (!canMoveX && canMoveZ) {
                adjustedVelocity.x = 0; // X 방향 이동 차단
              } else if (canMoveX && !canMoveZ) {
                adjustedVelocity.z = 0; // Z 방향 이동 차단
              } else {
                adjustedVelocity.set(0, 0, 0); // 둘 다 충돌 시 이동 차단
              }
              break;
            }
          }
        }

        if (canMove || adjustedVelocity.length() > 0) {
          newPosition = this.position_.clone().add(adjustedVelocity);
          newPosition.y += this.velocityY_ * timeElapsed;
          this.position_.copy(newPosition);
          if (stepUpHeight > 0) {
            this.position_.y = newPosition.y + stepUpHeight;
            this.velocityY_ = 0;
            this.isJumping_ = false;
          } else if (isOnTop) {
            this.position_.y = topY; // 오브젝트 위에 고정
            this.velocityY_ = 0;
            this.isJumping_ = false;
          }
        } else {
          this.position_.y = newPosition.y; // Y 이동은 허용
        }

        // 바닥 체크
        if (this.position_.y <= 0 && !isOnTop) {
          this.position_.y = 0;
          this.velocityY_ = 0;
          this.isJumping_ = false;
        }

        // 애니메이션 업데이트 (공격 중이 아닐 때만)
        if (this.position_.y > 0 && this.isJumping_) {
          this.SetAnimation_('Jump');
        } else if (isMoving && !this.isAttacking_) {
          this.SetAnimation_(isRunning ? 'Run' : 'Walk');
        } else if (!this.isAttacking_) {
          this.SetAnimation_('Idle');
        }
      }

      this.mesh_.position.copy(this.position_);
      // 바운딩 박스 위치를 플레이어에 맞춰 업데이트
      const halfWidth = 0.65; // 너비: 1.0
      const halfHeight = 3.2; // 높이: 2.5
      const halfDepth = 0.65; // 깊이: 1.0
      this.boundingBox_.set(
        new THREE.Vector3(this.position_.x - halfWidth, this.position_.y, this.position_.z - halfDepth),
        new THREE.Vector3(this.position_.x + halfWidth, this.position_.y + halfHeight, this.position_.z + halfDepth)
      );

      if (this.mixer_) {
        this.mixer_.update(timeElapsed);
      }

      // HPUI 위치 업데이트
      if (this.hpUI) {
        this.hpUI.updatePosition();
      }

      
    }
  }

  return {
    Player: Player,
  };
})();