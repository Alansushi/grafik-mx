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

  const stageRef = useRef(null);
  const logoImageRef = useRef(null);

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
      console.error('[estudio] no se pudo montar el stage', err);
      setStageBusy(false);
    });

    return () => { cancelled = true; };
    // colorHex NO va en las dependencias a propósito: cambiar de color no debe
    // reconstruir el stage, sólo repintar la prenda (efecto de abajo).
    // eslint-disable-next-line
  }, [garment, stageContainer]);

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
    if (qty === 0) { setQuote(null); setQuoteError(null); return; }

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

      let dominantHex = null;
      try { dominantHex = dominantColorFromPixels(px); } catch { /* logo totalmente transparente */ }

      logoImageRef.current = { image, naturalSize };
      setLogo({
        name: file.name,
        sizeBytes: file.size,
        naturalSize,
        hasAlpha: pixelsHaveAlpha(px),
        dominantHex,
      });
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
      } catch {
        // Valor no numérico a medio teclear: se conserva lo crudo para que el
        // panel muestre el error, y el desglose válido no se toca.
      }
      return next;
    });
  }, []);

  const canSubmit = Boolean(
    quote && !quoting && !quoteError && logo && customer.email.includes('@'),
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
      breakdown, rawSizes,
      minQty: garment.min_qty, maxQty: garment.max_qty,
      onChange: onSize,
    }),
    h(PanelResumen, {
      quote, loading: quoting, error: quoteError,
      customer, onCustomer: (k, v) => setCustomer((c) => ({ ...c, [k]: v })),
      onSubmit: () => { /* incremento 8b: crea el pedido y abre WhatsApp */ },
      canSubmit, submitting: false,
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
