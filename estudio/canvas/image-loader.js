// estudio/canvas/image-loader.js — cortafuegos anti-taint del configurador.
//
// REGLA DURA: `img.src` SÓLO recibe `blob:` o `data:`. JAMÁS una URL remota.
// ---------------------------------------------------------------------------
// Un <img> cuyo `src` apunta a un origen remoto puede "contaminar" (taint) el
// canvas donde se dibuja si ese origen no manda `Access-Control-Allow-Origin`:
// el canvas lo sigue pintando en pantalla con normalidad (nada avisa en el
// momento), pero `toDataURL` / `toBlob` / `getImageData` lanzan una
// SecurityError — y ese fallo aparece al final del flujo, cuando el cliente
// ya configuró la playera entera y le toca guardar el snapshot aprobado.
//
// Un `blob:` es same-origin por construcción (lo emite `URL.createObjectURL`
// dentro del propio documento), así que un <img> que sólo ve blobs nunca
// puede taintear el canvas, sin importar qué cabeceras CORS tenga el
// servidor de origen. `loadImageFromUrl` explota justo eso: hace el `fetch`
// ella misma (donde CORS sí aplica, y si falla, falla ahí con un error
// claro) y sólo entrega un Blob al <img> — el <img> nunca ve la URL remota
// ni negocia CORS por su cuenta.

import { AppError, TaintedCanvasError } from '../lib/errors.js';

/**
 * Carga un Blob (o File, que es un Blob) como HTMLImageElement.
 *
 * Crea un object URL local, espera a que decodifique y lo revoca de
 * inmediato — tanto en éxito como en error, de ahí el `finally`. Una vez
 * que `onload` dispara, el bitmap ya quedó decodificado dentro del <img>;
 * mantener el object URL vivo después de eso no aporta nada y sólo filtra
 * memoria (la spec de Object URLs los mantiene reservados hasta que se
 * revocan explícitamente o el documento se descarga).
 *
 * Mientras la carga está en vuelo, el object URL se guarda en
 * `img.dataset.objectUrl`: es la única ventana en la que `revokeImage`
 * (más abajo) tiene algo que revocar. En el camino feliz, para cuando esta
 * promesa resuelve, `dataset.objectUrl` ya se borró — así que llamar a
 * `revokeImage(img)` después de un `await loadImageFromBlob(...)` exitoso
 * es un no-op seguro, no un doble-revoke.
 */
export async function loadImageFromBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw new AppError('NOT_A_BLOB', 'Se esperaba un Blob o File.', {
      receivedType: typeof blob,
    });
  }

  const objectUrl = URL.createObjectURL(blob);
  const img = new Image();
  img.dataset.objectUrl = objectUrl;

  try {
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(
          new AppError('IMAGE_LOAD_FAILED', 'No se pudo decodificar la imagen.', {
            blobType: blob.type,
            blobSize: blob.size,
          })
        );
      // Único lugar del módulo donde se asigna `img.src` — y sólo recibe
      // un `blob:` propio, nunca lo que haya llegado por parámetro a las
      // funciones públicas de más arriba.
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
    delete img.dataset.objectUrl;
  }

  return img;
}

/** Un File ES-UN Blob; esta función existe como punto de entrada explícito
 * para el flujo de "el usuario elige un archivo del disco" (input[type=file]
 * / drag&drop), aunque delegue en loadImageFromBlob sin diferencias. */
export async function loadImageFromFile(file) {
  return loadImageFromBlob(file);
}

/**
 * `fetch` primero, `<img>` después: el <img> nunca ve `url`. Si CORS
 * bloquea la petición (o la red falla, o el host no responde), `fetch`
 * rechaza aquí mismo, con un error tipado que apunta a esta función — no
 * 40 pasos después, en un `toDataURL` que revienta con "the canvas has
 * been tainted" sin decir de dónde vino la imagen problemática.
 */
export async function loadImageFromUrl(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new AppError('IMAGE_FETCH_FAILED', `No se pudo obtener la imagen: ${url}`, {
      url,
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  if (!response.ok) {
    throw new AppError('IMAGE_FETCH_FAILED', `La imagen respondió ${response.status}: ${url}`, {
      url,
      status: response.status,
    });
  }

  const blob = await response.blob();
  return loadImageFromBlob(blob);
}

/**
 * Confirma que `canvas` no está contaminado, ANTES de intentar exportarlo.
 * `getImageData` sobre un área de 1×1 es la sonda más barata posible: si el
 * canvas está tainted, el navegador lanza una SecurityError aquí, igual que
 * lo haría en `toDataURL` — pero en un punto donde el caller (`snapshot.js`)
 * puede reportarlo con contexto, antes de que el cliente pierda el snapshot
 * que acaba de aprobar.
 */
export function assertNotTainted(canvas) {
  const ctx = canvas.getContext('2d');
  try {
    ctx.getImageData(0, 0, 1, 1);
  } catch (err) {
    throw new TaintedCanvasError('CANVAS_TAINTED', 'El canvas está contaminado por una imagen cross-origin.', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Revoca el object URL asociado a `img`, si queda alguno vivo.
 *
 * En el camino feliz de `loadImageFromBlob` esto ya no tiene nada que hacer
 * (se revocó en su propio `onload`/`onerror`). Existe como red de
 * seguridad para el resto de casos: una promesa de carga abandonada, una
 * limpieza al desmontar un componente, o cualquier código futuro que decida
 * no esperar la carga. Comprobar `dataset.objectUrl` antes de revocar hace
 * que la función sea idempotente — llamarla dos veces, o llamarla cuando no
 * hay nada que revocar, nunca lanza.
 */
export function revokeImage(img) {
  const objectUrl = img?.dataset?.objectUrl;
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    delete img.dataset.objectUrl;
  }
}
