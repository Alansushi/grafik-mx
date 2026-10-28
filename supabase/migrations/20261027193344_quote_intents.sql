-- Solicitudes privadas. La API publica nunca usa la clave anon para estos datos.
create table public.quote_intents (
  id uuid primary key default gen_random_uuid(),
  client_key uuid not null unique,
  channel text not null check (channel in ('contacto', 'estudio')),
  status text not null default 'started' check (status in ('started', 'completed', 'cancelled')),
  name text check (name is null or char_length(name) between 2 and 120),
  email text not null check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  service text check (char_length(service) <= 80),
  details text check (char_length(details) <= 2000),
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  return_token uuid not null default gen_random_uuid() unique,
  order_id uuid references public.orders(id) on delete set null,
  referrer_host text,
  utm_source text,
  device text check (device in ('mobile','tablet','desktop')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  reminder_claimed_at timestamptz,
  reminder_sent_at timestamptz,
  returned_at timestamptz,
  constraint consent_timestamp check ((not marketing_consent) or consent_at is not null)
);

create index quote_intents_reminders on public.quote_intents (updated_at)
  where status = 'started' and reminder_claimed_at is null and unsubscribed_at is null;
create index quote_intents_email on public.quote_intents (lower(email));

create table public.quote_email_log (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references public.quote_intents(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'reminder')),
  state text not null check (state in ('claimed', 'sent', 'failed', 'delivered', 'bounced', 'clicked')),
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intent_id, kind)
);
create unique index quote_email_provider_id on public.quote_email_log (provider_id) where provider_id is not null;

create table public.quote_email_events (
  id bigint generated always as identity primary key,
  webhook_id text not null unique,
  provider_id text,
  intent_id uuid references public.quote_intents(id) on delete set null,
  event text not null check (event in ('delivered','bounced','clicked','contact_unsubscribed')),
  event_at timestamptz not null,
  received_at timestamptz not null default now()
);

alter table public.quote_intents enable row level security;
alter table public.quote_email_log enable row level security;
alter table public.quote_email_events enable row level security;
revoke all on public.quote_intents, public.quote_email_log, public.quote_email_events from anon, authenticated, service_role;
grant select, insert, update on public.quote_intents, public.quote_email_log to service_role;
grant select, insert on public.quote_email_events to service_role;
create policy quote_intents_admin_read on public.quote_intents for select to authenticated using (public.is_admin());
create policy quote_email_admin_read on public.quote_email_log for select to authenticated using (public.is_admin());
create policy quote_email_events_admin_read on public.quote_email_events for select to authenticated using (public.is_admin());
grant select on public.quote_intents, public.quote_email_log, public.quote_email_events to authenticated;

-- Reclamar lotes de recordatorios sin que dos ejecuciones procesen la misma fila.
-- Sólo service_role puede llamar la función, aunque el privilegio de ejecución
-- de funciones nuevas suele ser PUBLIC por defecto.
create function public.claim_quote_reminders(p_limit integer default 50)
returns setof public.quote_intents
language sql security invoker set search_path = '' as $$
  update public.quote_intents q
  set reminder_claimed_at = now()
  where q.id in (
    select id from public.quote_intents
    where status = 'started' and unsubscribed_at is null
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

-- Agregados sin datos personales para el corte mensual. Cada fila deja visible
-- el denominador y evita porcentajes engañosos en muestras pequeñas.
create view public.v_quote_funnel with (security_invoker = true) as
select (started_at at time zone 'America/Mexico_City')::date as dia,
       channel, device,
       coalesce(nullif(utm_source, ''), referrer_host, '(directo)') as fuente,
       count(*) as intentos,
       count(*) filter (where status = 'completed') as solicitudes,
       count(*) filter (where reminder_sent_at is not null) as recordatorios,
       count(*) filter (where returned_at is not null) as regresos,
       count(*) filter (where order_id is not null) as pedidos
from public.quote_intents
group by 1,2,3,4;
revoke all on public.v_quote_funnel from anon, authenticated;
grant select on public.v_quote_funnel to authenticated;
