import { defineConfig } from 'vitest/config';

// Sólo lógica pura: estudio/lib/** y los módulos PURA de api/_lib/**.
// Nada de DOM aquí — el canvas se prueba con Playwright (playwright.config.js).
// `globals: false` es deliberado: cada test importa { describe, it, expect } de
// 'vitest' explícitamente, para que los archivos se puedan leer sin adivinar de
// dónde vienen los símbolos.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      include: ['estudio/lib/**', 'api/_lib/**'],
      reporter: ['text', 'html'],
    },
  },
});
