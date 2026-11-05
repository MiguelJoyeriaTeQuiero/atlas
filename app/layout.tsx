import type { Metadata } from 'next';
import './globals.css';
import './native.css';
import './operations.css';
import './jobs.css';
import './theme.css';
export const metadata: Metadata = {
  title: 'ATLAS · Automatización y mejora operativa',
  description: 'Diagnóstico, prioridades y resultados medidos de Joyería Te Quiero y Te Quiero Metales.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es" data-theme="system" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('atlas-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:'system'}catch(e){}" }} /></head><body>{children}</body></html>;
}
