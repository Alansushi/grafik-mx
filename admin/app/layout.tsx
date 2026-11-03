import './style.css';
import { headers } from 'next/headers';
export const metadata = { title: 'GRAFIK · Ventas', robots: { index: false, follow: false } };
export default async function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  await headers(); // nonce de CSP y render por petición también en las rutas de acceso
  return <html lang="es"><body>{children}</body></html>;
}
