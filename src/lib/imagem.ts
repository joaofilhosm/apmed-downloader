/**
 * Conversao de imagens das paginas do APMED.
 *
 * As paginas chegam como PNG 2400x3395 (~1,1 MB cada). Descomprimidas em
 * RAM, ocupam ~32 MB - o que estoura o limite de 1 GB da funcao serverless
 * quando processamos muitas de uma vez.
 *
 * Convertemos para JPEG 1700px, que:
 *  - reduz 6x o consumo de memoria (~180 KB por pagina);
 *  - mantem a leitura nitida (1700 px de largura a 80 de qualidade);
 *  - ja vem comprimido, entao o PDF final fica enxuto.
 */

import sharp from 'sharp';

/** Largura maxima da imagem convertida, em pixels. */
export const LARGURA_MAXIMA = 1700;

/** Largura usada na opcao "alta qualidade". */
export const LARGURA_ALTA = 2400;

/** Qualidade JPEG das paginas. */
export const QUALIDADE = 80;

export type ImagemPronta = {
  bytes: Buffer;
  width: number;
  height: number;
};

/**
 * Converte a imagem para JPEG reescalado.
 * Se o `sharp` falhar, devolve o buffer original (o download ainda funciona).
 */
export async function prepararPaginaJpeg(
  buffer: Buffer,
  larguraMaxima = LARGURA_MAXIMA,
): Promise<ImagemPronta> {
  try {
    const imagem = sharp(buffer, { failOn: 'none' });
    const meta = await imagem.metadata();
    const largura = Math.min(meta.width || larguraMaxima, larguraMaxima);
    const altura = meta.height
      ? Math.round((largura / (meta.width || largura)) * meta.height)
      : 0;

    const bytes = await imagem
      .resize({ width: largura, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALIDADE, mozjpeg: true })
      .toBuffer();

    return { bytes, width: largura, height: altura };
  } catch (erro) {
    console.error(
      '[imagem] sharp falhou, usando original:',
      erro instanceof Error ? erro.message : erro,
    );
    return { bytes: buffer, width: larguraMaxima, height: 0 };
  }
}
