import * as THREE from 'three';
import { gsap } from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---- PS1: степень пикселизации (1 = нативно, больше = крупнее пиксель) ----
const PS1_PIXEL = 2.2;     // рендерим в N раз меньше, CSS растягивает обратно (меньше = чётче)
const PS1_SNAP = 110.0;    // грубость сетки привязки вершин (меньше = сильнее дрожь)

/* =========================================================
   The Web — a remake (Three.js dolly-into-monitor prototype)
   Фазы:
   0) приветственная модалка
   1) сцена: компьютер на столе (камера далеко)
   2) скролл -> камера dolly-in в экран монитора
   3) внутри экрана проявляется HTML-контент
   ========================================================= */

// ---- параметры сцены ----
const SCREEN_CENTER = new THREE.Vector3(0, 1.68, -1.42); // центр экрана монитора (на передней грани корпуса)
const CAM_START = new THREE.Vector3(0, 1.7, 4.2);        // старт камеры (видно всю комнату)
const CAM_END = new THREE.Vector3(0, 1.68, -1.18);       // финиш (вплотную перед экраном)

// ---- renderer / scene / camera ----
const canvas = document.querySelector('#scene-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
function setRenderSize() {
  // рендерим в низком разрешении; CSS (image-rendering: pixelated) растягивает -> крупный пиксель
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth / PS1_PIXEL, window.innerHeight / PS1_PIXEL, false);
}
setRenderSize();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffa24a);
scene.fog = new THREE.Fog(0xc86a2d, 24, 150); // закатная дымка на горизонте

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.copy(CAM_START);
camera.lookAt(SCREEN_CENTER);

// ---- освещение (закат) ----
const SUN_DIR = new THREE.Vector3(0.02, 0.04, -1).normalize(); // солнце низко за столом
scene.add(new THREE.HemisphereLight(0xffd2c8, 0x4b5320, 0.8)); // небо тёплое / земля зелёная
const sun = new THREE.DirectionalLight(0xffb066, 2.35);          // тёплый закатный свет
sun.position.copy(SUN_DIR.clone().multiplyScalar(40));
scene.add(sun);
const lamp = new THREE.PointLight(0xffd9a0, 8, 6, 2);           // мягкая подсветка монитора/стола
lamp.position.set(-0.9, 2.0, -1.4);
scene.add(lamp);

// ---- небо (градиентная полусфера: зенит -> закат у горизонта) ----
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x6b3a24) }, // глубокий синий зенит
    mid: { value: new THREE.Color(0xf06a24) }, // оранжевый закат
    bot: { value: new THREE.Color(0xffb14a) }, // светлая дымка у земли
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
    void main(){ float h = normalize(vP).y;
      vec3 c = mix(mid, top, smoothstep(0.02, 0.42, h));
      c = mix(bot, c, smoothstep(-0.14, 0.08, h));
      gl_FragColor = vec4(c, 1.0); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
scene.add(sky);

function makeSynthSunTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#fff0b8';
  x.beginPath();
  x.arc(128, 128, 118, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = 'destination-out';
  for (let y = 124; y < 232; y += 18) {
    const h = 5 + (y - 124) * 0.035;
    x.fillRect(0, y, 256, h);
  }
  x.globalCompositeOperation = 'source-over';
  return new THREE.CanvasTexture(c);
}
const sunTexture = makeSynthSunTexture();
sunTexture.magFilter = THREE.NearestFilter;
sunTexture.minFilter = THREE.NearestFilter;

function makeSunRaysTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.translate(256, 256);
  x.fillStyle = 'rgba(255, 188, 92, 0.34)';
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const spread = i % 2 === 0 ? 0.075 : 0.045;
    const inner = i % 3 === 0 ? 104 : 122;
    const outer = i % 2 === 0 ? 248 : 216;
    x.beginPath();
    x.moveTo(Math.cos(a - spread) * inner, Math.sin(a - spread) * inner);
    x.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    x.lineTo(Math.cos(a + spread) * inner, Math.sin(a + spread) * inner);
    x.closePath();
    x.fill();
  }
  return new THREE.CanvasTexture(c);
}
const sunRaysTexture = makeSunRaysTexture();
sunRaysTexture.magFilter = THREE.NearestFilter;
sunRaysTexture.minFilter = THREE.NearestFilter;

