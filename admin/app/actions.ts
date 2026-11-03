'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/session';
import { assertOrigin, requireAdmin } from '@/lib/auth';

export async function login(form: FormData) {
  await assertOrigin();
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  if (!email || !password) redirect('/login?error=1');
  const sb = await adminClient();
  const result = await sb.auth.signInWithPassword({ email, password });
  if (result.error) redirect('/login?error=1');
  redirect('/mfa');
}

export async function verifyMfa(form: FormData) {
  await assertOrigin();
  const sb = await adminClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const factorId = String(form.get('factorId') || '');
  const code = String(form.get('code') || '');
  if (!/^[0-9]{6}$/.test(code)) redirect('/mfa?error=1');
  const factors = await sb.auth.mfa.listFactors();
  if (factors.error || !factors.data.all.some(f => f.id === factorId)) redirect('/mfa?error=1');
  const challenge = await sb.auth.mfa.challenge({ factorId });
  if (challenge.error) redirect('/mfa?error=1');
  const verified = await sb.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
  if (verified.error) redirect('/mfa?error=1');
  redirect('/');
}

export async function logout() {
  await assertOrigin();
  const sb = await adminClient();
  await sb.auth.signOut();
  redirect('/login');
}

export async function setPassword(form: FormData) {
  await assertOrigin();
  const sb = await adminClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const password = String(form.get('password') || '');
  if (password.length < 12 || password.length > 128) redirect('/establecer-clave?error=1');
  const result = await sb.auth.updateUser({ password });
  if (result.error) redirect('/establecer-clave?error=1');
  redirect('/mfa');
}

export async function updateOpportunity(form: FormData) {
  await assertOrigin();
  const { supabase } = await requireAdmin();
  const id = String(form.get('id') || '');
  const stage = String(form.get('stage') || '');
  const amount = Number(form.get('amount') || 0);
  const confirmed = form.get('confirmed') === 'on';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['nueva','contactada','cotizada','ganada','perdida'].includes(stage)
      || !Number.isFinite(amount) || amount < 0 || amount > 9999999999.99 || (stage !== 'ganada' && amount !== 0)) {
    throw new Error('Datos de oportunidad inválidos');
  }
  const result = await supabase.from('sales_opportunities').update({ stage, amount_collected: amount,
    conversation_confirmed_at: confirmed ? new Date().toISOString() : null }).eq('id', id).is('merged_into', null).select('id').single();
  if (result.error) throw new Error('No se pudo guardar la oportunidad');
  revalidatePath('/'); revalidatePath('/oportunidades'); revalidatePath(`/oportunidades/${id}`);
}

export async function mergeOpportunity(form: FormData) {
  await assertOrigin();
  const { supabase } = await requireAdmin();
  const id = String(form.get('id') || '');
  const target = String(form.get('target') || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(target) || id === target) throw new Error('Folios inválidos');
  const [sourceRow,targetRow] = await Promise.all([
    supabase.from('sales_opportunities').select('amount_collected').eq('id',id).is('merged_into',null).single(),
    supabase.from('sales_opportunities').select('id').eq('id',target).is('merged_into',null).single(),
  ]);
  if (sourceRow.error || targetRow.error || Number(sourceRow.data.amount_collected) !== 0)
    throw new Error('El folio de origen debe estar activo y sin importe cobrado');
  const result = await supabase.from('sales_opportunities').update({ merged_into: target }).eq('id', id)
    .eq('amount_collected',0).is('merged_into', null).select('id').single();
  if (result.error) throw new Error('No se pudo conciliar');
  revalidatePath('/'); revalidatePath('/oportunidades');
}

export async function saveSpend(form: FormData) {
  await assertOrigin();
  const { supabase, user } = await requireAdmin();
  const month = String(form.get('month') || '');
  const source = String(form.get('source') || '').trim().slice(0,100);
  const campaign = String(form.get('campaign') || '').trim().slice(0,100);
  const amount = Number(form.get('amount'));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !source || !campaign || !Number.isFinite(amount)
      || amount < 0 || amount > 9999999999.99) throw new Error('Gasto inválido');
  const result = await supabase.from('sales_campaign_spend').upsert({ month: `${month}-01`, source, campaign,
    amount, updated_by: user.id }, { onConflict: 'month,source,campaign' });
  if (result.error) throw new Error('No se pudo guardar el gasto');
  revalidatePath('/'); revalidatePath('/campanas');
}
