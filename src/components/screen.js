import * as THREE from 'three';

/* =========================================================
   Живой CRT-экран монитора: CanvasTexture с ретро-контентом.
   createScreen(scene) -> { mesh, draw(t), placeAt(center, w, h) }
   ========================================================= */
export function createScreen(scene) {
  const sCanvas = document.createElement('canvas');
  sCanvas.width = 512; sCanvas.height = 400;
  const sCtx = sCanvas.getContext('2d');

  function draw(t) {
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
    texture.needsUpdate = true;
  }

  const texture = new THREE.CanvasTexture(sCanvas);
  texture.magFilter = THREE.NearestFilter; // PS1: без сглаживания текстуры
  texture.minFilter = THREE.NearestFilter;
  draw(0); // первый кадр (texture уже создан)

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1), // масштабируется под монитор модели после загрузки
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  );
  mesh.visible = false; // покажем, спозиционировав по экрану pc.glb
  scene.add(mesh);

  // положить оверлей на нарисованный экран (фронтально, нормаль +Z)
  function placeAt(center, w, h) {
    mesh.position.copy(center);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(w, h, 1);
    mesh.visible = true;
  }

  return { mesh, draw, placeAt };
}
