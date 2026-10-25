import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import {
  obterSessao,
  obterTokenLeitura,
  contarPaginas,
  baixarPaginas,
  listarMateriais,
  ApmedError,
} from '@/lib/apmed';
import { gerarPdf, nomeArquivo } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

/** Limite de paginas somadas (memoria da funcao serverless). */
const MAX_PAGINAS_TOTAL = 150;
/** Quantidade maxima de materiais num unico ZIP. */
const MAX_MATERIAIS = 12;
/** Paginas baixadas em paralelo. */
const CONCORRENCIA = 3;

function erro(mensagem: string, status = 500) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * POST /api/zip
 * Body: { sessaoId, materialIds: number[] }
 * Gera um ZIP com um PDF por material selecionado.
 */
export async function POST(req: NextRequest) {
  let body: { sessaoId?: string; materialIds?: number[] };
  try {
    body = await req.json();
  } catch {
    return erro('Requisicao invalida.', 400);
  }

  const sessaoId = body.sessaoId || '';
  const ids = (body.materialIds || []).map(Number).filter((n) => Number.isFinite(n));

  if (!ids.length) return erro('Selecione ao menos um material.', 400);
  if (ids.length > MAX_MATERIAIS) {
    return erro(`Selecione no maximo ${MAX_MATERIAIS} materiais por vez.`, 400);
  }

  const sessao = obterSessao(sessaoId);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  try {
    const disponiveis = await listarMateriais(sessao.cookie);
    const permitidos = new Set(disponiveis.map((m) => m.id));

    const selecionados = ids.filter((id) => permitidos.has(id));
    if (!selecionados.length) {
      return erro('Nenhum dos materiais selecionados pertence a sua conta.', 404);
    }

    const zip = new JSZip();
    let paginasUsadas = 0;
    const avisos: string[] = [];

    for (const id of selecionados) {
      const material = disponiveis.find((m) => m.id === id)!;
      try {
        const token = await obterTokenLeitura(sessao.cookie, id);
        const total = await contarPaginas(sessao.cookie, id);

        if (total <= 0) {
          avisos.push(`${material.titulo}: nao foi possivel ler as paginas.`);
          continue;
        }
        if (paginasUsadas + total > MAX_PAGINAS_TOTAL) {
          avisos.push(
            `${material.titulo}: pulado (limite de ${MAX_PAGINAS_TOTAL} paginas por ZIP).`,
          );
          continue;
        }

        const indices = Array.from({ length: total }, (_, i) => i + 1);
        const buffers = await baixarPaginas(
          sessao.cookie,
          id,
          indices,
          token,
          2400,
          CONCORRENCIA,
        );
        paginasUsadas += total;

        const pdf = await gerarPdf(buffers.map((buffer) => ({ buffer })));
        zip.file(nomeArquivo(material.titulo, 'pdf'), pdf);
      } catch (e) {
        avisos.push(
          `${material.titulo}: ${e instanceof Error ? e.message : 'erro ao processar'}`,
        );
      }
    }

    const arquivos = zip.file(/.*/);
    if (!arquivos || arquivos.length === 0) {
      return erro(
        avisos.length
          ? `Nenhum material pode ser gerado. ${avisos.join(' ')}`
          : 'Nao foi possivel gerar o ZIP.',
        502,
      );
    }

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(buffer.length),
        'Content-Disposition': 'attachment; filename="materiais_apmed.zip"',
        'Cache-Control': 'no-store',
        ...(avisos.length ? { 'X-Avisos': avisos.join(' | ').slice(0, 900) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[apmed] erro ao gerar ZIP:', e instanceof Error ? e.message : e);
    return erro('Erro inesperado ao montar o ZIP. Tente novamente.', 500);
  }
}
