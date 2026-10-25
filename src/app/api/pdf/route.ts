import { NextRequest, NextResponse } from 'next/server';
import {
  obterSessao,
  obterTokenLeitura,
  contarPaginas,
  baixarPagina,
  baixarPaginas,
  listarMateriais,
  ApmedError,
} from '@/lib/apmed';
import { gerarPdf, nomeArquivo } from '@/lib/pdf';

// A Vercel exige maxDuration entre 1 e 60 para Serverless Functions.
// Em planos com Fluid compute, 60s e o maximo aceito no schema atual.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Numero maximo de paginas por requisicao (protege memoria da funcao). */
const MAX_PAGINAS = 120;

/** Quantidade de paginas baixadas em paralelo. */
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
    let total = await contarPaginas(sessao.cookie, materialId);

    if (total <= 0) {
      // Descobre o total testando paginas (em pequenos blocos).
      const teste = await baixarPaginas(sessao.cookie, materialId, [1, 2, 3], token);
      total = teste.length;
      while (total < MAX_PAGINAS) {
        const prox = total + 1;
        try {
          await baixarPagina(sessao.cookie, materialId, prox, token);
          total = prox;
        } catch {
          break;
        }
      }
    }

    if (total <= 0) {
      return erro('Nao foi possivel ler as paginas deste material.', 502);
    }
    if (total > MAX_PAGINAS) {
      return erro(
        `Este material tem ${total} paginas, acima do limite por download. ` +
          `Fale com o suporte para materiais maiores.`,
        413,
      );
    }

    // Baixa todas as paginas em paralelo (3 por vez).
    const indices = Array.from({ length: total }, (_, i) => i + 1);
    const buffers = await baixarPaginas(
      sessao.cookie,
      materialId,
      indices,
      token,
      2400,
      CONCORRENCIA,
    );

    const pdf = await gerarPdf(buffers.map((buffer) => ({ buffer })));

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
