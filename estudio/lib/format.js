// estudio/lib/format.js
//
// NOTA de alcance (Incremento 1): el spec (§1) enumera este módulo con
// formatCentsMXN, stableStringify, slugify y truncate. El propio encargo de
// este incremento marca sólo formatCentsMXN como obligatorio y permite
// diferir el resto al incremento 4 (donde vive el contrato de pruebas de
// stableStringify, spec §2.7). Por TDD estricto no se escribe código sin test
// que lo respalde, así que stableStringify/slugify/truncate se implementan
// cuando lleguen sus casos de prueba.

/**
 * Formatea centavos enteros como pesos mexicanos: '$1,234.00'.
 * El signo negativo va antes del símbolo de moneda: '-$5.00', no '$-5.00'.
 */
export function formatCentsMXN(cents) {
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(cents);
  const pesos = Math.floor(absCents / 100);
  const centavos = absCents % 100;
  const pesosWithThousands = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}$${pesosWithThousands}.${String(centavos).padStart(2, '0')}`;
}

// --- Incremento 4 (estudio/lib/order-draft.js, spec §2.7) ---------------
//
// stableStringify vive aquí (spec §1 lo ubica en format.js) y order-draft.js
// lo re-exporta: es una utilidad de serialización general, no algo propio
// del dominio de pedidos, así que no tiene sentido que "viva" ahí.

/**
 * Serializa un valor de forma determinista para poder comparar o hashear
 * dos estructuras "equivalentes" aunque sus claves se hayan escrito en
 * distinto orden (p.ej. dos borradores de pedido idénticos armados por
 * caminos de código distintos). Las claves de los objetos se ordenan
 * alfabéticamente; los arrays SÍ preservan su orden porque en un array el
 * orden es información (el orden de las tallas en un desglose, por
 * ejemplo), no un accidente de construcción. Las claves con valor
 * `undefined` se omiten — JSON.stringify ya las omite en objetos, pero acá
 * lo hacemos explícito para no depender de ese detalle de JSON.stringify.
 */
export function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      sorted[key] = sortKeysDeep(value[key]);
    }
    return sorted;
  }
  return value;
}
