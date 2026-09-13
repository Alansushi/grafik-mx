import { describe, it, expect } from 'vitest';
import { readEnv, findMissingEnv, resolveBaseUrl } from '../../api/_lib/env.js';
import { AppError } from '../../estudio/lib/errors.js';

describe('env.js — readEnv', () => {
  it('1. required:true con valor presente devuelve el valor', () => {
    expect(readEnv({ SUPABASE_URL: 'https://x.supabase.co' }, 'SUPABASE_URL', { required: true })).toBe(
      'https://x.supabase.co'
    );
  });

  it('2. required:true con la variable ausente lanza AppError MISSING_ENV', () => {
    try {
      readEnv({}, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('MISSING_ENV');
    }
  });

  it('3. el error MISSING_ENV incluye el NOMBRE de la variable en details, nunca un valor', () => {
    try {
      readEnv({}, 'SUPABASE_SERVICE_ROLE_KEY', { required: true });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.details.name).toBe('SUPABASE_SERVICE_ROLE_KEY');
      // Contrato explícito: details sólo lleva el nombre, jamás un "value".
      expect(Object.keys(err.details)).toEqual(['name']);
    }
  });

  it('4. required:true con string vacío también cuenta como ausente', () => {
    expect(() => readEnv({ FOO: '' }, 'FOO', { required: true })).toThrow(AppError);
  });

  it('5. required:true con string sólo de espacios también cuenta como ausente (trim)', () => {
    expect(() => readEnv({ FOO: '   ' }, 'FOO', { required: true })).toThrow(AppError);
  });

  it('6. sin required (u omitido) y la variable ausente NO lanza, devuelve string vacío', () => {
    expect(readEnv({}, 'OPCIONAL')).toBe('');
    expect(readEnv({}, 'OPCIONAL', {})).toBe('');
    expect(readEnv({}, 'OPCIONAL', { required: false })).toBe('');
  });

  it('7. no aplica trim al valor devuelto cuando sí está presente (se devuelve tal cual llegó)', () => {
    expect(readEnv({ FOO: '  con espacios  ' }, 'FOO', { required: true })).toBe('  con espacios  ');
  });
});

describe('env.js — findMissingEnv', () => {
  it('8. devuelve sólo las claves ausentes, en el orden pedido', () => {
    const env = { A: '1', C: '3' };
    expect(findMissingEnv(env, ['A', 'B', 'C', 'D'])).toEqual(['B', 'D']);
  });

  it('9. una clave presente pero vacía tras trim cuenta como ausente', () => {
    const env = { A: '1', B: '   ', C: '' };
    expect(findMissingEnv(env, ['A', 'B', 'C'])).toEqual(['B', 'C']);
  });

  it('10. lista vacía de claves → array vacío', () => {
    expect(findMissingEnv({ A: '1' }, [])).toEqual([]);
  });

  it('11. todas las claves presentes → array vacío', () => {
    expect(findMissingEnv({ A: '1', B: '2' }, ['A', 'B'])).toEqual([]);
  });
});

describe('env.js — resolveBaseUrl', () => {
  // Caso crítico del spec: VERCEL_URL no trae esquema (Vercel lo expone así
  // literalmente, p.ej. "mi-app.vercel.app"), así que hay que anteponer
  // 'https://' a mano o el resultado no es una URL válida.
  it('12. PUBLIC_BASE_URL tiene prioridad si está definida', () => {
    expect(
      resolveBaseUrl({ PUBLIC_BASE_URL: 'https://grafik.mx', VERCEL_URL: 'algo.vercel.app' })
    ).toBe('https://grafik.mx');
  });

  it('13. sin PUBLIC_BASE_URL, usa VERCEL_URL anteponiendo "https://" a mano', () => {
    expect(resolveBaseUrl({ VERCEL_URL: 'x.vercel.app' })).toBe('https://x.vercel.app');
  });

  it('14. sin ninguna de las dos, cae a localhost:3000 (desarrollo local)', () => {
    expect(resolveBaseUrl({})).toBe('http://localhost:3000');
  });

  it('15. (cosecha) PUBLIC_BASE_URL vacío/espacios no cuenta como definido, cae a VERCEL_URL', () => {
    expect(resolveBaseUrl({ PUBLIC_BASE_URL: '   ', VERCEL_URL: 'x.vercel.app' })).toBe('https://x.vercel.app');
  });

  it('16. (cosecha) env sin argumento no lanza y cae a localhost', () => {
    expect(resolveBaseUrl()).toBe('http://localhost:3000');
  });
});
