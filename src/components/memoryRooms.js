import * as THREE from 'three';
import { gsap } from 'gsap';
import { ASSETS, ROOM } from '../config.js';
import { renderer, raycaster, state, pointerNDC } from '../core.js';
import { makePS1, applyPS1Tree } from '../ps1.js';
import { loadGLB, texLoader } from '../loaders.js';
import { createDust } from './dust.js';

/* =========================================================
   CRT-комнаты памяти: две сцены в том же canvas, дверь между ними.
   createMemoryRooms({ onAfterExit }) -> { enterRoom, render,
                                           pointerDown, pointerUp, pointerMove }
   onAfterExit() вызывается при выходе из комнат (сброс наведения + скролла).
   ========================================================= */
export function createMemoryRooms({ onAfterExit } = {}) {
  const { W, H, D, DOOR_H, DOOR_OPEN, PHOTO_Y: HY, EPS: eps, MARGIN: M } = ROOM;

  // описания картин (по файлу) — редактируй текст тут -----------------------
  const PHOTO_CAPTIONS = {
    [ASSETS.photo1]: { t: 'Первое лето', d: 'Тёплый вечер, который хотелось остановить руками.' },
    [ASSETS.photo2]: { t: 'Свет в окне', d: 'Комната, где время всегда шло чуть медленнее.' },
    [ASSETS.photo3]: { t: 'Двое', d: 'Тишина, в которой не нужно было слов.' },
    [ASSETS.photo4]: { t: 'Дорога домой', d: 'Каждый кадр почему-то ведёт обратно к тебе.' },
  };
  // элемент описания + показ/скрытие
  const capEl = document.querySelector('#photo-caption');
  const capTitle = capEl?.querySelector('.pc-title');
  const capText = capEl?.querySelector('.pc-text');
  function showCaption(cap) {
    if (!capEl || !cap) return;
    capTitle.textContent = cap.t; capText.textContent = cap.d;
    capEl.classList.add('on');
  }
  function hideCaption() { capEl && capEl.classList.remove('on'); }

  // уютные процедурные текстуры (без файлов) --------------------------------
  function canvasTex(paint, repX = 1, repY = 1) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    paint(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repX, repY);
    t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function woodFloorTex() {
    return canvasTex((x) => {
      x.fillStyle = '#5a3e25'; x.fillRect(0, 0, 128, 128);
      const planks = 4, ph = 128 / planks, tones = ['#6b4a2c', '#5f4227', '#714e2e', '#634526'];
      for (let i = 0; i < planks; i++) {
        const y = i * ph;
        x.fillStyle = tones[i % 4]; x.fillRect(0, y + 1, 128, ph - 2);
        for (let g = 0; g < 5; g++) {                 // прожилки дерева
          x.strokeStyle = 'rgba(40,26,14,0.3)'; x.lineWidth = 1;
          const gy = y + 4 + Math.random() * (ph - 8);
          x.beginPath(); x.moveTo(0, gy); x.bezierCurveTo(40, gy + 2, 80, gy - 2, 128, gy); x.stroke();
        }
      }
    }, 4, 4);
  }
  function cozyWallTex() {
    return canvasTex((x) => {
      x.fillStyle = '#8a6f49'; x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 128; i += 16) {             // вертикальные полосы обоев
        x.fillStyle = (i / 16) % 2 ? '#96794f' : '#82663f'; x.fillRect(i, 0, 8, 128);
      }
      for (let n = 0; n < 500; n++) {                 // лёгкий шум-зерно
        x.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
        x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
      }
    }, 3, 1.5);
  }

  // фотки в рамках на стенах -----------------------------------------------
  function hangPhoto(targetScene, photosArr, url, x, y, z, ry, h = 1.3) {
    const grp = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.07),
      makePS1(new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.7 })));
    // паспарту без PS1-снапа, иначе z-файтит с фото
    const matte = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0xe9ddc2, roughness: 1 }));
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0x555555, side: THREE.DoubleSide }));
    frame.position.z = -0.035; matte.position.z = 0.015; photo.position.z = 0.05;
    grp.add(frame, matte, photo);
    grp.position.set(x, y, z); grp.rotation.y = ry; targetScene.add(grp);
    photo.userData.caption = PHOTO_CAPTIONS[url] || null; // описание для этой картины
    photosArr.push(photo);
    texLoader.load(url, (tex) => {
      tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      const a = tex.image.width / tex.image.height, w = h * a;
      photo.material.map = tex; photo.material.color.set(0xffffff); photo.material.needsUpdate = true;
      photo.scale.set(w, h, 1);
      matte.scale.set(w + 0.13, h + 0.13, 1);
      frame.scale.set(w + 0.28, h + 0.28, 1);
    });
  }

  // дверь из модели: полотно ("door") крутится по клику ----------------------
  const allDoors = []; // все двери (для сброса в закрытое при переходе)
  function makeModelDoor(fullScene, targetScene, x, z, ry, target) {
    const holder = new THREE.Group();
    const inst = fullScene.clone(true); // клон всей сцены (с предком -90°X)
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
    // за дверью — ТЕМНОТА: тёмный проём-ниша перед стеной
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

  // интерактивные объекты (общие билдеры) -----------------------------------
  // напольная лампа: клик по абажуру включает/выключает тёплый свет
  function makeLamp(scene, x, z) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z);
    const metal = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.8 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 14), metal);
    base.position.y = 0.04; grp.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.5, 8), metal);
    pole.position.y = 0.78; grp.add(pole);
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0xffe1a8, emissive: 0xffcf8a, emissiveIntensity: 0.85, roughness: 0.6, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.36, 16, 1, true), shadeMat);
    shade.position.y = 1.55; grp.add(shade);
    const light = new THREE.PointLight(0xffcf8a, 4, 8, 2); light.position.set(0, 1.5, 0); grp.add(light);
    // невидимый хитбокс пошире -> в абажур легче попасть кликом
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.5; grp.add(hit);
    scene.add(grp);
    let on = true;
    hit.userData.onClick = () => {
      on = !on;
      light.intensity = on ? 4 : 0;
      shadeMat.emissiveIntensity = on ? 0.85 : 0.05;
    };
    return hit;
  }

  // парящие орбы памяти: клик меняет цвет орба и его света (раскрашиваешь комнату)
  const ORB_PALETTE = [0xffb066, 0xff6f9c, 0x6fd0ff, 0x8fff9c];
  function makeOrb(scene, x, y, z, idx0) {
    let idx = idx0;
    const mat = new THREE.MeshStandardMaterial({ color: ORB_PALETTE[idx], emissive: ORB_PALETTE[idx], emissiveIntensity: 1.4, roughness: 0.3 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), mat);
    orb.position.set(x, y, z); scene.add(orb);
    const light = new THREE.PointLight(ORB_PALETTE[idx], 1.6, 6, 2); light.position.copy(orb.position); scene.add(light);
    orb.userData.baseY = y; orb.userData.phase = Math.random() * 6.28; orb.userData.light = light;
    orb.userData.onClick = () => {
      idx = (idx + 1) % ORB_PALETTE.length;
      mat.color.setHex(ORB_PALETTE[idx]); mat.emissive.setHex(ORB_PALETTE[idx]); light.color.setHex(ORB_PALETTE[idx]);
    };
    return orb;
  }

  // КОМНАТА 1 ----------------------------------------------------------------
  const roomScene = new THREE.Scene();
  roomScene.background = new THREE.Color(0x140f0a);
  roomScene.fog = new THREE.Fog(0x140f0a, 6, 16);
  const roomCam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 60);

  // стены/пол без PS1-снапа -> текстуры статичны при повороте камеры
  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
    new THREE.MeshStandardMaterial({ map: cozyWallTex(), roughness: 1, side: THREE.BackSide }));
  room.position.y = H / 2; roomScene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: woodFloorTex(), roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; roomScene.add(floor);

  roomScene.add(new THREE.HemisphereLight(0xffe0b0, 0x281a0c, 0.35));
  const roomLamp = new THREE.PointLight(0xffcf94, 3, 14, 2);
  roomLamp.position.set(0, 3.5, 0); roomScene.add(roomLamp);
  function lampAt(x, z, col, intensity) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10),
      new THREE.MeshBasicMaterial({ color: col }));
    bulb.position.set(x, 1.85, z); roomScene.add(bulb);
    const pl = new THREE.PointLight(col, intensity, 8, 2);
    pl.position.set(x, 1.85, z); roomScene.add(pl);
  }
  lampAt(-W / 2 + 0.7, D / 2 - 0.7, 0xffb066, 6);
  lampAt(W / 2 - 0.7, -D / 2 + 0.7, 0xff8a4a, 5);

  const rdust = createDust(); roomScene.add(rdust);

  const photoMeshes = [];
  hangPhoto(roomScene, photoMeshes, ASSETS.photo1, -2.5, HY, -D / 2 + eps, 0);
  hangPhoto(roomScene, photoMeshes, ASSETS.photo4, 2.5, HY, -D / 2 + eps, 0);
  hangPhoto(roomScene, photoMeshes, ASSETS.photo2, -W / 2 + eps, HY, -0.8, Math.PI / 2);
  hangPhoto(roomScene, photoMeshes, ASSETS.photo3, W / 2 - eps, HY, -0.8, -Math.PI / 2);

  const doorsRoom1 = [];
  const doorLight = new THREE.PointLight(0xffcf8a, 2.5, 6, 2);
  doorLight.position.set(0, 1.6, -D / 2 + 0.6); roomScene.add(doorLight);

  // КОМНАТА 2 ----------------------------------------------------------------
  function buildRoom2() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x120a08);
    s.fog = new THREE.Fog(0x120a08, 6, 16);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
      new THREE.MeshStandardMaterial({ map: cozyWallTex(), color: 0xd8c0a0, roughness: 1, side: THREE.BackSide }));
    walls.position.y = H / 2; s.add(walls);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: woodFloorTex(), roughness: 1 }));
    fl.rotation.x = -Math.PI / 2; s.add(fl);
    s.add(new THREE.HemisphereLight(0xffd9b0, 0x1a120a, 0.4));
    const pl = new THREE.PointLight(0xffc890, 3, 16, 2); pl.position.set(0, 3.5, 0); s.add(pl);
    s.add(createDust());
    const photos = [], doors = [];
    hangPhoto(s, photos, ASSETS.photo2, -2.5, HY, -D / 2 + eps, 0);
    hangPhoto(s, photos, ASSETS.photo3, 2.5, HY, -D / 2 + eps, 0);
    const dl = new THREE.PointLight(0xffcf8a, 2.2, 6, 2);
    dl.position.set(0, 1.6, D / 2 - 0.6); s.add(dl);
    // ИНТЕРАКТИВ: напольная лампа-выключатель (левее двери, в кадре при входе)
    const lamp = makeLamp(s, -1.8, -D / 2 + 1.4);
    return { scene: s, floor: fl, photos, doors, interactives: [lamp], update: null };
  }
  const room2 = buildRoom2();

  // КОМНАТА 3: «ночная» с цветными орбами памяти -----------------------------
  function buildRoom3() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x0a0c14);
    s.fog = new THREE.Fog(0x0a0c14, 6, 16);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
      new THREE.MeshStandardMaterial({ map: cozyWallTex(), color: 0x9fb0d0, roughness: 1, side: THREE.BackSide }));
    walls.position.y = H / 2; s.add(walls);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: woodFloorTex(), roughness: 1 }));
    fl.rotation.x = -Math.PI / 2; s.add(fl);
    s.add(new THREE.HemisphereLight(0x9fb0ff, 0x10121a, 0.3));
    const pl = new THREE.PointLight(0xbfcfff, 1.4, 16, 2); pl.position.set(0, 3.5, 0); s.add(pl);
    s.add(createDust());
    const orbs = [
      makeOrb(s, -2, 1.6, -1.5, 0),
      makeOrb(s, 0, 1.95, -2.4, 2),
      makeOrb(s, 2, 1.5, -1.0, 1),
    ];
    const photos = [], doors = [];
    hangPhoto(s, photos, ASSETS.photo1, -W / 2 + eps, HY, -0.8, Math.PI / 2);
    hangPhoto(s, photos, ASSETS.photo4, W / 2 - eps, HY, -0.8, -Math.PI / 2);
    const update = (t) => orbs.forEach((o) => {
      o.position.y = o.userData.baseY + Math.sin(t * 1.5 + o.userData.phase) * 0.15;
      o.rotation.y = t * 0.5;
      o.userData.light.position.y = o.position.y;
    });
    return { scene: s, floor: fl, photos, doors, interactives: orbs, update };
  }
  const room3 = buildRoom3();

  // двери в обе комнаты (между картинами)
  loadGLB(ASSETS.door).then((g) => {
    doorsRoom1.push(makeModelDoor(g.scene, roomScene, 0, -D / 2 + 0.1, 0, 'room2'));
    room2.doors.push(makeModelDoor(g.scene, room2.scene, 0, D / 2 - 0.1, Math.PI, 'room1'));
    room2.doors.push(makeModelDoor(g.scene, room2.scene, 0, -D / 2 + 0.1, 0, 'room3')); // 2 -> 3
    room3.doors.push(makeModelDoor(g.scene, room3.scene, 0, D / 2 - 0.1, Math.PI, 'room2')); // 3 -> 2
  }).catch((e) => console.warn('Дверь не загрузилась:', e));

  // активная комната (что рендерим/по чему кликаем)
  let activeRoomScene = roomScene, activeFloor = floor, activePhotos = photoMeshes, activeDoors = doorsRoom1;
  let activeInteractives = [], activeUpdate = null;

  // управление: осмотр перетаскиванием + навигация кликом
  let yaw = Math.PI, pitch = 0, dragging = false, moved = false, px = 0, py = 0;
  const roomDir = new THREE.Vector3();
  function aim() {
    roomDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    roomCam.lookAt(roomCam.position.clone().add(roomDir));
  }
  const clampX = (v) => Math.max(-W / 2 + M, Math.min(W / 2 - M, v));
  const clampZ = (v) => Math.max(-D / 2 + M, Math.min(D / 2 - M, v));
  function moveTo(tx, tz) {
    gsap.to(roomCam.position, { x: clampX(tx), z: clampZ(tz), duration: 1.1, ease: 'power2.inOut' });
  }

  // навигация кликом: дверь -> фото -> пол
  function navClick(e) {
    raycaster.setFromCamera(pointerNDC(e), roomCam);
    const dh = raycaster.intersectObjects(activeDoors, true)[0];
    if (dh) { let o = dh.object; while (o && o.userData.target === undefined) o = o.parent; if (o) { hideCaption(); activateDoor(o, o.userData.target); return; } }
    // интерактивные объекты (лампа/орбы): найти ближайший с onClick и дёрнуть
    const ih = raycaster.intersectObjects(activeInteractives, true)[0];
    if (ih) { let o = ih.object; while (o && !o.userData.onClick) o = o.parent; if (o) { o.userData.onClick(); return; } }
    const ph = raycaster.intersectObjects(activePhotos)[0];
    if (ph) {
      showCaption(ph.object.userData.caption); // описание появляется при подходе
      const grp = ph.object.parent;
      const c = grp.getWorldPosition(new THREE.Vector3());
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(grp.quaternion);
      const fx = clampX(c.x + n.x * 2.2), fz = clampZ(c.z + n.z * 2.2);
      moveTo(fx, fz);
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
    const fh = raycaster.intersectObject(activeFloor)[0];
    if (fh) { hideCaption(); moveTo(fh.point.x, fh.point.z); } // ушёл от картины -> скрыть
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

  // переход между комнатами (через шторку fade)
  function goToRoom(target) {
    if (busy) return;
    transition(() => {
      allDoors.forEach((d) => { if (d.userData.leaf) d.userData.leaf.rotation.y = d.userData.closed; });
      // в комнате 2 дверь обратно у стены +z -> спавним ближе к фото-стене,
      // чтобы при развороте дверь не оказалась впритык за спиной
      let startZ = ROOM.START_Z;
      if (target === 'room2') {
        activeRoomScene = room2.scene; activeFloor = room2.floor; activePhotos = room2.photos; activeDoors = room2.doors;
        activeInteractives = room2.interactives; activeUpdate = room2.update;
        startZ = ROOM.START_Z_ROOM2;
      } else if (target === 'room3') {
        activeRoomScene = room3.scene; activeFloor = room3.floor; activePhotos = room3.photos; activeDoors = room3.doors;
        activeInteractives = room3.interactives; activeUpdate = room3.update;
        startZ = ROOM.START_Z_ROOM2;
      } else {
        activeRoomScene = roomScene; activeFloor = floor; activePhotos = photoMeshes; activeDoors = doorsRoom1;
        activeInteractives = []; activeUpdate = null;
      }
      roomCam.position.set(0, 1.7, startZ); yaw = Math.PI; pitch = -0.05;
      aim();
    });
  }

  // переходы сцен (шторка fade) ---------------------------------------------
  const fade = document.querySelector('#fade');
  const roomUI = document.querySelector('#room-ui');
  let busy = false;
  function transition(swap) {
    busy = true;
    hideCaption(); // при любой смене сцены прячем описание
    gsap.to(fade, { opacity: 1, duration: 0.45, ease: 'power2.in', onComplete: () => {
      swap();
      gsap.to(fade, { opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => { busy = false; } });
    } });
  }
  function enterRoom() {
    if (state.inRoom || busy) return;
    transition(() => {
      state.inRoom = true;
      activeRoomScene = roomScene; activeFloor = floor; activePhotos = photoMeshes; activeDoors = doorsRoom1;
      activeInteractives = []; activeUpdate = null;
      roomCam.position.set(0, 1.7, ROOM.START_Z); yaw = Math.PI; pitch = -0.05; aim();
      document.body.classList.add('locked');
      roomUI && roomUI.classList.add('on');
    });
  }
  function exitRoom() {
    if (!state.inRoom || busy) return;
    transition(() => {
      state.inRoom = false;
      document.body.classList.remove('locked');
      roomUI && roomUI.classList.remove('on');
      onAfterExit && onAfterExit();
    });
  }
  const exitBtn = document.querySelector('#room-exit');
  exitBtn && exitBtn.addEventListener('click', exitRoom);

  // ввод (вызывается из main только когда state.inRoom) ----------------------
  function pointerDown(e) { dragging = true; moved = false; px = e.clientX; py = e.clientY; }
  function pointerUp(e) { if (!moved) navClick(e); dragging = false; }
  function pointerMove(e) {
    if (!dragging) return;
    if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 6) moved = true; // драг vs клик
    yaw -= (e.clientX - px) * 0.005;
    pitch = Math.max(-1.1, Math.min(1.1, pitch - (e.clientY - py) * 0.005));
    px = e.clientX; py = e.clientY;
  }

  function render(t) {
    aim();                       // позицию двигает gsap по клику
    rdust.rotation.y = t * 0.03;
    if (activeUpdate) activeUpdate(t); // анимация интерактива активной комнаты (орбы парят)
    renderer.render(activeRoomScene, roomCam);
  }

  return { camera: roomCam, enterRoom, exitRoom, render, pointerDown, pointerUp, pointerMove };
}
