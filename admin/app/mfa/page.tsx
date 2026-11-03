import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/session';
import { verifyMfa } from '../actions';

export default async function Mfa({ searchParams }: { searchParams: Promise<{error?: string}> }) {
  const sb = await adminClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const factors = await sb.auth.mfa.listFactors();
  if (factors.error) throw new Error('No se pudieron consultar factores');
  const verified = factors.data.totp.find(f => f.status === 'verified');
  const enrollment = verified ? null : await sb.auth.mfa.enroll({ factorType: 'totp' });
  if (enrollment?.error) throw new Error('No se pudo iniciar MFA');
  const factorId = verified?.id || enrollment?.data.id;
  const { error } = await searchParams;
  return <main className="auth"><div className="auth-card"><p className="eyebrow">SEGUNDO FACTOR</p>
    <h1>{verified ? 'Código de tu aplicación' : 'Configura tu aplicación'}</h1>
    {!verified && enrollment?.data && <><p>Escanea el código con tu aplicación autenticadora.</p>
      <img className="qr" src={`data:image/svg+xml;base64,${Buffer.from(enrollment.data.totp.qr_code).toString('base64')}`} alt="Código QR para configurar autenticación" />
      <p className="secret">Clave manual: <code>{enrollment.data.totp.secret}</code></p></>}
    {error && <p className="error" role="alert">Código inválido o vencido. Inténtalo de nuevo.</p>}
    <form action={verifyMfa}><input type="hidden" name="factorId" value={factorId} />
      <label>Código de 6 dígitos<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required /></label>
      <button type="submit">Verificar y entrar</button></form></div></main>;
}
