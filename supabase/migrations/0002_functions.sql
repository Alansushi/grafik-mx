-- Configurador /estudio/ — funciones
-- Spec §5.2

-- ¿El usuario autenticado es administrador?
--
-- security definer + search_path fijo: sin el search_path explícito, un usuario
-- podría crear un esquema propio con una tabla admin_users falsa y anteponerlo,
-- escalando privilegios. Es el error clásico de las funciones security definer.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- Rate limit atómico y compartido entre instancias.
--
-- Devuelve true si la petición se permite. El INSERT ... ON CONFLICT DO UPDATE
-- hace el incremento y el reinicio de ventana en una sola sentencia, así que no
-- hay carrera entre leer y escribir — que es exactamente lo que un contador en
-- memoria no puede garantizar en serverless.
create or replace function public.rpc_rate_limit_hit(
  p_bucket text,
  p_window_seconds int,
  p_max_hits int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_hits int;
begin
  insert into public.rate_limits (bucket, hits, window_start)
  values (p_bucket, 1, now())
  on conflict (bucket) do update set
    hits = case
             when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
             then 1
             else public.rate_limits.hits + 1
           end,
    window_start = case
             when public.rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
             then now()
             else public.rate_limits.window_start
           end
  returning hits into v_hits;

  return v_hits <= p_max_hits;
end $$;

-- Sólo las Vercel Functions (service_role) pueden consumir cuota. Si anon
-- pudiera llamarla, cualquiera agotaría el bucket de otro.
revoke execute on function public.rpc_rate_limit_hit(text, int, int) from anon, authenticated;
revoke execute on function public.gen_short_code() from anon, authenticated;