// ---- солнце-диск у горизонта ----
const sunRays = new THREE.Mesh(
  new THREE.PlaneGeometry(96, 96),
  new THREE.MeshBasicMaterial({
    map: sunRaysTexture,
    transparent: true,
    opacity: 0.62,
    fog: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
sunRays.position.copy(SUN_DIR.clone().multiplyScalar(329));
sunRays.lookAt(camera.position);
sunRays.renderOrder = 1;
scene.add(sunRays);

const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(34, 48),
  new THREE.MeshBasicMaterial({ map: sunTexture, transparent: true, fog: false, depthWrite: false })
);
sunDisc.position.copy(SUN_DIR.clone().multiplyScalar(330));
sunDisc.lookAt(0, sunDisc.position.y, 0);
sunDisc.renderOrder = 2;
scene.add(sunDisc);

function addPixelCloud(blocks, position, scale = 1) {
  const cloud = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd9b0,
    transparent: true,
    opacity: 0.86,
    fog: false,
    depthWrite: false,
  });

  blocks.forEach(([x, y, w, h]) => {
    const block = new THREE.Mesh(new THREE.PlaneGeometry(w * scale, h * scale), mat);
    block.position.set(x * scale, y * scale, 0);
    cloud.add(block);
  });

  cloud.position.copy(position);
  cloud.lookAt(camera.position);
  scene.add(cloud);
  return cloud;
}

const cloudBlocksA = [
  [-3.0, 0.0, 1.5, 0.7], [-1.8, 0.45, 2.0, 0.9], [0.0, 0.25, 2.4, 0.8],
  [1.8, 0.0, 1.8, 0.7], [-0.8, -0.35, 3.6, 0.55],
];
const cloudBlocksB = [
  [-2.2, 0.0, 1.4, 0.6], [-1.0, 0.35, 1.8, 0.75], [0.6, 0.2, 2.1, 0.7],
  [2.0, -0.08, 1.3, 0.55], [-0.2, -0.3, 3.0, 0.5],
];
const skyClouds = [
  addPixelCloud(cloudBlocksA, new THREE.Vector3(-54, 23, -120), 3.3),
  addPixelCloud(cloudBlocksB, new THREE.Vector3(58, 28, -135), 3.0),
];
skyClouds.forEach((cloud, i) => {
  cloud.userData.base = cloud.position.clone();
  cloud.userData.phase = i * 2.4;
});

function animateSky(t) {
  sunRays.lookAt(camera.position);
  sunRays.scale.setScalar(1 + Math.sin(t * 0.8) * 0.035);
  sunRays.material.opacity = 0.52 + Math.sin(t * 0.9) * 0.1;

  skyClouds.forEach((cloud) => {
    const base = cloud.userData.base;
    const phase = cloud.userData.phase;
    cloud.position.x = base.x + Math.sin(t * 0.13 + phase) * 3.4;
    cloud.position.y = base.y + Math.sin(t * 0.32 + phase) * 0.7;
    cloud.lookAt(camera.position);
  });
}

