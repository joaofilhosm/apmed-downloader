import { NextRequest, NextResponse } from 'next/server';
import {
  obterSessao,
  obterTokenLeitura,
  contarPaginas,
  baixarPagina,
  listarMateriais,
  ApmedError,
} from '@/lib/apmed';
import { gerarPdf, nomeArquivo } from '@/lib/pdf';

// Materiais grandes podem levar tempo. Limite do plano Hobby: 300s.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Numero maximo de paginas por requisicao (protege memoria da funcao). */
const MAX_PAGINAS = 120;

/** Descanso entre paginas, em ms. */
const INTERVALO_MS = 150;

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
      // Descobre o total testando paginas.
      for (let p = 1; p <= MAX_PAGINAS; p++) {
        try {
          await baixarPagina(sessao.cookie, materialId, p, token);
          total = p;
        } catch {
          break;
        }
        await dormir(INTERVALO_MS);
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

    const paginas: { buffer: Buffer }[] = [];
    for (let p = 1; p <= total; p++) {
      const buffer = await baixarPagina(sessao.cookie, materialId, p, token);
      paginas.push({ buffer });
      if (p < total) await dormir(INTERVALO_MS);
    }

    const pdf = await gerarPdf(paginas);

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

function dormir(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
