/**
 * Monta um PDF a partir de paginas PNG/JPEG.
 *
 * Usa `pdf-lib` (JavaScript puro) em vez de Pillow/ImageMagick, porque as
 * funcoes serverless da Vercel nao tem binarios de sistema e o `pdf-lib`
 * roda em qualquer runtime Node.
 */

import { PDFDocument } from 'pdf-lib';

/** Largura da pagina em pontos (A4 = 595 x 842). */
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

export type PaginaImagem = {
  buffer: Buffer;
};

function detectarTipo(buffer: Buffer): 'png' | 'jpg' {
  // Assinatura PNG: 89 50 4E 47
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  return 'jpg';
}

/**
 * Calcula as dimensoes (em pontos) mantendo a proporcao da imagem,
 * centralizada dentro de uma folha A4.
 */
function dimensoesA4(larguraPx: number, alturaPx: number) {
  const escala = Math.min(LARGURA_A4 / larguraPx, ALTURA_A4 / alturaPx);
  return {
    w: larguraPx * escala,
    h: alturaPx * escala,
    x: (LARGURA_A4 - larguraPx * escala) / 2,
    y: (ALTURA_A4 - alturaPx * escala) / 2,
  };
}

export async function gerarPdf(paginas: PaginaImagem[]): Promise<Buffer> {
  if (paginas.length === 0) {
    throw new Error('Nenhuma pagina para converter em PDF.');
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle('Material APMED');
  pdf.setCreator('APMED Downloader');

  for (const { buffer } of paginas) {
    const tipo = detectarTipo(buffer);
    const bytes =
      tipo === 'png'
        ? await pdf.embedPng(buffer)
        : await pdf.embedJpg(buffer);

    // dims em px -> pontos mantendo proporcao dentro do A4
    const pxW = bytes.width;
    const pxH = bytes.height;
    const { w, h, x, y } = dimensoesA4(pxW, pxH);

    const pagina = pdf.addPage([LARGURA_A4, ALTURA_A4]);
    pagina.drawImage(bytes, { x, y, width: w, height: h });
  }

  return Buffer.from(await pdf.save());
}

/** Nome de arquivo seguro para download. */
export function nomeArquivo(titulo: string, extensao = 'pdf'): string {
  const limpo = (titulo || 'material')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${limpo || 'material'}.${extensao}`;
}
