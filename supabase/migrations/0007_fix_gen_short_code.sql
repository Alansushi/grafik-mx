-- gen_short_code() usaba gen_random_bytes(), que vive en pgcrypto y en Supabase
-- se instala en el esquema `extensions`. Como la función lleva
-- `set search_path = public` (el endurecimiento contra escalada de privilegios
-- en funciones SECURITY DEFINER, migración 0006), no la encontraba: cada INSERT
-- en orders fallaba con 42883.
--
-- Se detectó ejecutando el flujo completo contra la base real. El esquema se
-- había aplicado sin error porque el cuerpo de una función plpgsql no se
-- resuelve hasta que se ejecuta — el tipo de fallo que sólo aparece cuando algo
-- de verdad intenta crear un pedido.
--
-- En vez de ampliar el search_path a `public, extensions` —que reabriría parte
-- de la superficie que 0006 cerró— se elimina la dependencia: gen_random_uuid()
-- es parte del core de Postgres desde la 13, no de pgcrypto, y da la misma
-- entropía hexadecimal.

create or replace function public.gen_short_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_code text;
begin
  loop
    v_code := 'GK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.orders where short_code = v_code);
  end loop;
  return v_code;
end $$;

revoke execute on function public.gen_short_code() from public, anon, authenticated;
grant  execute on function public.gen_short_code() to service_role;
