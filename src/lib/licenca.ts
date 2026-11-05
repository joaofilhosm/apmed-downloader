/**
 * Licencas de download.
 *
 * Depois que o Mercado Pago confirma o Pix, o servidor emite uma licenca
 * assinada com:
 *  - c: id anonimo da conta APMED que pagou
 *  - m: ids dos materiais liberados
 *  - p: id do pagamento no Mercado Pago (para suporte/estorno)
 *  - e: expiracao
 *
 * A licenca fica no navegador do usuario. Toda rota de download confere a
 * assinatura, a validade, a conta e se o material pedido esta na licenca.
 */

import { assinarToken, lerToken } from './tokens';

const PROPOSITO = 'licenca.v1';

/** Por quantos dias o usuario pode baixar de novo o que pagou. */
export function diasDeValidade(): number {
  const n = Number(process.env.LICENCA_DIAS || 7);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : 7;
}

export type DadosLicenca = {
  c: string;
  m: number[];
  p: string;
  e: number;
};

export function emitirLicenca(
  conta: string,
  materiais: number[],
  pagamentoId: string,
  agora = Date.now(),
  chave?: string,
): { token: string; expiraEm: number } {
  const e = agora + diasDeValidade() * 24 * 60 * 60 * 1000;
  const m = [...new Set(materiais)].sort((a, b) => a - b);
  return { token: assinarToken(PROPOSITO, { c: conta, m, p: pagamentoId, e }, chave), expiraEm: e };
}

export function lerLicenca(token: string, chave?: string, agora?: number): DadosLicenca | null {
  const dados = lerToken<DadosLicenca>(PROPOSITO, token, chave, agora);
  if (!dados || typeof dados.c !== 'string' || !Array.isArray(dados.m)) return null;
  return dados;
}

/**
 * Confere se alguma das licencas apresentadas libera o material para a conta.
 * Aceita varias licencas (o usuario pode ter feito mais de um pedido).
 */
export function licencaCobre(
  tokens: string[],
  conta: string,
  materialId: number,
  chave?: string,
  agora?: number,
): boolean {
  for (const t of tokens.slice(0, 50)) {
    const l = lerLicenca(t, chave, agora);
    if (l && l.c === conta && l.m.includes(materialId)) return true;
  }
  return false;
}
