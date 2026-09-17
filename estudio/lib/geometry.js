// estudio/lib/geometry.js — geometría pura del logo dentro del área imprimible.
//
// Sin DOM, sin Konva, sin red, sin reloj, sin Math.random: todo lo que entra
// por parámetro y todo lo que sale es data plana. El canvas real (Konva) sólo
// consume `transformToRenderProps`; el resto de este módulo es matemática de
// soporte para el clamp y la validación del transform.
//
// --- CONTRATO DE COORDENADAS (léase antes de tocar cualquier función) -----
//
// - Todo vive en el espacio de la prenda, en píxeles, origen arriba-izquierda
//   (x crece a la derecha, y crece hacia abajo — igual que un <canvas>).
// - `Transform.x` / `Transform.y` son el CENTRO del logo, NO la esquina.
//   Esto es deliberado: es lo que Konva espera cuando se rota un nodo
//   alrededor de su propio centro (ver `transformToRenderProps`), y evita
//   tener que recalcular la esquina cada vez que cambia la rotación.
// - `Transform.rotation` está en GRADOS, sentido horario. Con el eje Y hacia
//   abajo, la fórmula de rotación matemática estándar (antihoraria en un
//   plano y-arriba) se ve horaria en pantalla — por eso `rotatePoint` no
//   necesita invertir el signo de nada.
// - `printArea` (el parámetro `area` de las funciones de clamp/fit) es
//   siempre un `Rect` SIN rotar: {x,y,width,height} con (x,y) la esquina
//   superior izquierda.
//
// @typedef {{x:number,y:number}} Point
// @typedef {{x:number,y:number,width:number,height:number}} Rect
// @typedef {{x:number,y:number,scaleX:number,scaleY:number,rotation:number}} Transform
// @typedef {{width:number,height:number}} Size

import { GeometryError } from './errors.js';

/** Convierte grados a radianes. Único punto donde este módulo usa Math.PI. */
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Rota el punto `p` alrededor de `origin` por `deg` grados (horario, ver
 * contrato de coordenadas arriba). Es la primitiva de la que depende todo lo
 * demás: `logoCorners` la usa para llevar las 4 esquinas del logo del espacio
 * local al espacio de la prenda.
 */
