import { isEmail } from './validation.js';
import { CATALOG_PRODUCTS } from './catalog-products.js';

const short = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validateCatalogIntent(body, { partial = false } = {}) {
  const name = short(body?.name, 120);
  const email = short(body?.email, 254).toLowerCase();
  const phone = short(body?.phone, 30);
  if ((!partial && name.length < 2) || (name && name.length < 2) || (email && !isEmail(email)) ||
      (!email && !/^\+?[\d\s()-]{10,30}$/.test(phone)) ||
      (phone && phone.replace(/\D/g, '').length < 10)) {
    return { ok: false, error: 'INVALID_CONTACT' };
  }
  const items = body?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) return { ok: false, error: 'INVALID_ITEMS' };
  const cleanItems = [];
  for (const item of items) {
    const products = CATALOG_PRODUCTS[item?.catalog]?.[item?.page];
    const canonicalName = products?.[item?.sku];
    if (!canonicalName || !Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 100000) {
      return { ok: false, error: 'INVALID_ITEMS' };
    }
    cleanItems.push({ catalog: item.catalog, page: item.page, sku: item.sku,
      name: canonicalName, quantity: item.quantity });
  }
  const intendedUse = short(body?.intendedUse, 500);
  const personalization = short(body?.personalization, 1000);
  const requiredDate = short(body?.requiredDate, 10);
  const buyerType = ['empresa', 'independiente', 'organizacion', 'particular'].includes(body?.buyerType)
    ? body.buyerType : null;
  if ((!partial || intendedUse) && intendedUse.length < 3 ||
      (!partial || requiredDate) && !validDate(requiredDate) ||
      (!partial && !buyerType)) {
    return { ok: false, error: 'INVALID_DETAILS' };
  }
  return { ok: true, data: {
    name: name || null, email: email || null, phone: phone || null,
    intended_use: intendedUse || null, personalization: personalization || null, required_date: requiredDate || null,
    items: cleanItems, buyer_type: buyerType,
    return_catalog: cleanItems[0].catalog, return_page: cleanItems[0].page,
  } };
}
