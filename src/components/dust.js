import * as THREE from 'three';

/* =========================================================
   Лёгкие частицы-пылинки (общие для сцены стола и комнат).
   createDust() отдаёт новый объект с общей геометрией/материалом —
   у каждой сцены своя трансформация (вращение), но один буфер.
   ========================================================= */
const dustGeo = new THREE.BufferGeometry();
const dustPos = [];
for (let i = 0; i < 220; i++) {
  dustPos.push((Math.random() - 0.5) * 12, Math.random() * 6, (Math.random() - 0.5) * 10 - 2);
}
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

const dustMat = new THREE.PointsMaterial({
  color: 0xd8c9a8, size: 0.05, map: dustSprite,
  transparent: true, opacity: 0.55, depthWrite: false,
  blending: THREE.AdditiveBlending, sizeAttenuation: true,
});

export function createDust() {
  return new THREE.Points(dustGeo, dustMat);
}
