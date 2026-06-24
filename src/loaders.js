import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/* =========================================================
   Загрузчики ассетов (промис-обёртки).
   ========================================================= */
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();

export const texLoader = new THREE.TextureLoader();

export const loadGLB = (url) =>
  new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));

export const loadFBX = (url) =>
  new Promise((res, rej) => fbxLoader.load(url, res, undefined, rej));
