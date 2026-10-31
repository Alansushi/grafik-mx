import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import handler from '../../api/submit-quote.js';

const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const garmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const variantId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const techniqueId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function submit(garment, qty) {
  vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    calls.push({ table, method: options.method ?? 'GET' });
    if (table === 'rpc_rate_limit_hit') return Response.json(true);
    if (table === 'garment_types') return Response.json([{ id: garmentId, is_active: true, ...garment }]);
    if (table === 'garment_variants') return Response.json([{ id: variantId, garment_type_id: garmentId }]);
    if (table === 'print_techniques') return Response.json([{ id: techniqueId, is_active: true }]);
    if (table === 'customers') return Response.json([{ id: 'customer-id' }]);
    if (table === 'orders') return Response.json([{ id: 'order-id', short_code: 'GK-123456', public_token: 'token' }]);
    if (table === 'order_items') return Response.json([{ id: 'item-id' }]);
    throw new Error(`Unexpected request: ${url}`);
  }));
  const size = garment.allowed_sizes[0];
  const body = JSON.stringify({
    draftId, customer: { name: 'Ana Ruiz', email: 'ana@example.mx', phone: '5512345678' },
    items: [{ garment_type_id: garmentId, garment_variant_id: variantId,
      technique_id: garment.render_type === 'bracelet' ? null : techniqueId,
      size_breakdown: { [size]: qty },
      logo_path: `2026/10/${draftId}/imagen.png`,
      preview_path: `2026/10/${draftId}/vista.png`,
      logo_transform: { x: 1 },
    }],
  });
  const req = Readable.from([body]);
  req.method = 'POST';
  req.headers = {};
  const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res);
  return { res, calls };
}

describe('POST /api/submit-quote: mínimo del catálogo', () => {
  it('rechaza 99 pulseras antes de crear el pedido y acepta 100 y 101', async () => {
    const bracelet = { render_type: 'bracelet', allowed_sizes: ['U'], min_qty: 100 };
    const below = await submit(bracelet, 99);
    expect(below.res.code).toBe(400);
    expect(below.res.body).toMatchObject({ error: 'INVALID_BREAKDOWN', details: [{ code: 'BELOW_MIN', min: 100, got: 99 }] });
    expect(below.calls.some((call) => call.table === 'orders')).toBe(false);
    for (const qty of [100, 101]) {
      const accepted = await submit(bracelet, qty);
      expect(accepted.res.code, `Pulsera ${qty}`).toBe(201);
      expect(accepted.calls.some((call) => call.table === 'order_items')).toBe(true);
    }
  });

  it('mantiene pedidos de una playera y una gorra aunque el catálogo diga 12', async () => {
    for (const allowed_sizes of [['S'], ['U']]) {
      const result = await submit({ render_type: 'garment', allowed_sizes, min_qty: 12 }, 1);
      expect(result.res.code).toBe(201);
    }
  });
});
