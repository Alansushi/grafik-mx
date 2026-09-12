import { describe, it, expect } from 'vitest';
import {
  buildOrderDraft,
  validateOrderDraft,
  draftFingerprint,
  stableStringify,
} from '../../estudio/lib/order-draft.js';

function makeItem(overrides = {}) {
  return {
    garment_type_id: 'gt-1',
    garment_variant_id: 'gv-1',
    technique_id: 'tech-1',
    size_breakdown: { M: 12 },
    logo_path: 'blob:local-logo-1',
    preview_path: 'previews/2026/09/abc/item-0.png',
    logo_transform: { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 },
    ...overrides,
  };
}

function makeState(overrides = {}) {
  return {
    customer: { name: 'Ana Ruiz', email: 'ana@example.com', phone: '5512345678' },
    items: [makeItem()],
    ...overrides,
  };
}

function makeValidDraft(overrides = {}) {
  return {
    customer: { name: 'Ana Ruiz', email: 'ana@example.com', phone: '5512345678' },
    items: [makeItem()],
    ...overrides,
  };
}

describe('order-draft.js — stableStringify', () => {
  it('1. mismo objeto con claves permutadas produce el mismo string', () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
  });

  it('2. los arrays preservan su orden (no se ordenan)', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
    expect(stableStringify({ list: ['z', 'a'] })).toBe(stableStringify({ list: ['z', 'a'] }));
    expect(stableStringify({ list: ['z', 'a'] })).not.toBe(stableStringify({ list: ['a', 'z'] }));
  });

  it('3. omite claves con valor undefined', () => {
    expect(stableStringify({ a: undefined })).toBe('{}');
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe('order-draft.js — draftFingerprint', () => {
  it('4. mismo draft con claves permutadas → mismo hash', () => {
    const draftA = { customer: { email: 'a@x.com', name: 'A' }, items: [makeItem()] };
    const draftB = { items: [makeItem()], customer: { name: 'A', email: 'a@x.com' } };
    expect(draftFingerprint(draftA)).toBe(draftFingerprint(draftB));
  });

  it('5. cambiar la cantidad de una talla produce un hash distinto', () => {
    const draftA = makeValidDraft({ items: [makeItem({ size_breakdown: { M: 12 } })] });
    const draftB = makeValidDraft({ items: [makeItem({ size_breakdown: { M: 13 } })] });
    expect(draftFingerprint(draftA)).not.toBe(draftFingerprint(draftB));
  });

  it('6. siempre son 16 caracteres hexadecimales en minúscula', () => {
    const fp = draftFingerprint(makeValidDraft());
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    // Repetir con otro draft para no depender de un solo caso feliz.
    const fp2 = draftFingerprint(makeValidDraft({ items: [makeItem({ size_breakdown: { S: 1 } })] }));
    expect(fp2).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('order-draft.js — validateOrderDraft', () => {
  it('7. falta logo_path en un item → REQUIRED items[0].logo_path', () => {
    const draft = makeValidDraft({ items: [makeItem({ logo_path: undefined })] });
    const result = validateOrderDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: 'REQUIRED', field: 'items[0].logo_path' });
  });

  it('8. falta email → REQUIRED customer.email', () => {
    const draft = makeValidDraft({ customer: { name: 'Ana Ruiz', email: undefined } });
    const result = validateOrderDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: 'REQUIRED', field: 'customer.email' });
  });

  it('9. email con formato inválido → INVALID_EMAIL customer.email', () => {
    const draft = makeValidDraft({ customer: { name: 'Ana Ruiz', email: 'no-es-un-correo' } });
    const result = validateOrderDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({ code: 'INVALID_EMAIL', field: 'customer.email' });
  });

  it('10. draft completo y válido → sin errores', () => {
    expect(validateOrderDraft(makeValidDraft())).toEqual({ valid: true, errors: [] });
  });
});

describe('order-draft.js — buildOrderDraft nunca incluye precios', () => {
  it('11. el draft no lleva total_cents aunque el estado de entrada traiga campos de precio', () => {
    const state = makeState({
      // Campos "de más" que jamás deberían sobrevivir a buildOrderDraft: el
      // precio lo calcula el servidor, así que ni por accidente el cliente
      // puede llegar a expresarlo en el draft que envía.
      total_cents: 999999,
      items: [makeItem({ unit_price_cents: 111100 })],
    });
    const draft = buildOrderDraft(state);
    expect(draft).not.toHaveProperty('total_cents');
    expect(draft.items[0]).not.toHaveProperty('unit_price_cents');
  });
});

// La lista blanca de buildOrderDraft acierta al descartar precios, pero también
// estaba descartando preview_path — y order_items.preview_object_path es NOT
// NULL en el esquema (§5.1). Sin él, /api/checkout (incremento 9) no tendría
// por dónde recibir la ruta del snapshot: el PNG quedaría huérfano en Storage y
// el INSERT del pedido fallaría. Se detecta aquí porque el contrato del §2.7
// sólo nombraba logo_path.
describe('order-draft.js — el draft lleva la ruta del snapshot de preview', () => {
  it('11b. buildOrderDraft conserva preview_path', () => {
    const draft = buildOrderDraft(
      makeState({ items: [makeItem({ preview_path: 'previews/2026/09/abc/x.png' })] }),
    );
    expect(draft.items[0].preview_path).toBe('previews/2026/09/abc/x.png');
  });

  it('11c. falta preview_path → REQUIRED items[0].preview_path', () => {
    const draft = makeValidDraft({ items: [makeItem({ preview_path: undefined })] });
    const { valid, errors } = validateOrderDraft(draft);
    expect(valid).toBe(false);
    expect(errors).toContainEqual({ code: 'REQUIRED', field: 'items[0].preview_path' });
  });
});
