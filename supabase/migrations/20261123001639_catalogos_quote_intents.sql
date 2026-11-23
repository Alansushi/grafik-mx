-- Catálogos: solicitudes con varios artículos, contacto por correo o WhatsApp y atribución privada.
alter table public.quote_intents drop constraint quote_intents_channel_check;
alter table public.quote_intents add constraint quote_intents_channel_check
  check (channel in ('contacto','estudio','catalogos'));
alter table public.sales_opportunities drop constraint sales_opportunities_channel_check;
alter table public.sales_opportunities add constraint sales_opportunities_channel_check
  check (channel in ('contacto','estudio','whatsapp','catalogos'));
alter table public.quote_intents alter column email drop not null;
alter table public.quote_intents add constraint quote_intents_contact_check
  check (channel = 'catalogos' or email is not null);
alter table public.quote_intents add constraint quote_intents_catalog_complete_contact
  check (channel <> 'catalogos' or status <> 'completed' or (email is not null or phone is not null));
alter table public.quote_intents add column items jsonb not null default '[]'::jsonb;
alter table public.quote_intents add constraint quote_intents_items_array
  check (case when jsonb_typeof(items) = 'array' then jsonb_array_length(items) <= 30 else false end);
alter table public.quote_intents add column intended_use text check (char_length(intended_use) <= 500);
alter table public.quote_intents add column personalization text check (char_length(personalization) <= 1000);
alter table public.quote_intents add column required_date date;
alter table public.quote_intents add column buyer_type text
  check (buyer_type in ('empresa','independiente','organizacion','particular'));
alter table public.quote_intents add column analytics_sid text
  check (analytics_sid ~ '^[a-z0-9]{8,32}$');
alter table public.quote_intents add column return_catalog text
  check (return_catalog in ('navidad-2026','agendas-2027'));
alter table public.quote_intents add column return_page integer
  check (return_page between 1 and 57 and not (return_catalog = 'navidad-2026' and return_page = 56));
create index quote_intents_catalog_sid on public.quote_intents (analytics_sid)
  where channel = 'catalogos' and analytics_sid is not null;
alter table public.quote_email_log drop constraint quote_email_log_kind_check;
alter table public.quote_email_log add constraint quote_email_log_kind_check
  check (kind in ('confirmation','reminder','team_alert'));

-- Sólo las solicitudes iniciadas con correo pueden entrar al cron de recordatorio.
create or replace function public.claim_quote_reminders(p_limit integer default 50)
returns setof public.quote_intents
language sql security invoker set search_path = '' as $$
  update public.quote_intents q
  set reminder_claimed_at = now()
  where q.id in (
    select id from public.quote_intents
    where status = 'started' and email is not null and unsubscribed_at is null
      and (reminder_claimed_at is null or reminder_claimed_at < now() - interval '1 hour')
      and reminder_sent_at is null
      and updated_at <= now() - interval '24 hours'
    order by updated_at
    for update skip locked
    limit least(greatest(p_limit, 0), 50)
  )
  returning q.*;
$$;
revoke all on function public.claim_quote_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_quote_reminders(integer) to service_role;

-- Embudo por sesiones realmente expuestas en cada ubicación.
create view public.v_catalog_funnel with (security_invoker = true) as
with exposures as (
  select distinct on (sid, props->>'placement')
    sid, props->>'placement' as placement,
    date_trunc('week', ts at time zone 'America/Mexico_City')::date as week,
    coalesce(nullif(utm_source, ''), nullif(referrer_host, ''), '(directo)') as source,
    utm_campaign as campaign, device
  from public.site_events
  where event = 'catalog_promo_exposure'
  order by sid, props->>'placement', ts
), catalogs as (
  select unnest(array['navidad-2026','agendas-2027']) as catalog
)
select e.week, e.placement, c.catalog, e.source, e.campaign, e.device,
  count(*) as exposed_sessions,
  count(*) filter (where exists (select 1 from public.site_events s
    where s.sid=e.sid and s.event='catalog_promo_click' and s.props->>'placement'=e.placement)) as clicked_sessions,
  count(*) filter (where exists (select 1 from public.site_events s
    where s.sid=e.sid and s.event='catalog_open' and s.props->>'catalog'=c.catalog)) as opened_sessions,
  count(*) filter (where exists (select 1 from public.site_events s
    where s.sid=e.sid and s.event='catalog_item' and s.props->>'catalog'=c.catalog and s.props->>'action'='add')) as selected_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog)))) as saved_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage in ('contactada','cotizada','ganada'))) as contacted_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage in ('cotizada','ganada'))) as quoted_sessions,
  count(*) filter (where exists (select 1 from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage='ganada')) as won_sessions,
  coalesce(sum((select max(o.amount_collected) from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id=i.id
    where i.analytics_sid=e.sid and i.status='completed' and i.channel='catalogos'
      and i.items @> jsonb_build_array(jsonb_build_object('catalog', c.catalog))
      and o.stage='ganada'
      -- Una solicitud mixta no tiene importe asignado por catálogo.
      and (select count(distinct part->>'catalog') from jsonb_array_elements(i.items) part) = 1)),0) as amount_collected
from exposures e cross join catalogs c
group by e.week,e.placement,c.catalog,e.source,e.campaign,e.device;
revoke all on public.v_catalog_funnel from anon, authenticated;
grant select on public.v_catalog_funnel to authenticated;

-- El clic opcional a WhatsApp actualiza la oportunidad más reciente de esa sesión.
-- La sesión sólo está ligada a la solicitud en quote_intents (tabla privada).
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
