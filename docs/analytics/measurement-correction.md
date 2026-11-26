# Corrección de medición, noviembre de 2026

La página `/estudio/pedido/` puede abrirse directamente y no representa una
entrada al configurador. Desde esta corrección, `v_studio_sessions` sólo incluye
sesiones con `page_view` en `/estudio/` y sólo agrega eventos de esa ruta.

`vio_precio` se basa en `studio_price_view`, emitido una vez cuando el precio
base de frazada entra en pantalla. Los eventos antiguos no permiten reconstruir
esa exposición: el cero anterior no significa que nadie viera el precio.

Las solicitudes nuevas de Contacto, Estudio y Catálogos pueden guardar
`analytics_sid` y asociarse con la navegación de la misma pestaña. Las filas
históricas conservan `NULL`. Un rebote o clic de Resend es un evento de correo,
no una visita. Las vistas omitidas antes de publicar el script de Vercel no se
pueden recuperar.

Para comparar Vercel con Supabase, consultar **Pages** en Vercel Analytics y
las vistas `v_studio_sessions` y `v_studio_funnel` en Supabase. Las cifras pueden
diferir por filtros de tráfico y bloqueadores. `?notrack` excluye la propia
medición y Vercel; `?notrack=0` la vuelve a activar en ese navegador.
