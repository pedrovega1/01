import * as THREE from 'three';

/* =========================================================
   Степь/вода: большая плоскость с шейдерной рябью и бликом заката.
   createWater(scene) -> { update(t) }
   ========================================================= */
export function createWater(scene) {
  const uniforms = {
    time: { value: 0 },
    deep: { value: new THREE.Color(0x172f2f) },
    shallow: { value: new THREE.Color(0x4f704f) },
    amber: { value: new THREE.Color(0xff9f3f) },
  };
  const mat = new THREE.ShaderMaterial({
    fog: false,
    depthWrite: true,
    uniforms,
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
        // плавная (непрерывная) рябь — без блочной сетки floor()
        vec2 p = vWorld.xz;
        float ripple = sin(p.x * 0.85 + time * 1.2) * 0.5 + sin(p.y * 1.15 - time * 1.7) * 0.5;
        ripple = ripple * 0.5 + 0.5; // 0..1

        float horizon = smoothstep(-170.0, 150.0, -vWorld.z);
        vec3 color = mix(shallow, deep, horizon);
        color += (ripple - 0.5) * 0.09;

        float center = 1.0 - smoothstep(0.0, 42.0, abs(vWorld.x));
        float distanceFade = smoothstep(20.0, 190.0, -vWorld.z);
        // мягкое мерцающее отражение вместо жёсткого квадратного step-блика
        float broken = fract(sin(dot(floor(p * 0.9), vec2(12.9898, 78.233))) * 43758.5453);
        float reflection = center * distanceFade * (0.45 + ripple * 0.55) * mix(0.7, 1.0, smoothstep(0.46, 0.66, broken));
        color = mix(color, amber, reflection * 0.55);

        // мягкая полоса блика, катящаяся к берегу
        float scan = smoothstep(0.7, 0.95, fract((vWorld.z + time * 7.0) * 0.18));
        color += amber * scan * center * distanceFade * 0.08;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(800, 800, 120, 120), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.015, -3);
  scene.add(water);

  return { update(t) { uniforms.time.value = t; } };
}
