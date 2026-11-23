import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { searchByFolio } from '../lib/folio-search.js';

test('finds short and historical folios without changing their displayed value', () => {
  const opportunities = [
    { folio: 'GQ-ABC1234567' },
    { folio: 'GQ-5555555555554555' },
    { folio: 'GW-0123456789' },
  ];
  assert.deepEqual(searchByFolio(opportunities, 'abc123'), [opportunities[0]]);
  assert.deepEqual(searchByFolio(opportunities, '5555555555554555'), [opportunities[1]]);
  assert.deepEqual(searchByFolio(opportunities, ' gw-0123456789 '), [opportunities[2]]);
  assert.deepEqual(searchByFolio(opportunities, ''), opportunities);
});
