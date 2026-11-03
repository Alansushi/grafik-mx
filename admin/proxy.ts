import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { seal, sessionCookie, unseal } from './lib/session';

export async function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString('base64');
  const devEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  const csp = `default-src 'none'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}; style-src 'self' 'nonce-${nonce}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; upgrade-insecure-requests`;
  let current = unseal(request.cookies.get(sessionCookie.name)?.value);
  if (current) {
    try {
      const session = JSON.parse(current.value);
      if (session.expires_at * 1000 < Date.now() + 60_000) {
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } });
        const refreshed = await sb.auth.refreshSession({ refresh_token: session.refresh_token });
        current = refreshed.error || !refreshed.data.session ? null : { value: JSON.stringify(refreshed.data.session), touched: Date.now() };
      }
    } catch { current = null; }
  }
  if (current) request.cookies.set(sessionCookie.name, seal({ value: current.value, touched: Date.now() }));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  if (current) response.cookies.set(sessionCookie.name,
    seal({ value: current.value, touched: Date.now() }), sessionCookie.options);
  else if (request.cookies.has(sessionCookie.name)) response.cookies.delete(sessionCookie.name);
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
