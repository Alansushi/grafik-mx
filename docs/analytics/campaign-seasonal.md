# Campaña de temporada — borrador, sin envío

**Estado:** pendiente del catálogo de temporada, del aviso de privacidad y de conectar la cuenta existente de Resend. El primer envío será puntual tras revisar catálogo, audiencia y mensaje. No programar ni enviar una campaña automáticamente.

## Audiencia permitida

Una dirección sólo puede entrar a la lista de campañas si existe consentimiento expreso, sigue vigente y no hay baja. Antes de sincronizar con Resend, deduplicar por correo y excluir cualquier dirección con una baja en cualquiera de sus intentos:

```sql
select distinct on (lower(q.email)) lower(q.email) as email, q.name, q.consent_at
from public.quote_intents q
where q.marketing_consent = true and q.consent_at is not null
  and not exists (
    select 1 from public.quote_intents x
    where lower(x.email) = lower(q.email) and x.unsubscribed_at is not null
  )
order by lower(q.email), q.consent_at desc;
```

Verificar el tamaño de muestra y comparar el total sincronizado con Resend antes de preparar el envío. Resend debe manejar la baja de Broadcasts; escuchar `contact.updated` y reflejarla en `quote_intents`. La plantilla incluye `{{{RESEND_UNSUBSCRIBE_URL}}}` y nunca se envía por el endpoint transaccional `/emails`.

## Plantilla a revisar con el catálogo

**Asunto:** Ideas para imprimir esta temporada | GRAFIK

Hola {{{contact.first_name|hola}}},

Ya está listo nuestro catálogo de temporada: **[nombre y enlace del catálogo]**. Si necesitas piezas para tu negocio o evento, responde a este correo o cotiza por WhatsApp.

[Ver catálogo de temporada]

GRAFIK · CDMX

Si prefieres no recibir promociones, date de baja aquí: {{{RESEND_UNSUBSCRIBE_URL}}}