// ---- степь (большая зелёная плоскость) ----
const waterUniforms = {
  time: { value: 0 },
  deep: { value: new THREE.Color(0x172f2f) },
  shallow: { value: new THREE.Color(0x4f704f) },
  amber: { value: new THREE.Color(0xff9f3f) },
};
const waterMat = new THREE.ShaderMaterial({
  fog: false,
  depthWrite: true,
  uniforms: waterUniforms,
  vertexShader: `
    uniform float time;
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vec3 p = position;
      float w1 = sin((p.x * 0.055) + time * 0.9);
      float w2 = sin((p.y * 0.085) - time * 1.15);
      p.z += (w1 + w2) * 0.035;
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorld = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec3 deep;
    uniform vec3 shallow;
    uniform vec3 amber;
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vec2 pixel = floor(vWorld.xz * 1.45) / 1.45;
      float ripple = sin(pixel.x * 0.85 + time * 1.2) * 0.5 + sin(pixel.y * 1.15 - time * 1.7) * 0.5;
      ripple = floor((ripple * 0.5 + 0.5) * 5.0) / 5.0;

      float horizon = smoothstep(-170.0, 150.0, -vWorld.z);
      vec3 color = mix(shallow, deep, horizon);
      color += ripple * 0.045;

      float center = 1.0 - smoothstep(0.0, 42.0, abs(vWorld.x));
      float distanceFade = smoothstep(20.0, 190.0, -vWorld.z);
      float broken = step(0.56, fract(sin(dot(floor(pixel * 0.9), vec2(12.9898, 78.233))) * 43758.5453));
      float reflection = center * distanceFade * (0.45 + ripple * 0.55) * mix(0.7, 1.0, broken);
      color = mix(color, amber, reflection * 0.55);

      float scan = step(0.82, fract((vWorld.z + time * 7.0) * 0.18));
      color += amber * scan * center * distanceFade * 0.08;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800, 120, 120),
  waterMat
);
water.rotation.x = -Math.PI / 2;
water.position.set(0, -0.015, -3);
scene.add(water);

// ---- экран монитора: CanvasTexture с ретро-контентом (в него «въезжаем») ----
const sCanvas = document.createElement('canvas');
sCanvas.width = 512; sCanvas.height = 400;
const sCtx = sCanvas.getContext('2d');
function drawScreen(t) {
  sCtx.fillStyle = '#0b1a12';
  sCtx.fillRect(0, 0, 512, 400);
  // мягкое свечение
  const g = sCtx.createRadialGradient(256, 200, 40, 256, 200, 320);
  g.addColorStop(0, 'rgba(60,255,170,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  sCtx.fillStyle = g; sCtx.fillRect(0, 0, 512, 400);
  // текст-курсор
  sCtx.fillStyle = '#7CFCB4';
  sCtx.font = '22px monospace';
  sCtx.fillText('> THE WEB', 40, 90);
  sCtx.fillText('> pedrovega_', 40, 130);
  if (Math.floor(t * 2) % 2 === 0) sCtx.fillRect(192, 114, 12, 20); // мигающий курсор
  // скан-линии
  sCtx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 400; y += 4) sCtx.fillRect(0, y, 512, 2);
}
drawScreen(0);
const screenTex = new THREE.CanvasTexture(sCanvas);
screenTex.magFilter = THREE.NearestFilter; // PS1: без сглаживания текстуры
screenTex.minFilter = THREE.NearestFilter;
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1), // масштабируется под монитор модели после загрузки
  new THREE.MeshBasicMaterial({ map: screenTex })
);
screen.visible = false; // покажем, спозиционировав по экрану pc.glb
scene.add(screen);

// лёгкие частицы-пылинки
const dustGeo = new THREE.BufferGeometry();
const dustPos = [];
for (let i = 0; i < 220; i++) dustPos.push((Math.random() - 0.5) * 12, Math.random() * 6, (Math.random() - 0.5) * 10 - 2);
dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
// мягкий круглый спрайт (radial-gradient) вместо квадрата
const dustSprite = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,244,220,1)');
  g.addColorStop(0.4, 'rgba(216,201,168,0.6)');
  g.addColorStop(1, 'rgba(216,201,168,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color: 0xd8c9a8, size: 0.05, map: dustSprite,
  transparent: true, opacity: 0.55, depthWrite: false,
  blending: THREE.AdditiveBlending, sizeAttenuation: true,
}));
scene.add(dust);

// =========================================================
//  PS1-СТИЛЬ: дрожание вершин (vertex snapping) + flat shading
//  Привязываем вершины к грубой экранной сетке -> характерная «дрожь» PS1.
// =========================================================
function makePS1(material) {
  if (!material || material.isPointsMaterial) return material;
  material.flatShading = true; // граненое освещение вместо гладкого
  material.onBeforeCompile = (shader) => {
    // снап-константа зашита в код (PS1_SNAP), без uniform — проще и без проблем с кэшем
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       // привязка к сетке в clip-space (PS1 vertex jitter)
       vec3 _ndc = gl_Position.xyz / gl_Position.w;
       _ndc.xy = floor(_ndc.xy * ${PS1_SNAP.toFixed(1)}) / ${PS1_SNAP.toFixed(1)};
       gl_Position.xyz = _ndc * gl_Position.w;`
    );
  };
  material.customProgramCacheKey = () => 'ps1-snap';
  material.needsUpdate = true;
  return material;
}
scene.traverse((o) => { if (o.isMesh) makePS1(o.material); });

// =========================================================
//  Загрузка моделей: стол + компьютер (монитор = портал в сайт) + видеокамера (фон сбоку)
// =========================================================
const PC_ROT_Y = 0;            // поверни на Math.PI, если монитор смотрит от камеры
const gltfLoader = new GLTFLoader();
const loadGLB = (url) => new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
const applyPS1Tree = (root) => root.traverse((o) => { if (o.isMesh) makePS1(o.material); });

