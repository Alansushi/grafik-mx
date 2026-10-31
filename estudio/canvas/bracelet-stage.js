// Render original de pulsera: tira editable y simulación cerrada desde el mismo arte.
// El canvas de exportación no incluye tiradores ni controles.
import { canvasToBlob } from './snapshot.js';
import { isDarkColor } from '../lib/color.js';

const W = 1000;
const H = 720;
const STRIP = { x: 120, y: 156, w: 760, h: 120 };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function createBraceletStage({ container, colorHex }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'es-bracelet-canvas';
  container.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');
  const strip = document.createElement('canvas');
  strip.width = STRIP.w;
  strip.height = STRIP.h;
  const sc = strip.getContext('2d');
  let color = colorHex;
  let logo = null;
  let natural = null;
  let transform = null;
  let dragging = false;
  const listeners = new Set();

  function notify() { if (transform) listeners.forEach((fn) => fn({ ...transform })); }
  function drawLogo() {
    if (!logo || !transform) return;
    const t = transform;
    const width = natural.width * t.scaleX;
    const height = natural.height * t.scaleY;
    sc.save();
    sc.translate(t.x - STRIP.x, t.y - STRIP.y);
    sc.rotate(t.rotation * Math.PI / 180);
    sc.drawImage(logo, -width / 2, -height / 2, width, height);
    sc.restore();
  }

  function render(showGuide = true) {
    ctx.clearRect(0, 0, W, H);
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#262626'); bg.addColorStop(1, '#111111');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.font = '600 19px Barlow, sans-serif';
    ctx.fillStyle = '#F0F0EE'; ctx.fillText('TIRA PLANA · EDITA TU IMAGEN', 120, 105);
    ctx.fillStyle = '#A8A8A8'; ctx.font = '15px Barlow, sans-serif';
    ctx.fillText('Vista ilustrativa · zona visible aproximada', 120, 129);

    sc.clearRect(0, 0, strip.width, strip.height);
    sc.fillStyle = color; sc.fillRect(0, 0, strip.width, strip.height);
    drawLogo();

    // Sombra, extremos redondeados y una pequeña línea de cierre.
    ctx.save();
    ctx.shadowColor = '#000'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
    ctx.beginPath(); ctx.roundRect(STRIP.x, STRIP.y, STRIP.w, STRIP.h, 17); ctx.clip();
    ctx.drawImage(strip, STRIP.x, STRIP.y);
    const sheen = ctx.createLinearGradient(0, STRIP.y, 0, STRIP.y + STRIP.h);
    sheen.addColorStop(0, 'rgba(255,255,255,.18)');
    sheen.addColorStop(.4, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,.22)');
    ctx.fillStyle = sheen; ctx.fillRect(STRIP.x, STRIP.y, STRIP.w, STRIP.h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(STRIP.x + 25, STRIP.y + 9);
    ctx.lineTo(STRIP.x + 25, STRIP.y + STRIP.h - 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(STRIP.x + STRIP.w - 25, STRIP.y + 9);
    ctx.lineTo(STRIP.x + STRIP.w - 25, STRIP.y + STRIP.h - 9); ctx.stroke();

    if (showGuide) {
      ctx.save();
      ctx.strokeStyle = isDarkColor(color) ? '#FFFFFF' : '#0C0C0C';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 7]);
      ctx.strokeRect(145, 172, 710, 88);
      ctx.restore();
    }

    ctx.fillStyle = '#F0F0EE'; ctx.font = '600 19px Barlow, sans-serif';
    ctx.fillText('PULSERA CERRADA · SIMULACIÓN', 120, 351);
    ctx.fillStyle = '#A8A8A8'; ctx.font = '15px Barlow, sans-serif';
    ctx.fillText('El equipo confirmará material, medidas y técnica', 120, 375);

    // Cada columna de la tira alimenta una columna del frente curvo.
    // El centro conserva más anchura y altura aparente; los laterales se alejan.
    for (let x = 0; x < STRIP.w; x += 2) {
      const u = x / STRIP.w;
      const a = (u - .5) * Math.PI * .9;
      const px = 500 + 310 * Math.sin(a);
      const next = 500 + 310 * Math.sin(((x + 2) / STRIP.w - .5) * Math.PI * .9);
      const y = 471 + 58 * Math.cos(a);
      const height = 82 + 19 * Math.cos(a);
      ctx.drawImage(strip, x, 0, 2, STRIP.h, px, y, Math.max(1, next - px + 1), height);
      const shade = Math.abs(u - .5) * .32;
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(px, y, Math.max(1, next - px + 1), height);
    }
    ctx.fillStyle = '#999'; ctx.font = '14px Barlow, sans-serif';
    ctx.fillText('Referencia visual · no es arte final de impresión', 120, 672);
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const p = pointer(e);
    if (!logo || p.x < STRIP.x || p.x > STRIP.x + STRIP.w || p.y < STRIP.y || p.y > STRIP.y + STRIP.h) return;
    dragging = true; canvas.setPointerCapture(e.pointerId);
    canvas._last = p;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !transform) return;
    const p = pointer(e);
    transform.x = clamp(transform.x + p.x - canvas._last.x, STRIP.x, STRIP.x + STRIP.w);
    transform.y = clamp(transform.y + p.y - canvas._last.y, STRIP.y, STRIP.y + STRIP.h);
    canvas._last = p; render(); notify();
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  render();
  return {
    setGarment({ colorHex: hex }) { if (hex) color = hex; render(); },
    setLogo({ image, naturalSize }) {
      logo = image; natural = naturalSize;
      if (image) {
        const fit = Math.min(620 / natural.width, 90 / natural.height);
        transform = { x: 500, y: 216, scaleX: fit, scaleY: fit, rotation: 0 };
        notify();
      } else transform = null;
      container.dataset.editing = String(Boolean(image)); render();
    },
    getTransform() { return transform ? { ...transform } : null; },
    setTransform(next) {
      if (!transform) return;
      transform = { ...next, x: clamp(next.x, STRIP.x, STRIP.x + STRIP.w),
        y: clamp(next.y, STRIP.y, STRIP.y + STRIP.h), rotation: 0 };
      render(); notify();
    },
    fitLogo() {
      if (!natural) return;
      const fit = Math.min(620 / natural.width, 90 / natural.height);
      transform = { x: 500, y: 216, scaleX: fit, scaleY: fit, rotation: 0 };
      render(); notify();
    },
    getFitScale() { return natural ? Math.min(620 / natural.width, 90 / natural.height) : 1; },
    onTransformChange(fn) { listeners.add(fn); },
    isLogoSelected() { return Boolean(logo); },
    nudge(dx, dy) { if (transform) this.setTransform({ ...transform, x: transform.x + dx, y: transform.y + dy }); },
    async snapshot() {
      render(false);
      try { return await canvasToBlob(canvas); }
      finally { render(); }
    },
    destroy() { container.replaceChildren(); container.dataset.editing = 'false'; },
  };
}
