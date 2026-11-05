import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';

// Uma familia so: o eixo de largura (wdth) separa titulos expandidos da interface.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--fonte',
});

export const metadata: Metadata = {
  title: 'APMED Downloader',
  description:
    'Baixe os materiais de estudo da sua conta APMED em PDF. Pagamento por Pix com desconto progressivo.',
  applicationName: 'APMED Downloader',
  robots: { index: false, follow: false },
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%232E6B5E'/%3E%3Cpath d='M7 6h8a2 2 0 0 1 2 2v10H9a2 2 0 0 1-2-2V6Z' fill='white'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F7F6' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1B1E' },
  ],
};

// Aplica o tema salvo antes da primeira pintura (evita "piscar" claro no modo escuro).
const scriptTema = `try{var t=JSON.parse(localStorage.getItem('apmed:tema')||'"sistema"');if(t==='escuro')document.documentElement.setAttribute('data-theme','dark');else if(t==='claro')document.documentElement.setAttribute('data-theme','light');}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