// бумбокс на столе (кликабельный, музыку подключим позже)
let boombox = null, boomScale = 1, hoverBoom = false, boomBaseY = 0;

Promise.all([loadGLB('assets/Table.glb'), loadGLB('assets/pc.glb'), loadGLB('assets/Camera.glb'), loadGLB('assets/cc0_free_low_poly_boombox.glb')])
  .then(([table, pc, cam, boom]) => {
    // --- стол (верх столешницы ~ y=1.0) ---
    const tableObj = table.scene; applyPS1Tree(tableObj);
    tableObj.position.set(0, 0, -2.0);
    scene.add(tableObj);
    tableObj.updateMatrixWorld(true);
    const tableTop = new THREE.Box3().setFromObject(tableObj).max.y; // верх столешницы

    // --- компьютер на столе ---
    const pcObj = pc.scene; applyPS1Tree(pcObj);
    pcObj.rotation.y = PC_ROT_Y;
    pcObj.position.set(0, 1.245, -2.0); // низ pc садится на столешницу
    scene.add(pcObj);

    // --- бумбокс справа от монитора ---
    boombox = boom.scene; applyPS1Tree(boombox);
    const bsz = new THREE.Box3().setFromObject(boombox).getSize(new THREE.Vector3());
    boomScale = 0.6 / bsz.x; boombox.scale.setScalar(boomScale);
    boombox.position.set(-0.85, 0, -1.9); boombox.rotation.y = 0.4; // слева от монитора
    scene.add(boombox); boombox.updateMatrixWorld(true);
    boombox.position.y = tableTop - new THREE.Box3().setFromObject(boombox).min.y; // на столешницу
    boomBaseY = boombox.position.y;

    // --- видеокамера слева-сзади, как фоновый реквизит ---
    const camObj = cam.scene; applyPS1Tree(camObj);
    camObj.position.set(-1.9, 0, -3.0);
    camObj.rotation.y = 0.9; // развёрнута к столу
    scene.add(camObj);

    // --- живой экран по монитору модели (mesh_id49) + наводка dolly ---
    let screenMesh = null;
    pcObj.traverse((o) => { if (o.name === 'mesh_id49') screenMesh = o; });
    if (screenMesh) {
      pcObj.updateMatrixWorld(true); // иначе bounding box возьмёт локальные координаты
      const box = new THREE.Box3().setFromObject(screenMesh);
      const c = new THREE.Vector3(); box.getCenter(c);
      const s = new THREE.Vector3(); box.getSize(s);
      screen.scale.set(s.x * 0.95, s.y * 0.9, 1);
      screen.position.set(c.x, c.y, c.z + s.z / 2 + 0.006); // чуть перед лицевой гранью
      screen.visible = true;
      // навести зум на этот экран
      SCREEN_CENTER.set(c.x, c.y, c.z + s.z / 2);
      CAM_START.set(c.x, c.y + 0.5, c.z + 4.4);
      CAM_END.set(c.x, c.y, c.z + 0.28);
      camera.position.copy(CAM_START);
      camera.lookAt(SCREEN_CENTER);
      updateScroll();
    }
  })
  .catch((e) => console.warn('Модель не загрузилась:', e));

// =========================================================
//  CRT-КОМНАТА ПАМЯТИ (idea 4) — отдельная сцена в том же canvas
// =========================================================
const RW = 8, RH = 4, RD = 8; // ширина/высота/глубина комнаты
const roomScene = new THREE.Scene();
roomScene.background = new THREE.Color(0x140f0a);
roomScene.fog = new THREE.Fog(0x140f0a, 6, 16);
const roomCam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 60);

// коробка-комната (нормали внутрь) + пол
const room = new THREE.Mesh(new THREE.BoxGeometry(RW, RH, RD),
  makePS1(new THREE.MeshStandardMaterial({ color: 0x9c7c4e, roughness: 1, side: THREE.BackSide })));
room.position.y = RH / 2; roomScene.add(room);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD),
  makePS1(new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1 })));
floor.rotation.x = -Math.PI / 2; roomScene.add(floor);

