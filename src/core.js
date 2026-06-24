import * as THREE from 'three';
import { PS1 } from './config.js';

/* =========================================================
   Общие синглтоны: renderer, часы, raycaster, runtime-состояние.
   ========================================================= */

export const canvas = document.querySelector('#scene-canvas');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });

// рендерим в низком разрешении; CSS (image-rendering: pixelated) растягивает -> крупный пиксель
export function setRenderSize() {
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth / PS1.PIXEL, window.innerHeight / PS1.PIXEL, false);
}
setRenderSize();

export const clock = new THREE.Clock();
export const raycaster = new THREE.Raycaster();

// общие флаги, которые читают/меняют разные компоненты
export const state = {
  playing: false, // играет ли музыка (бумбокс/танцор синхронятся с этим)
  inRoom: false,  // находимся ли внутри комнаты памяти (что рендерим)
};

// нормализованные координаты указателя [-1..1] из события мыши
export function pointerNDC(e) {
  return new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1,
  );
}
