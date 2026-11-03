import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { logout } from '../actions';

export default async function PrivateLayout({ children }: {children: React.ReactNode}) {
  await requireAdmin();
  return <div className="shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">◉</span> GRAFIK<span className="brand-sub">VENTAS</span></div>
    <nav aria-label="Panel"><Link href="/">Resumen</Link><Link href="/oportunidades">Oportunidades</Link>
      <Link href="/campanas">Campañas</Link><Link href="/historico">Histórico</Link><Link href="/actividad">Actividad</Link></nav>
    <form action={logout}><button className="logout">Cerrar sesión</button></form></aside>
    <main className="content">{children}</main></div>;
}
