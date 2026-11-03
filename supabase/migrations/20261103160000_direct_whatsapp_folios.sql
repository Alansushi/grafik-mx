-- Enlaces sin data-cta (ayuda del Estudio, pedido y página 404) también son
-- oportunidades con folio. El evento sólo indica apertura de WhatsApp.
create or replace function public.sales_from_click() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_folio text;
begin
  v_folio := new.props->>'folio';
  if ((new.event = 'cta_click' and new.props->>'kind' = 'whatsapp')
       or new.event = 'direct_whatsapp_click')
     and v_folio ~ '^GW-[0-9A-F]{32}$' then
    insert into public.sales_opportunities
      (folio, channel, whatsapp_clicked_at, source, medium, campaign, created_at)
    values (v_folio, 'whatsapp', new.ts, coalesce(nullif(new.utm_source, ''), nullif(new.referrer_host, '')),
            new.utm_medium, new.utm_campaign, new.ts)
    on conflict (folio) do nothing;
  elsif new.event = 'studio_whatsapp_click' and new.props->>'short_code' ~ '^GK-[0-9A-F]{6}$' then
    update public.sales_opportunities as opportunity
       set whatsapp_clicked_at = coalesce(opportunity.whatsapp_clicked_at, new.ts)
      from public.orders as studio_order
     where studio_order.short_code = new.props->>'short_code'
       and opportunity.order_id = studio_order.id;
  end if;
  return new;
end $$;
