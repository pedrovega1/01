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

  // КОМНАТА 1 ----------------------------------------------------------------
  const roomScene = new THREE.Scene();
  roomScene.background = new THREE.Color(0x140f0a);
  roomScene.fog = new THREE.Fog(0x140f0a, 6, 16);
  const roomCam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 60);

  const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
    makePS1(new THREE.MeshStandardMaterial({ color: 0x9c7c4e, roughness: 1, side: THREE.BackSide })));
  room.position.y = H / 2; roomScene.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
    makePS1(new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 1 })));
  floor.rotation.x = -Math.PI / 2; roomScene.add(floor);

  roomScene.add(new THREE.HemisphereLight(0xffe0b0, 0x281a0c, 0.3));
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
    s.background = new THREE.Color(0x0c1014);
    s.fog = new THREE.Fog(0x0c1014, 6, 16);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D),
      makePS1(new THREE.MeshStandardMaterial({ color: 0x4e6173, roughness: 1, side: THREE.BackSide })));
    walls.position.y = H / 2; s.add(walls);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D),
      makePS1(new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 1 })));
    fl.rotation.x = -Math.PI / 2; s.add(fl);
    s.add(new THREE.HemisphereLight(0xbfe0ff, 0x10181e, 0.4));
    const pl = new THREE.PointLight(0x9fd0ff, 3, 16, 2); pl.position.set(0, 3.5, 0); s.add(pl);
    s.add(createDust());
    const photos = [], doors = [];
    hangPhoto(s, photos, ASSETS.photo2, -2.5, HY, -D / 2 + eps, 0);
    hangPhoto(s, photos, ASSETS.photo3, 2.5, HY, -D / 2 + eps, 0);
    const dl = new THREE.PointLight(0xbfe0ff, 2.2, 6, 2);
    dl.position.set(0, 1.6, D / 2 - 0.6); s.add(dl);
    return { scene: s, floor: fl, photos, doors };
  }
  const room2 = buildRoom2();

  // двери в обе комнаты (между картинами)
  loadGLB(ASSETS.door).then((g) => {
    doorsRoom1.push(makeModelDoor(g.scene, roomScene, 0, -D / 2 + 0.1, 0, 'room2'));
    room2.doors.push(makeModelDoor(g.scene, room2.scene, 0, D / 2 - 0.1, Math.PI, 'room1'));
  }).catch((e) => console.warn('Дверь не загрузилась:', e));

  // активная комната (что рендерим/по чему кликаем)
  let activeRoomScene = roomScene, activeFloor = floor, activePhotos = photoMeshes, activeDoors = doorsRoom1;

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
    if (dh) { let o = dh.object; while (o && o.userData.target === undefined) o = o.parent; if (o) { activateDoor(o, o.userData.target); return; } }
    const ph = raycaster.intersectObjects(activePhotos)[0];
    if (ph) {
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
        startZ = ROOM.START_Z_ROOM2;
      } else {
        activeRoomScene = roomScene; activeFloor = floor; activePhotos = photoMeshes; activeDoors = doorsRoom1;
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
    renderer.render(activeRoomScene, roomCam);
  }

  return { camera: roomCam, enterRoom, exitRoom, render, pointerDown, pointerUp, pointerMove };
}
