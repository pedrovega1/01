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
let boombox = null, boomScale = 1, hoverBoom = false;

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
    boombox.position.set(0.95, 0, -1.9); boombox.rotation.y = -0.4;
    scene.add(boombox); boombox.updateMatrixWorld(true);
    boombox.position.y = tableTop - new THREE.Box3().setFromObject(boombox).min.y; // на столешницу

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
function hangPhoto(url, x, y, z, ry, h = 1.3) {
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
  grp.position.set(x, y, z); grp.rotation.y = ry; roomScene.add(grp);
  photoMeshes.push(photo);
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
hangPhoto('assets/1.png', -1.7, HY, -RD / 2 + eps, 0);
hangPhoto('assets/4.png', 1.7, HY, -RD / 2 + eps, 0);
hangPhoto('assets/2.png', -RW / 2 + eps, HY, -0.8, Math.PI / 2);
hangPhoto('assets/3.png', RW / 2 - eps, HY, -0.8, -Math.PI / 2);

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
  const fh = ray.intersectObject(floor)[0];
  if (fh) { moveTo(fh.point.x, fh.point.z); return; }
  // клик по фото -> встать ровно перед ним и навести взгляд в центр
  const ph = ray.intersectObjects(photoMeshes)[0];
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
  }
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
    renderer.render(roomScene, roomCam);
  } else {
    if (boombox) boombox.scale.setScalar(boomScale * (hoverBoom ? 1 + Math.sin(t * 6) * 0.05 : 1)); // пульс при наведении
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
