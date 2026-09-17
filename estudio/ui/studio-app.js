// estudio/ui/studio-app.js — la raíz. Dueña de TODO el estado de negocio.
//
// Konva no es React: el stage es imperativo y vive fuera del árbol, en un ref.
// El trato es de una sola dirección — React decide y llama al stage; el stage
// sólo devuelve el transform cuando el usuario arrastra. Nunca al revés. Si el
// stage empezara a ser fuente de verdad de algo, habría dos estados que
// mantener sincronizados y ése es el camino a los bugs difíciles.

import { h, useState, useEffect, useMemo, useRef, useCallback, Fragment } from './react.js';
import { PanelPrenda, AvisoContraste } from './panel-prenda.js';
import { PanelLogo } from './panel-logo.js';
import { PanelTallas } from './panel-tallas.js';
import { PanelResumen } from './panel-resumen.js';

import { createStudioStage } from '../canvas/konva-adapter.js';
import { renderProceduralBase, resolvePrintArea } from '../canvas/mockup.js';
import { loadImageFromUrl, loadImageFromFile } from '../canvas/image-loader.js';
import { normalizeBreakdown } from '../lib/sizes.js';
import { dominantColorFromPixels, pixelsHaveAlpha } from '../lib/compose.js';
import { breakdownToLabel } from '../lib/sizes.js';
import { formatCentsMXN } from '../lib/format.js';

const PROCEDURAL_PREFIX = 'procedural:';
const DEFAULT_CANVAS_SIZE = { width: 900, height: 900 };
const QUOTE_DEBOUNCE_MS = 350;