// свет: мягкий тёплый общий + ламповые источники по углам + CRT-отблеск
roomScene.add(new THREE.HemisphereLight(0xffe0b0, 0x281a0c, 0.3));
const roomLamp = new THREE.PointLight(0xffcf94, 3, 14, 2);
roomLamp.position.set(0, 3.5, 0); roomScene.add(roomLamp);
// видимые лампы-шары с тёплым светом (ламповый вайб)
function lampAt(x, z, col, intensity) {
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10),
    new THREE.MeshBasicMaterial({ color: col }));
  bulb.position.set(x, 1.85, z); roomScene.add(bulb);
  const pl = new THREE.PointLight(col, intensity, 8, 2);
  pl.position.set(x, 1.85, z); roomScene.add(pl);
}
lampAt(-RW / 2 + 0.7, RD / 2 - 0.7, 0xffb066, 6);   // тёплая у двери
lampAt(RW / 2 - 0.7, -RD / 2 + 0.7, 0xff8a4a, 5);   // оранжевая в углу

const rdust = dust.clone(); roomScene.add(rdust);

// фотки в рамках на стенах
const texLoader = new THREE.TextureLoader();
const photoMeshes = []; // для клика-навигации
function hangPhoto(targetScene, photosArr, url, x, y, z, ry, h = 1.3) {
  const grp = new THREE.Group();
  // рамка-короб (дерево, с глубиной) + паспарту + фото
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.07),
    makePS1(new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.7 })));
  // паспарту без PS1-снапа, иначе оно z-файтит с фото и перекрывает его (серая заглушка)
  const matte = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xe9ddc2, roughness: 1 }));
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide }));
  frame.position.z = -0.035; matte.position.z = 0.015; photo.position.z = 0.05; // развели по Z
  grp.add(frame, matte, photo);
  grp.position.set(x, y, z); grp.rotation.y = ry; targetScene.add(grp);
  photosArr.push(photo);
  texLoader.load(url, (tex) => {
    tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const a = tex.image.width / tex.image.height, w = h * a;
    photo.material.map = tex; photo.material.color.set(0xffffff); photo.material.needsUpdate = true;
    photo.scale.set(w, h, 1);
    matte.scale.set(w + 0.13, h + 0.13, 1);   // паспарту
    frame.scale.set(w + 0.28, h + 0.28, 1);   // деревянная рамка
  });
}
const HY = 2.0, eps = 0.06;
hangPhoto(roomScene, photoMeshes, 'assets/1.png', -2.5, HY, -RD / 2 + eps, 0);
hangPhoto(roomScene, photoMeshes, 'assets/4.png', 2.5, HY, -RD / 2 + eps, 0);
hangPhoto(roomScene, photoMeshes, 'assets/2.png', -RW / 2 + eps, HY, -0.8, Math.PI / 2);
hangPhoto(roomScene, photoMeshes, 'assets/3.png', RW / 2 - eps, HY, -0.8, -Math.PI / 2);

// =========================================================
//  ДВЕРЬ между двумя картинами (центр задней стены) -> следующая комната
// =========================================================
const DOOR_H = 2.4, DOOR_OPEN = -1.5;   // высота двери и угол открытия полотна (рад)
const allDoors = [];                     // все двери (для сброса в закрытое при переходе)

// собрать дверь из закрытой сборки "01" модели; полотно ("door") крутится по клику
function makeModelDoor(fullScene, targetScene, x, z, ry, target) {
  const holder = new THREE.Group();
  const inst = fullScene.clone(true); // клон всей сцены (с предком -90°X), иначе дверь ляжет на бок
  let open2 = null; inst.traverse((o) => { if (o.name === '01_1') open2 = o; }); // вырезать открытую копию
  if (open2 && open2.parent) open2.parent.remove(open2);
  applyPS1Tree(inst);
  holder.add(inst);
  // масштаб под высоту проёма + центрирование X/Z, низ на пол
  inst.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(inst);
  const sz = bb.getSize(new THREE.Vector3());
  inst.scale.multiplyScalar(DOOR_H / sz.y);
  inst.updateMatrixWorld(true);
  bb = new THREE.Box3().setFromObject(inst);
  const ctr = bb.getCenter(new THREE.Vector3());
  inst.position.x -= ctr.x; inst.position.z -= ctr.z; inst.position.y -= bb.min.y;
  // полотно + ручка (ручка едет с полотном)
  let leaf = null, handle = null;
  inst.traverse((o) => { if (o.name === 'door') leaf = o; if (o.name === 'handel') handle = o; });
  if (leaf && handle) leaf.attach(handle);
  // за дверью — ТЕМНОТА (а не цвет стены): тёмный проём-ниша перед стеной
  const dark = new THREE.Mesh(new THREE.BoxGeometry(1.02, 2.12, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x050505, fog: false }));
  dark.position.set(0, DOOR_H / 2, -0.08);
  // невидимый хитбокс для надёжного клика
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.6),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, DOOR_H / 2, 0.22);
  holder.add(dark, hit);
  holder.position.set(x, 0, z); holder.rotation.y = ry;
  holder.userData.target = target;
  holder.userData.leaf = leaf;
  holder.userData.closed = leaf ? leaf.rotation.y : 0;
  holder.userData.opened = (leaf ? leaf.rotation.y : 0) + DOOR_OPEN;
  targetScene.add(holder);
  allDoors.push(holder);
  return holder;
}
const doorsRoom1 = []; // наполнится после загрузки модели двери
// мягкий тёплый свет у двери
const doorLight = new THREE.PointLight(0xffcf8a, 2.5, 6, 2);
doorLight.position.set(0, 1.6, -RD / 2 + 0.6); roomScene.add(doorLight);

