import 'server-only';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { adminClient } from './session';

export async function requireAdmin() {
  const supabase = await adminClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error || aal.data.currentLevel !== 'aal2') redirect('/mfa');
  const member = await supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (member.error || !member.data) redirect('/sin-acceso');
  return { supabase, user };
}

export async function assertOrigin() {
  const h = await headers();
  const origin = h.get('origin');
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!origin || !host || new URL(origin).host !== host) throw new Error('Origen no permitido');
}
