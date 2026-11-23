(() => {
  'use strict';
  const slug = document.body.dataset.catalog;
  const track = (name, props = {}) => window.grafikTrack?.(name, props);
  const cartKey = 'grafik_catalog_cart_v1';
  const draftKey = 'grafik_catalog_draft_v1';
  const getStored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const setStored = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  let cart = Array.isArray(getStored(cartKey, [])) ? getStored(cartKey, []) : [];
  let draft = getStored(draftKey, null);
  if (!draft || typeof draft.key !== 'string') draft = { key: crypto.randomUUID(), startedEmail: null };
  const count = () => cart.reduce((n, item) => n + Number(item.quantity || 0), 0);
  const updateCount = () => { const el = document.getElementById('cart-count'); if (el) el.textContent = String(count()); };
  const saveCart = () => { setStored(cartKey, cart); updateCount(); };
  const saveDraft = () => setStored(draftKey, draft);
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  updateCount();
  if (!slug) return;

  const stage = document.getElementById('reader-stage');
  const image = document.getElementById('reader-image');
  const loading = document.getElementById('reader-loading');
  const label = document.getElementById('reader-page-label');
  const select = document.getElementById('page-select');
  const productsEl = document.getElementById('reader-products');
  const search = document.getElementById('sku-search');
  const results = document.getElementById('search-results');
  const dialog = document.getElementById('quote-dialog');
  const form = document.getElementById('quote-form');
  const status = document.getElementById('quote-status');
  const savedActions = document.getElementById('saved-actions');
  const saveButton = document.getElementById('save-quote');
  const isMobile = () => window.matchMedia('(max-width:700px)').matches;
  let pages = [];
  let index = 0;
  let side = 'left';
  let imageToken = 0;
  let seenPages = new Set();
  let saved = Boolean(draft.completed);

  const current = () => pages[index];
  const pageUrl = (page, sku) => {
    const url = new URL(location.href);
    url.searchParams.set('p', String(page.number));
    if (sku) url.searchParams.set('sku', sku); else url.searchParams.delete('sku');
    if (page.wide && isMobile()) url.searchParams.set('side', side); else url.searchParams.delete('side');
    return url;
  };
  const syncUrl = (sku) => history.replaceState(null, '', pageUrl(current(), sku));

  function renderProducts(page, highlightSku) {
    productsEl.innerHTML = page.products.length ? `<h2>Referencias de esta página</h2><ul>${page.products.map((item) =>
      `<li class="reader-product${highlightSku === item.sku ? ' is-highlighted' : ''}"><span><strong>${escape(item.name)}</strong><small>SKU ${escape(item.sku)} · Página ${page.number}</small></span><button type="button" data-add-sku="${escape(item.sku)}" aria-label="Añadir ${escape(item.name)}">Añadir a mi lista</button></li>`).join('')}</ul>` : '<p>Esta hoja no tiene artículos para añadir. Sigue leyendo o usa el índice.</p>';
    productsEl.querySelectorAll('[data-add-sku]').forEach((button) => button.addEventListener('click', () => {
      const product = page.products.find((item) => item.sku === button.dataset.addSku);
      if (!product) return;
      if (saved) newDraft();
      const key = [slug, page.number, product.sku].join(':');
      const existing = cart.find((item) => item.key === key);
      if (existing) existing.quantity += 1;
      else cart.push({ key, catalog: slug, page: page.number, sku: product.sku, name: product.name, quantity: 1 });
      saveCart();
      track('catalog_item', { catalog: slug, page: page.number, sku: product.sku, action: 'add' });
      button.textContent = 'Añadido ✓';
      setTimeout(() => { button.textContent = 'Añadir a mi lista'; }, 1200);
    }));
  }

  function renderPage({ sku = null, updateUrl = true } = {}) {
    const page = current();
    if (!page) return;
    const wideHalf = page.wide && isMobile();
    stage.classList.toggle('is-half', wideHalf);
    stage.dataset.side = wideHalf ? side : 'full';
    select.value = String(page.number);
    label.textContent = `Página ${page.number} · ${page.category}`;
    image.alt = `${page.wide ? 'Pliego' : 'Página'} ${page.number} del catálogo ${slug.replace('-', ' ')}`;
    image.src = page.preview;
    image.width = page.wide ? 1800 : 1100;
    image.height = page.wide ? 1165 : 1434;
    loading.textContent = 'Cargando hoja en alta resolución…';
    const token = ++imageToken;
    const full = new Image();
    full.onload = () => { if (token === imageToken) { image.src = full.src; loading.textContent = ''; } };
    full.onerror = () => { if (token === imageToken) loading.textContent = 'Se muestra la vista previa. Puedes descargar el PDF.'; };
    full.src = page.image;
    renderProducts(page, sku);
    if (updateUrl) syncUrl(sku);
    if (!seenPages.has(page.number)) {
      seenPages.add(page.number);
      track('catalog_page', { catalog: slug, page: page.number });
    }
    const nextPage = pages[index + 1];
    if (nextPage) { const preload = new Image(); preload.src = nextPage.preview; }
  }

  function move(direction) {
    const page = current();
    if (page?.wide && isMobile()) {
      if (direction > 0 && side === 'left') { side = 'right'; renderPage(); return; }
      if (direction < 0 && side === 'right') { side = 'left'; renderPage(); return; }
    }
    const next = index + direction;
    if (next < 0 || next >= pages.length) return;
    index = next;
    side = direction > 0 ? 'left' : pages[index].wide && isMobile() ? 'right' : 'left';
    renderPage();
  }

  function goTo(number, sku = null) {
    const next = pages.findIndex((page) => page.number === Number(number));
    if (next < 0) return;
    index = next;
    side = 'left';
    renderPage({ sku });
    document.getElementById('lector').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  document.getElementById('page-prev').addEventListener('click', () => move(-1));
  document.getElementById('page-next').addEventListener('click', () => move(1));
  select.addEventListener('change', () => goTo(select.value));
  document.getElementById('copy-page-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pageUrl(current()).toString());
      document.getElementById('copy-page-link').textContent = 'Enlace copiado';
      setTimeout(() => document.getElementById('copy-page-link').textContent = 'Copiar enlace a esta página', 1800);
    } catch { document.getElementById('copy-page-link').textContent = 'Copia la URL del navegador'; }
  });
  document.addEventListener('keydown', (event) => {
    if (dialog.open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'Home') { index = 0; side = 'left'; renderPage(); }
    if (event.key === 'End') { index = pages.length - 1; side = 'left'; renderPage(); }
    if (event.key === '/') { event.preventDefault(); search.focus(); }
  });
  let touchX = null;
  stage.addEventListener('touchstart', (event) => { touchX = event.touches[0]?.clientX ?? null; }, { passive: true });
  stage.addEventListener('touchend', (event) => {
    if (touchX === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
    if (Math.abs(delta) > 55) move(delta < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });
  window.addEventListener('resize', () => { if (pages.length) renderPage({ updateUrl: false }); });
  window.addEventListener('pagehide', () => {
    if (pages.length) track('catalog_depth', { catalog: slug, depth_pct: Math.round(100 * seenPages.size / pages.length) });
  });
  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(location.search).get('p');
    const next = pages.findIndex((page) => page.number === Number(p));
    if (next >= 0) { index = next; side = new URLSearchParams(location.search).get('side') === 'right' ? 'right' : 'left'; renderPage({ updateUrl: false }); }
  });
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = search.value.trim().toUpperCase();
    const found = query.length >= 2 ? pages.flatMap((page) => page.products.filter((item) =>
      item.sku.includes(query)).map((item) => ({ ...item, page: page.number }))) : [];
    results.innerHTML = found.length ? found.slice(0, 30).map((item) =>
      `<a href="?p=${item.page}&amp;sku=${escape(item.sku)}#lector" data-result-page="${item.page}" data-result-sku="${escape(item.sku)}">${escape(item.name)} <strong>${escape(item.sku)}</strong><small>p. ${item.page}</small></a>`).join('') : query.length >= 2 ? '<p>No encontramos ese SKU en este catálogo.</p>' : '';
    results.querySelectorAll('a').forEach((link) => link.addEventListener('click', (event) => {
      event.preventDefault(); goTo(link.dataset.resultPage, link.dataset.resultSku);
    }));
    if (query.length >= 2) searchTimer = setTimeout(() => track('catalog_search', { catalog: slug, found: found.length > 0 }), 500);
  });
  document.querySelectorAll('a[href^="?p="]').forEach((link) => {
    if (link.closest('#search-results')) return;
    link.addEventListener('click', (event) => {
      const url = new URL(link.href);
      const p = url.searchParams.get('p');
      if (!pages.some((page) => page.number === Number(p))) return;
      event.preventDefault(); goTo(p, url.searchParams.get('sku'));
    });
  });
  document.querySelector('[data-catalog-download]')?.addEventListener('click', () => track('catalog_download', { catalog: slug }));

  function newDraft() {
    draft = { key: crypto.randomUUID(), startedEmail: null };
    saveDraft();
    saved = false;
    savedActions.hidden = true;
    status.textContent = '';
  }
  const cleanCart = () => cart.filter((item) => item && typeof item.catalog === 'string' && Number.isInteger(item.page) && typeof item.sku === 'string' && Number.isInteger(item.quantity) && item.quantity > 0).map(({ catalog, page, sku, name, quantity }) => ({ catalog, page, sku, name, quantity }));
  const ctx = (() => { try { return JSON.parse(sessionStorage.getItem('grafik_ctx')) || {}; } catch { return {}; } })();
  const bodyFor = (action) => {
    const fields = new FormData(form);
    return { key: draft.key, channel: 'catalogos', action, items: cleanCart(),
      name: String(fields.get('name') || '').trim(), email: String(fields.get('email') || '').trim(),
      phone: String(fields.get('phone') || '').trim(), buyerType: fields.get('buyerType'),
      intendedUse: String(fields.get('intendedUse') || '').trim(),
      personalization: String(fields.get('personalization') || '').trim(), requiredDate: fields.get('requiredDate'),
      marketingConsent: fields.get('marketingConsent') === 'on',
      analyticsSid: sessionStorage.getItem('grafik_sid'),
      device: innerWidth < 640 ? 'mobile' : innerWidth < 960 ? 'tablet' : 'desktop',
      utmSource: ctx.utm_source, utmMedium: ctx.utm_medium, utmCampaign: ctx.utm_campaign,
      referrerHost: ctx.referrer_host };
  };
  async function postIntent(body) {
    const response = await fetch('/api/quote-intent', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.saved) throw new Error(result.error || 'SAVE_FAILED');
    return result;
  }
  function renderCart() {
    const target = document.getElementById('cart-items');
    target.innerHTML = cart.length ? `<ul>${cart.map((item, i) => `<li><span><strong>${escape(item.name)}</strong><small>${escape(item.sku)} · ${escape(item.catalog)} · p. ${item.page}</small></span><label>Cantidad <input type="number" min="1" max="100000" value="${item.quantity}" data-qty="${i}"></label><button type="button" data-remove="${i}" aria-label="Quitar ${escape(item.name)}">Quitar</button></li>`).join('')}</ul>` : '<p>Tu lista está vacía. Añade un artículo desde el lector.</p>';
    target.querySelectorAll('[data-qty]').forEach((field) => field.addEventListener('change', () => {
      const value = Number(field.value);
      if (!Number.isInteger(value) || value < 1 || value > 100000) { field.value = String(cart[Number(field.dataset.qty)].quantity); return; }
      if (saved) newDraft();
      cart[Number(field.dataset.qty)].quantity = value; saveCart();
    }));
    target.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      if (saved) newDraft();
      const [item] = cart.splice(Number(button.dataset.remove), 1);
      if (item) track('catalog_item', { catalog: item.catalog, page: item.page, sku: item.sku, action: 'remove' });
      saveCart(); renderCart();
    }));
  }
  document.getElementById('open-quote').addEventListener('click', () => {
    renderCart();
    if (saved && draft.folio && draft.waHref) {
      status.textContent = `Solicitud guardada con folio ${draft.folio}. El equipo podrá consultar tu selección.`;
      document.getElementById('catalog-whatsapp').href = draft.waHref;
      savedActions.hidden = false;
    }
    dialog.showModal(); track('catalog_quote', { step: 'start' });
  });
  document.getElementById('close-quote').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  form.elements.email.addEventListener('blur', async () => {
    const email = form.elements.email.value.trim().toLowerCase();
    if (!email || !form.elements.email.checkValidity() || !cart.length || saved || email === draft.startedEmail) return;
    if (draft.startedEmail && draft.startedEmail !== email) {
      const oldKey = draft.key;
      newDraft();
      fetch('/api/quote-intent', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({key:oldKey,action:'cancel'}) }).catch(() => {});
    }
    try { await postIntent(bodyFor('start')); draft.startedEmail = email; saveDraft(); }
    catch { /* El guardado final mostrará el error y ofrecerá reintentar. */ }
  });
  form.addEventListener('input', () => { if (saved) newDraft(); });
  form.addEventListener('change', () => { if (saved) newDraft(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!cart.length) { status.textContent = 'Añade al menos un artículo para continuar.'; return; }
    const body = bodyFor('complete');
    if (!body.email && !body.phone) { status.textContent = 'Indica un correo o WhatsApp para responderte.'; return; }
    status.textContent = 'Guardando solicitud…';
    saveButton.disabled = true;
    try {
      const result = await postIntent(body);
      if (!result.completed || !result.folio) throw new Error('SAVE_FAILED');
      saved = true;
      const summary = body.items.map((item) => `${item.name} (${item.sku}, p. ${item.page}) × ${item.quantity}`).join('\n');
      const message = `Hola GRAFIK, guardé la solicitud ${result.folio}.\n${summary}\nUso: ${body.intendedUse}\nPersonalización: ${body.personalization || 'por definir'}\nFecha requerida: ${body.requiredDate}`;
      const wa = document.getElementById('catalog-whatsapp');
      wa.href = `https://wa.me/525539014600?text=${encodeURIComponent(message)}`;
      draft = { ...draft, completed: true, folio: result.folio, waHref: wa.href };
      saveDraft();
      status.textContent = `Solicitud guardada con folio ${result.folio}. El equipo podrá consultar tu selección.`;
      savedActions.hidden = false;
      track('catalog_quote', { step: 'saved' });
    } catch {
      status.textContent = 'No se pudo guardar la solicitud. Revisa tu conexión y vuelve a intentar.';
      savedActions.hidden = true;
      track('catalog_quote', { step: 'error' });
    } finally { saveButton.disabled = false; }
  });
  document.getElementById('catalog-whatsapp').addEventListener('click', () => track('catalog_whatsapp_click'));
  document.getElementById('new-quote').addEventListener('click', () => {
    cart = []; saveCart(); renderCart(); form.reset(); newDraft();
  });

  fetch(`/catalogos/${slug}/pages.json`).then((response) => {
    if (!response.ok) throw new Error('manifest');
    return response.json();
  }).then((data) => {
    pages = data.pages;
    const requested = Number(new URLSearchParams(location.search).get('p'));
    index = Math.max(0, pages.findIndex((page) => page.number === requested));
    side = new URLSearchParams(location.search).get('side') === 'right' ? 'right' : 'left';
    renderPage({ sku: new URLSearchParams(location.search).get('sku') });
    track('catalog_open', { catalog: slug });
  }).catch(() => { loading.textContent = 'No se pudo cargar el lector. Puedes descargar el PDF o usar el índice de abajo.'; });
})();
