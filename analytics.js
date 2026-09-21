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
  // Eventos que salen ya, sin esperar la cola de 2 s: tras ellos el usuario salta a
  // WhatsApp y la pestaña puede quedar en segundo plano antes de que venza el
  // temporizador. `studio_submit` es la conversión del configurador.
  const IMMEDIATE = { cta_click: true, studio_submit: true };
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
    if (IMMEDIATE[name] || queue.length >= MAX_BATCH) flush();
    else if (!timer) timer = setTimeout(flush, 2000);
  }

  // ── Interacciones delegadas ───────────────────────────────────────────────
  // Todo cuelga de listeners en `document` (fase de captura), así que sobrevive a
  // los re-renders de React y el HTML sólo declara QUÉ es cada cosa con atributos.
  const recent = {};

  // Un doble clic accidental no son dos intenciones.
  function repeated(key) {
    const now = Date.now();
    if (recent[key] && now - recent[key] < 800) return true;
    recent[key] = now;
    return false;
  }

  function ctaKind(href) {
    if (/^tel:/i.test(href)) return 'tel';
    if (/^https:\/\/wa\.me\//i.test(href)) return 'whatsapp';
    return null;
  }

  function trackCta(el) {
    const id = el.getAttribute('data-cta');
    const kind = ctaKind(el.getAttribute('href') || '');
    if (!kind) {
      if (debug) console.warn('[grafik:analytics] data-cta sin href wa.me/tel:', id);
      return;
    }
    if (repeated('cta:' + id)) return;
    track('cta_click', { cta_id: id, kind: kind, work_cat: el.getAttribute('data-cta-work') || undefined });
  }

  function trackNav(a) {
    const target = (a.getAttribute('href') || '').slice(1);
    if (!/^[a-z0-9-]{1,30}$/.test(target) || repeated('nav:' + target)) return;
    // Dentro de <header>/<nav> es la barra; fuera, un botón de la página
    // ("Ver servicios", "Ver preguntas frecuentes").
    track('nav_click', { target: target, from: a.closest('header, nav') ? 'nav' : 'page' });
  }

  // Primer foco o clic dentro del formulario. No lee NADA de lo escrito.
  let formStarted = false;
  function trackFormStart(el) {
    if (formStarted || !el.closest('[data-track-form]')) return;
    formStarted = true;
    track('form_start');
  }

  function onClick(e) {
    // 'auxclick' cubre el clic con la rueda (abrir WhatsApp en pestaña nueva),
    // que 'click' no dispara. Sólo los CTA se miden así.
    if (e.type === 'auxclick' && e.button !== 1) return;
    const t = e.target;
    if (!t || !t.closest) return;

    const cta = t.closest('[data-cta]');
    if (cta) { trackCta(cta); return; }

    // data-event="nombre" [data-where="dónde"]: un evento con una sola propiedad.
    const custom = t.closest('[data-event]');
    if (custom) {
      const name = custom.getAttribute('data-event');
      const where = custom.getAttribute('data-where') || undefined;
      if (!repeated('ev:' + name + ':' + where)) track(name, { where: where });
      return;
    }
    if (e.type !== 'click') return;

    const work = t.closest('[data-work]');
    if (work) {
      const slug = work.getAttribute('data-work');
      if (!repeated('work:' + slug)) {
        track('work_open', { slug: slug, cat: work.getAttribute('data-work-cat') || undefined });
      }
    }
    const anchor = t.closest('a[href^="#"]');
    if (anchor) trackNav(anchor);
    trackFormStart(t);
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);
  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.closest) trackFormStart(e.target);
  }, true);

  // FAQ: 'toggle' no burbujea, pero sí baja por la fase de captura. Una vez por
  // pregunta y carga: abrir y cerrar la misma no es más interés.
  const seenFaq = {};
  // Máximo 60 (lo que acepta el servidor), cortando en límite de palabra: un slug
  // como "…lonas-e-impre" es válido pero ilegible en un reporte.
  function faqSlug(text) {
    let slug = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug.length > 60) {
      slug = slug.slice(0, 60);
      const corte = slug.lastIndexOf('-');
      if (corte > 30) slug = slug.slice(0, corte);
    }
    return slug.replace(/-+$/g, '');
  }
  document.addEventListener('toggle', function (e) {
    const d = e.target;
    if (!d || d.tagName !== 'DETAILS' || !d.open || !d.hasAttribute('data-faq')) return;
    const summary = d.querySelector('summary');
    const q = faqSlug(summary && summary.textContent);
    if (!q || seenFaq[q]) return;
    seenFaq[q] = true;
    track('faq_open', { q: q });
  }, true);

  // ── Secciones vistas ──────────────────────────────────────────────────────
  // Una sección cuenta cuando lleva 800 ms con una parte SUSTANCIAL a la vista:
  //  - Altura mínima visible, no un porcentaje: una sección más alta que la
  //    pantalla jamás llegaría a "40 % visible". Y IntersectionObserver da por
  //    "intersectando" una sección que sólo TOCA el borde (0 px), lo que al saltar
  //    a un ancla con el menú fijo contaría la sección anterior, que asoma ~100 px
  //    bajo la barra sin que nadie la haya visto.
  //  - Sin rootMargin: se probó un margen inferior del -25 % y dejaba fuera al
  //    footer, que es corto y no puede subir al borde superior porque la página
  //    termina; en un móvil no se habría contado jamás.
  //  - 800 ms: para no contar la que sólo se cruzó de paso (p. ej. al saltar a
  //    #contacto con scroll suave desde el menú).
  const DWELL_MS = 800;
  const MIN_VISIBLE_PX = 160;
  function watchSections() {
    if (!('IntersectionObserver' in window) || !('MutationObserver' in window)) return;
    if (!canSend && !debug) return;
    const SELECTOR = 'section[id], [data-section]';
    const keyOf = (el) => el.getAttribute('data-section') || el.id;
    const timers = {};
    const done = {};
    const watched = new WeakSet();

    // Muchos umbrales: con uno solo el callback no se repite mientras la
    // sección va entrando, y la altura mínima nunca se reevaluaría.
    const thresholds = [];
    for (let i = 0; i <= 20; i++) thresholds.push(i / 20);

    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        const key = keyOf(en.target);
        const enough = en.isIntersecting &&
          en.intersectionRect.height >= Math.min(MIN_VISIBLE_PX, en.boundingClientRect.height / 2);
        if (enough) {
          if (timers[key]) return;
          timers[key] = setTimeout(function () {
            done[key] = true;
            io.unobserve(en.target);
            track('section_view', { section: key });
          }, DWELL_MS);
        } else if (timers[key]) {
          clearTimeout(timers[key]);
          timers[key] = null;
        }
      });
    }, { threshold: thresholds });

    function watch(el) {
      const key = keyOf(el);
      // El hero equivale a page_view; el .ssr-fallback es el HTML plano para
      // crawlers, que React reemplaza al montar.
      if (!key || key === 'top' || done[key] || watched.has(el) || el.closest('.ssr-fallback')) return;
      watched.add(el);
      io.observe(el);
    }
    function scan(root) {
      if (root.matches && root.matches(SELECTOR)) watch(root);
      if (root.querySelectorAll) root.querySelectorAll(SELECTOR).forEach(watch);
    }

    // analytics.js corre ANTES de que React monte (Babel compila en el
    // navegador tras DOMContentLoaded), así que las secciones aparecen después.
    const mo = new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 20000);
    scan(document.documentElement);
  }

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });

  window.grafikTrack = track;
  track('page_view');
  watchSections();
})();