// =========================================================
//  КОМНАТА 2 (следующая) — отдельная сцена, дверь обратно в комнату 1
// =========================================================
function buildRoom2() {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x0c1014);
  s.fog = new THREE.Fog(0x0c1014, 6, 16);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(RW, RH, RD),
    makePS1(new THREE.MeshStandardMaterial({ color: 0x4e6173, roughness: 1, side: THREE.BackSide })));
  walls.position.y = RH / 2; s.add(walls);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD),
    makePS1(new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 1 })));
  fl.rotation.x = -Math.PI / 2; s.add(fl);
  s.add(new THREE.HemisphereLight(0xbfe0ff, 0x10181e, 0.4));
  const pl = new THREE.PointLight(0x9fd0ff, 3, 16, 2); pl.position.set(0, 3.5, 0); s.add(pl);
  s.add(dust.clone());
  const photos = [], doors = [];
  // пару кадров на дальней стене (заглушки — замени ассеты)
  hangPhoto(s, photos, 'assets/2.png', -2.5, HY, -RD / 2 + eps, 0);
  hangPhoto(s, photos, 'assets/3.png', 2.5, HY, -RD / 2 + eps, 0);
  // дверь обратно (наполнится после загрузки модели) + тёплый свет у неё
  const dl = new THREE.PointLight(0xbfe0ff, 2.2, 6, 2);
  dl.position.set(0, 1.6, RD / 2 - 0.6); s.add(dl);
  return { scene: s, floor: fl, photos, doors };
}
const room2 = buildRoom2();

// загрузка модели двери -> установка дверей в обе комнаты (между картинами)
loadGLB('assets/door_wooden_old_-9mb.glb').then((g) => {
  doorsRoom1.push(makeModelDoor(g.scene, roomScene, 0, -RD / 2 + 0.1, 0, 'room2'));
  room2.doors.push(makeModelDoor(g.scene, room2.scene, 0, RD / 2 - 0.1, Math.PI, 'room1'));
}).catch((e) => console.warn('Дверь не загрузилась:', e));

// активная комната (что рендерим/по чему кликаем)
let activeRoomScene = roomScene, activeFloor = floor, activePhotos = photoMeshes, activeDoors = doorsRoom1;

