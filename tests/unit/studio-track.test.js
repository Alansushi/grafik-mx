import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { track, trackOnce, resetTrackOnceForTests } from '../../estudio/ui/track.js';

// El puente hacia window.grafikTrack (analytics.js). Medir NUNCA puede afectar al
// configurador: sin analytics.js cargado (bloqueador de anuncios, Do Not Track,
// fallo de red) todo debe seguir funcionando en silencio.

let espia;
beforeEach(() => {
  espia = vi.fn();
  globalThis.window = { grafikTrack: espia };
  resetTrackOnceForTests();
});
afterEach(() => {
  delete globalThis.window;
});

describe('estudio/ui/track.js', () => {
  it('1. track reenvía nombre y props a window.grafikTrack', () => {
    track('studio_ready', { a: 1 });
    expect(espia).toHaveBeenCalledWith('studio_ready', { a: 1 });
  });

  it('2. sin analytics.js (window.grafikTrack ausente) no lanza', () => {
    globalThis.window = {};
    expect(() => track('studio_ready')).not.toThrow();
    delete globalThis.window; // ni siquiera hay window (p. ej. un test en Node)
    expect(() => track('studio_ready')).not.toThrow();
  });

  it('3. si grafikTrack lanza, track no propaga el error al configurador', () => {
    globalThis.window = { grafikTrack: () => { throw new Error('boom'); } };
    expect(() => track('studio_ready')).not.toThrow();
  });

  it('4. trackOnce emite una sola vez por clave, aunque se llame muchas', () => {
    trackOnce('studio_sizes', { qty: 12 });
    trackOnce('studio_sizes', { qty: 50 });
    trackOnce('studio_sizes', { qty: 99 });
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia).toHaveBeenCalledWith('studio_sizes', { qty: 12 }); // se queda con la PRIMERA
  });

  it('5. la clave por defecto es el nombre; con clave explícita, cada una emite su vez', () => {
    trackOnce('studio_error', { where: 'quote', code: 'BELOW_MIN' }, 'quote:BELOW_MIN');
    trackOnce('studio_error', { where: 'quote', code: 'BELOW_MIN' }, 'quote:BELOW_MIN');
    trackOnce('studio_error', { where: 'quote', code: 'ABOVE_MAX' }, 'quote:ABOVE_MAX');
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it('6. una clave se "gasta" aunque analytics.js no exista: no reintenta después', () => {
    globalThis.window = {};
    trackOnce('studio_ready');
    globalThis.window = { grafikTrack: espia };
    trackOnce('studio_ready');
    expect(espia).not.toHaveBeenCalled();
  });
});