export function StudioApp({ catalog, stageContainer }) {
  const garments = catalog.garments;
  const techniques = catalog.techniques;

  const [garmentSlug, setGarmentSlug] = useState(garments[0].slug);
  const [colorHex, setColorHex] = useState(garments[0].variants[0].color_hex);
  const [techniqueSlug, setTechniqueSlug] = useState(techniques[0].slug);
  const [logo, setLogo] = useState(null);
  const [transform, setTransform] = useState(null);
  const [breakdown, setBreakdown] = useState({});
  const [rawSizes, setRawSizes] = useState({});
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState(null);
  const [logoError, setLogoError] = useState(null);
  const [stageBusy, setStageBusy] = useState(true);
  // Si el stage no monta, la página se veía NORMAL: controles activos, canvas
  // vacío, y el logo "adjunto" sin posición real. Peor, canSubmit lo dejaba
  // pasar. Lo encontró la puerta de revisión del incremento 8.
  const [stageError, setStageError] = useState(null);
  // Valores que normalizeBreakdown rechazó, por talla.
  const [sizeErrors, setSizeErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  const stageRef = useRef(null);
  const logoImageRef = useRef(null);
  // Identificador del borrador. Agrupa en Storage el logo y el preview de ESTA
  // sesión, y api/submit-quote exige que toda ruta enviada lo contenga — así un
  // cliente no puede adjuntar a su pedido el archivo de otro.
  const draftIdRef = useRef(null);
  if (draftIdRef.current === null) draftIdRef.current = crypto.randomUUID();

  const garment = useMemo(
    () => garments.find((g) => g.slug === garmentSlug) ?? garments[0],
    [garments, garmentSlug],
  );
  const technique = useMemo(
    () => techniques.find((t) => t.slug === techniqueSlug) ?? techniques[0],
    [techniques, techniqueSlug],
  );

  // ── El stage se RECREA al cambiar de prenda ────────────────────────────
  //
  // createStudioStage fija printArea, ancho y alto al construirse. El shell del
  // incremento 7 reusaba el stage inicial al cambiar de prenda, así que la
  // gorra heredaba el área imprimible de la playera — el logo quedaba colocado
  // donde no se imprime. Recrear es más barato que añadir un camino de
  // redimensionado a konva-adapter, y deja una sola forma de construir el stage.
  useEffect(() => {
    let cancelled = false;
    let created = null;

    (async () => {
      setStageBusy(true);
      setStageError(null);
      const size = garment.canvas_size || DEFAULT_CANVAS_SIZE;
      const printArea = resolvePrintArea(garment.print_area, size);

      const baseImage = garment.base_mockup_url.startsWith(PROCEDURAL_PREFIX)
        ? renderProceduralBase(garment.base_mockup_url.slice(PROCEDURAL_PREFIX.length), size)
        : await loadImageFromUrl(garment.base_mockup_url);

      if (cancelled) return;

      stageRef.current?.destroy();
      stageContainer.style.aspectRatio = `${size.width} / ${size.height}`;

      created = createStudioStage({ container: stageContainer, width: size.width, height: size.height, printArea });
      created.setGarment({ baseImage, foldImage: null, colorHex });
      created.onTransformChange((t) => setTransform(t));

      // El logo ya colocado sobrevive al cambio de prenda, reencajado en el
      // área nueva. Perderlo obligaría a subirlo otra vez por cambiar de
      // playera a gorra, que es justo la comparación que el cliente quiere hacer.
      if (logoImageRef.current) {
        created.setLogo({ image: logoImageRef.current.image, naturalSize: logoImageRef.current.naturalSize });
      }

      stageRef.current = created;
      setStageBusy(false);
    })().catch((err) => {
      // El chequeo de `cancelled` aquí NO es de adorno: si el usuario cambia de
      // prenda dos veces rápido y la primera carga falla tarde, sin esto su
      // catch apagaría `stageBusy` mientras la SEGUNDA prenda sigue montándose
      // — reactivando los controles sobre un stage que todavía no existe.
      if (cancelled) return;
      console.error('[estudio] no se pudo montar el stage', err);
      setStageError({
        code: err?.code ?? 'STAGE_FAILED',
        message: 'No pudimos cargar la vista previa de esta prenda. Recarga la página o escríbenos por WhatsApp.',
      });
      setStageBusy(false);
    });

    return () => { cancelled = true; };
    // colorHex NO va en las dependencias a propósito: cambiar de color no debe
    // reconstruir el stage, sólo repintar la prenda (efecto de abajo).
    // eslint-disable-next-line
  }, [garment, stageContainer]);

  // Liberar el stage al DESMONTAR. Va en su propio efecto con dependencias
  // vacías porque el cleanup del efecto de arriba corre también en cada cambio
  // de prenda, y ahí el destroy NO debe pasar: el stage vigente se reemplaza al
  // inicio del run siguiente. Sin esto quedarían vivos los canvas y sus
  // listeners si el componente se desmontara de verdad.
  useEffect(() => () => { stageRef.current?.destroy(); }, []);

  // ── Cambiar de color: sólo repinta ──────────────────────────────────────
  useEffect(() => {
    if (!stageRef.current || stageBusy) return;
    stageRef.current.setGarment({ colorHex });
  }, [colorHex, stageBusy]);

  // Al cambiar de prenda, el color anterior puede no existir en la nueva.
  useEffect(() => {
    if (!garment.variants.some((v) => v.color_hex === colorHex)) {
      setColorHex(garment.variants[0].color_hex);
    }
  }, [garment, colorHex]);

  // ── Cotización: el precio SIEMPRE lo calcula el servidor ────────────────
  //
  // Se reconsulta con debounce porque el usuario teclea cantidades y cada
  // pulsación cambiaría el total. El precio nunca se calcula aquí ni aunque
  // tuviéramos los tiers: pricing_rules no es legible con la anon key, y eso es
  // deliberado.
  useEffect(() => {
    const qty = Object.values(breakdown).reduce((s, n) => s + n, 0);
    if (qty === 0) {
      // setQuoting(false) hace falta aquí: si el cliente borra las tallas
      // mientras una cotización va en vuelo, su `finally` ve cancelled=true y
      // se salta el apagado — y el panel se queda en "Cotizando…" para siempre.
      setQuote(null); setQuoteError(null); setQuoting(false);
      return;
    }

    let cancelled = false;
    setQuoting(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [{
              garment_type_id: garment.id,
              technique_id: technique.id,
              size_breakdown: breakdown,
            }],
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setQuote(null);
          setQuoteError({ code: data.error, message: mensajeDeCotizacion(data, garment) });
        } else {
          setQuote(data);
          setQuoteError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[estudio] falló la cotización', err);
          setQuote(null);
          setQuoteError({ code: 'NETWORK', message: 'No pudimos calcular el precio. Revisa tu conexión e intenta de nuevo.' });
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, QUOTE_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(id); };
  }, [breakdown, garment, technique]);

  // ── Logo ────────────────────────────────────────────────────────────────
  const onFile = useCallback(async (file) => {
    setLogoError(null);
    try {
      const image = await loadImageFromFile(file);
      const naturalSize = { width: image.naturalWidth, height: image.naturalHeight };

      // Se lee el logo una vez para dos cosas: saber si trae transparencia (el
      // §6 decidió no remover fondos automáticamente, así que hay que AVISAR) y
      // sacar su color dominante para la advertencia de contraste.
      const probe = document.createElement('canvas');
      probe.width = Math.min(naturalSize.width, 160);
      probe.height = Math.min(naturalSize.height, 160);
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      pctx.drawImage(image, 0, 0, probe.width, probe.height);
      const px = pctx.getImageData(0, 0, probe.width, probe.height).data;

      // dominantColorFromPixels lanza NO_OPAQUE_PIXELS cuando ningún píxel
      // supera el umbral de alfa — o sea, cuando el archivo NO TIENE NADA
      // VISIBLE. Antes se tragaba en silencio y el logo se aceptaba como
      // válido: el cliente subía un PNG vacío y nada se lo decía, aunque no se
      // fuera a imprimir absolutamente nada.
      let dominantHex = null;
      let emptyLogo = false;
      try {
        dominantHex = dominantColorFromPixels(px);
      } catch (err) {
        if (err?.code === 'NO_OPAQUE_PIXELS') emptyLogo = true;
        else throw err;
      }

      logoImageRef.current = { image, naturalSize, file };
      setLogo({
        name: file.name,
        sizeBytes: file.size,
        naturalSize,
        hasAlpha: pixelsHaveAlpha(px),
        dominantHex,
        isEmpty: emptyLogo,
      });
      if (emptyLogo) {
        setLogoError({
          code: 'NO_OPAQUE_PIXELS',
          message: 'Ese archivo parece estar vacío o totalmente transparente: no se imprimiría nada. Revisa que exportaste el logo con su contenido.',
        });
      }
      stageRef.current?.setLogo({ image, naturalSize });
    } catch (err) {
      console.error('[estudio] no se pudo cargar el logo', err);
      setLogoError({ code: err.code ?? 'LOGO_FAILED', message: 'No pudimos leer ese archivo. Prueba con un PNG.' });
    }
  }, []);

  const onRemoveLogo = useCallback(() => {
    logoImageRef.current = null;
    setLogo(null);
    setTransform(null);
    stageRef.current?.setLogo({ image: null });
  }, []);

  const onTransform = useCallback((partial) => {
    const s = stageRef.current;
    if (!s) return;
    s.setTransform({ ...s.getTransform(), ...partial });
  }, []);

  const onFit = useCallback((mode) => stageRef.current?.fitLogo(mode), []);

  // ── Tallas ──────────────────────────────────────────────────────────────
  //
  // El input entrega strings. normalizeBreakdown es quien los convierte, y
  // totalUnits lanza si se le pasa algo sin normalizar — ese guardia existe
  // porque antes se concatenaban y un pedido de 12 piezas se cotizaba como 57.
  const onSize = useCallback((size, rawValue) => {
    setRawSizes((prev) => {
      const next = { ...prev, [size]: rawValue };
      try {
        setBreakdown(normalizeBreakdown(next));
        setSizeErrors((errs) => {
          if (errs[size] === undefined) return errs;
          const { [size]: _, ...resto } = errs;
          return resto;
        });
      } catch (err) {
        // ANTES esto era un catch vacío, y era un fallo silencioso de verdad:
        // pegar "1,000" desde Excel hacía que el campo revirtiera al valor
        // anterior sin ningún aviso. El cliente no tenía forma de saber por qué
        // su cantidad "no se guardó" — y en un pedido por volumen eso termina
        // en la cantidad equivocada. Ahora el rechazo se muestra junto al campo.
        setSizeErrors((errs) => ({
          ...errs,
          [size]: err?.code === 'NON_NUMERIC_QTY'
            ? 'Escribe sólo números, sin comas ni puntos.'
            : 'Esa cantidad no es válida.',
        }));
      }
      return next;
    });
  }, []);

  // ── Envío del pedido ────────────────────────────────────────────────────
  //
  // Orden: logo → snapshot → pedido → WhatsApp. Los binarios NUNCA pasan por
  // api/*: se piden URLs firmadas y el PUT va directo a Storage (spec §7.2).
  //
  // El snapshot se genera AQUÍ y no en el servidor porque es literalmente lo
  // que el cliente tiene delante: el mismo canvas que aprobó, no una
  // reconstrucción que podría diferir.
  const onSubmit = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || !logoImageRef.current?.file) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const draftId = draftIdRef.current;

      const logoFile = logoImageRef.current.file;
      const logoPath = await subirArchivo({
        kind: 'logo', draftId, blob: logoFile,
        filename: logoFile.name, mime: logoFile.type || 'image/png',
      });

      // pixelRatio 2 para que el equipo pueda ampliar el preview sin que se
      // deshaga; el tope real de tamaño lo impone el bucket.
      const snapshot = await stage.snapshot({ pixelRatio: 2 });
      const previewPath = await subirArchivo({
        kind: 'preview', draftId, blob: snapshot,
        itemIndex: 0, mime: 'image/png',
      });

      const variant = garment.variants.find((v) => v.color_hex === colorHex);
      const res = await fetch('/api/submit-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          customer,
          items: [{
            garment_type_id: garment.id,
            garment_variant_id: variant.id,
            technique_id: technique.id,
            size_breakdown: breakdown,
            logo_path: logoPath,
            preview_path: previewPath,
            logo_transform: stage.getTransform(),
          }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error), { code: data.error });

      setSubmitted(data);
      // El mensaje se arma con los datos que DEVOLVIÓ el servidor (short_code y
      // total), no con los del cliente: es la cifra que quedó guardada.
      window.open(construirMensajeWhatsApp({
        data, garment, variant, technique, breakdown, customer,
      }), '_blank', 'noopener');
    } catch (err) {
      console.error('[estudio] no se pudo enviar el pedido', err);
      setSubmitError({
        code: err?.code ?? 'SUBMIT_FAILED',
        message: 'No pudimos enviar tu pedido. Vuelve a intentarlo o escríbenos por WhatsApp.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [garment, colorHex, technique, breakdown, customer]);

  // canSubmit exige además que el stage esté VIVO y que el logo tenga posición
  // real. Sin eso, un fallo al montar la vista previa dejaba el botón activo
  // con un logo "adjunto" pero sin transform: el pedido habría salido con el
  // logo sin colocar. Es el mismo bug de "el logo queda donde no se imprime",
  // pero a nivel de pedido.
  const canSubmit = Boolean(
    quote && !quoting && !quoteError
    && logo && !logo.isEmpty && transform
    && !stageBusy && !stageError && stageRef.current
    && customer.email.includes('@'),
  );

  // Puente para el gancho de depuración de boot.js. Se publica SIEMPRE (es sólo
  // una referencia interna), pero boot.js sólo lo envuelve en window.__studio
  // cuando la URL trae ?debug=1 — así no hay objeto de depuración accesible en
  // producción. Se reasigna en cada render para que los getters lean estado
  // vivo y no una foto del montaje.
  window.__studioBridge = {
    get stage() { return stageRef.current; },
    garment, colorHex, transform, quote,
    setColor: setColorHex,
    setGarmentBySlug: setGarmentSlug,
    setSize: onSize,
    loadLogoFromFile: onFile,
  };

  return h(Fragment, null,
    stageError
      ? h('p', { className: 'es-logo-alert', role: 'alert' },
          stageError.message, ' ',
          h('a', { href: 'https://wa.me/525539014600', target: '_blank', rel: 'noopener' }, 'Escríbenos'))
      : null,
    h(PanelPrenda, {
      garments, techniques, garmentSlug, colorHex, techniqueSlug,
      onGarment: setGarmentSlug, onColor: setColorHex, onTechnique: setTechniqueSlug,
      busy: stageBusy,
    }),
    h(AvisoContraste, { garmentHex: colorHex, logoHex: logo?.dominantHex }),
    h(PanelLogo, {
      logo, transform, garmentHex: colorHex, logoDominantHex: logo?.dominantHex,
      busy: stageBusy, error: logoError,
      onFile, onTransform, onFit, onRemove: onRemoveLogo,
    }),
    h(PanelTallas, {
      allowedSizes: garment.allowed_sizes,
      breakdown, rawSizes, rawErrors: sizeErrors,
      minQty: garment.min_qty, maxQty: garment.max_qty,
      onChange: onSize,
    }),
    h(PanelResumen, {
      quote, loading: quoting, error: quoteError,
      customer, onCustomer: (k, v) => setCustomer((c) => ({ ...c, [k]: v })),
      onSubmit, canSubmit, submitting, error: quoteError ?? submitError,
      submitted,
    }),
  );
}

/** Traduce los códigos de /api/quote a algo que el cliente pueda accionar. */
function mensajeDeCotizacion(data, garment) {
  const primero = data.details?.[0]?.code;
  if (primero === 'BELOW_MIN') return `El pedido mínimo es de ${garment.min_qty} piezas.`;
  if (primero === 'ABOVE_MAX') return `El máximo por pedido es de ${garment.max_qty} piezas.`;
  if (primero === 'UNKNOWN_SIZE') return 'Hay una talla que no aplica para esta prenda.';
  if (data.error === 'PRICING_RULE_NOT_FOUND') return 'Esa combinación de prenda y técnica no está disponible por ahora.';
  return 'No pudimos calcular el precio con esos datos.';
}

/**
 * Pide una URL firmada y hace el PUT directo a Storage. Devuelve la ruta del
 * objeto, que es lo único que viaja después a /api/submit-quote.
 */
async function subirArchivo({ kind, draftId, blob, filename, itemIndex, mime }) {
  const firma = await fetch('/api/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, draftId, filename, itemIndex, size: blob.size, mime }),
  });
  const datos = await firma.json();
  if (!firma.ok) throw Object.assign(new Error(datos.error), { code: datos.error });

  const put = await fetch(datos.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': mime, authorization: `Bearer ${datos.token}` },
    body: blob,
  });
  if (!put.ok) {
    throw Object.assign(new Error(`Storage ${put.status}`), { code: 'UPLOAD_FAILED' });
  }
  return datos.path;
}

/**
 * wa.me no admite adjuntos, así que el mensaje lleva el resumen en texto y una
 * liga a /estudio/pedido/?t=..., donde se ve el preview que el cliente aprobó.
 */
function construirMensajeWhatsApp({ data, garment, variant, technique, breakdown, customer }) {
  const liga = `${location.origin}/estudio/pedido/?t=${data.public_token}`;
  const lineas = [
    `Hola, acabo de armar un pedido en el configurador. Folio ${data.short_code}.`,
    '',
    `Prenda: ${garment.name}`,
    `Color: ${variant?.color_name ?? ''}`,
    `Técnica: ${technique.name}`,
    `Tallas: ${breakdownToLabel(breakdown)}`,
    `Total${data.is_placeholder ? ' de referencia' : ''}: ${formatCentsMXN(data.total_cents)}`,
    '',
    `Mi diseño: ${liga}`,
  ];
  if (customer.name) lineas.push('', `Soy ${customer.name}.`);
  return `https://wa.me/525539014600?text=${encodeURIComponent(lineas.join('\n'))}`;
}
