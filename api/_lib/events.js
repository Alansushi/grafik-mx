// api/_lib/events.js — PURA.
//
// Contrato de los eventos de analítica que llegan a POST /api/track. Sin red,
// sin reloj, sin DOM: todo lo que decide qué se guarda y qué se descarta vive
// aquí para poder probarlo sin levantar nada.
//
// ── Por qué una lista blanca estricta ──
//
// /api/track es un endpoint público y anónimo: cualquiera puede mandarle JSON.
// Sin lista blanca, la tabla se llena de basura y, peor, un cambio futuro del
// cliente podría empezar a mandar texto libre del formulario (nombre, detalle
// del pedido) y guardarlo sin que nadie lo decida. Aquí el destino de cada
// campo es explícito: lo que no está declarado se DESCARTA, no se guarda.
//
// Consecuencia deliberada: un `cta_id` mal escrito en index.html no se guarda
// como "hreo", descarta el evento. tests/unit/events.test.js cruza CTA_IDS con
// los data-cta reales del HTML para que ese descarte no pase en silencio.

/** Un id por PUNTO de conversión (no por botón lógico): dónde está importa. */
export const CTA_IDS = [
  'nav', 'hero', 'servicios-bottom', 'contacto-card', 'contacto-form',
  'contacto-tel', 'cta-final', 'footer-tel', 'floating', 'lightbox',
  'trabajos-bottom',
];

export const CTA_KINDS = ['whatsapp', 'tel', 'form'];

/**
 * Secciones que analytics.js reporta al hacerse visibles. `top` (el hero) no
 * está: es lo primero que se ve, así que equivaldría a page_view. Las que no
 * llevan id en el HTML (CTA final, footer) se marcan con data-section.
 */
export const SECTIONS = [
  'servicios', 'ventajas', 'proceso', 'faqs', 'trabajos', 'contacto', 'cta-final', 'footer',
];

const DEVICES = ['mobile', 'tablet', 'desktop'];

// Tope por lote. El cliente vacía la cola a los 20 y un lote normal trae 1–5.
export const MAX_EVENTS = 20;

const SID_RE = /^[a-z0-9]{8,32}$/;
const HOST_RE = /^[a-z0-9.-]{1,100}$/;
// Los UTM los escribe quien arma el enlace, o cualquiera que fabrique uno: se
// aceptan letras, números y puntuación de uso común, nunca control ni comillas.
const UTM_RE = /^[\p{L}\p{N} _.\-+:/|~%@]{1,100}$/u;
// Etiquetas de catálogo ("Pósters", "Artículos Promocionales").
const LABEL_RE = /^[\p{L}\p{N} _.\-]{1,40}$/u;

