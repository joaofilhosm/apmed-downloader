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

/** Paginas por parte. 12 partes cabem bem em 60s mesmo com rede lenta. */
const PAGINAS_POR_PARTE = 12;

/** Numero de partes por requisicao. */
const PARTES_POR_DOWNLOAD = 3;

function erro(mensagem: string, status = 500) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * GET /api/pdf/manifesto?sessaoId=...&materialId=...
 *
 * Descobre o total REAL de paginas do material e devolve o plano de
 * download (quantas partes, com quais paginas).
 *
 * Por que existe: materiais grandes (100+ paginas) nao cabem em uma
 * unica funcao serverless da Vercel (limite de 300s e 1 GB de memoria).
 * Com o manifesto, o navegador baixa partes em paralelo e monta o PDF
 * no proprio cliente - cada parte cabe confortavelmente no limite.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sessaoId = params.get('sessaoId') || '';
  const materialId = Number(params.get('materialId'));

  if (!materialId || Number.isNaN(materialId)) {
    return erro('Material invalido.', 400);
  }

  const sessao = obterSessao(sessaoId);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  try {
    const materiais = await listarMateriais(sessao.cookie);
    const material = materiais.find((m) => m.id === materialId);
    if (!material) {
      return erro('Este material nao esta disponivel na sua conta.', 404);
    }

    const token = await obterTokenLeitura(sessao.cookie, materialId);
    limparCachePaginas(materialId);

    const total = await contarPaginas(
      sessao.cookie,
      materialId,
      token,
      MAX_PAGINAS,
      5,
    );

    if (total <= 0) {
      return erro('Nao foi possivel ler as paginas deste material.', 502);
    }

    // Monta o plano: grupos de PAGINAS_POR_PARTE.
    const partes: { indice: number; de: number; ate: number }[] = [];
    for (let inicio = 1; inicio <= total; inicio += PAGINAS_POR_PARTE) {
      const fim = Math.min(inicio + PAGINAS_POR_PARTE - 1, total);
      partes.push({ indice: partes.length, de: inicio, ate: fim });
    }

    return NextResponse.json({
      ok: true,
      materialId,
      titulo: material.titulo,
      instituicao: material.instituicao,
      totalPaginas: total,
      paginasPorParte: PAGINAS_POR_PARTE,
      partesPorDownload: PARTES_POR_DOWNLOAD,
      partes,
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[apmed] erro no manifesto:', e instanceof Error ? e.message : e);
    return erro('Erro ao preparar o download. Tente novamente.', 500);
  }
}
