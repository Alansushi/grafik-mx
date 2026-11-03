import { login } from '../actions';
export default async function Login({ searchParams }: { searchParams: Promise<{error?: string}> }) {
  const { error } = await searchParams;
  return <main className="auth"><div className="auth-card"><p className="eyebrow">GRAFIK · ADMINISTRACIÓN</p>
    <h1>Acceso privado</h1><p>Inicia sesión con la cuenta invitada.</p>
    {error && <p className="error" role="alert">Revisa tu correo y contraseña.</p>}
    <form action={login}><label>Correo<input name="email" type="email" autoComplete="username" required /></label>
      <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
      <button type="submit">Continuar</button></form></div></main>;
}
