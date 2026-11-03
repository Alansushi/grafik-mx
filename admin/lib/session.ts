import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const COOKIE = 'grafik_admin_session';
const IDLE_MS = 30 * 60 * 1000;
type Envelope = { value: string; touched: number };

function key() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('ADMIN_SESSION_SECRET must be 64 hex characters');
  return Buffer.from(value, 'hex');
}
export function seal(payload: Envelope) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}
export function unseal(raw?: string): Envelope | null {
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString()) as Envelope;
    if (typeof payload.value !== 'string' || !Number.isFinite(payload.touched) || Date.now() - payload.touched > IDLE_MS) return null;
    return payload;
  } catch { return null; }
}
export const sessionCookie = {
  name: COOKIE,
  options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const,
    path: '/', maxAge: IDLE_MS / 1000, priority: 'high' as const },
};

export async function adminClient() {
  const jar = await cookies();
  const storage = {
    getItem: (_: string) => unseal(jar.get(COOKIE)?.value)?.value ?? null,
    setItem: (_: string, value: string) => {
      try { jar.set(COOKIE, seal({ value, touched: Date.now() }), sessionCookie.options); } catch { /* read-only render */ }
    },
    removeItem: (_: string) => {
      try { jar.delete(COOKIE); } catch { /* read-only render */ }
    },
  };
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error('Supabase admin environment missing');
  return createClient(url, publishableKey, { auth: { storage, persistSession: true,
    autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' } });
}
