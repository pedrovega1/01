import { PS1 } from './config.js';

/* =========================================================
   PS1-СТИЛЬ: дрожание вершин (vertex snapping) + flat shading
   Привязываем вершины к грубой экранной сетке -> характерная «дрожь» PS1.
   ========================================================= */
export function makePS1(material) {
  if (!material || material.isPointsMaterial) return material;
  material.flatShading = true; // граненое освещение вместо гладкого
  material.onBeforeCompile = (shader) => {
    // снап-константа зашита в код (PS1.SNAP), без uniform — проще и без проблем с кэшем
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       // привязка к сетке в clip-space (PS1 vertex jitter)
       vec3 _ndc = gl_Position.xyz / gl_Position.w;
       _ndc.xy = floor(_ndc.xy * ${PS1.SNAP.toFixed(1)}) / ${PS1.SNAP.toFixed(1)};
       gl_Position.xyz = _ndc * gl_Position.w;`
    );
  };
  material.customProgramCacheKey = () => 'ps1-snap';
  material.needsUpdate = true;
  return material;
}

// применить PS1 ко всем мешам поддерева
export function applyPS1Tree(root) {
  root.traverse((o) => { if (o.isMesh) makePS1(o.material); });
  return root;
}