// управление: осмотр перетаскиванием + навигация кликом (без WASD/скролла)
let inRoom = false, yaw = Math.PI, pitch = 0, dragging = false, moved = false, px = 0, py = 0;
const roomDir = new THREE.Vector3();
function aim() {
  roomDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  roomCam.lookAt(roomCam.position.clone().add(roomDir));
}
const M = 0.6; // отступ от стен
const clampX = (v) => Math.max(-RW / 2 + M, Math.min(RW / 2 - M, v));
const clampZ = (v) => Math.max(-RD / 2 + M, Math.min(RD / 2 - M, v));
function moveTo(tx, tz) {
  gsap.to(roomCam.position, { x: clampX(tx), z: clampZ(tz), duration: 1.1, ease: 'power2.inOut' });
}
const ray = new THREE.Raycaster();
const bgm = document.querySelector('#bgm');
const boomHint = document.querySelector('#boom-hint');
let playing = false;
function toggleMusic() {
  playing = !playing;
  if (playing) bgm.play().catch(() => {}); else bgm.pause(); // src добавишь позже -> заиграет
  if (boomHint) boomHint.textContent = playing ? '⏸ ПАУЗА' : '▶ ВКЛЮЧИТЬ';
}
function navClick(e) {
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, roomCam);
  // 1) клик по двери -> открыть полотно, затем переход
  const dh = ray.intersectObjects(activeDoors, true)[0];
  if (dh) { let o = dh.object; while (o && o.userData.target === undefined) o = o.parent; if (o) { activateDoor(o, o.userData.target); return; } }
  // 2) клик по фото -> встать ровно перед ним и навести взгляд в центр
  const ph = ray.intersectObjects(activePhotos)[0];
  if (ph) {
    const grp = ph.object.parent;
    const c = grp.getWorldPosition(new THREE.Vector3());          // центр картинки
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(grp.quaternion);
    const fx = clampX(c.x + n.x * 2.2), fz = clampZ(c.z + n.z * 2.2); // точка перед фото
    moveTo(fx, fz);
    // доворот yaw/pitch так, чтобы картинка была по центру кадра
    const dir = c.clone().sub(new THREE.Vector3(fx, roomCam.position.y, fz));
    let ty = Math.atan2(dir.x, dir.z);
    const tp = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    while (ty - yaw > Math.PI) ty -= 2 * Math.PI;
    while (ty - yaw < -Math.PI) ty += 2 * Math.PI;
    const o = { yaw, pitch };
    gsap.to(o, { yaw: ty, pitch: tp, duration: 1.1, ease: 'power2.inOut',
      onUpdate: () => { yaw = o.yaw; pitch = o.pitch; } });
    return;
  }
  // 3) клик по полу -> идти туда
  const fh = ray.intersectObject(activeFloor)[0];
  if (fh) moveTo(fh.point.x, fh.point.z);
}
// клик по двери: плавно открыть полотно, затем перейти в комнату
function activateDoor(grp, target) {
  if (busy) return;
  const leaf = grp.userData.leaf;
  if (!leaf) { goToRoom(target); return; }
  busy = true;
  gsap.to(leaf.rotation, { y: grp.userData.opened, duration: 0.7, ease: 'power2.out',
    onComplete: () => { busy = false; goToRoom(target); } });
}
// переход между комнатами (через ту же шторку fade)
function goToRoom(target) {
  if (busy) return;
  transition(() => {
    // все двери снова закрыты
    allDoors.forEach((d) => { if (d.userData.leaf) d.userData.leaf.rotation.y = d.userData.closed; });
    // встаём как при скролл-входе: в глубине комнаты, лицом к стене с дверью/картинами
    if (target === 'room2') {
      activeRoomScene = room2.scene; activeFloor = room2.floor; activePhotos = room2.photos; activeDoors = room2.doors;
    } else {
      activeRoomScene = roomScene; activeFloor = floor; activePhotos = photoMeshes; activeDoors = doorsRoom1;
    }
    roomCam.position.set(0, 1.7, 3.2); yaw = Math.PI; pitch = -0.05;
    aim();
  });
}
addEventListener('pointerdown', (e) => { if (inRoom) { dragging = true; moved = false; px = e.clientX; py = e.clientY; } });
addEventListener('pointerup', (e) => {
  if (inRoom) { if (!moved) navClick(e); dragging = false; return; }
  if (hoverBoom) toggleMusic(); // клик по бумбоксу снаружи
});
addEventListener('pointermove', (e) => {
  if (inRoom) {
    if (!dragging) return;
    if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 6) moved = true; // отличаем драг от клика
    yaw -= (e.clientX - px) * 0.005;
    pitch = Math.max(-1.1, Math.min(1.1, pitch - (e.clientY - py) * 0.005));
    px = e.clientX; py = e.clientY;
    return;
  }
  // снаружи: наведение на бумбокс -> курсор-палец + подсказка у курсора
  if (!boombox) return;
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  hoverBoom = ray.intersectObject(boombox, true).length > 0;
  canvas.style.cursor = hoverBoom ? 'pointer' : '';
  if (boomHint) {
    boomHint.style.opacity = hoverBoom ? '1' : '0';
    boomHint.style.left = e.clientX + 'px';
    boomHint.style.top = (e.clientY - 26) + 'px';
  }
});

