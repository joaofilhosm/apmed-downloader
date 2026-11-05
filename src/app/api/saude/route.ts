import { NextResponse } from 'next/server';
import { modoPagamento } from '@/lib/mercadopago';

export const dynamic = 'force-dynamic';

/** GET /api/saude - verificacao simples para monitoramento (uptime). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    pagamento: modoPagamento(),
    segredoConfigurado: (process.env.APMED_SESSION_SECRET || '').length >= 16,
    hora: new Date().toISOString(),
  });
}
