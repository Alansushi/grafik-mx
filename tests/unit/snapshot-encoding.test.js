import { describe, it, expect } from 'vitest';
import { pickSnapshotEncoding } from '../../estudio/canvas/snapshot.js';
import { AppError } from '../../estudio/lib/errors.js';

const TWO_MIB = 2 * 1024 * 1024;

describe('pickSnapshotEncoding — formato (mimeType/quality) según estimatedBytes', () => {
  it('1. por debajo del umbral de 2 MiB: se queda en PNG, sin quality', () => {
    const result = pickSnapshotEncoding(TWO_MIB - 1, { naturalSize: { width: 1000, height: 800 } });
    expect(result.mimeType).toBe('image/png');
    expect(result.quality).toBe(null);
  });

  it('2. justo en el umbral (=2 MiB exacto): "supera" es estricto, así que sigue en PNG', () => {
    const result = pickSnapshotEncoding(TWO_MIB, { naturalSize: { width: 1000, height: 800 } });
    expect(result.mimeType).toBe('image/png');
    expect(result.quality).toBe(null);
  });

  it('3. un solo byte por encima del umbral: cae a JPEG calidad 0.88', () => {
    const result = pickSnapshotEncoding(TWO_MIB + 1, { naturalSize: { width: 1000, height: 800 } });
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.quality).toBe(0.88);
  });

  it('4. muy por encima del umbral (10 MiB): también JPEG calidad 0.88', () => {
    const result = pickSnapshotEncoding(10 * 1024 * 1024, { naturalSize: { width: 1000, height: 800 } });
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.quality).toBe(0.88);
  });

  it('5. tamaño 0 (canvas vacío o estimación nula): PNG, nunca JPEG', () => {
    const result = pickSnapshotEncoding(0, { naturalSize: { width: 1000, height: 800 } });
    expect(result.mimeType).toBe('image/png');
    expect(result.quality).toBe(null);
  });
});

describe('pickSnapshotEncoding — pixelRatio según naturalSize y maxEdge', () => {
  it('6. lado mayor ya por debajo de maxEdge (1400 por defecto): pixelRatio = 1, nunca agranda', () => {
    const result = pickSnapshotEncoding(1000, { naturalSize: { width: 900, height: 600 } });
    expect(result.pixelRatio).toBe(1);
  });

  it('7. lado mayor exactamente igual a maxEdge: sigue sin downscale (no es ">")', () => {
    const result = pickSnapshotEncoding(1000, { naturalSize: { width: 1400, height: 700 } });
    expect(result.pixelRatio).toBe(1);
  });

  it('8. imagen apaisada (width > height) más grande que maxEdge: encoge el ancho a 1400 exactos', () => {
    const result = pickSnapshotEncoding(1000, { naturalSize: { width: 2800, height: 1000 } });
    expect(result.pixelRatio).toBeCloseTo(1400 / 2800, 10);
    expect(2800 * result.pixelRatio).toBeCloseTo(1400, 10);
  });

  it('9. imagen en retrato (height > width) más grande que maxEdge: usa el lado MAYOR (height), no el ancho', () => {
    const result = pickSnapshotEncoding(1000, { naturalSize: { width: 500, height: 2000 } });
    expect(result.pixelRatio).toBeCloseTo(1400 / 2000, 10);
    expect(2000 * result.pixelRatio).toBeCloseTo(1400, 10);
  });

  it('10. maxEdge personalizado: el downscale se calcula contra el límite pasado, no contra 1400', () => {
    const result = pickSnapshotEncoding(1000, {
      naturalSize: { width: 2000, height: 1600 },
      maxEdge: 800,
    });
    expect(result.pixelRatio).toBeCloseTo(800 / 2000, 10);
    expect(2000 * result.pixelRatio).toBeCloseTo(800, 10);
  });

  it('11. maxBytes personalizado: el umbral de formato se calcula contra el límite pasado, no contra 2 MiB', () => {
    const belowCustom = pickSnapshotEncoding(500_000, {
      naturalSize: { width: 900, height: 600 },
      maxBytes: 400_000,
    });
    expect(belowCustom.mimeType).toBe('image/jpeg');
  });
});

describe('pickSnapshotEncoding — validación de entrada', () => {
  it('12. sin naturalSize: lanza AppError con code MISSING_NATURAL_SIZE', () => {
    const call = () => pickSnapshotEncoding(1000, {});
    expect(call).toThrow(AppError);
    try {
      call();
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('MISSING_NATURAL_SIZE');
    }
  });

  it('13. naturalSize con width/height en 0: también se rechaza (no es un tamaño válido)', () => {
    const call = () => pickSnapshotEncoding(1000, { naturalSize: { width: 0, height: 0 } });
    expect(call).toThrow(AppError);
    try {
      call();
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('MISSING_NATURAL_SIZE');
    }
  });
});
