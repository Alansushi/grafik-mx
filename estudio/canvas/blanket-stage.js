// Editor de impresión completa. El canvas visible y la vista exportada comparten
// el mismo compositor; los recortes se guardan por medida en memoria.
import { blanketSize, coverTransform, clampBlanketTransform } from '../lib/blankets.js';
import { canvasToBlob } from './snapshot.js';

export function createBlanketStage({ container, mockups, initialSize = 'P' }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'es-blanket-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.touchAction = 'none';
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  const artwork = document.createElement('canvas');
  const artCtx = artwork.getContext('2d');
  const transforms = new Map();
  const listeners = new Set();
  let sizeCode = initialSize;
  let image = null;
  let naturalSize = null;
  let current = null;
  let drag = null;

  function notify() { listeners.forEach((fn) => fn(current ? { ...current } : null)); }

  function draw() {
    const size = blanketSize(sizeCode);
    const { width, height } = size.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#F0F0EE';
    ctx.fillRect(0, 0, width, height);
    const mockup = mockups[sizeCode];
    if (image && current) {
      artCtx.clearRect(0, 0, width, height);
      artCtx.drawImage(image, current.x, current.y,
        naturalSize.width * current.scaleX, naturalSize.height * current.scaleY);
      if (mockup) {
        // El alfa del mockup recorta la impresión a la silueta de la tela.
        artCtx.globalCompositeOperation = 'destination-in';
        artCtx.drawImage(mockup, 0, 0, width, height);
        // La fotografía aporta textura y pliegues encima del diseño.
        artCtx.globalCompositeOperation = 'multiply';
        artCtx.globalAlpha = 0.72;
        artCtx.drawImage(mockup, 0, 0, width, height);
        artCtx.globalAlpha = 1;
        artCtx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(artwork, 0, 0);
    }
    if (mockup && !image) {
      ctx.drawImage(mockup, 0, 0, width, height);
    }
  }

  function commit(raw) {
    if (!naturalSize) return;
    current = clampBlanketTransform(raw, naturalSize, blanketSize(sizeCode).canvas);
    transforms.set(sizeCode, { ...current });
    draw();
    notify();
  }

  function setSize(code) {
    const size = blanketSize(code);
    if (!size) return;
    sizeCode = code;
    canvas.width = size.canvas.width;
    canvas.height = size.canvas.height;
    artwork.width = size.canvas.width;
    artwork.height = size.canvas.height;
    container.style.aspectRatio = `${size.canvas.width} / ${size.canvas.height}`;
    current = naturalSize
      ? (transforms.get(code) ?? coverTransform(naturalSize, size.canvas)) : null;
    if (current) transforms.set(code, { ...current });
    draw();
    notify();
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (!current) return;
    drag = pointerPosition(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || !current) return;
    const next = pointerPosition(event);
    commit({ ...current, x: current.x + next.x - drag.x, y: current.y + next.y - drag.y });
    drag = next;
  });
  const stopDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);

  setSize(initialSize);
  return {
    setSize,
    getSize: () => sizeCode,
    getTransform: () => current ? { ...current } : null,
    getFitScale: () => naturalSize ? coverTransform(naturalSize, blanketSize(sizeCode).canvas).scaleX : 1,
    getTransforms: () => Object.fromEntries(transforms),
    setLogo({ image: next, naturalSize: dimensions }) {
      image = next;
      naturalSize = next ? dimensions : null;
      transforms.clear();
      current = null;
      if (image) commit(coverTransform(naturalSize, blanketSize(sizeCode).canvas));
      else { draw(); notify(); }
    },
    setTransform(raw) {
      if (!current || !naturalSize) return;
      const next = { ...current, ...raw };
      if (next.scaleX !== current.scaleX) {
        const { width, height } = blanketSize(sizeCode).canvas;
        const focusX = (width / 2 - current.x) / current.scaleX;
        const focusY = (height / 2 - current.y) / current.scaleY;
        next.x = width / 2 - focusX * next.scaleX;
        next.y = height / 2 - focusY * next.scaleX;
      }
      commit(next);
    },
    fitLogo() { if (naturalSize) commit(coverTransform(naturalSize, blanketSize(sizeCode).canvas)); },
    nudge(dx, dy) { if (current) commit({ ...current, x: current.x + dx, y: current.y + dy }); },
    isLogoSelected: () => Boolean(current),
    onTransformChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async snapshot() { return canvasToBlob(canvas, 'image/png'); },
    destroy() { canvas.remove(); listeners.clear(); },
  };
}
