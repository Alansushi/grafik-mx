// estudio/canvas/mockup.js — mockup procedural de playera/gorra en escala de
// grises, sustituto provisional de la foto real de prenda (§3.4 del spec).
//
// Tres reglas no negociables, en orden de importancia:
//
// 1. ESCALA DE GRISES PURA (r === g === b en todo píxel opaco). El tinte de
//    color que se aplica después (garment-painter.js, fuera de este archivo)
//    usa el blend 'color', que toma SU tono del canal de color de destino y
//    SÓLO conserva la luminosidad del fondo. Si este mockup ya tuviera tono
//    propio (aunque fuera sutil), el blend lo mezclaría con el color elegido
//    por el cliente y el resultado saldría con un tinte que nadie pidió.
//
// 2. RANGO DE LUMINOSIDAD REALISTA, no un gris plano. Sin variación de brillo
//    no hay pliegues que el tinte pueda heredar: el resultado se ve como una
//    calcomanía plana pegada sobre un rectángulo, no como tela. Por eso cada
//    silueta combina una base ~180 (tela plana bajo luz de estudio), sombras
//    90-150 (pliegues y axilas) y algún brillo hasta ~215 (donde pega más
//    la luz).
//
// 3. DETERMINISTA, CERO Math.random. Playwright muestrea píxeles en
//    coordenadas fijas y los compara contra números calculados en Node con
//    estas mismas fórmulas (ver tests/e2e/canvas.spec.js, casos C1-C14): si
//    la silueta cambiara de una corrida a otra, esa comparación sería
//    ruido, no una prueba. Toda la variación de brillo sale de funciones
//    suaves de la posición (senos superpuestos, caída radial tipo gradiente)
//    parametrizadas sólo por `u,v` (posición normalizada 0..1) — nunca por
//    el reloj ni por una fuente de azar.
//
// Implementación: en vez de trazar paths con curvas Bézier y depender de
// cómo cada navegador rasteriza esas curvas (lo que además sería difícil de
// verificar pixel a pixel), la silueta se calcula analíticamente: por cada
// píxel se decide (a) si cae dentro de la forma (torso/manga/cuello o
// copa/visera) con pruebas geométricas simples (rectángulos interpolados,
// elipses), y (b) su nivel de gris con una función de luminancia continua.
// El resultado se escribe una sola vez con `putImageData`, así que es
// pixel-exacto y no depende de antialiasing ni de operaciones de composición
// del navegador.

import { AppError } from '../lib/errors.js';

export const PROCEDURAL_PRINT_AREAS = {
  tee: { x: 0.3, y: 0.26, width: 0.4, height: 0.34 },
  cap: { x: 0.32, y: 0.38, width: 0.36, height: 0.2 },
};

/** Convierte un área en fracciones (0..1 del canvas) a píxeles reales. */
export function resolvePrintArea(fractional, size) {
  return {
    x: fractional.x * size.width,
    y: fractional.y * size.height,
    width: fractional.width * size.width,
    height: fractional.height * size.height,
  };
}

// --- helpers de bajo nivel, compartidos por tee y cap ----------------------