const enumOf = (list) => (v) => (list.includes(v) ? v : undefined);
const label = (v) => (typeof v === 'string' && LABEL_RE.test(v) ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
// Identificadores que arma el cliente (id de ancla, slug de pregunta o de foto).
// Se aceptan por FORMA y no por lista: las FAQs y las fotos de Trabajos cambian
// seguido y CLAUDE.md ya obliga a tocar tres sitios al hacerlo; un cuarto sería
// una trampa.
const slug = (max) => (v) => (typeof v === 'string' && v.length <= max && /^[a-z0-9-]+$/.test(v) ? v : undefined);

// `fields` decide QUÉ propiedades sobreviven; `required`, sin cuáles el evento
// no significa nada y se descarta entero.
const EVENTS = {
  page_view: { fields: {}, required: [] },
  cta_click: {
    fields: { cta_id: enumOf(CTA_IDS), kind: enumOf(CTA_KINDS), work_cat: label, servicio: label },
    required: ['cta_id', 'kind'],
  },
  // ── Fase 2: interacciones secundarias ──
  // Una vez por sesión y sección, tras 800 ms visible (ver analytics.js).
  section_view: { fields: { section: enumOf(SECTIONS) }, required: ['section'] },
  // Cualquier enlace a un ancla. `from` distingue la barra de navegación de los
  // botones dentro de la página ("Ver servicios", "Ver preguntas frecuentes").
  nav_click: { fields: { target: slug(30), from: enumOf(['nav', 'page']) }, required: ['target'] },
  service_chip: { fields: { servicio: label, selected: bool }, required: ['servicio', 'selected'] },
  // Primer foco o clic dentro del formulario de contacto. Sin props: no se
  // registra NADA de lo escrito.
  form_start: { fields: {}, required: [] },
  // `q` = texto de la pregunta convertido a slug, no su posición: las FAQs se reordenan.
  faq_open: { fields: { q: slug(60) }, required: ['q'] },
  work_open: { fields: { slug: slug(40), cat: label }, required: ['slug'] },
};

export const EVENT_NAMES = Object.keys(EVENTS);

function intIn(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function cleanCtx(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const host = typeof c.referrer_host === 'string' ? c.referrer_host.toLowerCase() : '';
  const utm = (v) => (typeof v === 'string' && UTM_RE.test(v) ? v : null);
  return {
    referrer_host: HOST_RE.test(host) ? host : null,
    utm_source: utm(c.utm_source),
    utm_medium: utm(c.utm_medium),
    utm_campaign: utm(c.utm_campaign),
    utm_content: utm(c.utm_content),
    utm_term: utm(c.utm_term),
    device: DEVICES.includes(c.device) ? c.device : null,
    vw: intIn(c.vw, 0, 10000),
  };
}

function cleanProps(schema, raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [key, clean] of Object.entries(schema.fields)) {
    const value = clean(src[key]);
    if (value !== undefined) out[key] = value;
  }
  return schema.required.every((k) => k in out) ? out : null;
}

function cleanEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  const schema = EVENTS[ev.name];
  if (!schema) return null;
  const props = cleanProps(schema, ev.props);
  if (!props) return null;
  // Sólo el pathname: una query string puede traer un correo o un token.
  const path = typeof ev.path === 'string' && ev.path.startsWith('/')
    ? ev.path.split(/[?#]/)[0].slice(0, 200)
    : null;
  return { event: ev.name, path, t_ms: intIn(ev.t_ms, 0, 86_400_000), props };
}

/**
 * Valida un lote `{ sid, ctx, events }`. Errores del lote entero → `{ok:false,
 * error}` (el llamador responde 400). Eventos sueltos inválidos se descartan y
 * se cuentan en `dropped`: un evento roto no debe llevarse el resto del lote.
 * Todas las filas salen con las MISMAS claves (PostgREST exige uniformidad en
 * inserciones en bloque).
 */
export function validateBatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'INVALID_BODY' };
  if (typeof body.sid !== 'string' || !SID_RE.test(body.sid)) return { ok: false, error: 'INVALID_SID' };
  if (!Array.isArray(body.events) || body.events.length === 0) return { ok: false, error: 'EMPTY_EVENTS' };
  if (body.events.length > MAX_EVENTS) return { ok: false, error: 'TOO_MANY_EVENTS' };

  const ctx = cleanCtx(body.ctx);
  const rows = [];
  let dropped = 0;
  for (const ev of body.events) {
    const row = cleanEvent(ev);
    if (row) rows.push({ sid: body.sid, ...row, ...ctx });
    else dropped += 1;
  }
  return { ok: true, rows, dropped };
}

/** País/región desde los headers de Vercel. La IP nunca llega hasta aquí. */
export function cleanGeo(country, region) {
  const c = typeof country === 'string' ? country.toUpperCase() : '';
  const r = typeof region === 'string' ? region : '';
  return {
    country: /^[A-Z]{2}$/.test(c) ? c : null,
    region: /^[A-Za-z0-9-]{1,10}$/.test(r) ? r : null,
  };
}

const DEFAULT_HOSTS = ['grafik.mx', 'www.grafik.mx'];

/** `TRACK_ALLOWED_HOSTS` (lista separada por comas) o los dominios de producción. */
export function parseAllowedHosts(raw) {
  const list = String(raw ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : DEFAULT_HOSTS;
}

/** Hostname de la petición desde `Host`, sin puerto. Vacío si falta. */
export function requestHostname(headers = {}) {
  const host = headers.host;
  return host ? String(host).split(':')[0].toLowerCase() : '';
}

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|prerender|preview|monitor|uptime|curl|wget|python-requests|node-fetch|undici|axios|go-http/i;

/** Un navegador real siempre manda User-Agent: su ausencia ya es señal de script. */
export function isBotUserAgent(ua) {
  return !ua || BOT_RE.test(String(ua));
}
