// estudio/boot.js — arranque del configurador.
//
// Orquesta, en orden: catálogo → imagen base de la prenda → stage de Konva →
// controles (color / prenda). No decide nada de geometría ni de mezcla de
// color — eso vive en estudio/lib y estudio/canvas/konva-adapter.js. Este
// archivo sólo conecta el DOM con esa maquinaria.
//
// Nada de esto compila con Babel: es ESM nativo, servido tal cual por
// Vercel/http.server. Si algo aquí necesitara JSX, va en estudio/ui/
// (incremento 8), no aquí.

import { createStudioStage } from './canvas/konva-adapter.js';
import { renderProceduralBase, resolvePrintArea } from './canvas/mockup.js';
import { loadImageFromUrl } from './canvas/image-loader.js';

const PROCEDURAL_PREFIX = 'procedural:';
// Sólo como red de seguridad si un garment_type llegara sin canvas_size —
// coincide con el default de la columna en 0001_schema.sql.
const DEFAULT_CANVAS_SIZE = { width: 900, height: 900 };

const els = {
  app: document.getElementById('es-app'),
  stage: document.getElementById('es-stage'),
  swatches: document.getElementById('es-swatches'),
  garments: document.getElementById('es-garments'),
};

// Estado mínimo del arranque. `window.__studio` (más abajo) expone una vista
// de sólo lectura de esto mismo, nunca una copia que se pueda desincronizar.
const state = {
  catalog: null,
  garment: null,
  colorHex: null,
  baseImage: null,
  stage: null,
};

boot().catch((err) => {
  // Cualquier fallo no previsto (incluidos los AppError que lanzan
  // renderProceduralBase/loadImageFromUrl/createStudioStage) también debe
  // degradar con un mensaje, nunca una consola muda + un canvas en blanco.
  console.error('[estudio] fallo inesperado al iniciar el configurador', err);
  setState('catalog-error');
});

async function boot() {
  // Si Konva no llegó a cargar del CDN, el inline script de index.html ya
  // pintó el aviso correspondiente (y lo hizo antes: corre en
  // DOMContentLoaded, que dispara antes de que este módulo termine de
  // ejecutarse). Aquí sólo cortamos para no perder tiempo pidiendo el
  // catálogo si de todos modos no hay dónde dibujar.
  if (typeof window.Konva === 'undefined') return;

  const catalog = await fetchCatalog();
  if (!catalog) return; // fetchCatalog ya dejó la página en estado de error

  const garment = catalog.garments[0];
  const variant = garment?.variants?.[0];
  if (!garment || !variant) {
    console.error('[estudio] el catálogo no trae prendas o colores utilizables', catalog);
    setState('catalog-error');
    return;
  }

  state.catalog = catalog;
  state.garment = garment;
  state.colorHex = variant.color_hex;

  const size = garment.canvas_size || DEFAULT_CANVAS_SIZE;
  const printArea = resolvePrintArea(garment.print_area, size);
  state.baseImage = await loadBaseImage(garment, size);

  // El contenedor manda su tamaño real en píxeles de prenda (no fracciones);
  // la relación de aspecto de #es-stage se ajusta aquí para que el marco no
  // dependa de asumir cuadrado (el CSS trae 1:1 sólo como valor por defecto
  // mientras esto carga).
  els.stage.style.aspectRatio = `${size.width} / ${size.height}`;

  state.stage = createStudioStage({
    container: els.stage,
    width: size.width,
    height: size.height,
    printArea,
  });
  applyGarmentToStage();

  renderGarmentOptions();
  renderSwatches();
  setState('ready');
  maybeExposeDebugHook();

  document.dispatchEvent(new CustomEvent('gk:ready'));
}

/** Pinta la imagen base ya cargada + color actual sobre el stage existente. */
function applyGarmentToStage() {
  // foldImage: null → el adapter reusa baseImage para derivar la sombra de
  // pliegues (konva-adapter hace `foldImage ?? baseImage`); no hace falta
  // que boot.js conozca ese detalle, sólo el contrato de la función.
  state.stage.setGarment({ baseImage: state.baseImage, foldImage: null, colorHex: state.colorHex });
}

