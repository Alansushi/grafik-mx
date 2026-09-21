import { defineConfig, devices } from '@playwright/test';

// Proyectos con propósitos distintos:
//
//   canvas → hermético. Sirve el repo con python3 http.server y falsea toda la
//            red con page.route(). No necesita Supabase, ni Mercado Pago, ni
//            cuentas. Es el que corre en cada incremento.
//
//   analytics → analytics.js del sitio contra una página fixture, con /api/track
//            interceptado. Hermético, sólo Chromium. Ligero: corre en paralelo.
//
//   studio-analytics → el embudo de /estudio/ (tests/e2e/studio-analytics.spec.js)
//            recorrido con la UI real. Hermético también, pero PESADO: cada
//            prueba carga React y Konva del CDN y pinta un canvas de 900×900, y
//            con varias a la vez los `waitForFunction` de arranque vencían por
//            carga de la máquina (pasan las 10 en serie). Por eso NO es
//            fullyParallel: las pruebas de este archivo van una tras otra.
//
//   live   → contra un deploy real (preview de Vercel). Sólo corre si existe
//            E2E_BASE_URL; sin esa variable el proyecto queda vacío en vez de
//            fallar con errores de conexión confusos.
//
// Regla del spec §3.5: CERO screenshot diffing. Todas las aserciones del canvas
// son numéricas y se comparan contra los mismos módulos puros ejecutados en Node.

const LIVE_BASE_URL = process.env.E2E_BASE_URL;
const LOCAL_PORT = 8099;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  expect: { timeout: 7_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  webServer: {
    command: `python3 -m http.server ${LOCAL_PORT}`,
    url: `http://127.0.0.1:${LOCAL_PORT}/estudio/`,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },

  projects: [
    // El motor de canvas debe funcionar con touch en móvil (módulo 9 del
    // análisis), y Safari es donde los blend modes se portan distinto — por eso
    // webkit no es opcional.
    // a11y corre en escritorio y en móvil, pero NO en webkit: el contraste sale
    // del mismo CSS en los tres, así que webkit no aportaría señal nueva. Lo
    // que sí cambia entre proyectos es el viewport, y de ahí dependen el área
    // táctil y el desbordamiento — por eso va en los dos tamaños.
    {
      name: 'canvas',
      testMatch: /(canvas|studio-flow|a11y)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${LOCAL_PORT}` },
    },
    {
      name: 'canvas-webkit',
      testMatch: /(canvas|studio-flow)\.spec\.js/,
      use: { ...devices['Desktop Safari'], baseURL: `http://127.0.0.1:${LOCAL_PORT}` },
    },
    {
      name: 'canvas-mobile',
      testMatch: /(canvas|studio-flow|a11y)\.spec\.js/,
      use: { ...devices['iPhone 14'], baseURL: `http://127.0.0.1:${LOCAL_PORT}` },
    },
    // analytics.js contra una página fixture, con /api/track interceptado.
    // Hermético como canvas: sin Supabase ni CDN. En Chromium basta: la lógica
    // es DOM estándar y no hay nada que se porte distinto entre motores.
    {
      name: 'analytics',
      // Anclado: sin el `$` y el separador, este patrón también capturaría
      // studio-analytics.spec.js y lo correría en paralelo con todo lo demás.
      testMatch: /[\\/]analytics\.spec\.js$/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${LOCAL_PORT}` },
    },
    {
      name: 'studio-analytics',
      testMatch: /[\\/]studio-analytics\.spec\.js$/,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${LOCAL_PORT}` },
    },
    ...(LIVE_BASE_URL
      ? [
          {
            name: 'live',
            testMatch: /(checkout|admin)\.spec\.js/,
            use: { ...devices['Desktop Chrome'], baseURL: LIVE_BASE_URL },
          },
        ]
      : []),
  ],
});
