// estudio/ui/track.js — puente hacia window.grafikTrack (analytics.js, en la raíz).
//
// Medir NUNCA puede afectar al configurador. analytics.js puede no estar (un
// bloqueador de anuncios, Do Not Track, un fallo de red), y aun estando, una
// excepción suya no debe cortar un pedido a medias: todo aquí falla en silencio.
//
// Vive en ui/ y no en lib/ porque toca `window`; lib/ es PURA.

const yaEnviados = new Set();

export function track(name, props) {
  try {
    if (typeof window !== 'undefined' && typeof window.grafikTrack === 'function') {
      window.grafikTrack(name, props);
    }
  } catch {
    // Ver arriba: medir jamás rompe el flujo del cliente.
  }
}

/**
 * Como `track`, pero una sola vez por `key` (por defecto, el nombre) durante la
 * vida de la página. Los pasos del embudo son "¿llegó alguna vez aquí?", no
 * "¿cuántas veces?": sin esto, escribir "120" en tallas emitiría tres eventos.
 * La clave se gasta aunque analytics.js no exista, para no reintentar luego.
 * Se conserva la PRIMERA llamada: sus props son las del primer momento.
 */
export function trackOnce(name, props, key = name) {
  if (yaEnviados.has(key)) return;
  yaEnviados.add(key);
  track(name, props);
}

export function resetTrackOnceForTests() {
  yaEnviados.clear();
}
