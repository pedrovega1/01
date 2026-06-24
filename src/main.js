import { gsap } from 'gsap';
import { DESK } from './config.js';
import { renderer, clock, state, setRenderSize } from './core.js';
import { createDeskScene } from './components/deskScene.js';
import { createMemoryRooms } from './components/memoryRooms.js';
import { createMusic } from './components/music.js';

/* =========================================================
   The Web — a remake (Three.js dolly-into-monitor prototype)
   Фазы: 0) интро  1) сцена-стол  2) скролл-зум в монитор  3) комнаты памяти
   Этот файл — только сборка компонентов + цикл рендера + скролл/ресайз/интро.
   ========================================================= */

// ---- компоненты ----
const desk = createDeskScene({ onReady: () => updateScroll() });
const rooms = createMemoryRooms({
  // при выходе из комнат: сбросить наведение на бумбокс и пересчитать скролл
  onAfterExit: () => { desk.clearHover(); window.scrollTo(0, 0); updateScroll(); },
});
const music = createMusic();

// =========================================================
//  СКРОЛЛ -> прогресс зума камеры в монитор -> вход в комнату
// =========================================================
const hint = document.querySelector('#scroll-hint');
function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

function updateScroll() {
  // прогресс по всему диапазону скролла (без HTML-контента низ не даёт дойти до 1)
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;

  // dolly камеры стола
  const e = easeInOut(progress);
  desk.camera.position.lerpVectors(DESK.CAM_START, DESK.CAM_END, e);
  desk.camera.lookAt(DESK.SCREEN_CENTER);
  desk.camera.fov = 45 - 8 * e; // к финалу сужаем угол -> экран заполняет кадр
  desk.camera.updateProjectionMatrix();

  // подсказка скролла: видна в начале, исчезает при движении
  if (hint) hint.style.opacity = (progress < 0.04 && !document.body.classList.contains('locked')) ? '1' : '0';

  // финал зума -> вход в CRT-комнату
  if (progress > 0.985) rooms.enterRoom();
}
window.addEventListener('scroll', updateScroll, { passive: true });

// =========================================================
//  ВВОД: снаружи — бумбокс; в комнате — осмотр/навигация
// =========================================================
addEventListener('pointerdown', (e) => { if (state.inRoom) rooms.pointerDown(e); });
addEventListener('pointerup', (e) => {
  if (state.inRoom) { rooms.pointerUp(e); return; }
  if (desk.isHoverBoombox()) music.toggle(); // клик по бумбоксу снаружи
});
addEventListener('pointermove', (e) => {
  if (state.inRoom) rooms.pointerMove(e);
  else desk.updateHover(e);
});

// ---- resize ----
window.addEventListener('resize', () => {
  const a = window.innerWidth / window.innerHeight;
  desk.camera.aspect = a; desk.camera.updateProjectionMatrix();
  rooms.camera.aspect = a; rooms.camera.updateProjectionMatrix();
  setRenderSize();
});

// =========================================================
//  ЦИКЛ РЕНДЕРА
// =========================================================
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05); // кап от больших скачков
  const t = clock.elapsedTime;
  desk.drawScreen(t);                 // текстура экрана обновляется всегда
  if (state.inRoom) rooms.render(t, dt);
  else desk.render(t, dt);
  requestAnimationFrame(tick);
}
tick();

// =========================================================
//  ФАЗА 0: приветственное окно
// =========================================================
document.querySelector('#enter-btn').addEventListener('click', () => {
  gsap.to('#intro-modal', {
    autoAlpha: 0, scale: 1.04, duration: 0.9, ease: 'power2.inOut',
    onComplete: () => {
      document.querySelector('#intro-modal').style.display = 'none';
      document.body.classList.remove('locked');
      updateScroll();
    }
  });
});

// инициализируем Lucide-иконки (заменяет <i data-lucide="..."> на SVG)
if (window.lucide) lucide.createIcons();

updateScroll();
