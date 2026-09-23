// estudio/ui/panel-logo.js — subida del logo y controles de colocación.
//
// Componente controlado: no guarda estado de negocio (eso vive en
// studio-app.js — ver `logo`/`transform` en su useState). El único estado
// local que se permite aquí es de UI pura: si el dropzone está en hover de
// un drag, y el mensaje de "archivo rechazado antes de intentar subirlo".

import { h, useState, useRef, useCallback, useEffect, cx } from './react.js';
import { legibility } from '../lib/color.js';
import { printQuality } from '../lib/print-quality.js';
import { snapRotation } from '../lib/geometry.js';

const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp,image/svg+xml';
const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
// Red de seguridad para cuando `file.type` llega vacío: algunos gestores de
// archivos (sobre todo en Android/iOS con SVG) no rellenan el mime del File
// que entrega el picker o el drag&drop. La extensión es una señal más débil
// que el mime real, pero el servidor vuelve a validar el mime de verdad
// (storage-paths.js + el bucket de Supabase) así que aquí sólo hace falta
// una guarda razonable para la UX, no la autoridad final.
const ACCEPTED_EXT_RE = /\.(png|jpe?g|webp|svg)$/i;
const MAX_LOGO_BYTES = 8 * 1024 * 1024; // 8 MB — mismo tope que el servidor (spec §7.2)

// El slider de Escala ya no usa constantes de rango/paso fijas: min, max y
// step se calculan relativos a fitScale (ver scaleMin/scaleMax/scaleStep más
// abajo), para que queden centrados en "lo que de verdad cabe" en vez de un
// 0.1-3 absoluto sin relación con la resolución del logo subido.
const ROTATION_MIN = -180;
const ROTATION_MAX = 180;
const ROTATION_STEP = 1;

// Mismo número y misma URL que ya usan los avisos de /estudio/index.html
// (ver #es-notice-konva / #es-notice-catalog) y el FloatingWA del sitio
// público — un solo canal de soporte, sin inventar uno nuevo aquí.
const WHATSAPP_URL = 'https://wa.me/525539014600';

function isAcceptedFile(file) {
  if (ACCEPTED_MIME.includes(file.type)) return true;
  return ACCEPTED_EXT_RE.test(file.name || '');
}

/** '2300000' → '2.19 MB'. Sólo para mostrar; no interviene en la validación. */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
}

function UploadIcon() {
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: 30,
      height: 30,
      'aria-hidden': 'true',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    h('path', { d: 'M12 15.5V3.5M12 3.5 8 7.5M12 3.5l4 4' }),
    h('path', { d: 'M4 15.5v2.5A2.5 2.5 0 0 0 6.5 20.5h11a2.5 2.5 0 0 0 2.5-2.5v-2.5' }),
  );
}

/**
 * Fila reutilizable de "label + slider + valor legible", usada por Escala y
 * Rotación. `extra` es el hueco para el botón "0°" de Rotación; Escala no lo
 * usa y pasa null.
 */
function RangeField({ id, label, value, min, max, step, display, disabled, onChange, extra, numberInput }) {
  return h(
    'div',
    { className: 'es-field' },
    h(
      'div',
      { className: 'es-logo-range-head' },
      h('label', { className: 'es-field-label', htmlFor: id }, label),
      // Un <span> de solo lectura no deja teclear un valor exacto — con el
      // slider solo, llegar a "150%" o "45°" depende de arrastrar fino o de
      // repetir flechas de a un `step`. El input numérico reusa el mismo
      // `onChange`/estado; sólo cambia el DOMINIO en que se expresa el valor
      // (p.ej. Escala lo recibe en % relativo al fit, no en escala absoluta).
      numberInput
        ? h('input', {
            type: 'number',
            className: 'es-logo-range-number',
            'aria-label': `${label} (valor exacto)`,
            value: numberInput.value,
            min: numberInput.min,
            max: numberInput.max,
            step: numberInput.step,
            disabled,
            onChange: (e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) numberInput.onChange(n);
            },
          })
        : h('span', { className: 'es-logo-range-value' }, display),
    ),
    h(
      'div',
      { className: 'es-logo-range-row' },
      h('input', {
        id,
        type: 'range',
        min,
        max,
        step,
        value,
        disabled,
        'aria-valuetext': display,
        onChange: (e) => onChange(Number(e.target.value)),
      }),
      extra || null,
    ),
  );
}

/**
 * @param {{
 *   logo: {name:string, sizeBytes:number, naturalSize:{width:number,height:number}, hasAlpha:boolean} | null,
 *   transform: {x:number,y:number,scaleX:number,scaleY:number,rotation:number} | null,
 *   fitScale: number, // techo alcanzable AHORA (a la rotación actual); 100% de Escala = este valor
 *   garmentHex: string,
 *   logoDominantHex: string | null,
 *   busy: boolean,
 *   error: {code:string, message:string} | null,
 *   onFile: (file: File) => void,
 *   onTransform: (partial: object) => void,
 *   onFit: (mode: 'contain'|'cover') => void,
 *   onRemove: () => void,
 *   onQualityWarning?: (level:'warn'|'fail', dpi:number) => void,  // sólo al ENTRAR en aviso
 *   onReject?: (reason:'type'|'size', file: File) => void,         // rechazo previo a onFile
 * }} props
 */