function clamp8(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Caída elíptica normalizada: 1 exacto en el centro (cu,cv), decrece
 * linealmente hasta 0 en el borde de la elipse de radios (ru,rv) medidos en
 * las mismas unidades que u,v, y se queda en 0 más allá. Sirve tanto para
 * manchas de sombra como de brillo — el signo con el que se suma a la
 * luminancia decide cuál de las dos es.
 */
function radialFalloff(u, v, cu, cv, ru, rv) {
  const du = (u - cu) / ru;
  const dv = (v - cv) / rv;
  const d = Math.sqrt(du * du + dv * dv);
  return Math.max(0, 1 - d);
}

/** ¿(u,v) cae dentro de la elipse de centro (cu,cv) y radios (ru,rv)? */
function insideEllipse(u, v, cu, cv, ru, rv) {
  const du = (u - cu) / ru;
  const dv = (v - cv) / rv;
  return du * du + dv * dv <= 1;
}

/**
 * Textura de pliegues: dos senos de frecuencia y fase distintas, sumados y
 * recortados a su parte negativa (`Math.min(0, ...)`). Un pliegue de tela es
 * una sombra — nunca aporta brillo, sólo lo resta — y usar dos frecuencias
 * en vez de una evita que el patrón se lea como una textura perfectamente
 * periódica (papel corrugado) en lugar de arrugas de tela reales.
 *
 * El sesgo `+ 0.55` antes del `min(0, ...)` es deliberado: sin él, cada
 * onda pasa la mitad de su ciclo en negativo, así que la sombra cubriría
 * ~50% de la superficie y arrastraría el promedio muy por debajo de 180 —
 * dejaría de haber una "zona plana" reconocible, todo se vería en penumbra.
 * Desplazar la onda hacia arriba antes de recortarla concentra la sombra en
 * el tramo más profundo de cada valle (donde sin(θ) < -0.55, ~1/4 del
 * ciclo) y deja el resto de la tela en 0 (sin aporte): la mayoría de la
 * superficie queda plana, y los pliegues aparecen sólo donde el valle es
 * más profundo — como arrugas reales, no como una malla difusa.
 */
function foldShadow(u, v, freqA, freqB) {
  const a = Math.sin(u * Math.PI * freqA.x + v * Math.PI * freqA.y) + 0.55;
  const b = Math.sin(u * Math.PI * freqB.x + v * Math.PI * freqB.y) + 0.55;
  return Math.min(0, a) * 0.6 + Math.min(0, b) * 0.4;
}

// --- playera -----------------------------------------------------------

// Fracciones (0..1) que definen el torso como un trapecio: ancho en los
// hombros, más angosto en la cintura — un rectángulo puro se lee como una
// caja, no como una prenda.
const TEE_SHOULDER_Y = 0.22;
const TEE_WAIST_Y = 0.95;
const TEE_SHOULDER_LEFT_X = 0.22;
const TEE_SHOULDER_RIGHT_X = 0.78;
const TEE_WAIST_LEFT_X = 0.3;
const TEE_WAIST_RIGHT_X = 0.7;

function teeTorsoAlpha(u, v) {
  if (v < TEE_SHOULDER_Y || v > TEE_WAIST_Y) return false;
  const t = (v - TEE_SHOULDER_Y) / (TEE_WAIST_Y - TEE_SHOULDER_Y);
  const leftX = TEE_SHOULDER_LEFT_X + t * (TEE_WAIST_LEFT_X - TEE_SHOULDER_LEFT_X);
  const rightX = TEE_SHOULDER_RIGHT_X + t * (TEE_WAIST_RIGHT_X - TEE_SHOULDER_RIGHT_X);
  return u >= leftX && u <= rightX;
}

// Cada manga es otro trapecio, del hombro (unido al torso) hacia abajo y
// hacia afuera. `mirror` refleja las coordenadas en x para obtener la manga
// derecha a partir de la misma definición que la izquierda.
const SLEEVE_TOP_Y = 0.22;
const SLEEVE_BOTTOM_Y = 0.46;
const SLEEVE_TOP_LEFT_X = 0.14;
const SLEEVE_TOP_RIGHT_X = 0.24;
const SLEEVE_BOTTOM_LEFT_X = 0.06;
const SLEEVE_BOTTOM_RIGHT_X = 0.2;

function teeSleeveAlpha(u, v, mirror) {
  if (v < SLEEVE_TOP_Y || v > SLEEVE_BOTTOM_Y) return false;
  const t = (v - SLEEVE_TOP_Y) / (SLEEVE_BOTTOM_Y - SLEEVE_TOP_Y);
  let leftX = SLEEVE_TOP_LEFT_X + t * (SLEEVE_BOTTOM_LEFT_X - SLEEVE_TOP_LEFT_X);
  let rightX = SLEEVE_TOP_RIGHT_X + t * (SLEEVE_BOTTOM_RIGHT_X - SLEEVE_TOP_RIGHT_X);
  if (mirror) {
    const mirroredLeft = 1 - rightX;
    const mirroredRight = 1 - leftX;
    leftX = mirroredLeft;
    rightX = mirroredRight;
  }
  return u >= leftX && u <= rightX;
}

// El cuello se recorta del torso con una elipse: sin esto, la silueta se lee
// como una caja con dos triángulos pegados, no como una playera.
function teeCollarCutout(u, v) {
  return insideEllipse(u, v, 0.5, 0.215, 0.09, 0.05);
}

function teeShapeAlpha(u, v) {
  if (teeCollarCutout(u, v)) return 0;
  if (teeTorsoAlpha(u, v) || teeSleeveAlpha(u, v, false) || teeSleeveAlpha(u, v, true)) {
    return 255;
  }
  return 0;
}

function teeLuminance(u, v) {
  let g = 180;
  g += 14 * (0.5 - v); // luz cenital de estudio: algo más clara arriba
  g += 100 * foldShadow(u, v, { x: 4.2, y: 1.3 }, { x: 2.1, y: -2.6 });
  g -= 42 * radialFalloff(u, v, 0.24, 0.34, 0.07, 0.06); // sombra bajo la manga izquierda
  g -= 42 * radialFalloff(u, v, 0.76, 0.34, 0.07, 0.06); // sombra bajo la manga derecha
  g += 47 * radialFalloff(u, v, 0.32, 0.24, 0.09, 0.05); // brillo sobre el hombro izquierdo
  return clamp8(g);
}

/**
 * Pinta la silueta de playera (cuerpo + mangas + cuello) sobre `ctx`, en
 * escala de grises pura. Opera con `putImageData`: no queda ninguna
 * operación de composición o antialiasing del navegador entre la fórmula de
 * arriba y el píxel final, así que un mismo `(u,v)` produce siempre el mismo
 * byte, en cualquier navegador.
 */
export function drawTeeSilhouette(ctx, size) {
  const { width, height } = size;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const alpha = teeShapeAlpha(u, v);
      if (alpha > 0) {
        const gray = teeLuminance(u, v);
        const i = (y * width + x) * 4;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        data[i + 3] = alpha;
      }
      // alpha === 0: no se escribe nada — createImageData ya entrega el
      // buffer en ceros (transparente), que es justo lo que queremos fuera
      // de la silueta.
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// --- gorra ---------------------------------------------------------------

// Copa: una elipse completa centrada en la mitad superior del canvas.
const CAP_CROWN_CX = 0.5;
const CAP_CROWN_CY = 0.4;
const CAP_CROWN_RX = 0.26;
const CAP_CROWN_RY = 0.2;

// Visera: la mitad inferior de otra elipse, más ancha y baja que la copa,
// para que se lea como una pieza plana que sobresale hacia adelante.
const CAP_BRIM_CX = 0.5;
const CAP_BRIM_CY = 0.58;
const CAP_BRIM_RX = 0.34;
const CAP_BRIM_RY = 0.08;

function capShapeAlpha(u, v) {
  const inCrown = insideEllipse(u, v, CAP_CROWN_CX, CAP_CROWN_CY, CAP_CROWN_RX, CAP_CROWN_RY);
  const inBrim = v >= CAP_BRIM_CY && insideEllipse(u, v, CAP_BRIM_CX, CAP_BRIM_CY, CAP_BRIM_RX, CAP_BRIM_RY);
  return inCrown || inBrim ? 255 : 0;
}

function capLuminance(u, v) {
  let g = 180;
  g += 20 * (CAP_CROWN_CY - v); // la copa recibe más luz cerca de la coronilla
  g += 88 * foldShadow(u, v, { x: 5, y: 0.8 }, { x: 3, y: -1.5 });
  g -= 46 * radialFalloff(u, v, 0.5, 0.5, 0.1, 0.05); // pliegue central bajo la copa
  g += 34 * radialFalloff(u, v, 0.4, 0.32, 0.1, 0.06); // brillo superior izquierdo de la copa
  g -= 34 * radialFalloff(u, v, 0.5, 0.62, 0.3, 0.06); // sombra bajo la visera
  return clamp8(g);
}

/**
 * Pinta la silueta de gorra (copa + visera) sobre `ctx`, en escala de
 * grises pura. Misma técnica de `putImageData` que `drawTeeSilhouette`, por
 * las mismas razones (pixel-exacto, sin antialiasing del navegador).
 */
export function drawCapSilhouette(ctx, size) {
  const { width, height } = size;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const alpha = capShapeAlpha(u, v);
      if (alpha > 0) {
        const gray = capLuminance(u, v);
        const i = (y * width + x) * 4;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        data[i + 3] = alpha;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Crea un `<canvas>` nuevo de `size` y le pinta la silueta procedural de
 * `kind`. Es el punto de entrada que usa el loader de mockups:
 * `garment_types.base_mockup_url` acepta el pseudo-esquema `procedural:tee`
 * / `procedural:cap`, y cuando lo ve llama aquí en vez de
 * `loadImageFromUrl`. Migrar a una foto real de prenda más adelante es sólo
 * cambiar esa columna en la base de datos — cero código.
 */
export function renderProceduralBase(kind, size) {
  if (kind !== 'tee' && kind !== 'cap') {
    throw new AppError('INVALID_MOCKUP_KIND', `Tipo de mockup procedural desconocido: "${kind}".`, { kind });
  }

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');

  if (kind === 'tee') {
    drawTeeSilhouette(ctx, size);
  } else {
    drawCapSilhouette(ctx, size);
  }

  return canvas;
}
