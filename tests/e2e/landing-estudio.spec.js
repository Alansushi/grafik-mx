import { test, expect } from '@playwright/test';

test('La maqueta de la landing muestra los cuatro productos y sus opciones', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const section = page.locator('#estudio');
  const selector = section.getByRole('group', { name: 'Producto', exact: true });
  const preview = section.getByRole('group', { name: 'Vista previa ilustrativa del Estudio GRAFIK' });
  await expect(selector).toBeVisible({ timeout: 15_000 });
  await expect(section.getByRole('link', { name: 'Abrir Estudio' })).toHaveAttribute('href', '/estudio/');
  await expect(selector.getByRole('button')).toHaveCount(4);

  for (const [name, phrase] of [
    ['Playera', 'Prueba colores y técnicas'],
    ['Gorra', 'Visualiza tu logo'],
    ['Pulsera', 'Revisa la tira y la vista cerrada'],
    ['Frazada', 'Ajusta tu imagen por medida'],
  ]) {
    await selector.getByRole('button', { name, exact: true }).click();
    await expect(selector.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(selector.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await expect(preview.getByText(phrase)).toBeVisible();
    await expect(preview.locator(`.cp-stage--${name.toLowerCase()}`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  await selector.getByRole('button', { name: 'Playera' }).click();
  await expect(preview.getByRole('group', { name: 'Color del producto' })).toBeVisible();
  await expect(preview.getByText('DTF')).toBeVisible();
  await expect.poll(() => preview.locator('.cp-tee-img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);

  await selector.getByRole('button', { name: 'Gorra' }).click();
  await expect(preview.getByRole('group', { name: 'Color del producto' })).toBeVisible();
  await expect(preview.getByText('Bordado')).toBeVisible();
  await preview.getByRole('group', { name: 'Técnica ilustrativa' }).getByRole('button', { name: 'Bordado' }).click();
  await expect(preview.getByRole('button', { name: 'Bordado' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => preview.locator('.cp-tee-img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);

  await selector.getByRole('button', { name: 'Pulsera' }).click();
  await expect(preview.getByText('Tira plana')).toBeVisible();
  await expect(preview.getByText('Vista cerrada', { exact: true })).toBeVisible();
  await expect(preview.getByRole('group', { name: 'Color del producto' })).toBeVisible();
  await preview.getByRole('group', { name: 'Color del producto' }).getByRole('button', { name: 'Azul', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Azul', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(preview.locator('.cp-stage--pulsera')).toHaveCSS('--c', '#2557b8');
  await expect(preview.getByText('DTF')).toHaveCount(0);

  await selector.getByRole('button', { name: 'Frazada' }).click();
  await expect(preview.getByRole('group', { name: 'Medida' })).toBeVisible();
  await expect(preview.getByRole('group', { name: 'Color del producto' })).toHaveCount(0);
  await expect(preview.getByText('DTF')).toHaveCount(0);
  for (const [size, slug] of [['Personal', 'personal'], ['Individual', 'individual'], ['Matrimonial', 'matrimonial']]) {
    await preview.getByRole('button', { name: size }).click();
    await expect(preview.getByRole('button', { name: size })).toHaveAttribute('aria-pressed', 'true');
    const image = preview.locator('.cp-blanket-img');
    await expect(image).toHaveAttribute('src', `/assets/estudio/frazada-${slug}-preview.avif`);
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
