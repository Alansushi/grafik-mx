/* analytics.js — medición de clics en CTA del sitio de Grafik.
 *
 * Sin dependencias ni build. Expone window.grafikTrack(nombre, props). Los
 * enlaces se marcan en el HTML con data-cta="<id>" y un ÚNICO listener
 * delegado detecta el clic: así sobrevive a los re-renders de React y no hay
 * un handler por botón que mantener. Lo que no es un enlace (el formulario)
 * llama a grafikTrack a mano.
 *
 * Contrato con el servidor: api/_lib/events.js (lista blanca de eventos, props
 * y cta_id). Un data-cta que allí no exista se descarta, y por eso
 * tests/unit/events.test.js cruza ambas listas.
 *
 * Privacidad: sin cookies ni ID persistente. El `sid` vive en sessionStorage
 * (por pestaña). Nunca se envía texto que el usuario escribió. Respeta
 * Do Not Track y Global Privacy Control.
 *
 * Medir jamás puede romper el sitio: todo falla en silencio.
 *
 * Utilidades para quien mantiene el sitio:
 *   /?notrack     este navegador deja de medirse (excluye tus propias pruebas)
 *   /?notrack=0   vuelve a medirse
 *   /?debug       imprime los eventos en consola durante la sesión
 */
(function () {
  'use strict';
  if (window.grafikTrack) return;

  const noop = function () {};
  const cfg = window.grafikAnalyticsConfig || {};
  const ENDPOINT = cfg.endpoint || '/api/track';

  const store = (kind) => ({
    get(k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window[kind].setItem(k, v); } catch (e) { /* modo privado */ } },
    del(k) { try { window[kind].removeItem(k); } catch (e) { /* modo privado */ } },
  });
  const local = store('localStorage');
  const session = store('sessionStorage');

  const params = new URLSearchParams(location.search);
  const notrack = params.get('notrack');
  if (notrack === '0') local.del('grafik_notrack');
  else if (notrack !== null) local.set('grafik_notrack', '1');
  if (params.has('debug')) session.set('grafik_debug', '1');
  const debug = session.get('grafik_debug') === '1';

  const optedOut =
    navigator.doNotTrack === '1' || window.doNotTrack === '1' ||
    navigator.globalPrivacyControl === true ||
    local.get('grafik_notrack') === '1';
  if (optedOut) { window.grafikTrack = noop; return; }

  // Fuera de grafik.mx (localhost, previews) no se manda nada, salvo que una
  // prueba lo fuerce. El servidor también filtra por host; esto evita ruido.
  const canSend = cfg.force === true || /(^|\.)grafik\.mx$/.test(location.hostname);

  // ── Sesión ────────────────────────────────────────────────────────────────
  function newSid() {
    const bytes = new Uint8Array(12);
    const c = window.crypto;
    if (c && c.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
  }
  let sid = session.get('grafik_sid');
  if (!sid || !/^[a-z0-9]{8,32}$/.test(sid)) { sid = newSid(); session.set('grafik_sid', sid); }

  // Fuente de la visita: se fija en el primer aterrizaje de la sesión. Las
  // cargas siguientes (p. ej. volver del estudio) traen como referrer el propio
  // sitio y sobrescribirían la fuente real.
  function referrerHost() {
    try {
      const h = new URL(document.referrer).hostname.toLowerCase();
      const strip = (x) => x.replace(/^www\./, '');
      return strip(h) === strip(location.hostname) ? null : h;
    } catch (e) { return null; }
  }
  function readCtx() {
    try {
      const saved = JSON.parse(session.get('grafik_ctx'));
      if (saved && typeof saved === 'object') return saved;
    } catch (e) { /* se recalcula */ }
    const ctx = { referrer_host: referrerHost() };
    ['source', 'medium', 'campaign', 'content', 'term'].forEach((k) => {
      ctx['utm_' + k] = params.get('utm_' + k);
    });
    session.set('grafik_ctx', JSON.stringify(ctx));
    return ctx;
  }
  const baseCtx = readCtx();
  const deviceOf = (w) => (w < 640 ? 'mobile' : w < 960 ? 'tablet' : 'desktop');

  // ── Cola y envío ──────────────────────────────────────────────────────────
  const MAX_BATCH = 20;
  const queue = [];
  let timer = null;

  function send(body) {
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) { /* cae al fetch */ }
    try {
      fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true,
      }).catch(noop);
    } catch (e) { /* nada más que hacer */ }
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    while (queue.length) {
      const w = window.innerWidth;
      const ctx = Object.assign({}, baseCtx, { device: deviceOf(w), vw: w });
      send(JSON.stringify({ sid: sid, ctx: ctx, events: queue.splice(0, MAX_BATCH) }));
    }
  }

  function track(name, props) {
    if (typeof name !== 'string') return;
    const ev = {
      name: name,
      t_ms: Math.round(performance.now()),
      path: location.pathname,
      props: props || {},
    };
    if (debug) console.info('[grafik:analytics]', ev);
    if (!canSend) return;
    queue.push(ev);
    // Un clic en CTA sale ya: en móvil el usuario puede saltar a WhatsApp y la
    // pestaña quedar en segundo plano antes de que venza el temporizador.
    if (name === 'cta_click' || queue.length >= MAX_BATCH) flush();
    else if (!timer) timer = setTimeout(flush, 2000);
  }

  // ── Clics delegados ───────────────────────────────────────────────────────
  const lastClick = {};

  function ctaKind(href) {
    if (/^tel:/i.test(href)) return 'tel';
    if (/^https:\/\/wa\.me\//i.test(href)) return 'whatsapp';
    return null;
  }

  function onClick(e) {
    // 'auxclick' cubre el clic con la rueda (abrir WhatsApp en pestaña nueva),
    // que 'click' no dispara.
    if (e.type === 'auxclick' && e.button !== 1) return;
    const el = e.target && e.target.closest ? e.target.closest('[data-cta]') : null;
    if (!el) return;
    const id = el.getAttribute('data-cta');
    const kind = ctaKind(el.getAttribute('href') || '');
    if (!kind) {
      if (debug) console.warn('[grafik:analytics] data-cta sin href wa.me/tel:', id);
      return;
    }
    // Un doble clic accidental no son dos intenciones.
    const now = Date.now();
    if (lastClick[id] && now - lastClick[id] < 800) return;
    lastClick[id] = now;
    track('cta_click', { cta_id: id, kind: kind, work_cat: el.getAttribute('data-cta-work') || undefined });
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  window.grafikTrack = track;
  track('page_view');
})();
