import * as THREE from 'three';
import { DESK } from '../config.js';

/* =========================================================
   Небо заката: градиентный купол + солнце-диск + лучи + пиксельные облака.
   createSky(scene, camera) -> { update(t) }
   ========================================================= */
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

function addPixelCloud(scene, camera, blocks, position, scale = 1) {
  const cloud = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd9b0, transparent: true, opacity: 0.86, fog: false, depthWrite: false,
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

export function createSky(scene, camera) {
  // купол неба (зенит -> закат у горизонта)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6b3a24) },
      mid: { value: new THREE.Color(0xf06a24) },
      bot: { value: new THREE.Color(0xffb14a) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
      void main(){ float h = normalize(vP).y;
        vec3 c = mix(mid, top, smoothstep(0.02, 0.42, h));
        c = mix(bot, c, smoothstep(-0.14, 0.08, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));

  const sunTexture = makeSynthSunTexture();
  sunTexture.magFilter = THREE.NearestFilter;
  sunTexture.minFilter = THREE.NearestFilter;

  const sunRaysTexture = makeSunRaysTexture();
  sunRaysTexture.magFilter = THREE.NearestFilter;
  sunRaysTexture.minFilter = THREE.NearestFilter;

  // лучи солнца
  const sunRays = new THREE.Mesh(
    new THREE.PlaneGeometry(96, 96),
    new THREE.MeshBasicMaterial({
      map: sunRaysTexture, transparent: true, opacity: 0.62,
      fog: false, depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  sunRays.position.copy(DESK.SUN_DIR.clone().multiplyScalar(329));
  sunRays.lookAt(camera.position);
  sunRays.renderOrder = 1;
  scene.add(sunRays);

  // диск солнца у горизонта
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 48),
    new THREE.MeshBasicMaterial({ map: sunTexture, transparent: true, fog: false, depthWrite: false })
  );
  sunDisc.position.copy(DESK.SUN_DIR.clone().multiplyScalar(330));
  sunDisc.lookAt(0, sunDisc.position.y, 0);
  sunDisc.renderOrder = 2;
  scene.add(sunDisc);

  // пиксельные облака
  const skyClouds = [
    addPixelCloud(scene, camera, cloudBlocksA, new THREE.Vector3(-54, 23, -120), 3.3),
    addPixelCloud(scene, camera, cloudBlocksB, new THREE.Vector3(58, 28, -135), 3.0),
  ];
  skyClouds.forEach((cloud, i) => {
    cloud.userData.base = cloud.position.clone();
    cloud.userData.phase = i * 2.4;
  });

  function update(t) {
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

  return { update };
}
