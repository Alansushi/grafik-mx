// estudio/ui/panel-logo.js — estado del logo: metadata y avisos.
//
// Componente controlado, de solo lectura/feedback: no guarda estado de
// negocio ni dispara acciones. La subida vive en canvas-dropzone.js (sobre
// el canvas) y los controles de colocación en logo-toolbar.js (debajo del
// canvas) — este panel sólo explica lo que el cliente subió: nombre/medidas,
// y los tres avisos que ya existían (transparencia, contraste, calidad de
// impresión).

import { h, useEffect, cx } from './react.js';
import { legibility } from '../lib/color.js';
import { printQuality } from '../lib/print-quality.js';

// Mismo número y misma URL que ya usan los avisos de /estudio/index.html
// (ver #es-notice-konva / #es-notice-catalog) y el FloatingWA del sitio
// público — un solo canal de soporte, sin inventar uno nuevo aquí.
const WHATSAPP_URL = 'https://wa.me/525539014600';

/** '2300000' → '2.19 MB'. Sólo para mostrar; no interviene en la validación. */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

/**
 * @param {{
 *   logo: {name:string, sizeBytes:number, naturalSize:{width:number,height:number}, hasAlpha:boolean} | null,
 *   transform: {x:number,y:number,scaleX:number,scaleY:number,rotation:number} | null,
 *   garmentHex: string,
 *   logoDominantHex: string | null,
 *   busy: boolean,
 *   error: {code:string, message:string} | null,
 *   onQualityWarning?: (level:'warn'|'fail', dpi:number) => void,  // sólo al ENTRAR en aviso
 * }} props
 */
export function PanelLogo({
  logo, transform, garmentHex, logoDominantHex, busy, error,
  printArea, printAreaWidthCm, onQualityWarning,
}) {
  // El §6 del spec decidió NO remover fondos automáticamente: la única
  // defensa contra un logo con fondo blanco es explicárselo bien al
  // cliente. No es un `error` — el archivo es válido y se puede imprimir
  // tal cual — así que se muestra como aviso accionable, con salida a
  // WhatsApp, no como fallo.
  const showAlphaNotice = Boolean(logo) && logo.hasAlpha === false;

  const contrast = garmentHex && logoDominantHex ? legibility(garmentHex, logoDominantHex) : null;
  const showContrastWarning = Boolean(contrast) && contrast.level !== 'ok';

  // ── Resolución de impresión ───────────────────────────────────────────
  //
  // Se recalcula en CADA render, o sea cada vez que el cliente escala el logo
  // desde logo-toolbar.js: el dpi depende del tamaño al que lo ponga, no del
  // archivo. Calcularlo una sola vez al subirlo daría un número que deja de
  // ser cierto en cuanto arrastra un tirador.
  //
  // Si falta cualquier ingrediente (no hay logo, el stage aún no montó, o la
  // prenda no tiene medida física registrada) no se inventa nada: simplemente
  // no se muestra el aviso. printQuality lanza con entradas inválidas, así que
  // la guarda va aquí y no se traga la excepción con un try/catch mudo.
  const puedeMedir = Boolean(logo?.naturalSize) && Boolean(transform)
    && Number(printArea?.width) > 0 && Number(printAreaWidthCm) > 0;

  const calidad = puedeMedir
    ? printQuality({
        naturalSize: logo.naturalSize,
        transform,
        printArea,
        printAreaWidthCm,
        vector: logo.isVector === true,
      })
    : null;

  // Se avisa hacia arriba sólo al ENTRAR en warn/fail, no en cada render: `calidad`
  // se recalcula cada vez que el cliente arrastra un tirador, y sin esto un solo
  // escalado emitiría decenas de avisos. El dpi que sube es el del momento de entrar.
  const nivelCalidad = calidad ? calidad.level : null;
  const dpiCalidad = calidad ? Math.round(calidad.dpi) : undefined;
  useEffect(() => {
    if ((nivelCalidad === 'warn' || nivelCalidad === 'fail') && onQualityWarning) {
      onQualityWarning(nivelCalidad, dpiCalidad);
    }
    // dpiCalidad y onQualityWarning fuera de las dependencias a propósito: sólo el
    // CAMBIO DE NIVEL debe disparar el aviso.
    // eslint-disable-next-line
  }, [nivelCalidad]);

  return h(
    'section',
    { className: 'es-panel es-panel-logo', 'aria-busy': busy ? 'true' : 'false' },
    h('h2', { className: 'es-panel-title' }, 'Tu logo'),

    logo
      ? h(
          'div',
          { className: 'es-field' },
          h(
            'div',
            { className: 'es-logo-card' },
            h(
              'div',
              { className: 'es-logo-card-info' },
              h('p', { className: 'es-logo-card-name' }, logo.name),
              h('p', { className: 'es-logo-card-meta' },
                `${logo.naturalSize.width}×${logo.naturalSize.height} px · ${formatBytes(logo.sizeBytes)}`),
            ),
          ),
        )
      : h('p', { className: 'es-hint' }, 'Sube tu logo sobre la prenda para continuar.'),

    showAlphaNotice
      ? h(
          'div',
          { className: cx('es-banner', 'es-logo-alert'), role: 'status' },
          h('p', null,
            h('strong', null, 'Este archivo no trae fondo transparente. '),
            'Se va a ver un rectángulo de color detrás del logo al imprimirlo. Escríbenos y te ayudamos a prepararlo.'),
          h('a', {
            className: 'es-btn es-btn-wa',
            href: WHATSAPP_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, 'Escribir por WhatsApp'),
        )
      : null,

    showContrastWarning
      ? h('p', {
          className: cx('es-warning', contrast.level === 'fail' && 'is-strong'),
          role: 'status',
        }, contrast.message)
      : null,

    // El tamaño impreso se enseña SIEMPRE que se pueda medir, no sólo cuando
    // hay problema: "se imprimirá a 12 × 5 cm" es justo el dato que el cliente
    // no tiene forma de deducir de una pantalla, y verlo cambiar mientras
    // escala es lo que convierte el aviso en algo que entiende.
    calidad?.message
      ? h('p', {
          className: cx(
            'es-print-quality',
            calidad.level === 'warn' && 'es-warning',
            calidad.level === 'fail' && 'es-warning is-strong',
          ),
          role: 'status',
          'data-dpi-level': calidad.level,
        }, calidad.message)
      : null,

    error ? h('p', { className: 'es-error-text', role: 'alert' }, error.message) : null,
  );
}
