// estudio/ui/canvas-dropzone.js — subir el logo directo sobre el canvas.
//
// Antes vivía dentro de panel-logo.js; se extrajo tal cual (misma validación,
// mismos handlers) para montarse vía portal en #es-canvas-dropzone-mount,
// superpuesto al canvas, en vez de en el sidebar — más cerca de donde el
// cliente en realidad suelta el archivo.
//
// Límite de alcance a propósito: esto SOLO se muestra cuando no hay logo
// (`visible=false` con logo puesto no renderiza nada salvo el <input>
// oculto). Con el logo ya colocado, Konva necesita el puntero completo sobre
// #es-stage para poder arrastrarlo — una capa de "soltar aquí" activa
// encima todo el tiempo se lo robaría. Reemplazar el logo ya puesto se hace
// desde el botón "Cambiar logo" de la toolbar (estudio/ui/logo-toolbar.js),
// que comparte este mismo <input> vía `fileInputRef`.

import { h, useState, useCallback, cx } from './react.js';

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
 * @param {{
 *   visible: boolean,       // !logo — con logo puesto sólo se monta el <input>
 *   busy: boolean,
 *   fileInputRef: {current: HTMLInputElement|null},  // compartido con logo-toolbar.js
 *   onFile: (file: File) => void,
 *   onReject?: (reason:'type'|'size', file: File) => void,
 * }} props
 */
export function CanvasDropzone({ visible, busy, fileInputRef, onFile, onReject }) {
  const [isDragOver, setIsDragOver] = useState(false);
  // Rechazo ANTES de llegar a onFile: mime/tamaño obviamente inválidos. Es
  // deliberadamente distinto del `error` que vive en panel-logo.js — ese otro
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
    fileInputRef.current?.click();
  }, [busy, fileInputRef]);

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

  return h(
    'div',
    { className: 'es-canvas-dropzone-wrap' },
    // El <input> real vive siempre en el árbol (obligatorio para móvil, donde
    // no hay drag&drop) pero oculto visualmente; el <label> le da nombre
    // accesible sin duplicar texto visible. logo-toolbar.js abre este mismo
    // input por su ref — un único <input> en todo el DOM.
    h('label', { className: 'es-sr-only', htmlFor: 'es-logo-input' }, 'Elegir archivo de logo'),
    h('input', {
      ref: fileInputRef,
      id: 'es-logo-input',
      className: 'es-file-input',
      type: 'file',
      accept: ACCEPT_ATTR,
      disabled: busy,
      onChange: onInputChange,
    }),

    visible
      ? h(
          'div',
          {
            className: cx('es-dropzone', 'es-canvas-dropzone', isDragOver && 'is-dragover', busy && 'is-busy'),
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
          h('p', { className: 'es-hint', id: 'es-logo-hint' },
            'PNG con fondo transparente: un JPG lleva un rectángulo de fondo que se ve pegado encima de la prenda.'),
          localError
            ? h('p', { className: 'es-error-text es-canvas-dropzone-error', role: 'alert' }, localError)
            : null,
        )
      : null,
  );
}
