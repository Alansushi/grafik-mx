// estudio/lib/order-draft.js — construcción y validación del borrador de
// pedido, y su huella (fingerprint) para detectar cambios sin comparar
// objetos campo a campo.
//
// @typedef {{
//   garment_type_id: string, garment_variant_id: string, technique_id: string,
//   size_breakdown: import('./sizes.js').SizeBreakdown,
//   logo_path: string,
//   preview_path: string,
//   logo_transform: {x:number,y:number,scaleX:number,scaleY:number,rotation:number},
// }} OrderDraftItem
// @typedef {{
//   customer: {name:string, email:string, phone?:string},
//   items: OrderDraftItem[],
// }} OrderDraft

import { stableStringify } from './format.js';

export { stableStringify };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Construye el OrderDraft copiando SÓLO los campos que el pedido necesita,
 * uno por uno, desde el estado libre del configurador. Es una lista blanca,
 * no una limpieza: por diseño, ningún campo de precio (unit_price_cents,
 * subtotal_cents, total_cents...) forma parte de esa lista, así que aunque
 * `state` viniera contaminado con un precio inventado en el cliente —a
 * mano, con devtools, como sea— jamás llegaría al draft. El precio real lo
 * calcula el servidor a partir de este draft (pricing.js + catálogo), nunca
 * al revés.
 */
export function buildOrderDraft(state) {
  const customer = state.customer ?? {};
  const draft = {
    customer: {
      name: customer.name ?? '',
      email: customer.email ?? '',
    },
    items: (state.items ?? []).map((item) => ({
      garment_type_id: item.garment_type_id,
      garment_variant_id: item.garment_variant_id,
      technique_id: item.technique_id,
      size_breakdown: item.size_breakdown,
      logo_path: item.logo_path,
      // El snapshot del canvas que aprobó el cliente. Va en la lista blanca
      // porque order_items.preview_object_path es NOT NULL (§5.1): sin él, el
      // PNG quedaría huérfano en Storage y el INSERT del pedido fallaría.
      preview_path: item.preview_path,
      logo_transform: item.logo_transform,
    })),
  };
  if (customer.phone !== undefined) {
    draft.customer.phone = customer.phone;
  }
  return draft;
}

/**
 * Valida el mínimo indispensable para que un draft sea procesable por el
 * servidor: cada item necesita su logo subido (logo_path) y el cliente
 * necesita un correo válido para poder recibir la confirmación. Acumula
 * errores en vez de cortar en el primero, igual que sizes.validateBreakdown.
 */
export function validateOrderDraft(draft) {
  const errors = [];
  const email = draft.customer?.email;

  if (!email) {
    errors.push({ code: 'REQUIRED', field: 'customer.email' });
  } else if (!EMAIL_RE.test(email)) {
    errors.push({ code: 'INVALID_EMAIL', field: 'customer.email' });
  }

  const items = draft.items ?? [];
  items.forEach((item, index) => {
    if (!item.logo_path) {
      errors.push({ code: 'REQUIRED', field: `items[${index}].logo_path` });
    }
    if (!item.preview_path) {
      errors.push({ code: 'REQUIRED', field: `items[${index}].preview_path` });
    }
  });

  return { valid: errors.length === 0, errors };
}

// FNV-1a de 64 bits, implementado con BigInt: síncrono, sin node:crypto, y
// suficientemente barato para correr en el cliente en cada cambio de
// estado. No es criptográfico —no hace falta: su único trabajo es detectar
// si el draft cambió, no proteger nada— así que FNV-1a (rápido, sin
// dependencias) es la herramienta correcta y no un HMAC o SHA-256.
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64BIT = 0xffffffffffffffffn;

function fnv1aHex(str) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64BIT;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Huella determinista del draft: mismo contenido (sin importar el orden de
 * las claves) ⇒ mismo hash. Se usa para detectar si el draft cambió entre
 * el momento en que el cliente pidió una cotización y el momento en que
 * intenta pagarla, sin tener que comparar objetos campo a campo.
 */
export function draftFingerprint(draft) {
  return fnv1aHex(stableStringify(draft));
}
