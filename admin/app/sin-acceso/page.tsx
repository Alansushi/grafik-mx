import { logout } from '../actions';
export default function NoAccess() { return <main className="auth"><div className="auth-card"><h1>Sin acceso</h1>
  <p>Esta cuenta no está autorizada para ver las ventas de GRAFIK.</p><form action={logout}><button>Cerrar sesión</button></form>
  </div></main>; }
