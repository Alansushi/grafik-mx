-- Keep historical folios stable and store the identifier chosen for every intent.
alter table public.quote_intents add column folio text;
update public.quote_intents
   set folio = 'GQ-' || upper(substr(replace(client_key::text, '-', ''), 1, 16));
-- Older deployed Functions omit folio until Vercel completes its Git deployment.
create function public.quote_intent_default_folio() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.folio is null then
    new.folio := 'GQ-' || upper(substr(replace(new.client_key::text, '-', ''), 1, 16));
  end if;
  return new;
end $$;
create trigger quote_intent_folio_default before insert on public.quote_intents
for each row execute function public.quote_intent_default_folio();
alter table public.quote_intents alter column folio set not null;
alter table public.quote_intents add constraint quote_intents_folio_key unique (folio);
alter table public.quote_intents add constraint quote_intents_folio_format
  check (folio ~ '^GQ-([0-9A-F]{10}|[0-9A-F]{16,32})$');

alter table public.sales_opportunities drop constraint sales_opportunities_folio_check;
alter table public.sales_opportunities add constraint sales_opportunities_folio_check
  check (folio ~ '^(GQ|GW)-([0-9A-F]{10}|[0-9A-F]{16,32})$');
alter table public.sales_opportunities drop constraint sales_opportunities_channel_check;
alter table public.sales_opportunities add constraint sales_opportunities_channel_check
  check (channel in ('contacto','estudio','whatsapp','catalogos','catalogos_ayuda'));

create or replace function public.sales_from_intent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sales_opportunities (folio, quote_intent_id, order_id, channel, source, medium, campaign, whatsapp_clicked_at)
  values (new.folio, new.id, new.order_id,
    new.channel, coalesce(nullif(new.utm_source, ''), nullif(new.referrer_host, '')), new.utm_medium, new.utm_campaign,
    case when new.channel = 'contacto' and new.status = 'completed' then new.completed_at end)
  on conflict (quote_intent_id) do update set
    order_id = coalesce(excluded.order_id, public.sales_opportunities.order_id),
    whatsapp_clicked_at = coalesce(public.sales_opportunities.whatsapp_clicked_at, excluded.whatsapp_clicked_at),
    source = coalesce(public.sales_opportunities.source, excluded.source),
    medium = coalesce(public.sales_opportunities.medium, excluded.medium),
    campaign = coalesce(public.sales_opportunities.campaign, excluded.campaign);
  return new;
end $$;

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
  elsif new.event = 'catalog_help_click' and v_folio ~ '^GW-[0-9A-F]{10}$' then
    insert into public.sales_opportunities
      (folio, channel, whatsapp_clicked_at, source, medium, campaign, created_at)
    values (v_folio, 'catalogos_ayuda', new.ts, coalesce(nullif(new.utm_source, ''), nullif(new.referrer_host, '')),
            new.utm_medium, new.utm_campaign, new.ts)
    on conflict (folio) do nothing;
  elsif new.event = 'studio_whatsapp_click' and new.props->>'short_code' ~ '^GK-[0-9A-F]{6}$' then
    update public.sales_opportunities as opportunity
       set whatsapp_clicked_at = coalesce(opportunity.whatsapp_clicked_at, new.ts)
      from public.orders as studio_order
     where studio_order.short_code = new.props->>'short_code'
       and opportunity.order_id = studio_order.id;
  elsif new.event = 'catalog_whatsapp_click' then
    update public.sales_opportunities as opportunity
       set whatsapp_clicked_at = coalesce(opportunity.whatsapp_clicked_at, new.ts)
     where opportunity.quote_intent_id = (
       select intent.id from public.quote_intents intent
       where intent.channel='catalogos' and intent.status='completed'
         and intent.analytics_sid=new.sid and intent.completed_at <= new.ts
       order by intent.completed_at desc limit 1
     );
  end if;
  return new;
end $$;