/** `base_mockup_url` decide si la imagen sale de un mockup procedural o de una foto real. */
async function loadBaseImage(garment, size) {
  const url = garment.base_mockup_url;
  return url.startsWith(PROCEDURAL_PREFIX)
    ? renderProceduralBase(url.slice(PROCEDURAL_PREFIX.length), size)
    : await loadImageFromUrl(url);
}

async function fetchCatalog() {
  try {
    const res = await fetch('/api/catalog');
    if (!res.ok) throw new Error(`respuesta ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.garments) || data.garments.length === 0) {
      throw new Error('el catálogo no trae garments');
    }
    return data;
  } catch (err) {
    // Camino esperado al servir el repo sin backend: /api/catalog no existe
    // en un `python3 -m http.server`, así que esto es normal en local. El
    // mensaje va a consola para depurar, pero la UI nunca se queda en
    // blanco — setState('catalog-error') pinta el aviso con WhatsApp.
    console.error('[estudio] no se pudo cargar /api/catalog', err);
    setState('catalog-error');
    return null;
  }
}

/** Único punto que cambia el estado visible de la página (ver studio.css, selectores [data-state]). */
function setState(name) {
  els.app.dataset.state = name;
}

function renderGarmentOptions() {
  els.garments.innerHTML = '';
  for (const g of state.catalog.garments) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'es-garment-option';
    btn.dataset.slug = g.slug;
    btn.textContent = g.name;
    btn.setAttribute('aria-pressed', String(g.slug === state.garment.slug));
    btn.addEventListener('click', () => selectGarment(g.slug));
    els.garments.appendChild(btn);
  }
}

function renderSwatches() {
  els.swatches.innerHTML = '';
  for (const v of state.garment.variants) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'es-swatch';
    btn.dataset.hex = v.color_hex;
    btn.style.setProperty('--es-swatch-color', v.color_hex);
    btn.setAttribute('aria-label', v.color_name || v.color_hex);
    btn.setAttribute('aria-pressed', String(v.color_hex === state.colorHex));
    btn.addEventListener('click', () => selectColor(v.color_hex));
    els.swatches.appendChild(btn);
  }
}

function selectColor(hex) {
  if (!state.stage || hex === state.colorHex) return;
  state.colorHex = hex;
  applyGarmentToStage();
  renderSwatches();
}

async function selectGarment(slug) {
  if (!state.stage || slug === state.garment.slug) return;
  const garment = state.catalog.garments.find((g) => g.slug === slug);
  if (!garment) return;

  // Preferimos mantener el color que el cliente ya eligió si la prenda nueva
  // también lo tiene disponible; si no, caemos al primer color de esa prenda.
  const keepHex = garment.variants.find((v) => v.color_hex === state.colorHex);
  const variant = keepHex || garment.variants[0];
  if (!variant) return;

  state.garment = garment;
  state.colorHex = variant.color_hex;

  const size = garment.canvas_size || DEFAULT_CANVAS_SIZE;
  // NOTA: el stage se creó una sola vez con el printArea de la prenda inicial
  // (createStudioStage no expone forma de recalcularlo). Cambiar de tipo de
  // prenda en este incremento sólo reemplaza imagen y color; retallar el
  // print_area al tamaño exacto de cada prenda llega con el panel de logo
  // (incremento 8), cuando además hay que reposicionar el logo colocado.
  state.baseImage = await loadBaseImage(garment, size);
  applyGarmentToStage();

  renderGarmentOptions();
  renderSwatches();
}

/**
 * Gancho de pruebas (spec §3.5). Se publica ÚNICAMENTE si la URL trae
 * `?debug=1` — nunca en producción normal. Los getters devuelven el estado
 * vivo (no una copia tomada una vez), así un test puede leer `.stage` o
 * `.colorHex` después de interactuar con la página sin recargar el hook.
 */
function maybeExposeDebugHook() {
  if (new URLSearchParams(location.search).get('debug') !== '1') return;
  window.__studio = {
    get stage() { return state.stage; },
    get catalog() { return state.catalog; },
    get garment() { return state.garment; },
    get colorHex() { return state.colorHex; },
    setColor: selectColor,
    setGarmentBySlug: selectGarment,
  };
}
