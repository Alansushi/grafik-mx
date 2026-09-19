import { describe, it, expect } from 'vitest';
import {
  printQuality,
  pixelesNecesarios,
  DPI_BUENO,
  DPI_MINIMO,
} from '../../estudio/lib/print-quality.js';
import { ValidationError } from '../../estudio/lib/errors.js';

// Valores REALES de la playera en producción (migración 0008): el área
// imprimible mide 0.330 del canvas de 955 px = 315.15 px, y 31.6 cm en la
// prenda. Usar los de verdad y no números redondos hace que un cambio de
// calibración que rompa el cálculo aparezca aquí.
const AREA = { width: 315.15, height: 279 };
const AREA_CM = 31.6;

function caso({ natural = { width: 1000, height: 400 }, escala = 1, ...resto } = {}) {
  return printQuality({
    naturalSize: natural,
    transform: { scaleX: escala, scaleY: escala },
    printArea: AREA,
    printAreaWidthCm: AREA_CM,
    ...resto,
  });
}

describe('print-quality — el dpi depende de la ESCALA, no del tamaño del archivo', () => {
  it('1. dos archivos de distinto tamaño a la misma escala dan el mismo dpi', () => {
    // Es la consecuencia de que naturalSize se cancele en la fórmula. Si
    // alguien "arregla" el cálculo metiendo naturalWidth, esto falla.
    const chico = caso({ natural: { width: 300, height: 120 }, escala: 2 });
    const grande = caso({ natural: { width: 3000, height: 1200 }, escala: 2 });
    expect(chico.dpi).toBeCloseTo(grande.dpi, 9);
  });

  it('2. al doble de escala, la mitad de dpi', () => {
    expect(caso({ escala: 1 }).dpi).toBeCloseTo(caso({ escala: 2 }).dpi * 2, 9);
  });

  it('3. el mismo archivo estirado más grande empeora', () => {
    const pequeno = caso({ natural: { width: 2000, height: 800 }, escala: 0.5 });
    const estirado = caso({ natural: { width: 2000, height: 800 }, escala: 4 });
    expect(pequeno.dpi).toBeGreaterThan(estirado.dpi);
    expect(pequeno.widthCm).toBeLessThan(estirado.widthCm);
  });
});

describe('print-quality — centímetros impresos', () => {
  it('4. un logo que ocupa exactamente el ancho del área mide el ancho del área', () => {
    // 200 px de origen × escala 1.57575 = 315.15 px de canvas = el área entera.
    const r = caso({ natural: { width: 200, height: 80 }, escala: AREA.width / 200 });
    expect(r.widthCm).toBeCloseTo(AREA_CM, 6);
  });

  it('5. a media escala del área, la mitad de los centímetros', () => {
    const r = caso({ natural: { width: 200, height: 80 }, escala: AREA.width / 200 / 2 });
    expect(r.widthCm).toBeCloseTo(AREA_CM / 2, 6);
  });

  it('6. el alto sale de scaleY, no de scaleX', () => {
    const r = printQuality({
      naturalSize: { width: 100, height: 100 },
      transform: { scaleX: 1, scaleY: 3 },
      printArea: AREA,
      printAreaWidthCm: AREA_CM,
    });
    expect(r.heightCm).toBeCloseTo(r.widthCm * 3, 9);
  });
});

describe('print-quality — el caso que motivó todo esto', () => {
  it('7. el logo de fixture a todo el ancho del pecho sale en ~16 dpi y es "fail"', () => {
    // tests/fixtures/logo-transparente.png mide 200×80, y es exactamente lo
    // que el configurador coloca por defecto: ocupa el área completa.
    // 200 px repartidos en 31.6 cm (12.44") = 16 dpi. Ilegible al imprimir, y
    // HOY nada se lo decía al cliente.
    const r = caso({ natural: { width: 200, height: 80 }, escala: AREA.width / 200 });
    expect(Math.round(r.dpi)).toBe(16);
    expect(r.level).toBe('fail');
    expect(r.message).toMatch(/pixele/i);
    // El mensaje trae la salida concreta, no sólo el diagnóstico.
    expect(r.message).toMatch(/1867 px/);
  });

  it('8. el mismo logo achicado a 5 cm ya es aceptable', () => {
    const escala = (AREA.width * (5 / AREA_CM)) / 200;
    const r = caso({ natural: { width: 200, height: 80 }, escala });
    expect(r.widthCm).toBeCloseTo(5, 6);
    expect(r.dpi).toBeGreaterThan(DPI_MINIMO);
  });
});

