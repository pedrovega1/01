import * as THREE from 'three';

/* =========================================================
   Лёгкие частицы-пылинки (общие для сцены стола и комнат).
   createDust() -> THREE.Points с собственной геометрией и
   само-анимацией (всплывают, покачиваются) — для «живого» вайба.
   ========================================================= */

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

const dustMat = new THREE.PointsMaterial({
  color: 0xd8c9a8, size: 0.05, map: dustSprite,
  transparent: true, opacity: 0.55, depthWrite: false,
  blending: THREE.AdditiveBlending, sizeAttenuation: true,
});

const N = 260;
const Y_MIN = 0, Y_MAX = 6.2, RANGE = Y_MAX - Y_MIN;

export function createDust() {
  // у каждой сцены свой буфер -> анимируем независимо
  const pos = new Float32Array(N * 3);
  const base = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  const rise = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 12, y = Math.random() * 6, z = (Math.random() - 0.5) * 10 - 2;
    base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    phase[i] = Math.random() * Math.PI * 2;
    rise[i] = 0.12 + Math.random() * 0.3; // скорость всплытия (у каждой своя)
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, dustMat);

  // само-анимация: всплытие с обёрткой + боковое покачивание + колыхание по Z
  points.onBeforeRender = () => {
    const t = performance.now() / 1000;
    const p = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const ph = phase[i];
      p[i * 3]     = base[i * 3] + Math.sin(t * 0.5 + ph) * 0.25;       // sway X
      p[i * 3 + 1] = Y_MIN + (((base[i * 3 + 1] - Y_MIN) + t * rise[i]) % RANGE); // подъём + wrap
      p[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.7 + ph) * 0.15;   // bob Z
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}
