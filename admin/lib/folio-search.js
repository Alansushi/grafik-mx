/** @template {{folio:string}} T
 * @param {T[]} opportunities
 * @param {unknown} raw
 * @returns {T[]}
 */
export function searchByFolio(opportunities, raw) {
  const query = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return query ? opportunities.filter((item) => item.folio.toUpperCase().includes(query)) : opportunities;
}
