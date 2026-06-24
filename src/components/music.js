import { state } from '../core.js';

/* =========================================================
   Управление музыкой: панель (шестерёнка), громкость, play/pause.
   Один и тот же toggle() дёргают кнопка панели И клик по бумбоксу.
   createMusic() -> { toggle }
   ========================================================= */
export function createMusic() {
  const bgm = document.querySelector('#bgm');
  const boomHint = document.querySelector('#boom-hint');
  const musicGear = document.querySelector('#music-gear');
  const musicPanel = document.querySelector('#music-panel');
  const musicPlay = document.querySelector('#music-play');
  const volSlider = document.querySelector('#vol-slider');
  const volVal = document.querySelector('#vol-val');
  let panelOpen = false;

  // громкость: синхронизируем со слайдером (0..100 -> 0..1)
  function applyVolume() {
    const v = (volSlider ? parseInt(volSlider.value, 10) : 70) / 100;
    if (bgm) bgm.volume = v;
    if (volVal) volVal.textContent = volSlider ? volSlider.value : 70;
  }
  applyVolume();
  if (volSlider) volSlider.addEventListener('input', applyVolume);

  // открыть/закрыть панель музыки
  function togglePanel() {
    panelOpen = !panelOpen;
    if (musicPanel) musicPanel.classList.toggle('open', panelOpen);
  }
  if (musicGear) musicGear.addEventListener('click', togglePanel);

  // воспроизведение/пауза + синхронизация всех индикаторов
  function toggle() {
    state.playing = !state.playing;
    applyVolume(); // на случай, если меняли громкость «вхолостую» до старта
    if (state.playing) bgm.play().catch(() => {}); else bgm.pause();
    if (boomHint) boomHint.textContent = state.playing ? '⏸ ПАУЗА' : '▶ ВКЛЮЧИТЬ';
    if (musicPlay) musicPlay.textContent = state.playing ? '⏸ ПАУЗА' : '▶ ИГРАТЬ';
    if (musicGear) musicGear.classList.toggle('playing', state.playing);
  }
  if (musicPlay) musicPlay.addEventListener('click', toggle);

  return { toggle };
}