export function PanelLogo({
  logo, transform, fitScale, garmentHex, logoDominantHex, busy, error,
  printArea, printAreaWidthCm,
  onFile, onTransform, onFit, onRemove, onQualityWarning, onReject,
}) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Rechazo ANTES de llegar a onFile: mime/tamaño obviamente inválidos. Es
  // deliberadamente distinto del `error` que llega por props — ese otro
  // viene de que el padre SÍ intentó leer el archivo (loadImageFromFile) y
  // falló; éste es más barato y evita ese intento por adelantado.
  const [localError, setLocalError] = useState(null);

  const handleCandidate = useCallback((file) => {
    if (!file) return;
    if (!isAcceptedFile(file)) {
      setLocalError('Ese formato no se acepta. Sube un PNG, JPG, WEBP o SVG.');
      if (onReject) onReject('type', file);
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLocalError(`El archivo pesa ${formatBytes(file.size)}; el máximo son 8 MB.`);
      if (onReject) onReject('size', file);
      return;
    }
    setLocalError(null);
    onFile(file);
  }, [onFile, onReject]);

  const openPicker = useCallback(() => {
    if (busy) return;
    inputRef.current?.click();
  }, [busy]);

  const onInputChange = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    // Limpiar el value primero: si no, elegir el MISMO archivo dos veces
    // seguidas (p.ej. lo corrigieron fuera y lo resubieron con igual
    // nombre) no dispara un segundo 'change'.
    e.target.value = '';
    if (file) handleCandidate(file);
  }, [handleCandidate]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleCandidate(file);
  }, [busy, handleCandidate]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    if (!busy) setIsDragOver(true);
  }, [busy]);

  const onDragLeave = useCallback(() => setIsDragOver(false), []);

  const onKeyDown = useCallback((e) => {
    if (busy) return;
    // Enter y Espacio: el dropzone es un <div role="button">, no un
    // elemento nativo que ya sepa reaccionar al teclado por su cuenta.
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      openPicker();
    }
  }, [busy, openPicker]);

  const scale = transform?.scaleX ?? 1;
  const rotation = transform?.rotation ?? 0;
  const controlsDisabled = busy || !transform;

  // % de Escala relativo al FIT, no absoluto: "100%" = el máximo que cabe en
  // el área imprimible AHORA MISMO (a la rotación actual — ver getFitScale()
  // en konva-adapter.js). El valor absoluto (scaleX, px de canvas por px del
  // archivo) no dice nada al cliente — para un logo típico de miles de px, el
  // fit "correcto" cae en 5%-20% de esa escala absoluta, pegado al piso del
  // rango y sin relación intuitiva con "qué tan grande se ve el logo".
  // fitScaleSafe evita dividir por 0/undefined antes de que exista un fit.
  const fitScaleSafe = Number(fitScale) > 0 ? fitScale : (scale || 1);
  const scaleMin = fitScaleSafe * 0.2;
  // 100%, no más: por encima del fit el AABB del logo ya no cabe en el área
  // imprimible, así que clampScale lo rechaza siempre — ofrecer un rango
  // mayor (antes ×4) prometía un "agrandar" que nunca sucedía.
  const scaleMax = fitScaleSafe;
  // 1% relativo por tick, no un paso absoluto fijo: así la precisión es la
  // misma sin importar si el fit dio una escala absoluta chica o grande.
  const scaleStep = fitScaleSafe / 100;
  const scalePercent = Math.round((scale / fitScaleSafe) * 100);

  // El §6 del spec decidió NO remover fondos automáticamente: la única
  // defensa contra un logo con fondo blanco es explicárselo bien al
  // cliente, antes (el hint de abajo) y después (este aviso). No es un
  // `error` — el archivo es válido y se puede imprimir tal cual — así que
  // se muestra como aviso accionable, con salida a WhatsApp, no como fallo.
  const showAlphaNotice = Boolean(logo) && logo.hasAlpha === false;

  const contrast = garmentHex && logoDominantHex ? legibility(garmentHex, logoDominantHex) : null;
  const showContrastWarning = Boolean(contrast) && contrast.level !== 'ok';

  // ── Resolución de impresión ───────────────────────────────────────────
  //
  // Se recalcula en CADA render, o sea cada vez que el cliente escala el logo:
  // el dpi depende del tamaño al que lo ponga, no del archivo. Calcularlo una
  // sola vez al subirlo daría un número que deja de ser cierto en cuanto
  // arrastra un tirador.
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

  const fileInput = h('input', {
    ref: inputRef,
    id: 'es-logo-input',
    className: 'es-file-input',
    type: 'file',
    accept: ACCEPT_ATTR,
    disabled: busy,
    onChange: onInputChange,
  });

  return h(
    'section',
    { className: 'es-panel', 'aria-busy': busy ? 'true' : 'false' },
    h('h2', { className: 'es-panel-title' }, '2. Tu logo'),

    // El <input> real vive siempre en el árbol (obligatorio para móvil, donde
    // no hay drag&drop) pero oculto visualmente; el <label> le da nombre
    // accesible sin duplicar texto visible.
    h('label', { className: 'es-sr-only', htmlFor: 'es-logo-input' }, 'Elegir archivo de logo'),
    fileInput,

    !logo
      ? h(
          'div',
          { className: 'es-field' },
          h(
            'div',
            {
              className: cx('es-dropzone', isDragOver && 'is-dragover', busy && 'is-busy'),
              role: 'button',
              tabIndex: busy ? -1 : 0,
              'aria-disabled': busy ? 'true' : 'false',
              'aria-describedby': 'es-logo-hint',
              onClick: openPicker,
              onKeyDown,
              onDrop,
              onDragOver,
              onDragLeave,
            },
            h(UploadIcon, null),
            h('p', { className: 'es-dropzone-title' },
              busy ? 'Cargando…' : 'Arrastra tu logo aquí o toca para elegirlo'),
            h('p', { className: 'es-dropzone-formats' }, 'PNG · JPG · WEBP · SVG — hasta 8 MB'),
          ),
          h('p', { className: 'es-hint', id: 'es-logo-hint' },
            'Sube el logo en PNG con fondo transparente: un JPG lleva un rectángulo de fondo que se va a ver pegado encima de la prenda.'),
        )
      : h(
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
            h('button', {
              type: 'button',
              className: 'es-btn es-btn-outline',
              onClick: openPicker,
              disabled: busy,
            }, 'Cambiar'),
          ),
        ),

    // Los controles van INMEDIATAMENTE después de la tarjeta del logo, antes
    // de cualquier aviso condicional: son lo primero que hay que poder usar
    // al subir un logo, y el aviso de transparencia + el de contraste + el de
    // calidad de impresión pueden aparecer los tres a la vez, empujando todo
    // lo de abajo — no deben interponerse entre la tarjeta y los sliders.
    logo
      ? h(
          'div',
          { className: 'es-logo-controls' },
          h(RangeField, {
            id: 'es-logo-scale',
            label: 'Escala',
            value: scale,
            min: scaleMin,
            max: scaleMax,
            step: scaleStep,
            display: `${scalePercent}%`,
            disabled: controlsDisabled,
            onChange: (v) => onTransform({ scaleX: v, scaleY: v }),
            numberInput: {
              // En porcentaje RELATIVO al fit (100% = el máximo real), no en
              // la escala absoluta: es la misma unidad que ve el cliente en
              // `display`, así el campo numérico y el slider siempre coinciden.
              // Tope en 100, a juego con scaleMax: no hay nada por encima.
              value: scalePercent,
              min: 20,
              max: 100,
              step: 1,
              onChange: (pct) => {
                const s = (pct / 100) * fitScaleSafe;
                onTransform({ scaleX: s, scaleY: s });
              },
            },
          }),
          h(RangeField, {
            id: 'es-logo-rotation',
            label: 'Rotación',
            value: rotation,
            min: ROTATION_MIN,
            max: ROTATION_MAX,
            step: ROTATION_STEP,
            display: `${Math.round(rotation)}°`,
            disabled: controlsDisabled,
            onChange: (v) => onTransform({ rotation: snapRotation(v) }),
            numberInput: {
              value: Math.round(rotation),
              min: ROTATION_MIN,
              max: ROTATION_MAX,
              step: 1,
              onChange: (v) => onTransform({ rotation: snapRotation(v) }),
            },
            extra: h('button', {
              type: 'button',
              className: 'es-btn es-btn-outline es-btn-sm',
              'aria-label': 'Restablecer rotación a 0 grados',
              onClick: () => onTransform({ rotation: 0 }),
              disabled: controlsDisabled || rotation === 0,
            }, '0°'),
          }),
          h(
            'div',
            { className: 'es-logo-actions' },
            h('button', {
              type: 'button',
              className: 'es-btn es-btn-outline',
              onClick: () => onFit('contain'),
              disabled: controlsDisabled,
            }, 'Ajustar al área'),
            h('button', {
              type: 'button',
              className: 'es-btn es-btn-danger',
              onClick: onRemove,
              disabled: busy,
            }, 'Quitar logo'),
          ),
        )
      : null,

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
    localError ? h('p', { className: 'es-error-text', role: 'alert' }, localError) : null,
  );
}