export function rotatePoint(p, origin, deg) {
  const rad = degToRad(deg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/**
 * Las 4 esquinas del logo en el espacio de la prenda, en orden
 * TL, TR, BR, BL, ya rotadas alrededor del centro del transform.
 *
 * `natural` es el tamaño intrínseco del logo (el de su archivo, sin escalar);
 * `t.scaleX/scaleY` lo llevan al tamaño real antes de rotar.
 */
export function logoCorners(t, natural) {
  const halfW = (natural.width * t.scaleX) / 2;
  const halfH = (natural.height * t.scaleY) / 2;
  const center = { x: t.x, y: t.y };
  // Esquinas en el espacio de la prenda pero SIN rotar todavía (el centro ya
  // está sumado porque rotatePoint necesita puntos absolutos, no relativos).
  const unrotated = [
    { x: center.x - halfW, y: center.y - halfH }, // TL
    { x: center.x + halfW, y: center.y - halfH }, // TR
    { x: center.x + halfW, y: center.y + halfH }, // BR
    { x: center.x - halfW, y: center.y + halfH }, // BL
  ];
  return unrotated.map((corner) => rotatePoint(corner, center, t.rotation));
}

/** La caja mínima (sin rotar) que contiene todos los puntos dados. */
export function aabbOf(points) {
  if (!points || points.length === 0) {
    throw new GeometryError('EMPTY_POINTS', 'No se puede calcular un AABB sin puntos.');
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * El AABB (bounding box sin rotar) del logo rotado. Se calcula desde las 4
 * esquinas (no con una fórmula abreviada) porque es la única forma correcta
 * de cubrir tanto rectángulos cuadrados como no cuadrados: para un cuadrado
 * de lado L rotado 45°, la diagonal L·√2 (100·√2 ≈ 141.4214 para L100) es un
 * caso particular de este cálculo general, no una fórmula aparte.
 */
export function rotatedAabb(t, natural) {
  return aabbOf(logoCorners(t, natural));
}

/**
 * ¿`inner` cabe completamente dentro de `outer`? `eps` absorbe el ruido de
 * punto flotante que introducen seno/coseno (del orden de 1e-12..1e-9 para
 * las magnitudes que maneja este módulo) — sin él, un AABB que toca el borde
 * del área por construcción (p.ej. tras un clamp) podría leerse como
 * "fuera" por una diferencia de la última cifra decimal.
 */
export function rectContains(outer, inner, eps = 1e-6) {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps
  );
}

function clampNum(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * La escala máxima "unitaria" (aplicada por igual a ambos ejes) del logo tal
 * que su AABB rotado, a esa escala, cabe dentro de `area`. Se calcula sobre
 * el AABB a escala 1 (`box1`) porque el AABB escala linealmente con un
 * multiplicador uniforme (rotar es una transformación lineal; escalar ambos
 * ejes por el mismo factor antes de rotar equivale a escalar el AABB por ese
 * mismo factor después) — así el resultado es exacto, no una aproximación.
 */
function maxFitScaleFor(t, natural, area) {
  const box1 = rotatedAabb({ ...t, scaleX: 1, scaleY: 1 }, natural);
  return Math.min(area.width / box1.width, area.height / box1.height);
}

/**
 * Devuelve la escala (misma para ambos ejes) resultante de:
 *  1. Nunca exceder el área — si el logo no cabe, se encoge lo necesario.
 *  2. Nunca agrandar sólo porque "hay espacio de más" (si ya cabe, se
 *     conserva la escala actual, tomando el mayor de scaleX/scaleY).
 *  3. `minPx` es un PISO (evita un logo imperceptible), pero jamás por
 *     encima de lo que el área permite — caber tiene prioridad absoluta.
 */
export function clampScale(t, natural, area, minPx) {
  const maxFitScale = maxFitScaleFor(t, natural, area);
  const currentScale = Math.max(t.scaleX, t.scaleY);
  let scale = Math.min(currentScale, maxFitScale);

  if (minPx !== undefined && minPx !== null) {
    const minDim = Math.min(natural.width, natural.height);
    const minScale = minPx / minDim;
    // El piso de minPx nunca puede subir la escala por encima de maxFitScale:
    // si minPx pide más de lo que cabe, gana "caber".
    scale = Math.max(scale, Math.min(minScale, maxFitScale));
  }

  return scale;
}

/**
 * Ancla el transform dentro de `area`: primero ajusta la escala (ver
 * `clampScale`, sin `minPx` — esta función no lo recibe por firma) y luego
 * reposiciona el centro para que el AABB resultante quede contenido.
 *
 * Es matemáticamente idempotente y garantiza la invariante
 * `rectContains(area, rotatedAabb(resultado, natural)) === true` para
 * cualquier transform de entrada: la escala nueva por construcción hace que
 * el AABB (a esa escala) mida ≤ area en ambos ejes, así que el rango
 * [min,max] de la posición nunca queda vacío (min ≤ max, con igualdad
 * cuando el AABB coincide exactamente con el área en ese eje).
 */
export function clampTransformToArea(t, natural, area) {
  const scale = clampScale(t, natural, area);
  const scaled = { ...t, scaleX: scale, scaleY: scale };
  const box = rotatedAabb(scaled, natural);
  const halfW = box.width / 2;
  const halfH = box.height / 2;

  const minX = area.x + halfW;
  const maxX = area.x + area.width - halfW;
  const minY = area.y + halfH;
  const maxY = area.y + area.height - halfH;

  return {
    x: clampNum(t.x, minX, maxX),
    y: clampNum(t.y, minY, maxY),
    scaleX: scale,
    scaleY: scale,
    rotation: t.rotation,
  };
}

/**
 * Construye un transform sin rotar, centrado en `area`, que encuadra un logo
 * de tamaño `natural`:
 *  - 'contain': el logo entero cabe dentro del área (puede dejar márgenes).
 *  - 'cover': el área queda completamente cubierta (el logo puede desbordar).
 */
export function fitTransformToArea(natural, area, mode) {
  if (mode !== 'contain' && mode !== 'cover') {
    throw new GeometryError('INVALID_FIT_MODE', `Modo de encuadre desconocido: "${mode}".`, { mode });
  }
  const scaleX = area.width / natural.width;
  const scaleY = area.height / natural.height;
  const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  return {
    x: area.x + area.width / 2,
    y: area.y + area.height / 2,
    scaleX: scale,
    scaleY: scale,
    rotation: 0,
  };
}

/**
 * Valida un transform de forma defensiva antes de dejarlo llegar al canvas o
 * al borrador de pedido. `natural`/`area` se reciben por si validaciones
 * futuras necesitan contexto geométrico (p.ej. "está completamente fuera del
 * área"); hoy sólo se usan los campos numéricos del propio transform.
 */
export function isTransformValid(t, natural, area) {
  const reasons = [];

  if (!(t.scaleX > 0) || !(t.scaleY > 0)) {
    // `!(x > 0)` cubre en un solo golpe: cero, negativos y NaN (toda
    // comparación con NaN es false, así que NaN también cae aquí).
    reasons.push('SCALE_ZERO');
  }
  if (Number.isNaN(t.rotation)) {
    reasons.push('ROTATION_NAN');
  }
  if (Number.isNaN(t.x) || Number.isNaN(t.y)) {
    reasons.push('POSITION_NAN');
  }

  return { valid: reasons.length === 0, reasons };
}

/**
 * Porcentaje del área imprimible cubierto por el logo, 0..100. Usa el área
 * REAL del rectángulo del logo (ancho×alto a escala), no la de su AABB
 * rotado: el área de tinta que cubre un logo no cambia por rotarlo (un
 * rectángulo rotado ocupa el mismo área que sin rotar), mientras que su AABB
 * sí crece al rotar — usar el AABB aquí inflaría el porcentaje sin razón.
 */
export function areaCoveragePct(t, natural, area) {
  const logoArea = natural.width * t.scaleX * natural.height * t.scaleY;
  const areaArea = area.width * area.height;
  const pct = (logoArea / areaArea) * 100;
  return Math.max(0, Math.min(100, pct));
}

/** Normaliza cualquier ángulo en grados al rango [0,360). */
export function normalizeRotation(deg) {
  return ((deg % 360) + 360) % 360;
}

/**
 * Si `deg` está a `tol` grados o menos del múltiplo de `step` más cercano
 * (distancia circular, para que el empalme 359°/0° no se trate como lejano),
 * devuelve ese múltiplo normalizado. Si no, devuelve `deg` sin tocar.
 */
export function snapRotation(deg, step = 90, tol = 5) {
  const normalized = normalizeRotation(deg);
  const nearestMultiple = normalizeRotation(Math.round(normalized / step) * step);
  const rawDiff = Math.abs(normalized - nearestMultiple);
  const circularDiff = Math.min(rawDiff, 360 - rawDiff);
  return circularDiff <= tol ? nearestMultiple : deg;
}

/**
 * Traduce un Transform a las props que espera un nodo Konva: `x`/`y` son el
 * centro (igual que Transform), y `offsetX`/`offsetY` son la mitad del
 * tamaño ya escalado — así Konva rota el nodo alrededor de su propio centro
 * en vez de la esquina superior izquierda por defecto.
 */
export function transformToRenderProps(t, natural) {
  const width = natural.width * t.scaleX;
  const height = natural.height * t.scaleY;
  return {
    x: t.x,
    y: t.y,
    width,
    height,
    rotation: t.rotation,
    offsetX: width / 2,
    offsetY: height / 2,
  };
}
