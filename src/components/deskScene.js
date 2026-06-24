import * as THREE from 'three';
import { ASSETS, DESK, BOOMBOX, DANCER, PROP_CAMERA } from '../config.js';
import { renderer, canvas, raycaster, state, pointerNDC } from '../core.js';
import { applyPS1Tree, makePS1 } from '../ps1.js';
import { loadGLB, loadFBX } from '../loaders.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createScreen } from './screen.js';
import { createDust } from './dust.js';

/* =========================================================
   Сцена со столом (фаза 1–2): закат, ПК-портал, бумбокс с нотами, танцор.
   createDeskScene({ onReady }) -> { scene, camera, drawScreen, render,
                                     updateHover, isHoverBoombox, clearHover }
   onReady() вызывается, когда экран спозиционирован по модели (для пересчёта скролла).
   ========================================================= */
export function createDeskScene({ onReady } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffa24a);
  scene.fog = new THREE.Fog(0xc86a2d, 24, 150); // закатная дымка на горизонте

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.copy(DESK.CAM_START);
  camera.lookAt(DESK.SCREEN_CENTER);

  // ---- освещение (закат) ----
  scene.add(new THREE.HemisphereLight(0xffd2c8, 0x4b5320, 0.8)); // небо тёплое / земля зелёная
  const sun = new THREE.DirectionalLight(0xffb066, 2.35);          // тёплый закатный свет
  sun.position.copy(DESK.SUN_DIR.clone().multiplyScalar(40));
  scene.add(sun);
  const lamp = new THREE.PointLight(0xffd9a0, 8, 6, 2);           // мягкая подсветка монитора/стола
  lamp.position.set(-0.9, 2.0, -1.4);
  scene.add(lamp);

  // ---- окружение ----
  const sky = createSky(scene, camera);
  const water = createWater(scene);
  const screen = createScreen(scene);
  const dust = createDust(); scene.add(dust);

  // ---- состояние бумбокса/нот/танцора ----
  let boombox = null, boomScale = 1, boomBaseY = 0, hoverBoom = false;
  let dancerMixer = null;

  const noteGroup = new THREE.Group(); scene.add(noteGroup);
  const noteMat = new THREE.MeshBasicMaterial({ color: 0x0a0a09, fog: false });
  let noteTemplate = null;
  let noteEmitPoints = [];
  const notes = [];          // активные ноты: { mesh, vel, spin, life, maxLife }
  let noteTimer = 0;

  function buildNoteTemplate() {
    // тёмные «восьмые» ноты (хорошо читаются на тёплом фоне)
    const mkBox = (w, h, d) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), noteMat);
    const nHead = mkBox(0.035, 0.05, 0.035); nHead.position.set(-0.012, 0.025, 0);
    const nHead2 = mkBox(0.035, 0.05, 0.035); nHead2.position.set(0.02, 0.05, 0);
    const nStem = mkBox(0.006, 0.09, 0.006); nStem.position.set(0.018, 0.07, 0);
    const nFlag = mkBox(0.03, 0.006, 0.006); nFlag.position.set(0.033, 0.11, 0);
    const g = new THREE.Group(); g.add(nHead, nHead2, nStem, nFlag);
    return g;
  }

  function spawnNote() {
    if (!noteTemplate || !boombox) return;
    const side = noteEmitPoints[Math.floor(Math.random() * noteEmitPoints.length)];
    const mesh = noteTemplate.clone(true);
    // стартовая позиция — из рупора в мировых координатах
    const wp = side.clone().multiplyScalar(boomScale).applyAxisAngle(new THREE.Vector3(0, 1, 0), boombox.rotation.y);
    wp.add(boombox.position);
    mesh.position.copy(wp);
    mesh.scale.setScalar(boomScale);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    // скорость: вверх + вбок + к камере
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.6,
      0.9 + Math.random() * 0.5,
      0.6 + Math.random() * 0.5,
    ).multiplyScalar(0.6);
    notes.push({
      mesh, vel,
      spin: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5),
      life: 0, maxLife: 1.6 + Math.random() * 0.8,
    });
    noteGroup.add(mesh);
  }

  function updateNotes(dt) {
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      n.life += dt;
      const k = n.life / n.maxLife;
      n.vel.y -= 1.1 * dt;                        // гравитация — ноты взлетают и плавно падают
      n.mesh.position.addScaledVector(n.vel, dt);
      n.mesh.rotation.x += n.spin.x * dt;
      n.mesh.rotation.y += n.spin.y * dt;
      n.mesh.rotation.z += n.spin.z * dt;
      // затухание: последние 35% жизни — растворяемся
      n.mesh.scale.setScalar(boomScale * (1 - Math.max(0, (k - 0.65) / 0.35)) * 0.9);
      if (k >= 1) {
        noteGroup.remove(n.mesh);
        n.mesh.traverse((c) => { if (c.geometry) c.geometry.dispose?.(); });
        notes.splice(i, 1);
      }
    }
  }

  // ---- загрузка моделей: стол + ПК + видеокамера + бумбокс ----
  Promise.all([loadGLB(ASSETS.table), loadGLB(ASSETS.pc), loadGLB(ASSETS.camera), loadGLB(ASSETS.boombox)])
    .then(([table, pc, cam, boom]) => {
      // стол (верх столешницы ~ y=1.0)
      const tableObj = applyPS1Tree(table.scene);
      tableObj.position.set(0, 0, -2.0);
      scene.add(tableObj);
      tableObj.updateMatrixWorld(true);
      const tableTop = new THREE.Box3().setFromObject(tableObj).max.y;

      // компьютер на столе
      const pcObj = applyPS1Tree(pc.scene);
      pcObj.rotation.y = DESK.PC_ROT_Y;
      pcObj.position.set(0, 1.245, -2.0);
      scene.add(pcObj);

      // бумбокс слева от монитора
      boombox = applyPS1Tree(boom.scene);
      const bsz = new THREE.Box3().setFromObject(boombox).getSize(new THREE.Vector3());
      boomScale = BOOMBOX.WIDTH / bsz.x; boombox.scale.setScalar(boomScale);
      boombox.position.copy(BOOMBOX.position); boombox.rotation.y = BOOMBOX.rotationY;
      scene.add(boombox); boombox.updateMatrixWorld(true);
      boombox.position.y = tableTop - new THREE.Box3().setFromObject(boombox).min.y; // на столешницу
      boomBaseY = boombox.position.y;

      // ноты: шаблон + точки излучения (оба рупора)
      noteTemplate = buildNoteTemplate();
      noteEmitPoints = [
        new THREE.Vector3(-0.42, 0.18, 0), // левый динамик
        new THREE.Vector3(0.42, 0.18, 0),  // правый динамик
      ];

      // видеокамера слева-сзади, как фоновый реквизит
      const camObj = applyPS1Tree(cam.scene);
      camObj.position.copy(PROP_CAMERA.position);
      camObj.rotation.y = PROP_CAMERA.rotationY;
      scene.add(camObj);

      // живой экран по монитору модели + наводка dolly
      const sm = screen.placeOnMesh(pcObj);
      if (sm) {
        DESK.SCREEN_CENTER.set(sm.center.x, sm.center.y, sm.center.z + sm.size.z / 2);
        DESK.CAM_START.set(sm.center.x, sm.center.y + 0.5, sm.center.z + 4.4);
        DESK.CAM_END.set(sm.center.x, sm.center.y, sm.center.z + 0.28);
        camera.position.copy(DESK.CAM_START);
        camera.lookAt(DESK.SCREEN_CENTER);
        onReady && onReady();
      }
    })
    .catch((e) => console.warn('Модель не загрузилась:', e));

  // ---- танцующий персонаж (Mixamo «Samba Dancing») позади видеокамеры ----
  loadFBX(ASSETS.dancer).then((fbx) => {
    // FBX от Mixamo идёт в «сантиметрах» (~180 ед.) -> подгоняем рост под DANCER.HEIGHT
    const h = new THREE.Box3().setFromObject(fbx).getSize(new THREE.Vector3()).y || 180;
    fbx.scale.setScalar(DANCER.HEIGHT / h);
    fbx.position.copy(DANCER.position);
    fbx.rotation.y = DANCER.rotationY;
    if (DANCER.PS1) applyPS1Tree(fbx); // выкл -> гладкое освещение без дрожи вершин (меньше «пикселей»)
    fbx.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    scene.add(fbx);
    // анимация: запускаем экшен, но «крутить» будем только при играющей музыке
    if (fbx.animations && fbx.animations.length) {
      dancerMixer = new THREE.AnimationMixer(fbx);
      dancerMixer.clipAction(fbx.animations[0]).play();
      dancerMixer.update(0); // встаём в первый кадр позы, а не в T-pose
    }
  }).catch((e) => console.warn('Танцор не загрузился:', e));

  // ---- каждый кадр (даже в комнате): обновляем текстуру экрана ----
  function drawScreen(t) { screen.draw(t); }

  // ---- кадр сцены стола: бумбокс/ноты/танцор/окружение + рендер ----
  function render(t, dt) {
    if (boombox) {
      if (state.playing) {
        // музыка включена -> бумбокс «качает»: подпрыгивает + покачивается + squash/stretch
        const beat = Math.abs(Math.sin(t * 7));
        boombox.position.y = boomBaseY + beat * 0.05;
        boombox.rotation.z = Math.sin(t * 7) * 0.05;
        boombox.scale.set(boomScale * (1 + beat * 0.06), boomScale * (1 - beat * 0.05), boomScale * (1 + beat * 0.06));
        // спавн нот: темп привязан к «биту»
        noteTimer -= dt;
        if (noteTimer <= 0) { spawnNote(); noteTimer = 0.16 + Math.random() * 0.12; }
      } else {
        boombox.position.y = boomBaseY;
        boombox.rotation.z = 0;
        boombox.scale.setScalar(boomScale * (hoverBoom ? 1 + Math.sin(t * 6) * 0.05 : 1)); // пульс при наведении
      }
    }
    updateNotes(dt); // обновляем всегда — остаток нот долетит даже на паузе
    if (dancerMixer && state.playing) dancerMixer.update(dt); // танцор двигается только под музыку
    sky.update(t);
    water.update(t);
    dust.rotation.y = t * 0.02;
    renderer.render(scene, camera);
  }

  // ---- наведение на бумбокс: курсор-палец + подсказка у курсора ----
  const boomHint = document.querySelector('#boom-hint');
  function updateHover(e) {
    if (!boombox) return;
    raycaster.setFromCamera(pointerNDC(e), camera);
    hoverBoom = raycaster.intersectObject(boombox, true).length > 0;
    canvas.style.cursor = hoverBoom ? 'pointer' : '';
    if (boomHint) {
      boomHint.style.opacity = hoverBoom ? '1' : '0';
      boomHint.style.left = e.clientX + 'px';
      boomHint.style.top = (e.clientY - 26) + 'px';
    }
  }
  function isHoverBoombox() { return hoverBoom; }
  function clearHover() {
    hoverBoom = false;
    if (boomHint) boomHint.style.opacity = '0';
    canvas.style.cursor = '';
  }

  return { scene, camera, drawScreen, render, updateHover, isHoverBoombox, clearHover };
}
