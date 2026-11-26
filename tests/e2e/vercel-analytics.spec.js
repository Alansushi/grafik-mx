import { test, expect } from '@playwright/test';
import privacyNotice from '../../api/privacy-notice.js';

test('las páginas públicas envían vista sin tokens; notrack persiste y se revierte', async ({ page }) => {
  const views = [];
  await page.route('**/_vercel/insights/script.js', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `const beforeSend = (window.vaq || []).find(([name]) => name === 'beforeSend')?.[1];
      const event = beforeSend?.({ type: 'pageview', url: location.href });
      if (event) fetch('/_vercel/insights/view', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });`,
  }));
  await page.route('**/_vercel/insights/view', (route) => {
    views.push(route.request().postDataJSON());
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/privacy-notice', (route) => {
    const old = { ...process.env };
    Object.assign(process.env, { QUOTE_CAPTURE_ENABLED: '1', PRIVACY_CONTROLLER: 'GRAFIK',
      PRIVACY_ADDRESS: 'CDMX', PRIVACY_EMAIL: 'info@grafik.mx' });
    const res = { body: '', status() { return this; }, setHeader() { return this; },
      send(body) { this.body = body; return this; } };
    try { privacyNotice({ method: 'GET' }, res); }
    finally { process.env = old; }
    return route.fulfill({ status: 200, contentType: 'text/html', body: res.body });
  });

  const paths = ['/', '/estudio/', '/estudio/pedido/?t=secreto&utm_source=google#fragmento',
    '/catalogos/', '/catalogos/navidad-2026/', '/catalogos/agendas-2027/',
    '/api/privacy-notice', '/404.html'];
  for (const path of paths) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => views.length, { timeout: 5000 }).toBe(paths.indexOf(path) + 1);
  }
  expect(views[2].url).toMatch(/\/estudio\/pedido\/\?utm_source=google$/);
  expect(JSON.stringify(views)).not.toContain('secreto');
  expect(JSON.stringify(views)).not.toContain('fragmento');

  await page.goto('/?notrack', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  expect(views).toHaveLength(paths.length);
  await page.goto('/catalogos/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  expect(views).toHaveLength(paths.length);
  await page.goto('/?notrack=0', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => views.length).toBe(paths.length + 1);
  expect(views.at(-1).url).not.toContain('notrack');
});
