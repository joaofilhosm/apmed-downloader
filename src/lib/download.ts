import { montarPdf, type PaginaParte } from '@/lib/pdf-client';

/**
 * Baixa um material completo e gera o PDF no navegador.
 *
 * Materiais grandes sao divididos em partes pelo servidor (cada parte cabe
 * no limite de 300s da funcao serverless). As partes sao baixadas em
 * grupos paralelos e, ao final, montamos o PDF unico no cliente.
 */

export type ParteManifesto = {
  indice: number;
  de: number;
  ate: number;
};

export type Manifesto = {
  ok: boolean;
  materialId: number;
  titulo: string;
  instituicao: string;
  totalPaginas: number;
  paginasPorParte: number;
  partesPorDownload: number;
  partes: ParteManifesto[];
};

export type Progresso = {
  partesConcluidas: number;
  partesTotal: number;
  paginasBaixadas: number;
  paginasTotal: number;
  etapa: string;
};

/** Baixa uma parte (intervalo de paginas) do material. */
async function baixarParte(
  sessaoId: string,
  materialId: number,
  parte: ParteManifesto,
): Promise<PaginaParte[]> {
  const url =
    `/api/pdf/parte?sessaoId=${encodeURIComponent(sessaoId)}` +
    `&materialId=${materialId}&de=${parte.de}&ate=${parte.ate}`;

  const res = await fetch(url);
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    throw new Error(corpo.erro || `Falha ao baixar as páginas ${parte.de}-${parte.ate}.`);
  }
  const json = await res.json();
  return json.paginas as PaginaParte[];
}

/**
 * Baixa todas as partes e monta o PDF.
 */
export async function baixarMaterialComoPdf(
  sessaoId: string,
  materialId: number,
  aoProgredir?: (p: Progresso) => void,
): Promise<{ blob: Blob; nome: string; totalPaginas: number }> {
  aoProgredir?.({
    partesConcluidas: 0,
    partesTotal: 1,
    paginasBaixadas: 0,
    paginasTotal: 0,
    etapa: 'Preparando o download...',
  });

  // 1) manifesto: total de paginas e plano de partes
  const resMan = await fetch(
    `/api/pdf/manifesto?sessaoId=${encodeURIComponent(sessaoId)}&materialId=${materialId}`,
  );
  if (!resMan.ok) {
    const corpo = await resMan.json().catch(() => ({}));
    throw new Error(corpo.erro || 'Não foi possível preparar o download.');
  }

  const manifesto = (await resMan.json()) as Manifesto;
  const partes = manifesto.partes || [];

  aoProgredir?.({
    partesConcluidas: 0,
    partesTotal: partes.length,
    paginasBaixadas: 0,
    paginasTotal: manifesto.totalPaginas,
    etapa: `Baixando ${manifesto.totalPaginas} páginas...`,
  });

  // 2) baixa as partes em grupos paralelos
  const paginas: PaginaParte[] = [];
  let partesConcluidas = 0;
  const grupo = Math.max(1, manifesto.partesPorDownload || 2);

  for (let i = 0; i < partes.length; i += grupo) {
    const lote = partes.slice(i, i + grupo);
    const resultados = await Promise.all(
      lote.map((p) => baixarParte(sessaoId, materialId, p)),
    );

    for (const r of resultados) paginas.push(...r);
    partesConcluidas += lote.length;

    aoProgredir?.({
      partesConcluidas,
      partesTotal: partes.length,
      paginasBaixadas: paginas.length,
      paginasTotal: manifesto.totalPaginas,
      etapa: `Baixando páginas... (${paginas.length}/${manifesto.totalPaginas})`,
    });
  }

  // 3) monta o PDF no navegador
  aoProgredir?.({
    partesConcluidas: partes.length,
    partesTotal: partes.length,
    paginasBaixadas: paginas.length,
    paginasTotal: manifesto.totalPaginas,
    etapa: 'Montando o PDF...',
  });

  const blob = await montarPdf(paginas, manifesto.titulo);

  return {
    blob,
    nome: `${sanitizarNome(manifesto.titulo)}.pdf`,
    totalPaginas: manifesto.totalPaginas,
  };
}

/** Nome de arquivo seguro. */
function sanitizarNome(titulo: string): string {
  return (
    titulo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'material'
  );
}
