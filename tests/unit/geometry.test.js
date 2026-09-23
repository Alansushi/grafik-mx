import { describe, it, expect } from 'vitest';
import {
  degToRad,
  rotatePoint,
  logoCorners,
  aabbOf,
  rotatedAabb,
  rectContains,
  clampScale,
  maxFitScaleFor,
  clampTransformToArea,
  fitTransformToArea,
  isTransformValid,
  areaCoveragePct,
  transformToRenderProps,
  normalizeRotation,
  snapRotation,
} from '../../estudio/lib/geometry.js';
import { GeometryError } from '../../estudio/lib/errors.js';

// Fixtures fijas del §2.3 del spec. Usarlas siempre — no inventar tamaños.
const AREA = { x: 0, y: 0, width: 200, height: 200 };
const L100 = { width: 100, height: 100 };

// Generador determinista de transforms para los property tests 14 y 15.
// Prohibido Math.random: cada índice produce siempre el mismo transform, así
// que un fallo (si lo hay) es reproducible sin depender de una semilla externa.
// Rangos exigidos por el spec: x,y ∈ [-500,700], scale ∈ [0.01,10], rotación ∈ [0,360).
function deterministicTransform(i) {
  const x = -500 + ((i * 137) % 1201); // 1201 = 700 - (-500) + 1
  const y = -500 + ((i * 269) % 1201);
  const scaleT = ((i * 37) % 1000) / 999; // ∈ [0,1]
  const scale = 0.01 + scaleT * (10 - 0.01);
  const rotation = (i * 53) % 360; // ya cae en [0,360)
  return { x, y, scaleX: scale, scaleY: scale, rotation };
}

const FIFTY_TRANSFORMS = Array.from({ length: 50 }, (_, i) => deterministicTransform(i));

describe('geometry.js — degToRad', () => {
  it('convierte grados a radianes', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 9);
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2, 9);
    expect(degToRad(0)).toBe(0);
  });
});

