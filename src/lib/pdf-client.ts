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
  jpeg: string; // base64
  largura: number;
  altura: number;
};

/**
 * Converte uma string base64 em bytes.
 */
function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

/**
 * Monta o PDF final a partir das paginas recebidas (em JPEG base64).
 * Mantem a ordem pelo numero da pagina.
 */
export async function montarPdf(
  paginas: PaginaParte[],
  titulo = 'Material APMED',
): Promise<Blob> {
  if (paginas.length === 0) {
    throw new Error('Nenhuma pagina para montar o PDF.');
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(titulo);
  pdf.setCreator('APMED Downloader');

  const ordenadas = [...paginas].sort((a, b) => a.pagina - b.pagina);

  for (const p of ordenadas) {
    const bytes = base64ParaBytes(p.jpeg);
    const embedido = await pdf.embedJpg(bytes);

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
