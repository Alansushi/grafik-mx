import { afterEach, expect, it, vi } from 'vitest';
import handler from '../../api/catalog.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('publica medidas y precios base de frazada en el catálogo', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const table = new URL(url).pathname.split('/').pop();
    if (table === 'garment_types') return Response.json([{ id: 'g', slug: 'frazada',
      render_type: 'blanket', allowed_sizes: ['P', 'I', 'M'], sort_order: 4 }]);
    if (table === 'garment_variants') return Response.json([{ id: 'v', garment_type_id: 'g',
      color_hex: '#D6D5D1', color_name: 'Felpa gris claro', sort_order: 1 }]);
    if (table === 'garment_type_views' || table === 'print_techniques') return Response.json([]);
    throw new Error(`Unexpected ${url}`);
  }));
  const req = { method: 'GET' };
  const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res);
  expect(res.code).toBe(200);
  expect(res.body.garments[0].blanket_sizes.map((size) => [size.code, size.priceCents]))
    .toEqual([['P', 41000], ['I', 53000], ['M', 63000]]);
});
