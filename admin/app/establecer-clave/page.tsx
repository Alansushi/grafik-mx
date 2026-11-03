import { redirect } from 'next/navigation';
import { adminClient } from '@/lib/session';
import { setPassword } from '../actions';

export default async function Password({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const sb=await adminClient();
  const {data:{user}}=await sb.auth.getUser();
  if(!user) redirect('/login');
  const {error}=await searchParams;
  return <main className="auth"><div className="auth-card"><p className="eyebrow">PRIMER ACCESO</p><h1>Crea tu contraseña</h1>
    <p>Usa al menos 12 caracteres. Después configurarás el código de tu aplicación autenticadora.</p>
    {error && <p className="error" role="alert">No se pudo guardar. Revisa la contraseña e inténtalo de nuevo.</p>}
    <form action={setPassword}><label>Contraseña<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
      <button>Guardar contraseña</button></form></div></main>;
}
