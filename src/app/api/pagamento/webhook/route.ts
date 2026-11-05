import { NextRequest, NextResponse } from 'next/server';
import { consultarPagamento, validarAssinaturaWebhook } from '@/lib/mercadopago';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST /api/pagamento/webhook
 *
 * Notificacao do Mercado Pago. O app e stateless: quem libera o download
 * e a consulta direta ao Mercado Pago em /api/pagamento/:id. O webhook
 * serve para auditoria (log do status) e para o painel do Mercado Pago
 * marcar a notificacao como entregue.
 *
 * Com MERCADOPAGO_WEBHOOK_SECRET definido, notificacoes sem assinatura
 * valida sao recusadas.
 */
export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  let corpo: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try {
    corpo = await req.json();
  } catch {
    // corpo vazio e aceitavel (algumas notificacoes vem so pela query)
  }

  const dataId = String(params.get('data.id') || corpo.data?.id || '');
  const tipo = params.get('type') || corpo.type || '';

  if (process.env.MERCADOPAGO_WEBHOOK_SECRET) {
    const valido = validarAssinaturaWebhook(
      req.headers.get('x-signature'),
      req.headers.get('x-request-id'),
      dataId,
    );
    if (!valido) return NextResponse.json({ ok: false }, { status: 401 });
  }

  if (tipo === 'payment' && /^\d{1,20}$/.test(dataId)) {
    try {
      const p = await consultarPagamento(dataId);
      console.info('[webhook] pagamento', p.id, p.status, p.materiais.length, 'itens');
    } catch (e) {
      console.error('[webhook] falha ao consultar', dataId, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true });
}
