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
