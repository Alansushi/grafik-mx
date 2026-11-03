export type Opportunity = { id: string; folio: string; channel: string; stage: string;
  amount_collected: number; source: string | null; campaign: string | null;
  created_at: string; merged_into: string | null; whatsapp_clicked_at: string | null;
  conversation_confirmed_at: string | null };
export type Spend = { month: string; source: string; campaign: string; amount: number };

export function summary(rows: Opportunity[], spend: Spend[]) {
  const active = rows.filter(x => !x.merged_into);
  const won = active.filter(x => x.stage === 'ganada');
  const totalSpend = spend.reduce((n,x) => n + Number(x.amount), 0);
  const revenue = won.reduce((n,x) => n + Number(x.amount_collected), 0);
  const count = (f: (x: Opportunity) => boolean) => active.filter(f).length;
  const contacted = count(x => ['contactada','cotizada','ganada','perdida'].includes(x.stage));
  const quoted = count(x => ['cotizada','ganada'].includes(x.stage));
  return {
    opportunities: active.length, clicks: count(x => Boolean(x.whatsapp_clicked_at)),
    conversations: count(x => Boolean(x.conversation_confirmed_at)), contacted, quoted,
    won: won.length, lost: count(x => x.stage === 'perdida'), revenue, spend: totalSpend,
    contactRate: active.length ? contacted / active.length : null,
    winRate: active.length ? won.length / active.length : null,
    costPerOpportunity: active.length && totalSpend ? totalSpend / active.length : null,
    costPerSale: won.length && totalSpend ? totalSpend / won.length : null,
    roas: totalSpend ? revenue / totalSpend : null,
  };
}

export function campaignRows(rows: Opportunity[], spend: Spend[]) {
  const active = rows.filter(x => !x.merged_into);
  const keys = new Map<string, {month:string; source:string; campaign:string; spend:number; opportunities:number; sales:number; revenue:number}>();
  const keyOf = (month:string,source:string,campaign:string) => `${month}\u0000${source}\u0000${campaign}`;
  for (const x of spend) {
    const month = x.month.slice(0,7);
    const key = keyOf(month,x.source,x.campaign);
    const row = keys.get(key) || { month, source:x.source, campaign:x.campaign, spend:0, opportunities:0, sales:0, revenue:0 };
    row.spend += Number(x.amount); keys.set(key,row);
  }
  for (const x of active) {
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit'}).formatToParts(new Date(x.created_at));
    const month = `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}`;
    const source = x.source || '(desconocido)';
    const campaign = x.campaign || '(sin campaña)';
    const key = keyOf(month,source,campaign);
    const row = keys.get(key) || { month, source, campaign, spend:0, opportunities:0, sales:0, revenue:0 };
    row.opportunities++;
    if (x.stage === 'ganada') { row.sales++; row.revenue += Number(x.amount_collected); }
    keys.set(key,row);
  }
  return [...keys.values()].sort((a,b) => b.month.localeCompare(a.month) || a.source.localeCompare(b.source));
}

export const money = (n:number) => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(n);
export const pct = (n:number|null) => n === null ? '—' : `${(n*100).toFixed(1)} %`;
