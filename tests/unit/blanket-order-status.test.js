import { afterEach, expect, it, vi } from 'vitest';
import handler from '../../api/order-status.js';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('consulta un pedido de frazada con vistas y precios base separados de la cotización final', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    if (table === 'rpc_rate_limit_hit') return Response.json(true);
    if (table === 'orders') return Response.json([{ id: 'order-id', short_code: 'GK-123456',
      status: 'quoted', currency: 'MXN', total_cents: null, priced_with_placeholder: false,
      created_at: '2026-11-22T12:00:00Z', customer_id: 'customer-id' }]);
    if (table === 'order_items') return Response.json(['P', 'M'].map((size, index) => ({
      item_index: index, garment_type_id: 'g', garment_variant_id: 'v', technique_id: null,
      size_breakdown: { [size]: index + 1 }, qty: index + 1,
      logo_object_path: 'original.jpg', preview_object_path: `preview-${size}.png`,
      unit_price_cents: null, subtotal_cents: null,
      pricing_snapshot: { reference_unit_price_cents: size === 'P' ? 41000 : 63000,
        reference_size: size, reference_only: true },
    })));
    if (table === 'customers') return Response.json([{ name: 'Ana Ruiz' }]);
    if (table === 'garment_types') return Response.json([{ id: 'g', name: 'Frazada personalizada',
      slug: 'frazada', render_type: 'blanket' }]);
    if (table === 'garment_variants') return Response.json([{ id: 'v', color_hex: '#D6D5D1',
      color_name: 'Felpa gris claro' }]);
    if (u.pathname.includes('/storage/v1/object/sign/')) return Response.json({ signedURL: '/signed/example' });
    throw new Error(`Unexpected ${url}`);
  }));
  const req = { method: 'GET', url: '/api/order-status',
    query: { t: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } };
  const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res);
  expect(res.code).toBe(200);
  expect(res.body.total_cents).toBeNull();
  expect(res.body.items.map((item) => [item.size_breakdown, item.reference_unit_price_cents,
    item.preview_url])).toEqual([
    [{ P: 1 }, 41000, 'https://supabase.test/storage/v1/signed/example'],
    [{ M: 2 }, 63000, 'https://supabase.test/storage/v1/signed/example'],
  ]);
  expect(res.body.items[0]).not.toHaveProperty('pricing_snapshot');
});
