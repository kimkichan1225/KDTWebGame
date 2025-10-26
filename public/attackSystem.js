// public/attackSystem.js
// 공격 애니메이션 타격 타이밍에서 meleeProjectile 생성 트리거
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';
import { MeleeProjectile } from './meleeProjectile.js';

export class AttackSystem {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];
  }

  // 공격 애니메이션의 타격 프레임에서 호출
  spawnMeleeProjectile({
    position, // THREE.Vector3 (무기 끝 위치)
    direction, // THREE.Vector3 (캐릭터 전방)
    weapon, // 무기 데이터 (공격력, 사거리 등)
    attacker, // 플레이어 또는 NPC
    onHit, // (optional) 타격 시 콜백
    type = 'circle', // 'sector' 또는 'circle'
    angle = Math.PI / 2, // 부채꼴 각도(라디안)
    radius, // 판정 반경
    speed // 투사체 속도 (원거리 무기용)
  }) {
    const projectile = new MeleeProjectile({
      scene: this.scene,
      position,
      direction,
      weapon,
      attacker,
      onHit,
      type, // player.js에서 전달한 type 사용
      angle,
      radius, // player.js에서 전달한 radius 사용
      speed
    });
    this.projectiles.push(projectile);
    return projectile;
  }

  // 매 프레임마다 호출 (game loop에서)
  update(delta, players, npcs) {
    this.projectiles = this.projectiles.filter(p => !p.isDestroyed);
    for (const projectile of this.projectiles) {
      // 공격자와 같은 대상은 제외하고, 유효한 mesh_를 가진 다른 플레이어와 NPC를 대상으로 충돌 검사
      const allTargets = [...Object.values(players).filter(p => p.mesh_ && p !== projectile.attacker), ...npcs.filter(n => n.model_ && n !== projectile.attacker)];
      projectile.update(delta, allTargets);
    }
  }
}