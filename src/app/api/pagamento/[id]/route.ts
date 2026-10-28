import { NextRequest, NextResponse } from 'next/server';
import { erro, excedeuLimite, sessaoDe } from '@/lib/http';
import { emitirLicenca } from '@/lib/licenca';
import {
  consultarPagamento,
  pagamentoAprovado,
  pagamentoEncerrado,
  PagamentoError,
} from '@/lib/mercadopago';
import { calcularOrcamento } from '@/lib/precos';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/pagamento/:id   (cabecalho x-sessao)
 *
 * Consulta o status no Mercado Pago. Quando aprovado, devolve a licenca
 * assinada que libera o download dos materiais daquele pagamento.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sessao = sessaoDe(req);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  if (excedeuLimite(`status:${sessao.conta}`, 120, 5 * 60 * 1000)) {
    return erro('Muitas consultas seguidas. Aguarde um instante.', 429);
  }

  const { id } = await ctx.params;

  try {
    const pagamento = await consultarPagamento(decodeURIComponent(id));

    // O pagamento precisa ser da mesma conta APMED que esta logada.
    if (!pagamento.conta || pagamento.conta !== sessao.conta) {
      return erro('Este pagamento pertence a outra conta.', 403);
    }

    const aprovado = pagamentoAprovado(pagamento.status);
    let licenca: { token: string; expiraEm: number } | null = null;

    if (aprovado) {
      const esperado = calcularOrcamento(pagamento.materiais.length).total;
      if (pagamento.materiais.length === 0 || pagamento.valor < esperado) {
        console.error('[pagamento] valor divergente', pagamento.id, pagamento.valor, esperado);
        return erro('Pagamento com valor divergente. Fale com o suporte.', 409);
      }
      licenca = emitirLicenca(sessao.conta, pagamento.materiais, pagamento.id);
    }

    return NextResponse.json({
      ok: true,
      id: pagamento.id,
      status: pagamento.status,
      aprovado,
      encerrado: pagamentoEncerrado(pagamento.status),
      materialIds: pagamento.materiais,
      valor: pagamento.valor,
      licenca,
    });
  } catch (e) {
    if (e instanceof PagamentoError) return erro(e.message, e.status);
    console.error('[pagamento] erro ao consultar:', e instanceof Error ? e.message : e);
    return erro('Nao foi possivel consultar o pagamento.', 500);
  }
}
