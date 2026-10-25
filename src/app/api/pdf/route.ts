import { NextRequest, NextResponse } from 'next/server';
import {
  obterSessao,
  obterTokenLeitura,
  contarPaginas,
  baixarPagina,
  listarMateriais,
  limparCachePaginas,
  ApmedError,
} from '@/lib/apmed';
import { ConstrutorPdf, nomeArquivo } from '@/lib/pdf';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Numero maximo de paginas por requisicao. */
const MAX_PAGINAS = 200;

/** Paginas processadas em paralelo durante a varredura. */
const CONCORRENCIA = 3;

function erro(mensagem: string, status = 500) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * GET /api/pdf?sessaoId=...&materialId=...
 * Baixa as paginas do material, monta o PDF e devolve para download.
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
    // Confere que o material pertence de fato a este aluno.
    const materiais = await listarMateriais(sessao.cookie);
    const material = materiais.find((m) => m.id === materialId);
    if (!material) {
      return erro('Este material nao esta disponivel na sua conta.', 404);
    }

    const token = await obterTokenLeitura(sessao.cookie, materialId);
    limparCachePaginas(materialId);

    // Varredura real: a API oficial do APMED reporta last_page desatualizado
    // (o progresso de leitura do aluno), entao Discovermos o total de verdade.
    const total = await contarPaginas(
      sessao.cookie,
      materialId,
      token,
      MAX_PAGINAS,
      CONCORRENCIA,
    );

    if (total <= 0) {
      return erro('Nao foi possivel ler as paginas deste material.', 502);
    }

    // Monta o PDF pagina a pagina: cada imagem e convertida para JPEG e
    // liberada em seguida, para nao estourar a memoria da funcao.
    const construtor = await ConstrutorPdf.criar();
    for (let p = 1; p <= total; p++) {
      const buffer = await baixarPagina(sessao.cookie, materialId, p, token);
      await construtor.adicionar(buffer);
    }

    const pdf = await construtor.finalizar(material.titulo);

    const nome = nomeArquivo(material.titulo, 'pdf');
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
        'Content-Disposition': `attachment; filename="${nome}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[apmed] erro ao gerar PDF:', e instanceof Error ? e.message : e);
    return erro('Erro inesperado ao montar o PDF. Tente novamente.', 500);
  }
}
