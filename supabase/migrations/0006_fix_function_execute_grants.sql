-- Cierra las funciones SECURITY DEFINER al exterior.
--
-- El bug que corrige: 0002 hacía `revoke execute ... from anon, authenticated`
-- y eso NO surtió efecto. Postgres concede EXECUTE a PUBLIC por defecto en cada
-- función nueva, y anon/authenticated heredan de PUBLIC — revocar del rol
-- específico no quita la concesión heredada. Hay que revocar de PUBLIC.
--
-- Lo detectó `get_advisors` del MCP de Supabase (lint 0028): rpc_rate_limit_hit
-- estaba expuesta como endpoint público en /rest/v1/rpc/, así que cualquiera
-- podía agotar el bucket de cuota de otro o inflar la tabla rate_limits.

-- is_admin(): las políticas RLS la evalúan con los privilegios del usuario que
-- consulta, así que 'authenticated' SÍ necesita EXECUTE — sin él, toda consulta
-- del panel de admin fallaría con "permission denied for function is_admin".
-- anon nunca la evalúa (ninguna de sus políticas la usa), así que se le quita.
--
-- Que siga siendo llamable por 'authenticated' aparece como WARN en el advisor
-- y es intencional: devuelve un booleano sobre el propio estatus de quien
-- llama, y un autenticado que no sea admin obtiene false. No filtra nada.
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated, service_role;

-- rpc_rate_limit_hit(): sólo las Vercel Functions.
revoke execute on function public.rpc_rate_limit_hit(text, int, int) from public, anon, authenticated;
grant  execute on function public.rpc_rate_limit_hit(text, int, int) to service_role;

-- gen_short_code(): se usa como DEFAULT de orders.short_code, y los defaults se
-- evalúan con los privilegios de quien inserta. Sólo service_role inserta
-- pedidos.
revoke execute on function public.gen_short_code() from public, anon, authenticated;
grant  execute on function public.gen_short_code() to service_role;
