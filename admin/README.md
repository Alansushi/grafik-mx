# Panel privado de ventas de GRAFIK

El proyecto de Vercel `grafik-admin` usa esta carpeta como raíz y publica `admin.grafik.mx` desde `main`. La landing pública sigue en su proyecto propio. No desplegar el panel por CLI: integrar los cambios mediante PR a `main` y verificar los dos despliegues creados por Git.

## Configuración

Las únicas variables del panel son `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `ADMIN_SESSION_SECRET` (32 bytes aleatorios en hexadecimal). No añadir una clave `service_role` al proyecto ni al navegador. Ver `.env.example`.

En Supabase Auth, deshabilitar el registro público, habilitar TOTP y permitir `https://admin.grafik.mx/aceptar` como URL de redirección de la invitación. Invitar a la cuenta inicial por correo; después de que establezca su contraseña, añadir su `auth.users.id` a `public.admin_users` con el mismo correo. La cuenta debe registrar una aplicación autenticadora y completar el código en cada sesión. Una sesión AAL1 no lee datos por RLS.

En el DNS de `grafik.mx`, añadir el CNAME `admin` con el destino que indique el proyecto `grafik-admin` de Vercel. Comprobar la verificación del dominio y TLS antes de usar la invitación.

## Uso y medición

El resumen y las campañas muestran agregados. Una oportunidad conserva el primer origen conocido de su solicitud; una visita anónima anterior que no se pueda vincular no se atribuye. El folio `GQ-…` corresponde a una solicitud y `GW-…` a un botón directo de WhatsApp. `GK-…` es el folio de pedido del Estudio, enlazado a la oportunidad mediante `order_id`. Un clic registrado indica que se intentó abrir WhatsApp, no que se envió un mensaje. La conversación se confirma manualmente y `ganada` requiere el importe realmente cobrado. El retorno publicitario compara ingresos cobrados con gasto; no representa utilidad.

Si Contacto y Estudio representan el mismo cliente, usar la conciliación en Oportunidades. La oportunidad fusionada queda en el historial y se excluye de los agregados.

## Operación y recuperación

- Antes de aplicar migraciones en producción, comprobar la política de respaldo del proyecto y guardar un dump de esquema y datos en almacenamiento privado. Los dumps pueden contener PII y no deben entrar en Git.
- Para retirar acceso de inmediato, eliminar la fila de `public.admin_users` de la cuenta. El panel comprueba pertenencia en cada petición y la RLS la comprueba en cada consulta. También revocar sesiones del usuario en Supabase Auth y, si procede, eliminar la cuenta.
- Revisar `Actividad` para cambios de estado, importes y conciliaciones. Los registros técnicos no incluyen datos personales de la oportunidad.
- Ejecutar `npm test` y `npm run build` en esta carpeta; las pruebas SQL de permisos viven en `supabase/tests/sales_admin_rls.sql`. `tests/local-e2e.mjs` necesita Supabase local y el panel en `localhost:3001`.
