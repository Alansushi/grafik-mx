// estudio/boot.js — arranque del configurador.
//
// Responsabilidad acotada: comprobar que Konva llegó, pedir el catálogo y
// montar la app de React. Nada más. Toda la interfaz y el estado viven en
// estudio/ui/studio-app.js, y el stage de Konva lo construye esa app (porque
// depende de qué prenda esté elegida, y eso cambia).
//
// ESM nativo sin Babel. El estudio usa `h` (React.createElement) en vez de JSX
// — el razonamiento está en estudio/ui/react.js.

import { React, ReactDOM } from './ui/react.js';
import { StudioApp } from './ui/studio-app.js';
import { trackOnce } from './ui/track.js';

const els = {
  app: document.getElementById('es-app'),
  stage: document.getElementById('es-stage'),
  controls: document.getElementById('es-controls'),
};

boot().catch((err) => {
  // Cualquier fallo no previsto también debe degradar con un mensaje: nunca una
  // consola muda y un canvas en blanco.
  console.error('[estudio] fallo inesperado al iniciar el configurador', err);
  setState('catalog-error');
});

async function boot() {
  // Si Konva no cargó, el script inline de index.html ya pintó el aviso (corre
  // en DOMContentLoaded, antes que este módulo). Aquí sólo se corta para no
  // pedir el catálogo si de todos modos no hay dónde dibujar.
  if (typeof window.Konva === 'undefined') return;

  const catalog = await fetchCatalog();
  if (!catalog) return; // fetchCatalog ya dejó la página en estado de error

  if (!catalog.garments[0]?.variants?.[0] || !catalog.techniques?.[0]) {
    console.error('[estudio] el catálogo no trae prendas, colores o técnicas utilizables', catalog);
    setState('catalog-error');
    return;
  }

  const root = ReactDOM.createRoot(els.controls);
  root.render(React.createElement(StudioApp, { catalog, stageContainer: els.stage }));

  setState('ready');
  maybeExposeDebugHook(catalog);

  // El evento se dispara tras el primer render. Los tests esperan por
  // window.__studio, que es más preciso, pero esto deja un gancho para
  // cualquier integración futura que sólo necesite saber que ya arrancó.
  queueMicrotask(() => document.dispatchEvent(new CustomEvent('gk:ready')));
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
    // Camino esperado al servir el repo sin backend: /api/catalog no existe en
    // un `python3 -m http.server`. Va a consola para depurar, pero la UI nunca
    // se queda en blanco.
    console.error('[estudio] no se pudo cargar /api/catalog', err);
    setState('catalog-error');
    return null;
  }
}

/** Único punto que cambia el estado visible (ver los [data-state] de studio.css). */
function setState(name) {
  els.app.dataset.state = name;
  // Un estado de error es un cliente que no pudo ni empezar: es lo que más
  // importa medir. `ready` da además el tiempo hasta poder usarlo (t_ms).
  if (name === 'ready') trackOnce('studio_ready');
  else if (name === 'catalog-error') trackOnce('studio_error', { where: 'catalog' }, 'error:catalog');
}

/**
 * Gancho de pruebas (spec §3.5). Se publica ÚNICAMENTE con `?debug=1`.
 *
 * Ahora que el estado vive en React, el hook no puede leerlo directamente: la
 * app se registra a sí misma en `window.__studioBridge` al montarse, y esto lo
 * envuelve. Los getters van contra el puente vivo, así que un test lee el
 * estado actual y no una foto del arranque.
 */
function maybeExposeDebugHook(catalog) {
  if (new URLSearchParams(location.search).get('debug') !== '1') return;
  window.__studio = {
    get stage() { return window.__studioBridge?.stage ?? null; },
    get catalog() { return catalog; },
    get garment() { return window.__studioBridge?.garment ?? null; },
    get colorHex() { return window.__studioBridge?.colorHex ?? null; },
    get transform() { return window.__studioBridge?.transform ?? null; },
    get quote() { return window.__studioBridge?.quote ?? null; },
    setColor: (hex) => window.__studioBridge?.setColor(hex),
    setGarmentBySlug: (slug) => window.__studioBridge?.setGarmentBySlug(slug),
    setSize: (talla, valor) => window.__studioBridge?.setSize(talla, valor),
    loadLogoFromFile: (file) => window.__studioBridge?.loadLogoFromFile(file),
  };
}
