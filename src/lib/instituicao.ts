/**
 * Descobre a instituicao (banca) de um material a partir do titulo.
 *
 * Os titulos do portal seguem "[AMPLIADA] BIBLIA <INSTITUICAO> [ANO]",
 * entao a instituicao e o que sobra sem o prefixo e o ano. Uma lista de
 * palavras-chave nao funciona: o portal tem dezenas de bancas e a lista
 * antiga juntava hospitais diferentes num grupo "Hosp" e mandava o resto
 * para "Outros".
 *
 * Os materiais do ENAMED (uma "biblia" por especialidade) ficam juntos.
 */

function semAcento(texto: string): string {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function gerarSlug(texto: string): string {
  return (
    semAcento(texto)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'outros'
  );
}

export function detectarInstituicao(titulo: string): { instituicao: string; slug: string } {
  const limpo = (titulo || '').replace(/\s+/g, ' ').trim();

  if (/\benamed\b/i.test(semAcento(limpo))) return { instituicao: 'ENAMED', slug: 'enamed' };

  const nome = limpo
    .replace(/^(ampliada\s+)?b[ií]blias?\s+/i, '')
    .replace(/\s+(19|20)\d{2}$/, '')
    .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
    .trim();

  if (!nome) return { instituicao: 'Outros', slug: 'outros' };
  return { instituicao: nome.toUpperCase(), slug: gerarSlug(nome) };
}
