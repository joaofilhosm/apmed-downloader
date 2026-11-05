import type { Metadata } from 'next';
import { Atendimento } from '@/components/Atendimento';

export const metadata: Metadata = {
  title: 'Atendimento - APMED Downloader',
  robots: { index: false, follow: false },
};

export default function Pagina() {
  return <Atendimento />;
}
