import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';

export class MeleeProjectile {
  constructor({ scene, position, direction, weapon, attacker, onHit, type = 'circle', angle = Math.PI / 2, radius = 3, speed, startWidth }) {
    this.scene = scene;
    this.position = position.clone();
    this.direction = direction.clone().normalize();
    this.weapon = weapon;
    this.attacker = attacker;
    this.onHit = onHit;
    this.speed = (speed !== undefined) ? speed : (weapon.projectileSpeed !== undefined ? weapon.projectileSpeed : 20);
    this.range = weapon.reach || 20.0;
    this.traveled = 0;
    this.radius = (weapon.projectileSize !== undefined) ? weapon.projectileSize : (radius || weapon.radius || 0.3);
    console.log(`MeleeProjectile created with radius: ${this.radius}, weapon.radius: ${weapon.radius}`);
    this.angle = angle || weapon.angle || Math.PI / 2;
    this.type = type;
    this.isDestroyed = false;
    this.projectileEffect = weapon.projectileEffect || null;
    this.hitTargets = new Set();
    this.lifeTime = 0.2;
    this.startWidth = (weapon.startWidth !== undefined) ? weapon.startWidth : (startWidth || 1.0);
    // 디버그 메시 생성: 원거리 투사체(circle)만 생성
    this.debugMesh = this.createDebugMesh();
    if (this.debugMesh && this.scene) this.scene.add(this.debugMesh);
  }

  createDebugMesh() {
    if (this.type === 'sector' || this.type === 'aerial') {
      // 근접 공격(sector, aerial)은 디버그 메시 생성 안 함
      return null;
    } else if (this.type === 'circle') {
      // 원거리 투사체 (구)
      let color = 0xff0000; // 기본 빨간색
      const geometry = new THREE.SphereGeometry(this.radius, 16, 16);
      if (this.projectileEffect === 'piercing') color = 0x00ff00; // 관통: 초록
      else if (this.projectileEffect === 'explosion') color = 0x0000ff; // 폭발: 파랑
      else color = 0xffaa00; // 일반 원거리: 주황

      const material = new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.5 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(this.position);
      return mesh;
    } else {
      // 기본 박스 (fallback)
      const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(this.position);
      return mesh;
    }
  }

  isInSector(targetPos) {
    const toTarget = targetPos.clone().sub(this.position);
    toTarget.y = 0;
    const dist = toTarget.length();
    if (dist > this.radius) {
      console.log(`isInSector: dist (${dist}) > this.radius (${this.radius})`);
      return false;
    }

    const dirToTarget = toTarget.normalize();
    const dot = this.direction.dot(dirToTarget);
    const theta = Math.acos(Math.min(Math.max(dot, -1), 1));
    return theta <= this.angle / 2;
  }

  update(delta, targets) {
    if (this.isDestroyed) return;

    // 디버그 메시 위치 업데이트
    if (this.debugMesh) this.debugMesh.position.copy(this.position);

    if (this.type === 'sector' || this.type === 'aerial') {
      for (const target of targets) {
        if (target === this.attacker) continue;

        const targetMesh = target.mesh_ || target.model_;
        if (targetMesh && typeof target.TakeDamage === 'function') {
          const canTargetTakeDamage = typeof target.canTakeDamage === 'function' ? target.canTakeDamage() : !target.isDead_;
          if (canTargetTakeDamage && !this.hitTargets.has(target)) {
            const targetPos = targetMesh.position;
            if (this.isInSector(targetPos)) {
              target.TakeDamage(this.weapon.damage);
              this.hitTargets.add(target);
              if (this.attacker && this.attacker.hitEnemies_) { this.attacker.hitEnemies_.add(target); }
              if (this.onHit) this.onHit(target);
              if (this.weapon.projectileEffect !== 'piercing') {
                // this.destroy();
              }
            }
          }
        }
      }
      this.lifeTime -= delta;
      if (this.lifeTime <= 0) {
        this.destroy();
        return;
      }
    }

    if (this.type === 'circle') {
      const moveDist = this.speed * delta;
      this.position.addScaledVector(this.direction, moveDist);
      this.traveled += moveDist;
    }

    for (const target of targets) {
      if (target === this.attacker) continue;

      const targetMesh = target.mesh_ || target.model_;
      if (targetMesh && typeof target.TakeDamage === 'function') {
        const canTargetTakeDamage = typeof target.canTakeDamage === 'function' ? target.canTakeDamage() : !target.isDead_;
        if (canTargetTakeDamage && !this.hitTargets.has(target)) {
          const targetPos = targetMesh.position;
          let hit = false;
          if (this.type === 'circle') {
            const dist = this.position.distanceTo(targetPos);
            const targetRadius = (target.boundingBox_ ? target.boundingBox_.getSize(new THREE.Vector3()).length() / 2 : 0.7);
            hit = dist <= this.radius + targetRadius;
          }

          if (hit) {
            this.hitTargets.add(target);
            if (this.projectileEffect === 'piercing') {
              target.TakeDamage(this.weapon.damage);
              if (this.attacker && this.attacker.hitEnemies_) { this.attacker.hitEnemies_.add(target); }
              if (this.onHit) this.onHit(target);
            } else if (this.projectileEffect === 'explosion') {
              target.TakeDamage(this.weapon.damage);
              if (this.attacker && this.attacker.hitEnemies_) { this.attacker.hitEnemies_.add(target); }
              if (this.onHit) this.onHit(target);
              this.explode(targets);
              this.destroy();
              return;
            } else {
              target.TakeDamage(this.weapon.damage);
              if (this.attacker && this.attacker.hitEnemies_) { this.attacker.hitEnemies_.add(target); }
              if (this.onHit) this.onHit(target);
              this.destroy();
              return;
            }
          }
        }
      }
    }

    if (this.traveled >= this.range) {
      this.destroy();
    }
  }

  explode(targets) {
    const explosionRadius = this.radius * 2;
    for (const target of targets) {
      if (target === this.attacker) continue;

      const targetMesh = target.mesh_ || target.model_;
      if (targetMesh && typeof target.TakeDamage === 'function') {
        const canTargetTakeDamage = typeof target.canTakeDamage === 'function' ? target.canTakeDamage() : !target.isDead_;
        if (canTargetTakeDamage && !this.hitTargets.has(target)) {
          const dist = this.position.distanceTo(targetMesh.position);
          if (dist <= explosionRadius) {
            target.TakeDamage(this.weapon.damage * 0.5);
            this.hitTargets.add(target);
          }
        }
      }
    }
  }

  destroy() {
    if (!this.isDestroyed) {
      if (this.debugMesh && this.scene) {
        this.scene.remove(this.debugMesh);
        this.debugMesh = null;
      }
      this.isDestroyed = true;
    }
  }
}