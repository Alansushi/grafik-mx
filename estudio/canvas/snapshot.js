// estudio/canvas/snapshot.js — exportación del snapshot final del
// configurador: la imagen PNG/JPEG que se guarda como lo que el cliente
// aprobó y viaja a Storage, al correo y al panel de admin.
//
// Este archivo NO importa Konva (regla del proyecto: sólo konva-adapter.js
// puede tocarlo). `layerToBlob` recibe la Layer ya construida como
// parámetro y sólo le llama métodos genéricos que cualquier nodo Konva
// expone (`.getCanvas()`, `.toCanvas()`) — nunca importa la librería para
// poder tipar nada.

import { AppError } from '../lib/errors.js';
import { assertNotTainted } from './image-loader.js';

/**
 * Decide el formato de exportación y el `pixelRatio` de downscale del
 * snapshot, sin tocar DOM ni canvas — es pura a propósito (spec §7.2) para
 * poder fijar los umbrales exactos con Vitest, sin depender de un navegador
 * real ni de cuánto pesa un PNG de verdad en cada corrida.
 *
 * Reglas:
 *  - El lado mayor de la imagen exportada no debe pasar de `maxEdge` (1400
 *    px por defecto). Si el lado mayor de `naturalSize` ya es menor o
 *    igual, no hay downscale (`pixelRatio = 1`, nunca se agranda). Si es
 *    mayor, `pixelRatio` encoge ese lado exactamente a `maxEdge`.
 *  - Si `estimatedBytes` (el peso estimado del PNG resultante) supera
 *    `maxBytes` (2 MiB por defecto), se cae a JPEG calidad 0.88: un PNG de
 *    una fotografía con textura de tela pesa mucho más que un JPEG
 *    equivalente, y evitar snapshots de varios MB importa tanto para el
 *    bucket de Storage como para el adjunto de correo (ver `email.js`,
 *    fuera de este archivo).
 *
 * `estimatedBytes === maxBytes` exacto NO cuenta como "supera" (se queda en
 * PNG) — la regla del spec dice "si supera", no "si alcanza".
 */
export function pickSnapshotEncoding(estimatedBytes, opts = {}) {
  const { naturalSize, maxEdge = 1400, maxBytes = 2 * 1024 * 1024 } = opts;

  if (!naturalSize || !(naturalSize.width > 0) || !(naturalSize.height > 0)) {
    throw new AppError(
      'MISSING_NATURAL_SIZE',
      'pickSnapshotEncoding necesita opts.naturalSize con width/height positivos.',
      { naturalSize }
    );
  }

  const longestEdge = Math.max(naturalSize.width, naturalSize.height);
  const pixelRatio = longestEdge > maxEdge ? maxEdge / longestEdge : 1;
  const overBudget = estimatedBytes > maxBytes;

  return {
    mimeType: overBudget ? 'image/jpeg' : 'image/png',
    quality: overBudget ? 0.88 : null,
    pixelRatio,
  };
}

/**
 * Exporta `layer` (una Konva.Layer ya construida por konva-adapter.js) a
 * Blob. Antes de exportar nada, verifica que el canvas NATIVO de la propia
 * Layer no esté contaminado — `layer.getCanvas()._canvas` es exactamente el
 * `<canvas>` real detrás del wrapper de Konva (spec §3.3) — así el fallo,
 * si lo hay, sale aquí con un `TaintedCanvasError` diagnosticable, en vez de
 * como una SecurityError genérica más abajo en `canvas.toBlob`.
 *
 * Exporta desde `layer`, nunca desde el stage completo: el stage incluye la
 * Layer "ui" con el Transformer (anchors de arrastre/rotación), que no debe
 * colarse en la imagen que el cliente aprobó.
 */
export async function layerToBlob(layer, opts = {}) {
  const { mimeType = 'image/png', quality = null, pixelRatio = 1, x, y, width, height } = opts;

  assertNotTainted(layer.getCanvas()._canvas);

  // Sólo se pasan a toCanvas() las claves que Konva realmente entiende
  // (pixelRatio y, si se piden, un recorte x/y/width/height). mimeType y
  // quality son cosa de canvasToBlob más abajo, no de Konva.
  const exportConfig = { pixelRatio };
  if (x !== undefined) exportConfig.x = x;
  if (y !== undefined) exportConfig.y = y;
  if (width !== undefined) exportConfig.width = width;
  if (height !== undefined) exportConfig.height = height;

  const exportCanvas = layer.toCanvas(exportConfig);
  return canvasToBlob(exportCanvas, mimeType, quality);
}

/**
 * Envuelve `canvas.toBlob` (callback-based, API vieja del DOM) en una
 * Promesa. `canvas.toBlob` devuelve `null` en vez de lanzar cuando falla
 * (canvas de tamaño 0, o memoria agotada) — ese `null` silencioso es
 * exactamente el tipo de fallo que este proyecto no tolera sin diagnóstico
 * (ver silent-failure-hunter en las puertas de revisión), así que se
 * convierte aquí en un `AppError` con código estable.
 */
export async function canvasToBlob(canvas, mimeType = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new AppError('SNAPSHOT_FAILED', 'canvas.toBlob() no produjo un blob.', {
              mimeType,
              width: canvas.width,
              height: canvas.height,
            })
          );
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality ?? undefined
    );
  });
}
