// estudio/ui/react.js — puente entre el React global del CDN y los módulos ESM.
//
// React llega como UMD (window.React), no como módulo. Este archivo lo
// re-exporta con nombres para que el resto de `ui/` haga imports normales en
// vez de tocar el global por todos lados.
//
// ── Por qué NO hay JSX (y por qué se quitó babel-standalone) ──
//
// El spec pedía componentes en `<script type="text/babel">`. No funciona con la
// arquitectura de módulos que tiene el estudio: babel-standalone sólo transforma
// el script inline, y los `.js` que ese script importa se cargan como ESM nativo
// SIN transformar — o sea que no pueden contener JSX. Habría que meter toda la
// UI en un único script inline gigante.
//
// Usar `h` (React.createElement) directamente resuelve eso y trae tres cosas
// más: la página adelgaza ~1 MB, desaparece el paso de compilación en runtime
// que el propio spec aceptaba como deuda en móvil, y se elimina la necesidad de
// `unsafe-eval` — así que el estudio sí podría llevar una CSP más adelante, que
// era otra deuda anotada.

if (typeof window.React === 'undefined' || typeof window.ReactDOM === 'undefined') {
  throw new Error('React/ReactDOM no están cargados: revisa los <script> del CDN en index.html.');
}

export const React = window.React;
export const ReactDOM = window.ReactDOM;

/** Alias corto de createElement. `h('div', {className:'x'}, hijo)` */
export const h = React.createElement;

export const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Fragment,
} = React;

/** Une clases condicionales: cx('a', cond && 'b') → 'a b' */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