const roomUI = document.querySelector('#room-ui');
const fade = document.querySelector('#fade');
let busy = false; // идёт переход между сценами
// плавный переход: затемнить -> свап на середине -> высветлить
function transition(swap) {
  busy = true;
  gsap.to(fade, { opacity: 1, duration: 0.45, ease: 'power2.in', onComplete: () => {
    swap();
    gsap.to(fade, { opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => { busy = false; } });
  } });
}
function enterRoom() {
  if (inRoom || busy) return;
  transition(() => {
    inRoom = true;
    // всегда стартуем в комнате 1
    activeRoomScene = roomScene; activeFloor = floor; activePhotos = photoMeshes; activeDoors = doorsRoom1;
    roomCam.position.set(0, 1.7, 3.2); yaw = Math.PI; pitch = -0.05; aim();
    document.body.classList.add('locked');
    roomUI && roomUI.classList.add('on');
  });
}
function exitRoom() {
  if (!inRoom || busy) return;
  transition(() => {
    inRoom = false; hoverBoom = false;
    if (boomHint) boomHint.style.opacity = '0';
    canvas.style.cursor = '';
    document.body.classList.remove('locked');
    roomUI && roomUI.classList.remove('on');
    window.scrollTo(0, 0); updateScroll();
  });
}
const exitBtn = document.querySelector('#room-exit');
exitBtn && exitBtn.addEventListener('click', exitRoom);

// =========================================================
//  СКРОЛЛ -> прогресс зума
// =========================================================
const driver = document.querySelector('#scroll-driver');
const hint = document.querySelector('#scroll-hint');
let progress = 0;

function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function updateScroll() {
  // прогресс по всему доступному диапазону скролла (а не по высоте спейсера),
  // иначе без HTML-контента низ страницы не даёт дойти до 1
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;

  // dolly камеры
  const e = easeInOut(progress);
  camera.position.lerpVectors(CAM_START, CAM_END, e);
  camera.lookAt(SCREEN_CENTER);
  // к финалу немного сужаем угол -> экран заполняет кадр
  camera.fov = 45 - 8 * e;
  camera.updateProjectionMatrix();

  // подсказка скролла: видна в начале, исчезает при движении
  hint.style.opacity = (progress < 0.04 && !document.body.classList.contains('locked')) ? '1' : '0';

  // финал зума -> вход в CRT-комнату
  if (progress > 0.985) enterRoom();
}
window.addEventListener('scroll', updateScroll, { passive: true });

// ---- resize ----
window.addEventListener('resize', () => {
  const a = window.innerWidth / window.innerHeight;
  camera.aspect = a; camera.updateProjectionMatrix();
  roomCam.aspect = a; roomCam.updateProjectionMatrix();
  setRenderSize();
});

// ---- render loop ----
const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  drawScreen(t);
  screenTex.needsUpdate = true;
  if (inRoom) {
    aim();                          // взгляд (позицию двигает gsap по клику)
    rdust.rotation.y = t * 0.03;
    renderer.render(activeRoomScene, roomCam);
  } else {
    if (boombox) {
      if (playing) {
        // музыка включена -> бумбокс «качает»: подпрыгивает + покачивается + squash/stretch
        const beat = Math.abs(Math.sin(t * 7));
        boombox.position.y = boomBaseY + beat * 0.05;
        boombox.rotation.z = Math.sin(t * 7) * 0.05;
        boombox.scale.set(boomScale * (1 + beat * 0.06), boomScale * (1 - beat * 0.05), boomScale * (1 + beat * 0.06));
      } else {
        boombox.position.y = boomBaseY;
        boombox.rotation.z = 0;
        boombox.scale.setScalar(boomScale * (hoverBoom ? 1 + Math.sin(t * 6) * 0.05 : 1)); // лёгкий пульс при наведении
      }
    }
    animateSky(t);
    waterUniforms.time.value = t;
    dust.rotation.y = t * 0.02;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}
tick();

// =========================================================
//  ФАЗА 0: приветственное окно
// =========================================================
document.querySelector('#enter-btn').addEventListener('click', () => {
  gsap.to('#intro-modal', {
    autoAlpha: 0, scale: 1.04, duration: 0.9, ease: 'power2.inOut',
    onComplete: () => {
      document.querySelector('#intro-modal').style.display = 'none';
      document.body.classList.remove('locked');
      updateScroll();
    }
  });
});

updateScroll();