describe('print-quality — umbrales', () => {
  // Se construye la escala que produce EXACTAMENTE el dpi buscado, en vez de
  // tantear números: dpi = 2.54 / (escala × cmPorPixel).
  const escalaParaDpi = (dpi) => 2.54 / (dpi * (AREA_CM / AREA.width));

  it('9. justo en 150 dpi es "ok" (el umbral no excluye su propio valor)', () => {
    const r = caso({ escala: escalaParaDpi(DPI_BUENO) });
    expect(r.dpi).toBeCloseTo(DPI_BUENO, 6);
    expect(r.level).toBe('ok');
  });

  it('10. justo por debajo de 150 es "warn"', () => {
    expect(caso({ escala: escalaParaDpi(DPI_BUENO - 1) }).level).toBe('warn');
  });

  it('11. justo en 100 dpi es "warn", no "fail"', () => {
    // El límite se evalúa sobre el dpi REDONDEADO. Con el valor crudo esto
    // llegaba como 99.99999999999999 y caía en "fail": el umbral exacto
    // dependía del ruido de coma flotante.
    const r = caso({ escala: escalaParaDpi(DPI_MINIMO) });
    expect(r.dpi).toBeCloseTo(DPI_MINIMO, 6);
    expect(r.level).toBe('warn');
  });

  it('11b. el número que se muestra y el veredicto nunca se contradicen', () => {
    // A 99.6 dpi el mensaje decía "100 dpi" junto a "se va a ver pixeleado".
    for (const objetivo of [99.6, 100.4, 149.6, 150.4]) {
      const r = caso({ escala: escalaParaDpi(objetivo) });
      const mostrado = Number(r.message.match(/(\d+) dpi/)[1]);
      const esperado = mostrado < DPI_MINIMO ? 'fail' : mostrado < DPI_BUENO ? 'warn' : 'ok';
      expect(r.level, `mostraba ${mostrado} dpi con level ${r.level}`).toBe(esperado);
    }
  });

  it('12. por debajo de 100 es "fail"', () => {
    expect(caso({ escala: escalaParaDpi(DPI_MINIMO - 1) }).level).toBe('fail');
  });

  it('13. 300 dpi es "ok" y el mensaje no alarma', () => {
    const r = caso({ escala: escalaParaDpi(300) });
    expect(r.level).toBe('ok');
    expect(r.message).toMatch(/suficiente/i);
    expect(r.message).not.toMatch(/pixele/i);
  });
});

describe('print-quality — un vector nunca tiene problema de resolución', () => {
  it('14. vector:true da dpi infinito y level ok por muy estirado que esté', () => {
    const r = caso({ natural: { width: 10, height: 10 }, escala: 50, vector: true });
    expect(r.level).toBe('ok');
    expect(r.dpi).toBe(Infinity);
    expect(r.vector).toBe(true);
  });

  it('15. …pero sigue reportando los centímetros impresos, y SIN hablar de dpi', () => {
    // Saber a qué tamaño sale es útil aunque la resolución no sea problema.
    // Mencionar dpi en un vector sólo confundiría: ese número no significa nada.
    const r = caso({ natural: { width: 200, height: 80 }, escala: AREA.width / 200, vector: true });
    expect(r.widthCm).toBeCloseTo(AREA_CM, 6);
    expect(r.message).toMatch(/31\.6 × 12\.6 cm/);
    expect(r.message).not.toMatch(/dpi/i);
    expect(r.message).not.toMatch(/pixele/i);
  });

  it('16. el MISMO caso sin vector sí falla — o sea, la bandera es lo que decide', () => {
    const conVector = caso({ natural: { width: 10, height: 10 }, escala: 50, vector: true });
    const sinVector = caso({ natural: { width: 10, height: 10 }, escala: 50, vector: false });
    expect(conVector.level).toBe('ok');
    expect(sinVector.level).toBe('fail');
  });
});

describe('print-quality — entradas inválidas fallan ruidoso', () => {
  const invalidos = [
    ['sin naturalSize', { naturalSize: undefined }],
    ['naturalSize.width en 0', { naturalSize: { width: 0, height: 10 } }],
    ['naturalSize.height negativo', { naturalSize: { width: 10, height: -5 } }],
    ['printArea.width en 0', { printArea: { width: 0, height: 10 } }],
    ['printAreaWidthCm ausente', { printAreaWidthCm: undefined }],
    ['printAreaWidthCm en 0', { printAreaWidthCm: 0 }],
    ['scaleX en 0', { transform: { scaleX: 0, scaleY: 1 } }],
    ['scaleY NaN', { transform: { scaleX: 1, scaleY: NaN } }],
  ];

  for (const [etiqueta, override] of invalidos) {
    it(`17. ${etiqueta} → ValidationError INVALID_PRINT_METRIC`, () => {
      const llamada = () => printQuality({
        naturalSize: { width: 100, height: 100 },
        transform: { scaleX: 1, scaleY: 1 },
        printArea: AREA,
        printAreaWidthCm: AREA_CM,
        ...override,
      });
      expect(llamada).toThrow(ValidationError);
      try { llamada(); } catch (err) { expect(err.code).toBe('INVALID_PRINT_METRIC'); }
    });
  }

  it('18. un printAreaWidthCm ausente NO se resuelve con un valor por omisión', () => {
    // Tentación evidente: "si no viene, asume 30 cm". Sería un número
    // inventado presentado al cliente como medida de su prenda.
    expect(() => printQuality({
      naturalSize: { width: 100, height: 100 },
      transform: { scaleX: 1, scaleY: 1 },
      printArea: AREA,
    })).toThrow(ValidationError);
  });
});

describe('print-quality — pixelesNecesarios', () => {
  it('19. 31.6 cm a 150 dpi necesitan 1867 px', () => {
    // 31.6/2.54 = 12.4409" x 150 = 1866.14 -> ceil = 1867.
    expect(pixelesNecesarios(31.6, 150)).toBe(1867);
  });

  it('20. 2.54 cm a 300 dpi son exactamente 300 px', () => {
    expect(pixelesNecesarios(2.54, 300)).toBe(300);
  });

  it('21. redondea hacia ARRIBA: pedir de menos dejaría el resultado por debajo del umbral', () => {
    expect(pixelesNecesarios(2.55, 300)).toBe(302); // 301.18 → 302
  });
});
