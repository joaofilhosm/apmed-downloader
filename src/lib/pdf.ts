/**
 * Monta um PDF a partir de paginas PNG/JPEG.
 *
 * Dois pontos criticos no ambiente serverless:
 *
 * 1) MEMORIA: uma pagina PNG 2400x3395 descomprime para ~32 MB em RAM.
 *    Com 12+ paginas o `pdf-lib` estoura o limite da instancia (1 GB) e a
 *    Vercel mata a funcao ("ran out of available memory").
 *    Solucao: reescalamos cada pagina para JPEG com `sharp` (1.1 MB -> 180 KB),
 *    reduzindo o consumo em ~6x. O visual permanece nitido para leitura.
 *
 * 2) ACUMULO: guardar todas as paginas em memoria antes de montar o PDF
 *    multiplica o pico de uso. Por isso a API abaixo permite processar e
 *    liberar cada pagina assim que ela entra no documento.
 */

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

/** Largura da pagina em pontos (A4 = 595 x 842). */
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

/** Largura maxima da imagem embutida, em pixels. */
const LARGURA_MAXIMA = 1700;

/** Qualidade JPEG das paginas. */
const QUALIDADE = 80;

export type PaginaImagem = {
  buffer: Buffer;
};

function ehPng(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

/**
 * Converte a imagem para JPEG reescalado.
 * Se o `sharp` falhar, cai para a imagem original (o download ainda funciona,
 * apenas com mais uso de memoria).
 */
async function prepararPagina(buffer: Buffer): Promise<{
  bytes: Buffer;
  tipo: 'png' | 'jpg';
  width: number;
  height: number;
}> {
  try {
    const imagem = sharp(buffer, { failOn: 'none' });
    const meta = await imagem.metadata();
    const largura = Math.min(meta.width || LARGURA_MAXIMA, LARGURA_MAXIMA);
    const altura = meta.height
      ? Math.round((largura / (meta.width || largura)) * meta.height)
      : ALTURA_A4;

    const bytes = await imagem
      .resize({ width: largura, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALIDADE, mozjpeg: true })
      .toBuffer();

    return { bytes, tipo: 'jpg', width: largura, height: altura };
  } catch (erro) {
    console.error(
      '[pdf] sharp falhou, usando imagem original:',
      erro instanceof Error ? erro.message : erro,
    );
    return {
      bytes: buffer,
      tipo: ehPng(buffer) ? 'png' : 'jpg',
      width: LARGURA_MAXIMA,
      height: ALTURA_A4,
    };
  }
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
    const { bytes, tipo, width, height } = await prepararPagina(buffer);

    const embedido =
      tipo === 'png' ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);

    const { w, h, x, y } = dimensoesA4(width, height);
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
    // Object streams comprimem o conteudo do PDF (imagens JPEG ja sao
    // comprimidas, mas os metadados e o stream da pagina nao).
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
