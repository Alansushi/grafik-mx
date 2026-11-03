import { requireAdmin } from './auth';
import type { Opportunity, Spend } from './metrics';

export async function salesData() {
  const { supabase } = await requireAdmin();
  const opportunities: Opportunity[] = [];
  const spend: Spend[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('sales_opportunities')
      .select('id,folio,channel,stage,amount_collected,source,campaign,created_at,merged_into,whatsapp_clicked_at,conversation_confirmed_at')
      .order('created_at', { ascending:false }).range(offset,offset+999);
    if (page.error) throw new Error('No se pudieron cargar oportunidades');
    opportunities.push(...page.data as Opportunity[]);
    if (page.data.length < 1000) break;
  }
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('sales_campaign_spend').select('month,source,campaign,amount')
      .order('month', { ascending:false }).range(offset,offset+999);
    if (page.error) throw new Error('No se pudo cargar gasto');
    spend.push(...page.data as Spend[]);
    if (page.data.length < 1000) break;
  }
  return { opportunities, spend };
}
