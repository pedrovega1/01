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
scene.background = new THREE.Color(0xf0a25a);
scene.fog = new THREE.Fog(0xe79a5c, 22, 150); // закатная дымка на горизонте

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.copy(CAM_START);
camera.lookAt(SCREEN_CENTER);

// ---- освещение (закат) ----
const SUN_DIR = new THREE.Vector3(0.35, 0.18, -1).normalize(); // солнце низко за столом
scene.add(new THREE.HemisphereLight(0xffe0b0, 0x556b2f, 0.75)); // небо тёплое / земля зелёная
const sun = new THREE.DirectionalLight(0xffb066, 2.0);          // тёплый закатный свет
sun.position.copy(SUN_DIR.clone().multiplyScalar(40));
scene.add(sun);
const lamp = new THREE.PointLight(0xffd9a0, 8, 6, 2);           // мягкая подсветка монитора/стола
lamp.position.set(-0.9, 2.0, -1.4);
scene.add(lamp);

// ---- небо (градиентная полусфера: зенит -> закат у горизонта) ----
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x1d2c5e) }, // глубокий синий зенит
    mid: { value: new THREE.Color(0xff7a33) }, // оранжевый закат
    bot: { value: new THREE.Color(0xffcf8a) }, // светлая дымка у земли
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
    void main(){ float h = normalize(vP).y;
      vec3 c = mix(mid, top, smoothstep(0.04, 0.55, h));
      c = mix(bot, c, smoothstep(-0.08, 0.12, h));
      gl_FragColor = vec4(c, 1.0); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
scene.add(sky);

// ---- солнце-диск у горизонта ----
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(14, 32),
  new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false })
);
sunDisc.position.copy(SUN_DIR.clone().multiplyScalar(330));
sunDisc.lookAt(0, sunDisc.position.y, 0);
scene.add(sunDisc);

// ---- степь (большая зелёная плоскость) ----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800),
  new THREE.MeshStandardMaterial({ color: 0x5f7a33, roughness: 1 }) // степная зелень
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, -3);
scene.add(ground);

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
  sCtx.fillText('> a remake_', 40, 130);
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
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd8c9a8, size: 0.02, transparent: true, opacity: 0.5 }));
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

Promise.all([loadGLB('assets/Table.glb'), loadGLB('assets/pc.glb'), loadGLB('assets/Camera.glb')])
  .then(([table, pc, cam]) => {
    // --- стол (верх столешницы ~ y=1.0) ---
    const tableObj = table.scene; applyPS1Tree(tableObj);
    tableObj.position.set(0, 0, -2.0);
    scene.add(tableObj);

    // --- компьютер на столе ---
    const pcObj = pc.scene; applyPS1Tree(pcObj);
    pcObj.rotation.y = PC_ROT_Y;
    pcObj.position.set(0, 1.245, -2.0); // низ pc садится на столешницу
    scene.add(pcObj);

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
      screen.scale.set(s.x * 0.9, s.y * 0.9, 1);
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
//  СКРОЛЛ -> прогресс зума
// =========================================================
const driver = document.querySelector('#scroll-driver');
const siteContent = document.querySelector('#site-content');
const hint = document.querySelector('#scroll-hint');
let progress = 0;

function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function updateScroll() {
  const driverH = driver.offsetHeight;            // высота фазы зума
  progress = Math.min(1, Math.max(0, window.scrollY / driverH));

  // dolly камеры
  const e = easeInOut(progress);
  camera.position.lerpVectors(CAM_START, CAM_END, e);
  camera.lookAt(SCREEN_CENTER);
  // к финалу немного сужаем угол -> экран заполняет кадр
  camera.fov = 45 - 8 * e;
  camera.updateProjectionMatrix();

  // подсказка скролла: видна в начале, исчезает при движении
  hint.style.opacity = (progress < 0.04 && !document.body.classList.contains('locked')) ? '1' : '0';

  // проявление HTML-контента на финале зума
  const reveal = smoothstep(0.82, 1.0, progress);
  siteContent.style.opacity = reveal.toFixed(3);
  siteContent.classList.toggle('live', reveal > 0.5);
  canvas.style.opacity = (1 - smoothstep(0.92, 1.0, progress)).toFixed(3);
}
window.addEventListener('scroll', updateScroll, { passive: true });

// ---- resize ----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  setRenderSize();
});

// ---- render loop ----
const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  drawScreen(t);
  screenTex.needsUpdate = true;
  dust.rotation.y = t * 0.02;
  renderer.render(scene, camera);
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
