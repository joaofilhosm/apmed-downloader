import { NextRequest, NextResponse } from 'next/server';
import { erro, licencasDe, sessaoDe } from '@/lib/http';
import { licencaCobre } from '@/lib/licenca';
import {
  obterTokenLeitura,
  baixarPagina,
  listarMateriais,
  ApmedError,
} from '@/lib/apmed';
import { prepararPaginaJpeg, LARGURA_ALTA, LARGURA_MAXIMA } from '@/lib/imagem';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Maximo de paginas por parte. */
const MAX_POR_PARTE = 20;

/**
 * GET /api/pdf/parte?materialId=...&de=N&ate=M[&formato=jpg|png]
 *     (cabecalhos x-sessao e x-licencas)
 *
 * Baixa as paginas N..M do material e devolve as imagens, empacotadas em
 * JSON (base64) para o navegador montar o PDF.
 *
 * `formato=jpg` (padrao): imagens reescaladas para JPEG 1700px, que sao
 * leves e suficientes para montar o PDF.
 *
 * `formato=png`: devolve o PNG ORIGINAL do portal (2400px), usado quando o
 * usuario quer tambem os arquivos de imagem originais junto com o PDF.
 *
 * `qualidade=alta` gera o JPEG em 2400px (PDF maior, mais nitido).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const materialId = Number(params.get('materialId'));
  const de = Number(params.get('de'));
  const ate = Number(params.get('ate'));
  const formato = (params.get('formato') || 'jpg').toLowerCase();
  const qualidade = params.get('qualidade') === 'alta' ? 'alta' : 'padrao';

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

  const sessao = sessaoDe(req);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  // Download so e liberado com uma licenca paga que cubra este material.
  if (!licencaCobre(licencasDe(req), sessao.conta, materialId)) {
    return erro('Este material ainda nao foi pago. Adicione ao carrinho para liberar.', 402);
  }

  try {
    const materiais = await listarMateriais(sessao.cookie);
    const material = materiais.find((m) => m.id === materialId);
    if (!material) {
      return erro('Este material nao esta disponivel na sua conta.', 404);
    }

    const token = await obterTokenLeitura(sessao.cookie, materialId);

    type Pagina = { pagina: number; dados: string; largura: number; altura: number };
    const numeros = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
    const paginas: Pagina[] = new Array(numeros.length);

    // 3 paginas em paralelo: bem mais rapido que em serie, sem pesar no portal
    // nem estourar a memoria da funcao.
    let proximo = 0;
    async function trabalhador() {
      while (proximo < numeros.length) {
        const i = proximo++;
        const p = numeros[i];
        const buffer = await baixarPagina(sessao!.cookie, materialId, p, token);
        if (formato === 'png') {
          // PNG original do portal.
          paginas[i] = { pagina: p, dados: buffer.toString('base64'), largura: 2400, altura: 3395 };
        } else {
          // JPEG reescalado (leve, para montar o PDF).
          const { bytes, width, height } = await prepararPaginaJpeg(
            buffer,
            qualidade === 'alta' ? LARGURA_ALTA : LARGURA_MAXIMA,
          );
          paginas[i] = { pagina: p, dados: bytes.toString('base64'), largura: width, altura: height };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, numeros.length) }, trabalhador));

    return NextResponse.json({
      ok: true,
      materialId,
      de,
      ate,
      formato,
      qualidade,
      paginas,
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[apmed] erro ao baixar parte:', e instanceof Error ? e.message : e);
    return erro('Erro ao baixar as paginas. Tente novamente.', 500);
  }
}
