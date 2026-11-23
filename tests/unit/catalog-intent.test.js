import { describe, expect, it } from 'vitest';
import { validateCatalogIntent } from '../../api/_lib/catalog-intent.js';

const base = {
  name: 'Ana Ruiz', phone: '5512345678', buyerType: 'empresa', intendedUse: 'Regalo para clientes',
  personalization: 'Logotipo a un color', requiredDate: '2026-12-10',
  items: [{ catalog: 'navidad-2026', page: 26, sku: 'A2786', name: 'Cutters', quantity: 20 },
    { catalog: 'agendas-2027', page: 2, sku: 'ASLE2027', name: 'Agenda Semanal Luxemburgo Ejecutiva 2027', quantity: 30 }],
};

describe('solicitudes de catálogo', () => {
  it('acepta contacto sólo por WhatsApp y productos de ambos catálogos', () => {
    expect(validateCatalogIntent(base)).toEqual({ ok: true, data: {
      name: 'Ana Ruiz', email: null, phone: '5512345678', intended_use: 'Regalo para clientes',
      personalization: 'Logotipo a un color', required_date: '2026-12-10', buyer_type: 'empresa',
      items: base.items,
      return_catalog: 'navidad-2026', return_page: 26,
    } });
  });
  it('rechaza la página retirada de Navidad', () => {
    expect(validateCatalogIntent({ ...base, items: [{ ...base.items[0], page: 56, sku: 'A2941' }] }).error).toBe('INVALID_ITEMS');
  });
  it('rechaza solicitudes sin un contacto utilizable', () => {
    expect(validateCatalogIntent({ ...base, phone: '', email: '' }).error).toBe('INVALID_CONTACT');
  });
  it('requiere tipo de comprador al guardar, pero no para el inicio', () => {
    expect(validateCatalogIntent({ ...base, buyerType: '' }).error).toBe('INVALID_DETAILS');
    expect(validateCatalogIntent({ ...base, buyerType: '' }, { partial: true }).ok).toBe(true);
  });
  it('rechaza una fecha imposible antes de escribir en la base', () => {
    expect(validateCatalogIntent({ ...base, requiredDate: '2027-02-30' }).error).toBe('INVALID_DETAILS');
  });
  it('rechaza referencias incorrectas aunque el formato del SKU parezca válido', () => {
    expect(validateCatalogIntent({ ...base, items: [{ ...base.items[0], page: 26, sku: 'A3304' }] }).error).toBe('INVALID_ITEMS');
  });
  it('permite guardar un inicio con correo y selección aunque falten los detalles finales', () => {
    const result = validateCatalogIntent({ email: 'ana@example.com', items: [base.items[0]] }, { partial: true });
    expect(result.ok).toBe(true);
    expect(result.data.email).toBe('ana@example.com');
    expect(result.data.items).toEqual([base.items[0]]);
    expect(result.data.required_date).toBeNull();
  });
});
