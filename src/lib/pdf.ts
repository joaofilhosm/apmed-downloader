/**
 * Monta um PDF a partir de paginas PNG/JPEG.
 *
 * Pontos criticos no ambiente serverless:
 *
 * 1) MEMORIA: uma pagina PNG 2400x3395 descomprime para ~32 MB em RAM.
 *    Com 12+ paginas o `pdf-lib` estoura o limite da instancia (1 GB) e a
 *    Vercel mata a funcao ("ran out of available memory").
 *    Solucao: `ConstrutorPdf` processa cada pagina individualmente e as
 *    imagens sao convertidas para JPEG (ver `lib/imagem.ts`).
 *
 * 2) TEMPO: materiais com 100+ paginas nao cabem em uma unica funcao
 *    (limite de 300s). Para esses, use o fluxo de partes:
 *    `/api/pdf/manifesto` + `/api/pdf/parte` + montagem no navegador.
 */

import { PDFDocument } from 'pdf-lib';
import { prepararPaginaJpeg } from './imagem';

/** Largura da pagina em pontos (A4 = 595 x 842). */
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

export type PaginaImagem = {
  buffer: Buffer;
};

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

/**
 * Construtor de PDF que processa cada pagina assim que ela chega,
 * sem manter todas as paginas em memoria.
 */
export class ConstrutorPdf {
  private pdf!: PDFDocument;
  private total = 0;

  /** Cria o construtor. `PDFDocument.create()` e assincrono. */
  static async criar(): Promise<ConstrutorPdf> {
    const c = new ConstrutorPdf();
    c.pdf = await PDFDocument.create();
    return c;
  }

  /** Adiciona uma pagina ao documento. */
  async adicionar(buffer: Buffer): Promise<void> {
    const { bytes, width, height } = await prepararPaginaJpeg(buffer);
    const embedido = await this.pdf.embedJpg(bytes);
    const { w, h, x, y } = dimensoesA4(width, height || ALTURA_A4);
    const pagina = this.pdf.addPage([LARGURA_A4, ALTURA_A4]);
    pagina.drawImage(embedido, { x, y, width: w, height: h });
    this.total++;
  }

  /** Quantidade de paginas adicionadas. */
  get paginas(): number {
    return this.total;
  }

  /** Finaliza e devolve o PDF. */
  async finalizar(titulo = 'Material APMED'): Promise<Buffer> {
    this.pdf.setTitle(titulo);
    this.pdf.setCreator('APMED Downloader');
    return Buffer.from(await this.pdf.save({ useObjectStreams: true }));
  }
}

/**
 * Versao simples: recebe todas as paginas de uma vez.
 * Preferir `ConstrutorPdf` para materiais grandes.
 */
export async function gerarPdf(paginas: PaginaImagem[]): Promise<Buffer> {
  if (paginas.length === 0) {
    throw new Error('Nenhuma pagina para converter em PDF.');
  }
  const construtor = await ConstrutorPdf.criar();
  for (const { buffer } of paginas) {
    await construtor.adicionar(buffer);
  }
  return construtor.finalizar();
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