describe('geometry.js — rotatePoint', () => {
  it('1. rota (1,0) 90° alrededor del origen → (0,1) ±1e-9 (sentido horario, y hacia abajo)', () => {
    const result = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(result.x).toBeCloseTo(0, 9);
    expect(result.y).toBeCloseTo(1, 9);
  });

  it('2. rotar 360° devuelve el mismo punto ±1e-9', () => {
    const p = { x: 37, y: -12 };
    const o = { x: 5, y: 5 };
    const result = rotatePoint(p, o, 360);
    expect(result.x).toBeCloseTo(p.x, 9);
    expect(result.y).toBeCloseTo(p.y, 9);
  });

  it('3. rotar un punto alrededor de sí mismo devuelve el mismo punto, cualquier ángulo', () => {
    const p = { x: 42, y: -7 };
    for (const deg of [0, 33, 90, 180, 271, 359]) {
      const result = rotatePoint(p, p, deg);
      expect(result.x).toBeCloseTo(p.x, 9);
      expect(result.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe('geometry.js — rotatedAabb', () => {
  it('4. rotación 0 sobre L100 centrado en (100,100) → {x:50,y:50,width:100,height:100}', () => {
    const box = rotatedAabb({ x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }, L100);
    expect(box.x).toBeCloseTo(50, 9);
    expect(box.y).toBeCloseTo(50, 9);
    expect(box.width).toBeCloseTo(100, 9);
    expect(box.height).toBeCloseTo(100, 9);
  });

  it('5. rotación 45 sobre L100 → width=height=141.4214 ±1e-3, centrado en (100,100)', () => {
    const box = rotatedAabb({ x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 45 }, L100);
    expect(box.width).toBeCloseTo(141.4214, 3);
    expect(box.height).toBeCloseTo(141.4214, 3);
    // Un AABB rotado 45° de un cuadrado 100×100 sigue centrado en el mismo punto:
    // la diagonal (100*√2 ≈ 141.4214) se reparte igual a ambos lados del centro.
    expect(box.x + box.width / 2).toBeCloseTo(100, 6);
    expect(box.y + box.height / 2).toBeCloseTo(100, 6);
  });

  it('6. rotación 90 sobre {200,100} intercambia ancho y alto → {width:100,height:200}', () => {
    const box = rotatedAabb(
      { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 90 },
      { width: 200, height: 100 },
    );
    expect(box.width).toBeCloseTo(100, 6);
    expect(box.height).toBeCloseTo(200, 6);
  });

  it('7. rotación 180 sobre L100 es idéntico al de rotación 0', () => {
    const box0 = rotatedAabb({ x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }, L100);
    const box180 = rotatedAabb({ x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 180 }, L100);
    expect(box180.x).toBeCloseTo(box0.x, 6);
    expect(box180.y).toBeCloseTo(box0.y, 6);
    expect(box180.width).toBeCloseTo(box0.width, 6);
    expect(box180.height).toBeCloseTo(box0.height, 6);
  });
});

describe('geometry.js — aabbOf (soporte de rotatedAabb)', () => {
  it('calcula la caja mínima que contiene un conjunto de puntos', () => {
    const box = aabbOf([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: -3, y: 8 }]);
    expect(box).toEqual({ x: -3, y: 0, width: 13, height: 8 });
  });
});

describe('geometry.js — rectContains', () => {
  it('detecta un rect contenido y uno que se sale', () => {
    expect(rectContains(AREA, { x: 10, y: 10, width: 50, height: 50 })).toBe(true);
    expect(rectContains(AREA, { x: -1, y: 10, width: 50, height: 50 })).toBe(false);
    expect(rectContains(AREA, { x: 10, y: 10, width: 500, height: 50 })).toBe(false);
  });

  it('tolera diferencias de flotante dentro del eps', () => {
    expect(rectContains(AREA, { x: -1e-9, y: 0, width: 200, height: 200 })).toBe(true);
  });
});

describe('geometry.js — clampTransformToArea', () => {
  it('8. clamp de {x:180,y:100,scaleX:1,scaleY:1,rotation:0} sobre L100 → x===150', () => {
    const result = clampTransformToArea({ x: 180, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }, L100, AREA);
    expect(result.x).toBeCloseTo(150, 6);
    expect(result.y).toBeCloseTo(100, 6);
  });

  it('9. clamp de {x:-50,y:100,scaleX:1,scaleY:1,rotation:0} sobre L100 → x===50', () => {
    const result = clampTransformToArea({ x: -50, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }, L100, AREA);
    expect(result.x).toBeCloseTo(50, 6);
  });

  it('10. clamp de {x:180,y:100,scaleX:1,scaleY:1,rotation:45} sobre L100 → x===200-70.7107≈129.2893', () => {
    const result = clampTransformToArea({ x: 180, y: 100, scaleX: 1, scaleY: 1, rotation: 45 }, L100, AREA);
    expect(result.x).toBeCloseTo(200 - 70.7107, 3);
  });

  it('11. clamp de un transform ya dentro del área devuelve el mismo valor, sin cambios', () => {
    const input = { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 };
    const result = clampTransformToArea(input, L100, AREA);
    expect(result).toEqual(input);
  });

  it('12. clamp de un logo 400×400 a escala 1 no cabe → scaleX===scaleY===0.5, x===100, y===100', () => {
    // Posición inicial deliberadamente muy fuera del área: como el logo no cabe
    // a escala 1 en NINGUNA posición (400 > 200 en ambos ejes), tras encogerlo
    // a 200×200 exacto sólo queda un centro válido: el del área.
    const result = clampTransformToArea(
      { x: 9999, y: -9999, scaleX: 1, scaleY: 1, rotation: 0 },
      { width: 400, height: 400 },
      AREA,
    );
    expect(result.scaleX).toBeCloseTo(0.5, 9);
    expect(result.scaleY).toBeCloseTo(0.5, 9);
    expect(result.x).toBeCloseTo(100, 6);
    expect(result.y).toBeCloseTo(100, 6);
  });

  it('13. clamp de un logo 400×400 rotado 45° → scale === 200/565.685 ≈ 0.35355', () => {
    const result = clampTransformToArea(
      { x: 9999, y: -9999, scaleX: 1, scaleY: 1, rotation: 45 },
      { width: 400, height: 400 },
      AREA,
    );
    const expectedScale = 200 / (400 * Math.SQRT2);
    expect(result.scaleX).toBeCloseTo(expectedScale, 5);
    expect(result.scaleY).toBeCloseTo(expectedScale, 5);
  });

  it('16. clamp con área desplazada {x:60,y:80,width:120,height:90}: el AABB resultante está contenido y x se clampa a [60+w/2,180-w/2]', () => {
    const shiftedArea = { x: 60, y: 80, width: 120, height: 90 };
    // L100 a escala 1 no cabe en 120×90 (100 > 90 de alto), así que primero se
    // encoge a 0.9 (min(120/100, 90/100)) y luego se reposiciona.
    const result = clampTransformToArea(
      { x: 9999, y: -9999, scaleX: 1, scaleY: 1, rotation: 0 },
      L100,
      shiftedArea,
    );
    expect(result.scaleX).toBeCloseTo(0.9, 9);
    expect(result.scaleY).toBeCloseTo(0.9, 9);
    // w = ancho del AABB ya encogido (100*0.9 = 90) → medio ancho 45.
    // rango válido de x: [60+45, 180-45] = [105,135]
    expect(result.x).toBeCloseTo(135, 6);
    expect(result.x).toBeGreaterThanOrEqual(105 - 1e-6);
    expect(result.x).toBeLessThanOrEqual(135 + 1e-6);
    expect(rectContains(shiftedArea, rotatedAabb(result, L100))).toBe(true);
  });

  it('14. idempotencia: clamp(clamp(t)) === clamp(t) — property test, 50 transforms deterministas', () => {
    for (let i = 0; i < FIFTY_TRANSFORMS.length; i++) {
      const t = FIFTY_TRANSFORMS[i];
      const once = clampTransformToArea(t, L100, AREA);
      const twice = clampTransformToArea(once, L100, AREA);
      expect(twice.x, `x difiere en el índice ${i} (t=${JSON.stringify(t)})`).toBeCloseTo(once.x, 9);
      expect(twice.y, `y difiere en el índice ${i} (t=${JSON.stringify(t)})`).toBeCloseTo(once.y, 9);
      expect(twice.scaleX, `scaleX difiere en el índice ${i} (t=${JSON.stringify(t)})`).toBeCloseTo(once.scaleX, 9);
      expect(twice.scaleY, `scaleY difiere en el índice ${i} (t=${JSON.stringify(t)})`).toBeCloseTo(once.scaleY, 9);
      expect(twice.rotation, `rotation difiere en el índice ${i} (t=${JSON.stringify(t)})`).toBeCloseTo(once.rotation, 9);
    }
  });

  it('15. invariante: rectContains(AREA, rotatedAabb(clamp(t), L100)) es siempre true — mismos 50 transforms', () => {
    for (let i = 0; i < FIFTY_TRANSFORMS.length; i++) {
      const t = FIFTY_TRANSFORMS[i];
      const clamped = clampTransformToArea(t, L100, AREA);
      const box = rotatedAabb(clamped, L100);
      const contained = rectContains(AREA, box);
      expect(contained, `transform en el índice ${i} rompe la invariante: t=${JSON.stringify(t)} clamped=${JSON.stringify(clamped)} box=${JSON.stringify(box)}`).toBe(true);
    }
  });
});

describe('geometry.js — clampScale (minPx, caso 26)', () => {
  it('26. logo más grande que el área con minPx: nunca produce un AABB > área, prioriza caber sobre minPx', () => {
    // Logo de 1000×1000 en un área de 200×200: incluso al mínimo tamaño en
    // píxeles pedido (minPx muy alto), la prioridad es caber en el área.
    const t = { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 };
    const natural = { width: 1000, height: 1000 };
    const scale = clampScale(t, natural, AREA, /* minPx */ 5000);
    const box = rotatedAabb({ ...t, scaleX: scale, scaleY: scale }, natural);
    expect(rectContains(AREA, box)).toBe(true);
    expect(box.width).toBeLessThanOrEqual(AREA.width + 1e-6);
    expect(box.height).toBeLessThanOrEqual(AREA.height + 1e-6);
  });

  it('minPx actúa como piso cuando SÍ es compatible con el área', () => {
    // Logo muy chico (10×10) que a escala 1 mediría sólo 10px: con un minPx de
    // 40, clampScale debe subir la escala para que el lado más chico llegue a 40px,
    // ya que 40px sigue cabiendo de sobra en el área de 200×200.
    const t = { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 };
    const natural = { width: 10, height: 10 };
    const scale = clampScale(t, natural, AREA, /* minPx */ 40);
    expect(scale).toBeCloseTo(4, 6); // 40/10
  });
});

describe('geometry.js — fitTransformToArea', () => {
  it("17. modo 'contain' con {400,200} en AREA → scaleX===scaleY===0.5, x===100, y===100", () => {
    const result = fitTransformToArea({ width: 400, height: 200 }, AREA, 'contain');
    expect(result.scaleX).toBeCloseTo(0.5, 9);
    expect(result.scaleY).toBeCloseTo(0.5, 9);
    expect(result.x).toBeCloseTo(100, 9);
    expect(result.y).toBeCloseTo(100, 9);
  });

  it("18. modo 'cover' con {400,200} en AREA → scale===1, centrado (el AABB puede desbordar)", () => {
    const result = fitTransformToArea({ width: 400, height: 200 }, AREA, 'cover');
    expect(result.scaleX).toBeCloseTo(1, 9);
    expect(result.scaleY).toBeCloseTo(1, 9);
    expect(result.x).toBeCloseTo(100, 9);
    expect(result.y).toBeCloseTo(100, 9);
  });

  it("modo inválido lanza GeometryError INVALID_FIT_MODE", () => {
    try {
      fitTransformToArea({ width: 100, height: 100 }, AREA, 'stretch');
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(GeometryError);
      expect(err.code).toBe('INVALID_FIT_MODE');
    }
  });
});

describe('geometry.js — maxFitScaleFor (export)', () => {
  // Techo real que usa clampScale por dentro (línea ~129 de geometry.js). No
  // estaba exportada porque nada fuera del propio módulo la necesitaba — el
  // fix de los controles del Transformer (playera/gorra que no respondían al
  // agrandar/mover) la reutiliza en konva-adapter.js para que `getFitScale()`
  // refleje siempre el techo vigente, no el de la última fit explícita.
  const NATURAL_WIDE = { width: 400, height: 100 };
  const AREA_WIDE = { x: 0, y: 0, width: 300, height: 100 };

  it('a rotación 0 coincide exactamente con fitTransformToArea(...).scaleX', () => {
    const t = { x: 150, y: 50, scaleX: 1, scaleY: 1, rotation: 0 };
    const max = maxFitScaleFor(t, NATURAL_WIDE, AREA_WIDE);
    const fit = fitTransformToArea(NATURAL_WIDE, AREA_WIDE, 'contain');
    expect(max).toBeCloseTo(fit.scaleX, 9);
    expect(max).toBeCloseTo(0.75, 9);
  });

  it('a rotación 90° coincide con fitTransformToArea del logo con width/height invertidos', () => {
    const t = { x: 150, y: 50, scaleX: 1, scaleY: 1, rotation: 90 };
    const max = maxFitScaleFor(t, NATURAL_WIDE, AREA_WIDE);
    const swapped = { width: NATURAL_WIDE.height, height: NATURAL_WIDE.width };
    const fit = fitTransformToArea(swapped, AREA_WIDE, 'contain');
    expect(max).toBeCloseTo(fit.scaleX, 6);
    expect(max).toBeCloseTo(0.25, 6);
  });

  it('es independiente de x/y (el AABB rotado no cambia de tamaño al trasladarse)', () => {
    const a = maxFitScaleFor({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 37 }, NATURAL_WIDE, AREA_WIDE);
    const b = maxFitScaleFor({ x: 999, y: -400, scaleX: 1, scaleY: 1, rotation: 37 }, NATURAL_WIDE, AREA_WIDE);
    expect(a).toBeCloseTo(b, 9);
  });
});

describe('geometry.js — areaCoveragePct', () => {
  it('19. L100 centrado en AREA a escala 1 → 25%', () => {
    const pct = areaCoveragePct({ x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }, L100, AREA);
    expect(pct).toBeCloseTo(25, 6);
  });

  it('20. logo que llena exactamente el área → 100%', () => {
    const pct = areaCoveragePct({ x: 100, y: 100, scaleX: 2, scaleY: 2, rotation: 0 }, L100, AREA);
    expect(pct).toBeCloseTo(100, 6);
  });
});

describe('geometry.js — isTransformValid', () => {
  it("21. scaleX:0 → {valid:false, reasons:['SCALE_ZERO']}", () => {
    const result = isTransformValid(
      { x: 100, y: 100, scaleX: 0, scaleY: 1, rotation: 0 },
      L100,
      AREA,
    );
    expect(result).toEqual({ valid: false, reasons: ['SCALE_ZERO'] });
  });

  it("22. rotation:NaN → {valid:false, reasons:['ROTATION_NAN']}", () => {
    const result = isTransformValid(
      { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: NaN },
      L100,
      AREA,
    );
    expect(result).toEqual({ valid: false, reasons: ['ROTATION_NAN'] });
  });

  it('transform completamente válido → {valid:true, reasons:[]}', () => {
    const result = isTransformValid(
      { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 30 },
      L100,
      AREA,
    );
    expect(result).toEqual({ valid: true, reasons: [] });
  });
});

describe('geometry.js — normalizeRotation', () => {
  it('23. normalizeRotation(-90) → 270, normalizeRotation(450) → 90', () => {
    expect(normalizeRotation(-90)).toBeCloseTo(270, 9);
    expect(normalizeRotation(450)).toBeCloseTo(90, 9);
  });

  it('normaliza 0 y 360 al mismo valor canónico', () => {
    expect(normalizeRotation(0)).toBeCloseTo(0, 9);
    expect(normalizeRotation(360)).toBeCloseTo(0, 9);
  });
});

describe('geometry.js — snapRotation', () => {
  it('24. snapRotation(88,90,5) → 90 (dentro de tolerancia)', () => {
    expect(snapRotation(88, 90, 5)).toBeCloseTo(90, 9);
  });

  it('24b. snapRotation(80,90,5) → 80 (fuera de tolerancia, sin cambios)', () => {
    expect(snapRotation(80, 90, 5)).toBeCloseTo(80, 9);
  });
});

describe('geometry.js — transformToRenderProps', () => {
  it('25. offsetX === natural.width*scaleX/2, x === centro (para que Konva rote alrededor del centro)', () => {
    const t = { x: 120, y: 80, scaleX: 1.5, scaleY: 2, rotation: 30 };
    const natural = { width: 100, height: 50 };
    const props = transformToRenderProps(t, natural);
    expect(props.offsetX).toBeCloseTo((natural.width * t.scaleX) / 2, 9);
    expect(props.offsetY).toBeCloseTo((natural.height * t.scaleY) / 2, 9);
    expect(props.x).toBeCloseTo(t.x, 9);
    expect(props.y).toBeCloseTo(t.y, 9);
    expect(props.rotation).toBeCloseTo(t.rotation, 9);
    expect(props.width).toBeCloseTo(natural.width * t.scaleX, 9);
    expect(props.height).toBeCloseTo(natural.height * t.scaleY, 9);
  });
});
