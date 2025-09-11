// object.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.124/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.124/examples/jsm/loaders/GLTFLoader.js';

export const object = (() => {
  class NatureObject {
    constructor(scene, params = {}) {
      this.scene_ = scene;
      this.models_ = [];
      this.collidables_ = []; // 충돌 대상 오브젝트 배열
      this.debugHelpers_ = []; // 디버그용 바운딩 박스 배열
      this.hp_ = 100; // NPC HP
      this.isDead_ = false; // NPC 죽음 상태
      this.LoadModels_();
    }

    TakeDamage(amount) {
      if (this.isDead_) return; // 이미 죽었으면 데미지 입지 않음

      this.hp_ -= amount;
      if (this.hp_ < 0) this.hp_ = 0;

      if (this.hp_ === 0) {
        this.isDead_ = true; // 죽음 상태로 설정
        // TODO: NPC 사망 애니메이션 또는 제거 로직 추가
        
        // 예: this.scene_.remove(this.model_);
      }
    }

    canTakeDamage() {
      return !this.isDead_;
    }

    LoadModels_() {
      const fbxLoader = new FBXLoader();
      fbxLoader.setPath('./resources/Buildings-pack-Aug-2017/FBX/');

      const gltfLoader = new GLTFLoader();
      gltfLoader.setPath('./resources/Nature-Kit/Models/GLTF-format/');

      const carLoader = new GLTFLoader();
      carLoader.setPath('./resources/kenney_car-kit/Models/GLB-format/');

      const textureLoader = new THREE.TextureLoader();

      const modelsToLoad = [
        // House2.fbx에 다중 바운딩 박스 적용
        {
          type: 'fbx',
          filename: 'House2.fbx',
          texture: 'HouseTexture1.png',
          position: new THREE.Vector3(-33, 0, -33),
          scale: 0.06,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 7, height: 5, depth: 8 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 5, height: 2, depth: 5 }, offset: new THREE.Vector3(0, 5, 0) },
          ],
        },
        {
          type: 'fbx',
          filename: 'Hospital.fbx',
          texture: 'HouseTexture3.png',
          position: new THREE.Vector3(32, 0, -34),
          scale: 0.03,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 12, height: 12, depth: 9 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 4.5, height: 0.5, depth: 4.5 }, offset: new THREE.Vector3(0, 3.5, 3.7) },
          ],
        },
        {
          type: 'fbx',
          filename: 'Shop.fbx',
          texture: 'HouseTexture4.png',
          position: new THREE.Vector3(20, 0, -34),
          scale: 0.05,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 10, height: 7, depth: 7.5 },
        },
        {
          type: 'fbx',
          filename: 'House3.fbx',
          texture: 'HouseTexture2.png',
          position: new THREE.Vector3(33, 0, 32.5),
          scale: 0.06,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(-90), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 8, height: 6, depth: 7 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 6, height: 5, depth: 6 }, offset: new THREE.Vector3(0, 6, 0) },
          ],
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-28.1, 0.1, 0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(100), 0),
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-29.3, 0.1, -0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(80), 0),
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-30.5, 0.1, 0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(100), 0),
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-31.7, 0.1, -0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(80), 0),
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-32.9, 0.1, 0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(100), 0),
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-34.1, 0.1, -0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(80), 0),
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-35.3, 0.1, 0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(100), 0),
        },
        {
          type: 'glb',
          filename: 'path_stone.glb',
          position: new THREE.Vector3(-36.5, 0.1, -0.8),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(80), 0),
        },
        {
          type: 'glb',
          filename: 'tent_detailedOpen.glb',
          position: new THREE.Vector3(-31.8, 0.1, -8.5),
          scale: 8,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(150), 0),
          collidable: true,
          boundingBoxSize: { width: 5, height: 4, depth: 5 },
        },
        {
          type: 'glb',
          filename: 'campfire_planks.glb',
          position: new THREE.Vector3(-34.5, 0.2, -4),
          scale: 4,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(100), 0),
        },
        {
          type: 'glb',
          filename: 'campfire_stones.glb',
          position: new THREE.Vector3(-34.4, 0.13, -3.9),
          scale: 4.8,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(100), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 2, height: 0.1, depth: 2 }, offset: new THREE.Vector3(-0.2, 0, -0.1) },
          ],
        },
        {
          type: 'glb',
          filename: 'stump_roundDetailed.glb',
          position: new THREE.Vector3(-35, 0.13, 3.5),
          scale: 4.8,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 1.5, height: 1, depth: 1.5 }, offset: new THREE.Vector3(0, 0, 0) },
          ],
        },
        {
          type: 'glb',
          filename: 'log.glb',
          position: new THREE.Vector3(-30, 0.13, 6),
          scale: 6,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(-20), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 1.5, height: 0.7, depth: 4 }, offset: new THREE.Vector3(0, 0, 0) },
          ],
        },
        {
          type: 'glb',
          filename: 'log_stackLarge.glb',
          position: new THREE.Vector3(-34, 0.13, 11),
          scale: 5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 3.5, height: 1.5, depth: 2 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 3.5, height: 0.7, depth: 3 }, offset: new THREE.Vector3(0, 0, 0) },
          ],
        },
        {
          type: 'glb',
          filename: 'sign.glb',
          position: new THREE.Vector3(-29, 0.13, 11),
          scale: 5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(40), 0),
        },
        {
          type: 'glb',
          filename: 'flower_redC.glb',
          position: new THREE.Vector3(-35, 0.13, 5.5),
          scale: 2,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(40), 0),
        },
        {
          type: 'glb',
          filename: 'flower_yellowC.glb',
          position: new THREE.Vector3(-35, 0.13, 6.5),
          scale: 2,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(40), 0),
        },
        {
          type: 'glb',
          filename: 'flower_purpleC.glb',
          position: new THREE.Vector3(-35, 0.13, 7.5),
          scale: 2,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(40), 0),
        },
        {
          type: 'glb',
          filename: 'Wood_Road_Block_Large_003.glb',
          position: new THREE.Vector3(20, 0.01, 38.8),
          scale: 0.3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 8, height: 2, depth: 0.2 },
        },
        {
          type: 'glb',
          filename: 'Wood_Road_Block_Large_003.glb',
          position: new THREE.Vector3(38.8, 0.01, 20.2),
          scale: 0.3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 0.2, height: 2, depth: 8 },
        },
        {
          type: 'glb',
          filename: 'Wood_Road_Block_Large_003.glb',
          position: new THREE.Vector3(38.8, 0.01, -20.2),
          scale: 0.3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 0.2, height: 2, depth: 8 },
        },
        {
          type: 'glb',
          filename: 'Wood_Road_Block_Large_003.glb',
          position: new THREE.Vector3(-20, 0.01, 38.8),
          scale: 0.3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 8, height: 2, depth: 0.2 },
        },
        {
          type: 'glb',
          filename: 'Wood_Road_Block_Large_003.glb',
          position: new THREE.Vector3(-38.8, 0.01, 20.2),
          scale: 0.3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 0.2, height: 2, depth: 8 },
        },
        {
          type: 'glb',
          filename: 'Wood_Road_Block_Large_003.glb',
          position: new THREE.Vector3(-38.8, 0.01, -20.2),
          scale: 0.3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 0.2, height: 2, depth: 8 },
        },
        {
          type: 'glb',
          filename: 'Wood_Road_Block_Large_003.glb',
          position: new THREE.Vector3(-20, 0.01, -38.8),
          scale: 0.3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 8, height: 2, depth: 0.2 },
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(5, 0, 0),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 0.9, depth: 3 },
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(-5, 0, 0),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 0.9, depth: 3 },
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(5, 0, 7),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 0.9, depth: 3 },
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(-5, 0, 7),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 0.9, depth: 3 },
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(5, 0, -7),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 0.9, depth: 3 },
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(-5, 0, -7),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 0.9, depth: 3 },
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(11.5, 0, 4),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(11.5, 0, 6),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(11.5, 0, 8),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(11.5, 0, -4),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(11.5, 0, -6),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(11.5, 0, -8),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(-11.5, 0, 4),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(-11.5, 0, 6),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(-11.5, 0, 8),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(-11.5, 0, -4),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(-11.5, 0, -6),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'bush1.glb',
          position: new THREE.Vector3(-11.5, 0, -8),
          scale: 0.7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
        },
        {
          type: 'glb',
          filename: 'tree2.glb',
          position: new THREE.Vector3(5, 0, -11),
          scale: 1,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 5, depth: 1 },
        },
        {
          type: 'glb',
          filename: 'slide.glb',
          position: new THREE.Vector3(9, 0, 35),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(-90), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 8, height: 0.4, depth: 2 }, offset: new THREE.Vector3(-1, 0, 0) },
            { size: { width: 7.4, height: 0.4, depth: 2 }, offset: new THREE.Vector3(-1, 0.4, 0) },
            { size: { width: 6.8, height: 0.4, depth: 2 }, offset: new THREE.Vector3(-1, 0.8, 0) },
            { size: { width: 6.2, height: 0.4, depth: 2 }, offset: new THREE.Vector3(-1, 1.2, 0) },
            { size: { width: 5.8, height: 0.4, depth: 2 }, offset: new THREE.Vector3(-0.7, 1.6, 0) },
            { size: { width: 4.4, height: 0.4, depth: 2 }, offset: new THREE.Vector3(-0.4, 2, 0) },
            { size: { width: 3, height: 0.4, depth: 2 }, offset: new THREE.Vector3(0, 2.4, 0) },
            { size: { width: 1.4, height: 0.4, depth: 2 }, offset: new THREE.Vector3(0.4, 2.8, 0) },
          ],
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(9, 0, 30),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 3, height: 0.9, depth: 1 },
        },
        {
          type: 'glb',
          filename: 'bench.glb',
          position: new THREE.Vector3(5.5, 0, 30),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 3, height: 0.9, depth: 1 },
        },
        {
          type: 'glb',
          filename: 'tree3.glb',
          position: new THREE.Vector3(11, 0, 29),
          scale: 0.9,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(70), 0),
        },
        {
          type: 'glb',
          filename: 'swing.glb',
          position: new THREE.Vector3(-10, 0, 32.2),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(180), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1, depth: 1 },
        },
        {
          type: 'glb',
          filename: 'swing.glb',
          position: new THREE.Vector3(-6, 0, 32.2),
          scale: 1.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(180), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1, depth: 1 },
        },
        {
          type: 'glb',
          filename: 'fence_corner.glb',
          position: new THREE.Vector3(-11, 0, 28.8),
          scale: 3.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.5, height: 1, depth: 3.2 }, offset: new THREE.Vector3(-1.5, 0, 0) },
            { size: { width: 3.2, height: 1, depth: 0.5 }, offset: new THREE.Vector3(0, 0, -1.5) },
          ],
        },
        {
          type: 'glb',
          filename: 'fence_corner.glb',
          position: new THREE.Vector3(-11, 0, 35.5),
          scale: 3.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(180), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.5, height: 1, depth: 3.2 }, offset: new THREE.Vector3(-1.5, 0, 0) },
            { size: { width: 3.2, height: 1, depth: 0.5 }, offset: new THREE.Vector3(0, 0, 1.5) },
          ],
        },
        {
          type: 'glb',
          filename: 'fence_corner.glb',
          position: new THREE.Vector3(-4.5, 0, 28.8),
          scale: 3.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.5, height: 1, depth: 3.2 }, offset: new THREE.Vector3(1.5, 0, 0) },
            { size: { width: 3.2, height: 1, depth: 0.5 }, offset: new THREE.Vector3(0, 0, -1.5) },
          ],
        },
        {
          type: 'glb',
          filename: 'fence_corner.glb',
          position: new THREE.Vector3(-4.5, 0, 35.5),
          scale: 3.5,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(-90), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.5, height: 1, depth: 3.2 }, offset: new THREE.Vector3(1.5, 0, 0) },
            { size: { width: 3.2, height: 1, depth: 0.5 }, offset: new THREE.Vector3(0, 0, 1.5) },
          ],
        },
        {
          type: 'car',
          filename: 'suv.glb',
          position: new THREE.Vector3(3, 0, -34),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 2.7, depth: 7 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 4, height: 1.3, depth: 5 }, offset: new THREE.Vector3(0, 2.7, -1) },
          ],
        },
        {
          type: 'car',
          filename: 'sedan.glb',
          position: new THREE.Vector3(-4, 0, -34),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 2.5, depth: 7 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 4, height: 1.3, depth: 4 }, offset: new THREE.Vector3(0, 2.5, 0) },
          ],
        },
        {
          type: 'car',
          filename: 'ambulance.glb',
          position: new THREE.Vector3(10, 0, -33),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 2.7, depth: 9 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 4, height: 1.3, depth: 7 }, offset: new THREE.Vector3(0, 2.7, -1) },
            { size: { width: 4, height: 1, depth: 6 }, offset: new THREE.Vector3(0, 4, -1.5) },
          ],
        },
        {
          type: 'car',
          filename: 'cone.glb',
          position: new THREE.Vector3(27.5, 0, -13),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1.8, depth: 1 },
        },
        {
          type: 'car',
          filename: 'cone.glb',
          position: new THREE.Vector3(27.5, 0, 13),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1.8, depth: 1 },
        },
        {
          type: 'car',
          filename: 'cone.glb',
          position: new THREE.Vector3(37, 0, -13),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1.8, depth: 1 },
        },
        {
          type: 'car',
          filename: 'cone.glb',
          position: new THREE.Vector3(37, 0, 13),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1.8, depth: 1 },
        },
        {
          type: 'car',
          filename: 'cone.glb',
          position: new THREE.Vector3(27.5, 0, -4),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1.8, depth: 1 },
        },
        {
          type: 'car',
          filename: 'cone.glb',
          position: new THREE.Vector3(27.5, 0, 4),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxSize: { width: 1, height: 1.8, depth: 1 },
        },
        {
          type: 'car',
          filename: 'tractor-shovel.glb',
          position: new THREE.Vector3(33, 0, 2),
          scale: 3,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(0), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 2.2, depth: 7 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 4, height: 2.5, depth: 3 }, offset: new THREE.Vector3(0, 2.2, -1.8) },
          ],
        },
        {
          type: 'glb',
          filename: 'log_stackLarge.glb',
          position: new THREE.Vector3(33, 0.13, 9),
          scale: 7,
          rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(90), 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4.8, height: 1, depth: 4 }, offset: new THREE.Vector3(0, 0, 0) },
            { size: { width: 4.8, height: 1, depth: 2.8 }, offset: new THREE.Vector3(0, 1, 0) },
          ],
        },
      ];

      // Fence A: X축으로
      const fenceStartXA = -10.5;
      const fenceCountA = 14;
      const fenceSpacingA = 3.7;
      const fenceZ_A = -37.7;

      for (let i = 0; i < fenceCountA; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceStartXA + i * fenceSpacingA, 0, fenceZ_A),
          scale: 4.0,
          rotation: new THREE.Euler(0, 0, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 1.2, depth: 0.2 }, offset: new THREE.Vector3(0, 0, -1.8) },
          ],
        });
      }

      // Fence B: Z축으로 수직 설치 (회전 포함)
      const fenceStartXB = -6.7;
      const fenceStartZB = -37.7;
      const fenceCountB = 3;
      const fenceSpacingB = 3.7;
      const fenceX_B = fenceStartXB + (fenceCountA - 1) * fenceSpacingA;

      for (let i = 0; i < fenceCountB; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceX_B, 0, fenceStartZB + i * fenceSpacingB),
          scale: 4.0,
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.2, height: 1.2, depth: 4 }, offset: new THREE.Vector3(-1.8, 0, 0) },
          ],
        });
      }

      // Fence C: Z축으로 수직 설치 (회전 포함)
      const fenceStartXC = 34;
      const fenceStartZC = -11;
      const fenceCountC = 7;
      const fenceSpacingC = 3.7;
      const fenceX_C = fenceStartXC + (fenceCountB - 1) * fenceSpacingC;

      for (let i = 0; i < fenceCountC; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceX_C, 0, fenceStartZC + i * fenceSpacingC),
          scale: 4.0,
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.2, height: 1.2, depth: 4 }, offset: new THREE.Vector3(-1.8, 0, 0) },
          ],
        });
      }

      // Fence D: Z축으로 수직 설치 (회전 포함)
      const fenceStartXD = 19.2;
      const fenceStartZD = 30.3;
      const fenceCountD = 3;
      const fenceSpacingD = 3.7;
      const fenceX_D = fenceStartXD + (fenceCountC - 1) * fenceSpacingD;

      for (let i = 0; i < fenceCountD; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceX_D, 0, fenceStartZD + i * fenceSpacingD),
          scale: 4.0,
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.2, height: 1.2, depth: 4 }, offset: new THREE.Vector3(-1.8, 0, 0) },
          ],
        });
      }

      // Fence E: X축으로
      const fenceStartXE = 30;
      const fenceCountE = 3;
      const fenceSpacingE = 3.7;
      const fenceZ_E = 41.42;

      for (let i = 0; i < fenceCountE; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceStartXE + i * fenceSpacingE, 0, fenceZ_E),
          scale: 4.0,
          rotation: new THREE.Euler(0, 0, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 1.2, depth: 0.2 }, offset: new THREE.Vector3(0, 0, -1.8) },
          ],
        });
      }

      // Fence F: X축으로
      const fenceStartXF = -11;
      const fenceCountF = 7;
      const fenceSpacingF = 3.7;
      const fenceZ_F = 41.42;

      for (let i = 0; i < fenceCountF; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceStartXF + i * fenceSpacingF, 0, fenceZ_F),
          scale: 4.0,
          rotation: new THREE.Euler(0, 0, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 1.2, depth: 0.2 }, offset: new THREE.Vector3(0, 0, -1.8) },
          ],
        });
      }

      // Fence G: X축으로
      const fenceStartXG = -37.5;
      const fenceCountG = 3;
      const fenceSpacingG = 3.7;
      const fenceZ_G = 41.42;

      for (let i = 0; i < fenceCountG; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceStartXG + i * fenceSpacingG, 0, fenceZ_G),
          scale: 4.0,
          rotation: new THREE.Euler(0, 0, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 1.2, depth: 0.2 }, offset: new THREE.Vector3(0, 0, -1.8) },
          ],
        });
      }

      // Fence H: Z축으로 수직 설치 (회전 포함)
      const fenceStartXH = -45;
      const fenceStartZH = 30.3;
      const fenceCountH = 3;
      const fenceSpacingH = 3.7;
      const fenceX_H = fenceStartXH + (fenceCountG - 1) * fenceSpacingH;

      for (let i = 0; i < fenceCountH; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceX_H, 0, fenceStartZH + i * fenceSpacingH),
          scale: 4.0,
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.2, height: 1.2, depth: 4 }, offset: new THREE.Vector3(-1.8, 0, 0) },
          ],
        });
      }

      // Fence I: Z축으로 수직 설치 (회전 포함)
      const fenceStartXI = -45;
      const fenceStartZI = -11;
      const fenceCountI = 7;
      const fenceSpacingI = 3.7;
      const fenceX_I = fenceStartXI + (fenceCountH - 1) * fenceSpacingI;

      for (let i = 0; i < fenceCountI; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceX_I, 0, fenceStartZI + i * fenceSpacingI),
          scale: 4.0,
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.2, height: 1.2, depth: 4 }, offset: new THREE.Vector3(-1.8, 0, 0) },
          ],
        });
      }

      // Fence J: Z축으로 수직 설치 (회전 포함)
      const fenceStartXJ = -60;
      const fenceStartZJ = -37.7;
      const fenceCountJ = 3;
      const fenceSpacingJ = 3.7;
      const fenceX_J = fenceStartXJ + (fenceCountI - 1) * fenceSpacingJ;

      for (let i = 0; i < fenceCountJ; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceX_J, 0, fenceStartZJ + i * fenceSpacingJ),
          scale: 4.0,
          rotation: new THREE.Euler(0, Math.PI / 2, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 0.2, height: 1.2, depth: 4 }, offset: new THREE.Vector3(-1.8, 0, 0) },
          ],
        });
      }

      // Fence K: X축으로
      const fenceStartXK = -37.9;
      const fenceCountK = 3;
      const fenceSpacingK = 3.7;
      const fenceZ_K = -37.7;

      for (let i = 0; i < fenceCountK; i++) {
        modelsToLoad.push({
          type: 'glb',
          filename: 'fence_simple.glb',
          position: new THREE.Vector3(fenceStartXK + i * fenceSpacingK, 0, fenceZ_K),
          scale: 4.0,
          rotation: new THREE.Euler(0, 0, 0),
          collidable: true,
          boundingBoxes: [
            { size: { width: 4, height: 1.2, depth: 0.2 }, offset: new THREE.Vector3(0, 0, -1.8) },
          ],
        });
      }

      const flowerModels = [
        'flower-white.glb',
        'flower-red.glb',
        'flower-blue.glb',
      ];
      const flowerCountPerType = 10;
      const flowerSpawnArea = {
        xMin: -10,
        xMax: 10,
        zMin: -11,
        zMax: 11,
        y: 0,
      };
      flowerModels.forEach((filename) => {
        for (let i = 0; i < flowerCountPerType; i++) {
          const randomX = Math.random() * (flowerSpawnArea.xMax - flowerSpawnArea.xMin) + flowerSpawnArea.xMin;
          const randomZ = Math.random() * (flowerSpawnArea.zMax - flowerSpawnArea.zMin) + flowerSpawnArea.zMin;

          if (randomX >= -4 && randomX <= 4) continue;

          modelsToLoad.push({
            type: 'glb',
            filename,
            position: new THREE.Vector3(randomX, flowerSpawnArea.y, randomZ),
            scale: 1.5,
            rotation: new THREE.Euler(0, THREE.MathUtils.degToRad(Math.random() * 360), 0),
          });
        }
      });

      modelsToLoad.forEach((modelInfo) => {
        if (modelInfo.type === 'fbx') {
          fbxLoader.load(modelInfo.filename, (fbx) => {
            this.OnModelLoaded_(fbx, modelInfo, textureLoader);
          });
        } else if (modelInfo.type === 'glb') {
          gltfLoader.load(modelInfo.filename, (gltf) => {
            this.OnModelLoaded_(gltf.scene, modelInfo, textureLoader);
          });
        } else if (modelInfo.type === 'car') {
          carLoader.load(modelInfo.filename, (gltf) => {
            this.OnModelLoaded_(gltf.scene, modelInfo, textureLoader);
          });
        } else if (modelInfo.type === 'character') {
          characterLoader.load(modelInfo.filename, (gltf) => {
            this.OnModelLoaded_(gltf.scene, modelInfo, textureLoader);
          });
        } else if (modelInfo.type === 'character') {
          characterLoader.load(modelInfo.filename, (gltf) => {
            this.OnModelLoaded_(gltf.scene, modelInfo, textureLoader);
          });
        }
      });
    }

    OnModelLoaded_(model, modelInfo, textureLoader) {
      model.scale.setScalar(modelInfo.scale);
      model.position.copy(modelInfo.position);
      if (modelInfo.rotation) {
        model.rotation.copy(modelInfo.rotation);
      }

      if (modelInfo.texture) {
        const texture = textureLoader.load(
          `./resources/Buildings-pack-Aug-2017/Textures/${modelInfo.texture}`
        );
        model.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
            c.material = new THREE.MeshStandardMaterial({ map: texture });
          }
        });
      } else {
        model.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
      }

      this.scene_.add(model);
      this.models_.push(model);

      if (modelInfo.collidable) {
        if (modelInfo.boundingBoxes) {
          // 다중 바운딩 박스 처리 (House2.fbx)
          modelInfo.boundingBoxes.forEach((boxInfo) => {
            const { width, height, depth } = boxInfo.size;
            const halfWidth = width / 2;
            const halfHeight = height;
            const halfDepth = depth / 2;
            const boxPosition = modelInfo.position.clone().add(boxInfo.offset);
            const boundingBox = new THREE.Box3(
              new THREE.Vector3(-halfWidth, 0, -halfDepth).add(boxPosition),
              new THREE.Vector3(halfWidth, halfHeight, halfDepth).add(boxPosition)
            );
            const collidable = { model, boundingBox, offset: boxInfo.offset };
            this.collidables_.push(collidable);
            const helper = new THREE.Box3Helper(boundingBox, 0x00ff00);
            helper.visible = false;
            this.scene_.add(helper);
            this.debugHelpers_.push(helper);
          });
        } else if (modelInfo.boundingBoxSize) {
          // 단일 바운딩 박스 처리 (기존 로직)
          const { width, height, depth } = modelInfo.boundingBoxSize;
          const halfWidth = width / 2;
          const halfHeight = height;
          const halfDepth = depth / 2;
          const boundingBox = new THREE.Box3(
            new THREE.Vector3(-halfWidth, 0, -halfDepth).add(modelInfo.position),
            new THREE.Vector3(halfWidth, halfHeight, halfDepth).add(modelInfo.position)
          );
          const collidable = { model, boundingBox, offset: new THREE.Vector3(0, 0, 0) };
          this.collidables_.push(collidable);
          const helper = new THREE.Box3Helper(boundingBox, 0x00ff00);
          helper.visible = false;
          this.scene_.add(helper);
          this.debugHelpers_.push(helper);
        }
      }
    }

    Update(timeElapsed) {
      this.collidables_.forEach((collidable) => {
        if (collidable.model.userData.boundingBoxSize) {
          // 단일 바운딩 박스 업데이트
          const { width, height, depth } = collidable.model.userData.boundingBoxSize;
          const halfWidth = width / 2;
          const halfHeight = height;
          const halfDepth = depth / 2;
          const boxPosition = collidable.model.position.clone().add(collidable.offset);
          collidable.boundingBox.set(
            new THREE.Vector3(-halfWidth, 0, -halfDepth).add(boxPosition),
            new THREE.Vector3(halfWidth, halfHeight, halfDepth).add(boxPosition)
          );
        } else if (collidable.offset) {
          // 다중 바운딩 박스 업데이트 (House2.fbx)
          const boxInfo = collidable.model.userData.boundingBoxes?.find(
            (box) => box.offset.equals(collidable.offset)
          );
          if (boxInfo) {
            const { width, height, depth } = boxInfo.size;
            const halfWidth = width / 2;
            const halfHeight = height;
            const halfDepth = depth / 2;
            const boxPosition = collidable.model.position.clone().add(collidable.offset);
            collidable.boundingBox.set(
              new THREE.Vector3(-halfWidth, 0, -halfDepth).add(boxPosition),
              new THREE.Vector3(halfWidth, halfHeight, halfDepth).add(boxPosition)
            );
          }
        } else {
          // 기본 바운딩 박스
          collidable.boundingBox.setFromObject(collidable.model);
        }
      });
    }

    ToggleDebugVisuals(visible) {
      this.debugHelpers_.forEach((helper) => {
        helper.visible = visible;
      });
    }

    GetCollidables() {
      return this.collidables_;
    }
  }

  return {
    NPC: NatureObject,
  };
})();