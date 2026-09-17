import { describe, it, expect } from 'vitest';
import {
  isEmail,
  isMxPhone,
  normalizeMxPhone,
  isUuid,
  sanitizeFilename,
  assertShape,
} from '../../api/_lib/validation.js';

// Casos numerados según la tabla de la spec §2.13 (docs/superpowers/specs/
// 2026-09-11-configurador-estudio-design.md). Las letras (8b, 8c...) son
// casos adicionales no listados explícitamente en la tabla pero necesarios
// para cubrir por completo la firma exportada del módulo.

describe('validation.js — isEmail', () => {
  it('8. acepta un email simple con TLD', () => {
    expect(isEmail('a@b.co')).toBe(true);
  });

  it('8b. rechaza un email sin punto tras la @ (sin TLD)', () => {
    expect(isEmail('a@b')).toBe(false);
  });

  it('8c. rechaza un email con espacio en la parte local', () => {
    expect(isEmail('a b@c.com')).toBe(false);
  });

  it('8d. rechaza el string vacío', () => {
    expect(isEmail('')).toBe(false);
  });

  it('8e. nunca lanza con entradas que no son string', () => {
    expect(isEmail(null)).toBe(false);
    expect(isEmail(undefined)).toBe(false);
    expect(isEmail(42)).toBe(false);
  });
});

describe('validation.js — normalizeMxPhone / isMxPhone', () => {
  it('9. normaliza un número con lada de país (+52) y espacios a 10 dígitos', () => {
    expect(normalizeMxPhone('+52 55 3901 4600')).toBe('5539014600');
  });

  it('10. normaliza un número con guiones, ya sin lada de país', () => {
    expect(normalizeMxPhone('55-3901-4600')).toBe('5539014600');
  });

  it('11. isMxPhone rechaza un número demasiado corto', () => {
    expect(isMxPhone('123')).toBe(false);
  });

  it('11b. isMxPhone acepta un número de 10 dígitos ya normalizado', () => {
    expect(isMxPhone('5539014600')).toBe(true);
  });

  it('11c. isMxPhone acepta el mismo número con formato +52 y espacios', () => {
    expect(isMxPhone('+52 55 3901 4600')).toBe(true);
  });

  it('11d. isMxPhone nunca lanza con entradas basura', () => {
    expect(() => isMxPhone(null)).not.toThrow();
    expect(isMxPhone(null)).toBe(false);
    expect(isMxPhone(undefined)).toBe(false);
  });
});

describe('validation.js — isUuid', () => {
  it('acepta un UUID v4 válido', () => {
    expect(isUuid('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true);
  });

  it('acepta un UUID en mayúsculas (case-insensitive por RFC 4122)', () => {
    expect(isUuid('3FA85F64-5717-4562-B3FC-2C963F66AFA6')).toBe(true);
  });

  it('rechaza un string sin guiones', () => {
    expect(isUuid('3fa85f6457174562b3fc2c963f66afa6')).toBe(false);
  });

  it('rechaza longitudes/formas incorrectas', () => {
    expect(isUuid('abc-123')).toBe(false);
  });

  it('rechaza vacío, null y undefined sin lanzar', () => {
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('validation.js — sanitizeFilename', () => {
  it('convierte espacios y símbolos en guiones, todo en minúsculas', () => {
    expect(sanitizeFilename('Mi Logo (final)')).toBe('mi-logo-final');
  });

  it('colapsa separadores consecutivos en un único guión', () => {
    expect(sanitizeFilename('a   b---c')).toBe('a-b-c');
  });

  it('path traversal con "/": se queda sólo con el último segmento de ruta', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  });

  it('path traversal con "\\": mismo comportamiento que con "/"', () => {
    const backslashPath = ['..', '..', 'windows', 'system32', 'evil'].join(String.fromCharCode(92));
    expect(sanitizeFilename(backslashPath)).toBe('evil');
  });

  it('bytes nulos: se tratan como cualquier otro separador, nunca sobreviven', () => {
    const withNullByte = 'a' + String.fromCharCode(0) + 'b';
    const result = sanitizeFilename(withNullByte);
    expect(result).not.toContain(String.fromCharCode(0));
    expect(result).toBe('a-b');
  });

  it('nombres que empiezan con punto: el punto líder no sobrevive', () => {
    expect(sanitizeFilename('.secret')).toBe('secret');
  });

  it('trunca a 60 caracteres', () => {
    expect(sanitizeFilename('a'.repeat(300)).length).toBeLessThanOrEqual(60);
  });

  it('nunca devuelve string vacío: usa un fallback seguro cuando no queda nada', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('...')).toBe('file');
    expect(sanitizeFilename(null)).toBe('file');
  });
});

describe('validation.js — assertShape', () => {
  it('12. reporta REQUIRED para el campo faltante e ignora el que sí cumple', () => {
    expect(assertShape({ a: 1 }, { a: 'number', b: 'string' })).toEqual({
      valid: false,
      errors: [{ path: 'b', code: 'REQUIRED' }],
    });
  });

  it('13. ignora campos extra que no están en el schema', () => {
    expect(assertShape({ a: 1, extra: 'x' }, { a: 'number' })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('13b. reporta INVALID_TYPE cuando el campo existe pero con otro tipo', () => {
    expect(assertShape({ a: 'no-es-numero' }, { a: 'number' })).toEqual({
      valid: false,
      errors: [{ path: 'a', code: 'INVALID_TYPE' }],
    });
  });

  it('13c. acumula errores de varios campos, no cortocircuita en el primero', () => {
    const result = assertShape({}, { a: 'number', b: 'string' });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      { path: 'a', code: 'REQUIRED' },
      { path: 'b', code: 'REQUIRED' },
    ]);
  });

  it('13d. null cuenta como REQUIRED, no como INVALID_TYPE', () => {
    expect(assertShape({ a: null }, { a: 'number' })).toEqual({
      valid: false,
      errors: [{ path: 'a', code: 'REQUIRED' }],
    });
  });
});
