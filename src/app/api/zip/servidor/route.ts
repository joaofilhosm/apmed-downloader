import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
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

/** Maximo de paginas somadas (memoria da funcao serverless). */
const MAX_PAGINAS_TOTAL = 120;

/** Maximo de materiais por ZIP. */
const MAX_MATERIAIS = 3;

function erro(mensagem: string, status = 500) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * POST /api/zip/servidor
 * Body: { sessaoId, materialIds: number[], incluirPngs?: boolean, slug?: string }
 *
 * Monta o ZIP no servidor. Util quando o volume e pequeno (o navegador
 * consegue com volumes grandes, mas este caminho e mais simples e rapido
 * para poucos materiais).
 *
 * Com `incluirPngs`, cada material tambem recebe uma pasta com as paginas
 * originais em PNG.
 */
export async function POST(req: NextRequest) {
  let body: {
    sessaoId?: string;
    materialIds?: number[];
    incluirPngs?: boolean;
    slug?: string;
  };
  try {
    body = await req.json();
  } catch {
    return erro('Requisicao invalida.', 400);
  }

  const sessaoId = body.sessaoId || '';
  const incluirPngs = body.incluirPngs === true;
  const slug = (body.slug || '').toLowerCase().trim();

  let ids = (body.materialIds || []).map(Number).filter((n) => Number.isFinite(n));

  const sessao = obterSessao(sessaoId);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  try {
    const disponiveis = await listarMateriais(sessao.cookie);
    const permitidos = new Set(disponiveis.map((m) => m.id));

    // Se veio um slug, baixa TODOS os materiais da instituicao.
    if (slug) {
      ids = disponiveis.filter((m) => m.slug === slug).map((m) => m.id);
      if (ids.length === 0) {
        return erro('Nenhum material encontrado para esta instituicao.', 404);
      }
    }

    if (!ids.length) return erro('Selecione ao menos um material.', 400);

    const selecionados = ids.filter((id) => permitidos.has(id));
    if (!selecionados.length) {
      return erro('Nenhum dos materiais selecionados pertence a sua conta.', 404);
    }
    if (selecionados.length > MAX_MATERIAIS) {
      return erro(
        `Este metodo aceita no maximo ${MAX_MATERIAIS} materiais por vez. ` +
          `Para mais, use o download no navegador.`,
        400,
      );
    }

    const zip = new JSZip();
    let paginasUsadas = 0;
    const avisos: string[] = [];

    for (const id of selecionados) {
      const material = disponiveis.find((m) => m.id === id)!;
      try {
        const token = await obterTokenLeitura(sessao.cookie, id);
        limparCachePaginas(id);

        const total = await contarPaginas(sessao.cookie, id, token, MAX_PAGINAS_TOTAL, 5);

        if (total <= 0) {
          avisos.push(`${material.titulo}: nao foi possivel ler as paginas.`);
          continue;
        }
        if (paginasUsadas + total > MAX_PAGINAS_TOTAL) {
          avisos.push(
            `${material.titulo}: pulado (limite de ${MAX_PAGINAS_TOTAL} paginas).`,
          );
          continue;
        }

        const construtor = await ConstrutorPdf.criar();
        const pngs: { pagina: number; bytes: Buffer }[] = [];

        for (let p = 1; p <= total; p++) {
          const buffer = await baixarPagina(sessao.cookie, id, p, token);
          await construtor.adicionar(buffer);
          if (incluirPngs) {
            pngs.push({ pagina: p, bytes: buffer });
          }
        }
        paginasUsadas += total;

        const pdf = await construtor.finalizar(material.titulo);
        const nomeBase = nomeArquivo(material.titulo, 'pdf').replace(/\.pdf$/, '');
        zip.file(`${nomeBase}.pdf`, pdf);

        if (incluirPngs && pngs.length) {
          const pasta = zip.folder(`${nomeBase}_imagens`);
          if (pasta) {
            for (const p of pngs) {
              pasta.file(`pagina_${String(p.pagina).padStart(3, '0')}.png`, p.bytes);
            }
          }
        }
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
      compressionOptions: { level: 4 },
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
    console.error('[apmed] erro ao gerar ZIP no servidor:', e instanceof Error ? e.message : e);
    return erro('Erro inesperado ao montar o ZIP. Tente novamente.', 500);
  }
}
