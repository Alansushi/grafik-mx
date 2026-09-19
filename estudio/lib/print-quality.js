// estudio/lib/print-quality.js — ¿el logo tiene resolución suficiente para
// imprimirse al tamaño que el cliente eligió?
//
// Es el hueco más caro que quedaba en el configurador: en pantalla TODO se ve
// nítido, porque el canvas escala el logo a lo que haga falta. Un archivo de
// 300 px se ve perfecto en el preview y sale pixelado en la playera — y eso se
// descubre en producción, con la prenda ya impresa y pagada.
//
// ── El tamaño físico tiene que venir de la base, no de una constante ──
//
// El cálculo necesita saber cuántos centímetros mide el área imprimible en el
// mundo real. Eso es un dato de la PRENDA (garment_types.print_area_width_cm),
// no del código: una gorra y una playera no imprimen al mismo tamaño, y una
// playera infantil tampoco. Con una constante, cambiar de prenda daría un
// número falso sin que nada avisara.
//
// ── Por qué naturalSize no aparece en la fórmula del DPI ──
//
// Parece que debería, pero se cancela. `transform.scaleX` ya ES "píxeles de
// canvas por píxel de origen", y el canvas tiene una escala física fija
// (printArea.width px ↔ printAreaWidthCm cm). Desarrollándolo:
//
//   anchoImpresoCm = naturalWidth × scaleX / printArea.width × printAreaWidthCm
//   dpi            = naturalWidth / (anchoImpresoCm / 2.54)
//                  = 2.54 × printArea.width / (scaleX × printAreaWidthCm)
//
// O sea: el DPI depende de CUÁNTO SE AMPLIÓ el archivo, no de cuán grande era.
// Un logo de 3000 px y uno de 300 px estirados al mismo tamaño en pantalla dan
// DPI distintos porque su scaleX es distinto. naturalSize sí se usa para
// reportar los centímetros impresos, que es otra cosa.

import { ValidationError } from './errors.js';

const CM_POR_PULGADA = 2.54;

// Umbrales para impresión sobre tela. La tela es más indulgente que el papel
// (la trama difumina el detalle), así que 150 dpi es aceptable donde en
// impresión offset se pedirían 300.
export const DPI_BUENO = 150;
export const DPI_MINIMO = 100;

function exigirPositivo(valor, campo, detalles) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new ValidationError(
      'INVALID_PRINT_METRIC',
      `${campo} debe ser un número positivo para calcular la resolución de impresión.`,
      { campo, valor, ...detalles },
    );
  }
}

/**
 * Resolución efectiva del logo tal como está colocado ahora mismo.
 *
 * @param {{
 *   naturalSize: {width:number, height:number},
 *   transform: {scaleX:number, scaleY:number},
 *   printArea: {width:number, height:number},   // en píxeles de canvas
 *   printAreaWidthCm: number,                   // ancho REAL del área, en cm
 *   vector?: boolean,                           // SVG: sin resolución fija
 * }} opts
 * @returns {{dpi:number, widthCm:number, heightCm:number,
 *            level:'ok'|'warn'|'fail', vector:boolean, message:string|null}}
 */
