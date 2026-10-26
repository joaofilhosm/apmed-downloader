import { NextRequest, NextResponse } from 'next/server';
import {
  obterSessao,
  obterTokenLeitura,
  contarPaginas,
  listarMateriais,
  limparCachePaginas,
  ApmedError,
} from '@/lib/apmed';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Total maximo de paginas por material. */
const MAX_PAGINAS = 300;

/** Paginas por parte. */
const PAGINAS_POR_PARTE = 12;

function erro(mensagem: string, status = 500) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * GET /api/instituicao/manifesto?sessaoId=...&slug=unicamp
 *
 * Monta o plano de download de TODOS os materiais de uma instituicao.
 *
 * Cada material tem seu proprio total de paginas (a API oficial do APMED
 * reporta um `last_page` desatualizado, entao Discovermos o valor real).
 * O plano traz, para cada material, as partes a baixar.
 *
 * A montagem final do ZIP acontece no navegador, entao nao ha limite de
 * tempo nem de memoria no servidor.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sessaoId = params.get('sessaoId') || '';
  const slug = (params.get('slug') || '').toLowerCase().trim();

  if (!slug) return erro('Informe a instituicao desejada.', 400);

  const sessao = obterSessao(sessaoId);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  try {
    const materiais = await listarMateriais(sessao.cookie);
    const daInstituicao = materiais.filter((m) => m.slug === slug);

    if (daInstituicao.length === 0) {
      return erro('Nenhum material encontrado para esta instituicao.', 404);
    }

    // Descobre o total real de paginas de cada material.
    const itens: {
      materialId: number;
      titulo: string;
      totalPaginas: number;
      partes: { indice: number; de: number; ate: number }[];
    }[] = [];

    const avisos: string[] = [];

    for (const material of daInstituicao) {
      try {
        const token = await obterTokenLeitura(sessao.cookie, material.id);
        limparCachePaginas(material.id);

        const total = await contarPaginas(
          sessao.cookie,
          material.id,
          token,
          MAX_PAGINAS,
          5,
        );

        if (total <= 0) {
          avisos.push(`${material.titulo}: nao foi possivel ler as paginas.`);
          continue;
        }

        const partes: { indice: number; de: number; ate: number }[] = [];
        for (let inicio = 1; inicio <= total; inicio += PAGINAS_POR_PARTE) {
          const fim = Math.min(inicio + PAGINAS_POR_PARTE - 1, total);
          partes.push({ indice: partes.length, de: inicio, ate: fim });
        }

        itens.push({
          materialId: material.id,
          titulo: material.titulo,
          totalPaginas: total,
          partes,
        });
      } catch (e) {
        avisos.push(
          `${material.titulo}: ${e instanceof Error ? e.message : 'erro ao processar'}`,
        );
      }
    }

    if (itens.length === 0) {
      return erro(
        avisos.length
          ? `Nenhum material pode ser preparado. ${avisos.join(' ')}`
          : 'Nenhum material encontrado para esta instituicao.',
        404,
      );
    }

    const totalPaginas = itens.reduce((s, i) => s + i.totalPaginas, 0);
    const totalPartes = itens.reduce((s, i) => s + i.partes.length, 0);

    return NextResponse.json({
      ok: true,
      slug,
      instituicao: daInstituicao[0].instituicao,
      materiais: itens,
      totalMateriais: itens.length,
      totalPaginas,
      totalPartes,
      paginasPorParte: PAGINAS_POR_PARTE,
      avisos,
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[apmed] erro no manifesto da instituicao:', e instanceof Error ? e.message : e);
    return erro('Erro ao preparar o download. Tente novamente.', 500);
  }
}
