import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import handler from '../../api/submit-quote.js';

const draftId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const garmentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const variantId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function item(code, qty, path = `2026/11/${draftId}/original.jpg`) {
  return { garment_type_id: garmentId, garment_variant_id: variantId, technique_id: null,
    size_breakdown: { [code]: qty }, logo_path: path,
    preview_path: `2026/11/${draftId}/preview-${code}.png`,
    logo_transform: { x: -30, y: 0, scaleX: 1.5, scaleY: 1.5, rotation: 0 } };
}

async function submit(items) {
  vi.stubEnv('SUPABASE_URL', 'https://supabase.test');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    const table = new URL(url).pathname.split('/').pop();
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ table, method: options.method ?? 'GET', body });
    if (table === 'rpc_rate_limit_hit') return Response.json(true);
    if (table === 'garment_types') return Response.json([{
      id: garmentId, slug: 'frazada', name: 'Frazada personalizada',
      is_active: true, render_type: 'blanket', allowed_sizes: ['P', 'I', 'M'], min_qty: 1, max_qty: 1000,
    }]);
    if (table === 'garment_variants') return Response.json([{ id: variantId, garment_type_id: garmentId }]);
    if (table === 'customers') return Response.json([{ id: 'customer-id' }]);
    if (table === 'orders') return Response.json([{ id: 'order-id', short_code: 'GK-123456', public_token: 'token' }]);
    if (table === 'order_items') return Response.json([{ id: 'item-id' }]);
    throw new Error(`Unexpected request: ${url}`);
  }));
  const req = Readable.from([JSON.stringify({ draftId,
    customer: { name: 'Ana Ruiz', email: 'ana@example.mx', phone: '5512345678' }, items })]);
  req.method = 'POST'; req.headers = {};
  const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(req, res);
  return { res, calls };
}

describe('POST /api/submit-quote: frazadas', () => {
  it('guarda medidas mixtas en un pedido y fija precios base sin cotización final', async () => {
    const { res, calls } = await submit([item('P', 1), item('M', 2)]);
    expect(res.code).toBe(201);
    const rows = calls.find((call) => call.table === 'order_items')?.body;
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.size_breakdown, row.pricing_snapshot?.reference_unit_price_cents]))
      .toEqual([[{ P: 1 }, 41000], [{ M: 2 }, 63000]]);
    expect(rows.every((row) => row.unit_price_cents === null && row.subtotal_cents === null)).toBe(true);
    expect(new Set(rows.map((row) => row.logo_object_path)).size).toBe(1);
  });

  it('acepta una sola pieza de cualquier medida', async () => {
    for (const size of ['P', 'I', 'M']) {
      const { res, calls } = await submit([item(size, 1)]);
      expect(res.code, size).toBe(201);
      expect(calls.find((call) => call.table === 'order_items')?.body[0].qty).toBe(1);
    }
  });

  it.each([
    ['medida desconocida', [item('XL', 1)], 'INVALID_BREAKDOWN'],
    ['cantidad cero', [item('P', 0)], 'INVALID_BREAKDOWN'],
    ['cantidad excesiva', [item('P', 1001)], 'INVALID_BREAKDOWN'],
    ['medida repetida', [item('P', 1), item('P', 2)], 'INVALID_BREAKDOWN'],
    ['originales diferentes', [item('P', 1), item('I', 1, `2026/11/${draftId}/other.jpg`)], 'INVALID_BLANKET_ASSETS'],
    ['previews repetidos', [item('P', 1), { ...item('I', 1), preview_path: item('P', 1).preview_path }], 'INVALID_BLANKET_ASSETS'],
  ])('rechaza %s antes de crear el pedido', async (_name, lines, expectedError) => {
    const { res, calls } = await submit(lines);
    expect(res.code).toBe(400);
    expect(res.body.error).toBe(expectedError);
    expect(calls.some((call) => call.table === 'orders')).toBe(false);
  });
});
