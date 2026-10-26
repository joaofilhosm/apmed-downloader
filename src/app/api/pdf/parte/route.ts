import { NextRequest, NextResponse } from 'next/server';
import {
  obterSessao,
  obterTokenLeitura,
  baixarPagina,
  listarMateriais,
  ApmedError,
} from '@/lib/apmed';
import { prepararPaginaJpeg } from '@/lib/imagem';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Maximo de paginas por parte. */
const MAX_POR_PARTE = 20;

function erro(mensagem: string, status = 500) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * GET /api/pdf/parte?sessaoId=...&materialId=...&de=N&ate=M[&formato=jpg|png]
 *
 * Baixa as paginas N..M do material e devolve as imagens, empacotadas em
 * JSON (base64) para o navegador montar o PDF.
 *
 * `formato=jpg` (padrao): imagens reescaladas para JPEG 1700px, que sao
 * leves e足以 para montar o PDF.
 *
 * `formato=png`: devolve o PNG ORIGINAL do portal (2400px), usado quando o
 * usuario quer tambem os arquivos de imagem originais junto com o PDF.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const sessaoId = params.get('sessaoId') || '';
  const materialId = Number(params.get('materialId'));
  const de = Number(params.get('de'));
  const ate = Number(params.get('ate'));
  const formato = (params.get('formato') || 'jpg').toLowerCase();

  if (!materialId || Number.isNaN(materialId)) {
    return erro('Material invalido.', 400);
  }
  if (!de || !ate || de < 1 || ate < de) {
    return erro('Intervalo de paginas invalido.', 400);
  }
  if (ate - de + 1 > MAX_POR_PARTE) {
    return erro(`Cada parte pode ter no maximo ${MAX_POR_PARTE} paginas.`, 400);
  }
  if (formato !== 'jpg' && formato !== 'png') {
    return erro("Formato invalido. Use 'jpg' ou 'png'.", 400);
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

    const paginas: {
      pagina: number;
      dados: string;
      largura: number;
      altura: number;
    }[] = [];

    for (let p = de; p <= ate; p++) {
      const buffer = await baixarPagina(sessao.cookie, materialId, p, token);

      if (formato === 'png') {
        // PNG original do portal.
        paginas.push({
          pagina: p,
          dados: buffer.toString('base64'),
          largura: 2400,
          altura: 3395,
        });
      } else {
        // JPEG reescalado (leve, para montar o PDF).
        const { bytes, width, height } = await prepararPaginaJpeg(buffer);
        paginas.push({
          pagina: p,
          dados: bytes.toString('base64'),
          largura: width,
          altura: height,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      materialId,
      de,
      ate,
      formato,
      paginas,
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[apmed] erro ao baixar parte:', e instanceof Error ? e.message : e);
    return erro('Erro ao baixar as paginas. Tente novamente.', 500);
  }
}
