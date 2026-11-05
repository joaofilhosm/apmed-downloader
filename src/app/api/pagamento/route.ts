import { NextRequest, NextResponse } from 'next/server';
import { listarMateriais, ApmedError } from '@/lib/apmed';
import { erro, excedeuLimite, licencasDe, sessaoDe } from '@/lib/http';
import { licencaCobre } from '@/lib/licenca';
import { criarCheckout, criarPix, modoPagamento, PagamentoError } from '@/lib/mercadopago';
import { calcularOrcamento, MAX_ITENS_PEDIDO } from '@/lib/precos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_VALIDO = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/**
 * POST /api/pagamento   (cabecalhos x-sessao e x-licencas)
 * Body: { materialIds: number[], email: string, metodo?: 'pix' | 'cartao' }
 *
 * Cria a cobranca do carrinho: Pix (QR Code na propria pagina) ou cartao
 * (Checkout Pro, na pagina do Mercado Pago). O valor e SEMPRE calculado aqui, a
 * partir da quantidade de materiais validos - nunca vem do navegador.
 */
export async function POST(req: NextRequest) {
  const sessao = sessaoDe(req);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  if (excedeuLimite(`pix:${sessao.conta}`, 10, 10 * 60 * 1000)) {
    return erro('Voce gerou muitos Pix seguidos. Aguarde alguns minutos.', 429);
  }

  let body: { materialIds?: unknown; email?: unknown; metodo?: unknown };
  try {
    body = await req.json();
  } catch {
    return erro('Requisicao invalida.', 400);
  }

  const email = String(body.email || '').trim();
  if (!EMAIL_VALIDO.test(email)) {
    return erro('Informe um e-mail valido para o comprovante do Pix.', 400);
  }

  const ids = Array.isArray(body.materialIds)
    ? [...new Set(body.materialIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
  if (ids.length === 0) return erro('Seu carrinho esta vazio.', 400);
  if (ids.length > MAX_ITENS_PEDIDO) {
    return erro(`Cada pedido pode ter no maximo ${MAX_ITENS_PEDIDO} materiais.`, 400);
  }

  try {
    const materiais = await listarMateriais(sessao.cookie);
    const daConta = new Map(materiais.map((m) => [m.id, m]));

    const invalidos = ids.filter((id) => !daConta.has(id));
    if (invalidos.length) {
      return erro('Alguns materiais do carrinho nao estao mais disponiveis na sua conta.', 409, {
        invalidos,
      });
    }

    // Nao cobra de novo o que ja tem licenca valida.
    const licencas = licencasDe(req);
    const jaPagos = ids.filter((id) => licencaCobre(licencas, sessao.conta, id));
    const cobrar = ids.filter((id) => !jaPagos.includes(id));
    if (cobrar.length === 0) {
      return erro('Voce ja tem acesso a todos esses materiais. E so baixar!', 409, { jaPagos });
    }

    const orcamento = calcularOrcamento(cobrar.length);
    const titulos = cobrar.map((id) => daConta.get(id)!.titulo);
    const descricao =
      cobrar.length === 1
        ? `APMED Downloader - ${titulos[0]}`
        : `APMED Downloader - ${cobrar.length} materiais`;

    const origem = (process.env.APP_URL || '').replace(/\/$/, '');
    const pedido = {
      valor: orcamento.total,
      descricao,
      email,
      conta: sessao.conta,
      materiais: cobrar,
      urlNotificacao: origem.startsWith('https://') ? `${origem}/api/pagamento/webhook` : undefined,
    };

    // Cartao usa o Checkout Pro. No modo simulado cai no Pix simulado.
    if (body.metodo === 'cartao' && modoPagamento() === 'mercadopago') {
      // Volta para o mesmo endereco em que o usuario esta (prevista, local ou producao).
      const urlRetorno = `${req.nextUrl.origin}/?retorno=mercadopago`;
      const checkout = await criarCheckout({ ...pedido, titulos, urlRetorno });
      return NextResponse.json({
        ok: true,
        checkout,
        materialIds: cobrar,
        jaPagos,
        orcamento,
      });
    }

    const pix = await criarPix(pedido);

    return NextResponse.json({
      ok: true,
      pagamento: pix,
      materialIds: cobrar,
      jaPagos,
      orcamento,
    });
  } catch (e) {
    if (e instanceof ApmedError || e instanceof PagamentoError) return erro(e.message, e.status);
    console.error('[pagamento] erro ao criar:', e instanceof Error ? e.message : e);
    return erro('Nao foi possivel gerar o Pix agora. Tente novamente.', 500);
  }
}
