import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');

for (const [slug, count] of [['navidad-2026', 56], ['agendas-2027', 9]]) {
  describe(slug, () => {
    it('exposes crawlable product and page links with a canonical reader', () => {
      const dir = join(root, 'catalogos', slug);
      const html = readFileSync(join(dir, 'index.html'), 'utf8');
      expect(html).toContain(`<link rel="canonical" href="https://www.grafik.mx/catalogos/${slug}/">`);
      expect(html).toContain('href="?p=26&amp;sku=A2786#pagina-26"'.replace('26&amp;sku=A2786#pagina-26',
        slug === 'navidad-2026' ? '26&amp;sku=A2786#pagina-26' : '2&amp;sku=ASLE2027#pagina-2'));
      expect(html).toContain('href="catalogo.pdf"');
      expect(html).not.toContain('p=56#pagina-56');
      expect(html).toContain(slug === 'navidad-2026' ? 'href="?p=4#pagina-4">Bebidas' : 'href="?p=1#pagina-1">Agendas semanales');
    });
    it('publishes every approved original sheet with real images and a PDF', () => {
      const dir = join(root, 'catalogos', slug);
      const data = JSON.parse(readFileSync(join(dir, 'pages.json'), 'utf8'));
      expect(data.pages).toHaveLength(count);
      expect(data.pages.map((page) => page.number)).toEqual(
        slug === 'navidad-2026' ? [...Array(55)].map((_, i) => i + 1).concat(57) : [...Array(9)].map((_, i) => i + 1),
      );
      for (const page of data.pages) {
        expect(existsSync(join(dir, page.preview))).toBe(true);
        expect(existsSync(join(dir, page.image))).toBe(true);
      }
      expect(existsSync(join(dir, data.pdf))).toBe(true);
    });
    it('indexes verified SKU references on the original page', () => {
      const data = JSON.parse(readFileSync(join(root, 'catalogos', slug, 'pages.json'), 'utf8'));
      const skuPage = new Map(data.pages.flatMap((page) => page.products.map((product) => [product.sku, page.number])));
      expect(skuPage.get(slug === 'navidad-2026' ? 'A3304' : 'ASLE2027')).toBe(slug === 'navidad-2026' ? 4 : 2);
      expect(skuPage.has('A2941')).toBe(false);
      expect(skuPage.has('A3197')).toBe(false);
    });
  });
}
