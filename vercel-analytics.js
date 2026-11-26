// Configuración compartida de Web Analytics. Debe ejecutarse antes de script.js.
(function () {
  'use strict';
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

  const params = new URLSearchParams(location.search);
  try {
    const notrack = params.get('notrack');
    if (notrack === '0') window.localStorage.removeItem('grafik_notrack');
    else if (notrack !== null) window.localStorage.setItem('grafik_notrack', '1');
  } catch { /* El almacenamiento puede estar deshabilitado. */ }

  const allowed = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
  window.va('beforeSend', (event) => {
    try {
      if (navigator.doNotTrack === '1' || window.doNotTrack === '1' ||
          navigator.globalPrivacyControl === true ||
          window.localStorage.getItem('grafik_notrack') === '1' ||
          (params.has('notrack') && params.get('notrack') !== '0')) return null;
    } catch { /* Se aplica DNT y la URL depurada aunque localStorage falle. */ }

    try {
      const url = new URL(event.url);
      for (const key of [...url.searchParams.keys()]) {
        if (!allowed.has(key)) url.searchParams.delete(key);
      }
      url.hash = '';
      return { ...event, url: url.toString() };
    } catch { return null; }
  });
})();
