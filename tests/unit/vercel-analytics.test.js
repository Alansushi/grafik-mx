import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
const script = () => readFileSync(new URL('vercel-analytics.js', root), 'utf8');
const html = (path) => readFileSync(new URL(path, root), 'utf8');

function configured(search = '', storage = {}, privacy = {}) {
  const calls = [];
  const window = {
    va(...args) { calls.push(args); },
    localStorage: {
      getItem(key) { return storage[key] ?? null; },
      setItem(key, value) { storage[key] = value; },
      removeItem(key) { delete storage[key]; },
    },
    ...privacy,
  };
  const navigator = privacy.navigator || {};
  runInNewContext(script(), { window, navigator, location: { search }, URL, URLSearchParams });
  return { calls, storage, beforeSend: calls.find(([name]) => name === 'beforeSend')?.[1] };
}

describe('Vercel Analytics', () => {
  it('carga la configuración antes del script en las páginas públicas', () => {
    for (const path of ['index.html', 'estudio/index.html', 'estudio/pedido/index.html',
      'catalogos/index.html', 'catalogos/navidad-2026/index.html',
      'catalogos/agendas-2027/index.html', '404.html']) {
      const page = html(path);
      expect(page.indexOf('src="/vercel-analytics.js"'), path).toBeGreaterThan(-1);
      expect(page.indexOf('src="/vercel-analytics.js"'), path)
        .toBeLessThan(page.indexOf('src="/_vercel/insights/script.js"'));
    }
    expect(html('api/privacy-notice.js')).toContain('src="/vercel-analytics.js"');
    expect(html('api/privacy-notice.js')).toContain('src="/_vercel/insights/script.js"');
    expect(html('api/unsubscribe.js')).not.toContain('src="/_vercel/insights/script.js"');
  });

  it('conserva solo UTM permitidos y elimina tokens y fragmentos', () => {
    const { beforeSend } = configured();
    const event = { type: 'pageview', url: 'https://www.grafik.mx/estudio/pedido/?t=secreto&utm_source=google&utm_campaign=oto%C3%B1o&email=ana%40example.com#token' };
    const clean = beforeSend(event);
    expect(clean.url).toBe('https://www.grafik.mx/estudio/pedido/?utm_source=google&utm_campaign=oto%C3%B1o');
    expect(clean.type).toBe('pageview');
  });

  it('respeta ?notrack, persistencia, reactivación, DNT y GPC', () => {
    const storage = {};
    expect(configured('?notrack', storage).beforeSend({ url: 'https://www.grafik.mx/' })).toBeNull();
    expect(configured('', storage).beforeSend({ url: 'https://www.grafik.mx/' })).toBeNull();
    expect(configured('?notrack=0', storage).beforeSend({ url: 'https://www.grafik.mx/' })).not.toBeNull();
    expect(configured('', {}, { navigator: { doNotTrack: '1' } }).beforeSend({ url: 'https://www.grafik.mx/' })).toBeNull();
    expect(configured('', {}, { navigator: { globalPrivacyControl: true } }).beforeSend({ url: 'https://www.grafik.mx/' })).toBeNull();
  });
});
