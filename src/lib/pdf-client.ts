/**
 * Montagem do PDF no navegador.
 *
 * O fluxo completo:
 *  1. `/api/pdf/manifesto` diz quantas paginas o material tem e divide em partes.
 *  2. O navegador baixa as partes (cada uma cabe no limite da funcao serverless).
 *  3. Aqui as imagens de cada parte viram paginas de um unico PDF.
 *
 * Usamos `pdf-lib` no cliente - ele roda no browser e gera o arquivo final
 * sem precisar reenviar tudo ao servidor.
 */

import { PDFDocument } from 'pdf-lib';

/** Largura da pagina em pontos (A4 = 595 x 842). */
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

export type PaginaParte = {
  pagina: number;
  jpeg: string; // base64 (JPEG; PNG aceito quando o servidor nao conseguiu converter)
  largura: number;
  altura: number;
};

export type MetadadosPdf = {
  titulo: string;
  instituicao?: string;
};

/** Converte uma string base64 em bytes. */
export function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

/** Os 4 primeiros bytes de todo PNG: 0x89 'P' 'N' 'G'. */
function ehPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/**
 * Monta o PDF final a partir das paginas recebidas.
 * Mantem a ordem pelo numero da pagina e ignora paginas duplicadas.
 */
export async function montarPdf(
  paginas: PaginaParte[],
  meta: MetadadosPdf | string = 'Material APMED',
): Promise<Blob> {
  if (paginas.length === 0) {
    throw new Error('Nenhuma página para montar o PDF.');
  }
  const { titulo, instituicao } = typeof meta === 'string' ? { titulo: meta, instituicao: '' } : meta;

  const pdf = await PDFDocument.create();
  pdf.setTitle(titulo);
  pdf.setSubject(instituicao ? `Material de estudo - ${instituicao}` : 'Material de estudo');
  pdf.setKeywords(['APMED', 'residência médica', ...(instituicao ? [instituicao] : [])]);
  pdf.setCreator('APMED Downloader');
  pdf.setProducer('APMED Downloader (pdf-lib)');
  pdf.setCreationDate(new Date());

  const vistas = new Set<number>();
  const ordenadas = [...paginas]
    .sort((a, b) => a.pagina - b.pagina)
    .filter((p) => (vistas.has(p.pagina) ? false : (vistas.add(p.pagina), true)));

  for (const p of ordenadas) {
    const bytes = base64ParaBytes(p.jpeg);
    const embedido = ehPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);

    const larguraPx = p.largura || embedido.width;
    const alturaPx = p.altura || embedido.height;

    const escala = Math.min(LARGURA_A4 / larguraPx, ALTURA_A4 / alturaPx);
    const w = larguraPx * escala;
    const h = alturaPx * escala;

    const pagina = pdf.addPage([LARGURA_A4, ALTURA_A4]);
    pagina.drawImage(embedido, {
      x: (LARGURA_A4 - w) / 2,
      y: (ALTURA_A4 - h) / 2,
      width: w,
      height: h,
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
