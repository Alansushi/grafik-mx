import test from 'node:test';
import assert from 'node:assert/strict';
import { summary, campaignRows } from '../lib/metrics.ts';

const lead = (id, overrides={}) => ({ id, folio:`GW-${id}`, channel:'whatsapp', stage:'nueva', amount_collected:0,
  source:'google', campaign:'noviembre', created_at:'2026-11-02T12:00:00Z', merged_into:null,
  whatsapp_clicked_at:'2026-11-02T12:00:00Z', conversation_confirmed_at:null, ...overrides });

test('one merged lead is excluded and a click is not a confirmed conversation', () => {
  const rows = [lead('one'), lead('two',{stage:'ganada',amount_collected:2500,conversation_confirmed_at:'2026-11-02T13:00:00Z'}),
    lead('three',{merged_into:'two'})];
  const m = summary(rows,[{month:'2026-11-01',source:'google',campaign:'noviembre',amount:500}]);
  assert.equal(m.opportunities,2);
  assert.equal(m.clicks,2);
  assert.equal(m.conversations,1);
  assert.equal(m.revenue,2500);
  assert.equal(m.roas,5);
  assert.equal(m.costPerSale,500);
});

test('campaigns retain unknown attribution and never assign it to a known source', () => {
  const rows = [lead('one',{source:null,campaign:null}),lead('two',{stage:'ganada',amount_collected:1500})];
  const result = campaignRows(rows,[{month:'2026-11-01',source:'google',campaign:'noviembre',amount:300}]);
  assert.equal(result.find(x=>x.source==='google')?.revenue,1500);
  assert.equal(result.find(x=>x.source==='(desconocido)')?.opportunities,1);
});

test('campaign month uses Mexico City business time', () => {
  const [row] = campaignRows([lead('edge',{created_at:'2026-11-01T01:00:00Z'})],[]);
  assert.equal(row.month,'2026-10');
});
