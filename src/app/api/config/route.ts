import { NextResponse } from 'next/server';
import { diasDeValidade } from '@/lib/licenca';
import { MINUTOS_PIX, modoPagamento } from '@/lib/mercadopago';
import { FAIXAS, MAX_ITENS_PEDIDO, PRECO_BASE } from '@/lib/precos';

export const dynamic = 'force-dynamic';

/** GET /api/config - parametros publicos que a interface exibe. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    pagamento: modoPagamento(),
    precoBase: PRECO_BASE,
    faixas: FAIXAS,
    maxItens: MAX_ITENS_PEDIDO,
    diasLicenca: diasDeValidade(),
    minutosPix: MINUTOS_PIX,
  });
}
