-- Panel privado de ventas. Toda lectura/escritura humana requiere membresía y TOTP.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and (auth.jwt()->>'aal') = 'aal2'
    and exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

drop policy if exists admin_self on public.admin_users;
create policy admin_self on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_admin()));

alter table public.quote_intents add column utm_medium text;
alter table public.quote_intents add column utm_campaign text;

create table public.sales_opportunities (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique check (folio ~ '^(GQ|GW)-[0-9A-F]{16,32}$'),
  quote_intent_id uuid unique references public.quote_intents(id) on delete set null,
  order_id uuid unique references public.orders(id) on delete set null,
  channel text not null check (channel in ('contacto','estudio','whatsapp')),
  stage text not null default 'nueva' check (stage in ('nueva','contactada','cotizada','ganada','perdida')),
  whatsapp_clicked_at timestamptz,
  conversation_confirmed_at timestamptz,
  amount_collected numeric(12,2) not null default 0 check (amount_collected >= 0),
  source text,
  medium text,
  campaign text,
  attribution_note text not null default 'Primer origen conocido; visita anónima previa no vinculable',
  merged_into uuid references public.sales_opportunities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merged_into is null or merged_into <> id),
  check (stage = 'ganada' or amount_collected = 0)
);
create index sales_opportunities_created on public.sales_opportunities (created_at desc) where merged_into is null;
create index sales_opportunities_campaign on public.sales_opportunities (campaign, created_at) where merged_into is null;

create table public.sales_campaign_spend (
  id bigint generated always as identity primary key,
  month date not null check (extract(day from month) = 1),
  source text not null,
  campaign text not null,
  amount numeric(12,2) not null check (amount >= 0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (month, source, campaign)
);
create table public.sales_activity (
  id bigint generated always as identity primary key,
  opportunity_id uuid references public.sales_opportunities(id) on delete set null,
  actor uuid references auth.users(id),
  kind text not null,
  old_stage text,
  new_stage text,
  old_amount numeric(12,2),
  new_amount numeric(12,2),
  created_at timestamptz not null default now()
);

create or replace function public.sales_from_intent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sales_opportunities (folio, quote_intent_id, order_id, channel, source, medium, campaign, whatsapp_clicked_at)
  values ('GQ-' || upper(substr(replace(new.client_key::text, '-', ''), 1, 16)), new.id, new.order_id,
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
create trigger sales_intent_sync after insert or update of status, order_id, utm_source, utm_medium, utm_campaign, referrer_host on public.quote_intents
for each row execute function public.sales_from_intent();
insert into public.sales_opportunities (folio, quote_intent_id, order_id, channel, source, medium, campaign, whatsapp_clicked_at, created_at)
select 'GQ-' || upper(substr(replace(client_key::text, '-', ''), 1, 16)), id, order_id, channel,
       coalesce(nullif(utm_source, ''), nullif(referrer_host, '')), utm_medium, utm_campaign,
       case when channel = 'contacto' and status = 'completed' then completed_at end, started_at
from public.quote_intents on conflict (quote_intent_id) do nothing;

create or replace function public.sales_from_click() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_folio text;
begin
  v_folio := new.props->>'folio';
  if new.event = 'cta_click' and new.props->>'kind' = 'whatsapp'
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
create trigger sales_click_sync after insert on public.site_events
for each row execute function public.sales_from_click();

create or replace function public.sales_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stage is distinct from old.stage or new.amount_collected is distinct from old.amount_collected
     or new.conversation_confirmed_at is distinct from old.conversation_confirmed_at
     or new.merged_into is distinct from old.merged_into then
    insert into public.sales_activity(opportunity_id, actor, kind, old_stage, new_stage, old_amount, new_amount)
    values (new.id, auth.uid(), case when new.merged_into is distinct from old.merged_into then 'conciliacion'
      when new.conversation_confirmed_at is distinct from old.conversation_confirmed_at then 'conversacion'
      else 'estado_importe' end, old.stage, new.stage, old.amount_collected, new.amount_collected);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger sales_opportunity_audit before update on public.sales_opportunities
for each row execute function public.sales_audit();

alter table public.sales_opportunities enable row level security;
alter table public.sales_campaign_spend enable row level security;
alter table public.sales_activity enable row level security;
revoke all on public.sales_opportunities, public.sales_campaign_spend, public.sales_activity from anon, authenticated;
grant select on public.sales_opportunities to authenticated;
grant update (stage, amount_collected, conversation_confirmed_at, merged_into) on public.sales_opportunities to authenticated;
grant select, insert, update on public.sales_campaign_spend to authenticated;
grant select on public.sales_activity to authenticated;
create policy sales_opportunities_read on public.sales_opportunities for select to authenticated using ((select public.is_admin()));
create policy sales_opportunities_update on public.sales_opportunities for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy sales_spend_read on public.sales_campaign_spend for select to authenticated using ((select public.is_admin()));
create policy sales_spend_insert on public.sales_campaign_spend for insert to authenticated
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy sales_spend_update on public.sales_campaign_spend for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy sales_activity_read on public.sales_activity for select to authenticated using ((select public.is_admin()));

-- Una tabla de gastos no puede atribuirse a otro usuario mediante un UPDATE.
create or replace function public.sales_spend_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger sales_spend_stamp before insert or update on public.sales_campaign_spend
for each row execute function public.sales_spend_stamp();

create or replace function public.sales_spend_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sales_activity(actor,kind,old_amount,new_amount)
  values (auth.uid(), 'gasto_campana', case when tg_op = 'UPDATE' then old.amount else null end, new.amount);
  return new;
end $$;
create trigger sales_spend_audit after insert or update on public.sales_campaign_spend
for each row execute function public.sales_spend_audit();
