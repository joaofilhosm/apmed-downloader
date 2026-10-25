import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'APMED Downloader - Baixe seus materiais',
  description:
    'Baixe os materiais de estudo do portal APMED em PDF, de forma simples e rapida.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