export function printQuality(opts = {}) {
  const { naturalSize, transform, printArea, printAreaWidthCm, vector = false } = opts;

  if (!naturalSize) {
    throw new ValidationError('INVALID_PRINT_METRIC', 'Falta naturalSize del logo.', {});
  }
  exigirPositivo(naturalSize.width, 'naturalSize.width', {});
  exigirPositivo(naturalSize.height, 'naturalSize.height', {});
  exigirPositivo(printArea?.width, 'printArea.width', {});
  exigirPositivo(printAreaWidthCm, 'printAreaWidthCm', {});
  exigirPositivo(transform?.scaleX, 'transform.scaleX', {});
  exigirPositivo(transform?.scaleY, 'transform.scaleY', {});

  // Cuántos cm mide un píxel del canvas en la prenda real.
  const cmPorPixelCanvas = printAreaWidthCm / printArea.width;

  const widthCm = naturalSize.width * transform.scaleX * cmPorPixelCanvas;
  const heightCm = naturalSize.height * transform.scaleY * cmPorPixelCanvas;

  // Un SVG no tiene resolución: se rasteriza al tamaño que haga falta en el
  // RIP de impresión. Avisar de "baja resolución" en un vector sería un falso
  // positivo que enseña al cliente a ignorar los avisos.
  if (vector) {
    return {
      dpi: Infinity,
      widthCm,
      heightCm,
      level: 'ok',
      vector: true,
      // Sí lleva mensaje, pero SIN hablar de dpi: en un vector ese número no
      // significa nada. Lo que sigue siendo útil es el tamaño al que va a
      // salir la estampa, que es un dato que no se puede deducir de una
      // pantalla por mucho que se mire.
      message:
        `Se imprimirá a ${redondear(widthCm)} × ${redondear(heightCm)} cm. ` +
        `Es un vector: no pierde definición por mucho que lo amplíes.`,
    };
  }

  // Se toma el eje PEOR: con escalado no uniforme, un eje puede estar bien y el
  // otro pixelado, y lo que se ve en la prenda es el peor de los dos.
  const dpiX = CM_POR_PULGADA / (transform.scaleX * cmPorPixelCanvas);
  const dpiY = CM_POR_PULGADA / (transform.scaleY * cmPorPixelCanvas);
  const dpi = Math.min(dpiX, dpiY);

  // Se clasifica sobre el dpi REDONDEADO, que es el que el mensaje enseña.
  // Comparando el valor crudo, un logo a 99.6 dpi mostraría "100 dpi" junto a
  // un aviso de "se va a ver pixeleado": el número y el veredicto se
  // contradirían en pantalla. Además vuelve estable el límite exacto, que con
  // el valor crudo depende del ruido de coma flotante (100 dpi llegaba aquí
  // como 99.99999999999999 y caía del lado malo).
  const dpiMostrado = Math.round(dpi);

  let level = 'ok';
  if (dpiMostrado < DPI_MINIMO) level = 'fail';
  else if (dpiMostrado < DPI_BUENO) level = 'warn';

  return {
    dpi,
    widthCm,
    heightCm,
    level,
    vector: false,
    message: mensaje(level, dpiMostrado, widthCm, heightCm, naturalSize),
  };
}

/** Ancho mínimo en píxeles para imprimir `cm` centímetros a `dpi`. */
export function pixelesNecesarios(cm, dpi = DPI_BUENO) {
  exigirPositivo(cm, 'cm', {});
  exigirPositivo(dpi, 'dpi', {});
  return Math.ceil((cm / CM_POR_PULGADA) * dpi);
}

function redondear(n) {
  return Math.round(n * 10) / 10;
}

/**
 * El mensaje dice SIEMPRE las dos salidas que tiene el cliente —achicar el
 * logo o mandar un archivo más grande— con el número concreto de píxeles que
 * necesitaría. Un aviso que sólo dice "resolución baja" deja al cliente sin
 * saber qué hacer, y lo más probable es que siga adelante igual.
 */
function mensaje(level, dpi, widthCm, heightCm, naturalSize) {
  const medidas = `${redondear(widthCm)} × ${redondear(heightCm)} cm`;
  if (level === 'ok') {
    return `Se imprimirá a ${medidas} · ${dpi} dpi. Resolución suficiente.`;
  }
  const necesarios = pixelesNecesarios(widthCm, DPI_BUENO);
  const base =
    `A ${medidas} tu archivo queda en ${dpi} dpi ` +
    `(tiene ${naturalSize.width} px de ancho; para ese tamaño harían falta ~${necesarios} px).`;
  return level === 'fail'
    ? `${base} Así se va a ver pixeleado en la prenda. Hazlo más pequeño o mándanos el logo en mayor resolución o en vectores.`
    : `${base} Se puede imprimir, pero pierde definición. Si lo tienes en mayor resolución o en vectores, mejor.`;
}
