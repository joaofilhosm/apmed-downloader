/**
 * Utilidades comuns das rotas da API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { obterSessao, type Sessao } from './apmed';

export function erro(mensagem: string, status = 500, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, erro: mensagem, ...extra }, { status });
}

export function ipDe(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'desconhecido'
  );
}

/* ------------------------------------------------------------------ */
/* Rate limit (janela deslizante, por instancia)                       */
/* ------------------------------------------------------------------ */

const baldes = new Map<string, number[]>();

/**
 * Retorna true se a chave passou do limite na janela.
 * Em serverless o limite vale por instancia - e uma barreira contra abuso
 * casual, nao um controle rigido.
 */
export function excedeuLimite(chave: string, limite: number, janelaMs: number): boolean {
  const agora = Date.now();
  const lista = (baldes.get(chave) || []).filter((t) => agora - t < janelaMs);
  lista.push(agora);
  baldes.set(chave, lista);

  // Faxina ocasional para o Map nao crescer sem limite.
  if (baldes.size > 5000) {
    for (const [k, v] of baldes) {
      if (!v.some((t) => agora - t < janelaMs)) baldes.delete(k);
    }
  }
  return lista.length > limite;
}

/* ------------------------------------------------------------------ */
/* Sessao e licencas vindas do navegador                               */
/* ------------------------------------------------------------------ */

/**
 * Le a sessao do cabecalho `x-sessao` (preferido, nao aparece em logs de
 * URL) ou, por compatibilidade, do parametro `sessaoId`.
 */
export function sessaoDe(req: NextRequest): Sessao | null {
  const token =
    req.headers.get('x-sessao') || req.nextUrl.searchParams.get('sessaoId') || '';
  return obterSessao(token);
}

/** Licencas enviadas no cabecalho `x-licencas`, separadas por espaco. */
export function licencasDe(req: NextRequest): string[] {
  return (req.headers.get('x-licencas') || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function inteiroPositivo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 && n < 1e9 ? n : null;
}
