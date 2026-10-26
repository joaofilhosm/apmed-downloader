import { montarPdf, type PaginaParte } from '@/lib/pdf-client';
import JSZip from 'jszip';

/**
 * Baixa materiais do APMED e gera PDF/ZIP no navegador.
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

export type ManifestoMaterial = {
  materialId: number;
  titulo: string;
  totalPaginas: number;
  partes: ParteManifesto[];
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

export type ManifestoInstituicao = {
  ok: boolean;
  slug: string;
  instituicao: string;
  materiais: ManifestoMaterial[];
  totalMateriais: number;
  totalPaginas: number;
  totalPartes: number;
  paginasPorParte: number;
  avisos: string[];
};

export type Progresso = {
  partesConcluidas: number;
  partesTotal: number;
  paginasBaixadas: number;
  paginasTotal: number;
  etapa: string;
};

/** Opcoes de exportacao. */
export type OpcoesExportacao = {
  /** Incluir os PNGs originais (2400px) alem do PDF. */
  incluirPngs?: boolean;
};

type PaginaBruta = {
  pagina: number;
  dados: string; // base64
  largura: number;
  altura: number;
};

/** Baixa uma parte (intervalo de paginas) do material. */
async function baixarParte(
  sessaoId: string,
  materialId: number,
  parte: ParteManifesto,
  formato: 'jpg' | 'png' = 'jpg',
): Promise<PaginaBruta[]> {
  const url =
    `/api/pdf/parte?sessaoId=${encodeURIComponent(sessaoId)}` +
    `&materialId=${materialId}&de=${parte.de}&ate=${parte.ate}&formato=${formato}`;

  const res = await fetch(url);
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    throw new Error(corpo.erro || `Falha ao baixar as páginas ${parte.de}-${parte.ate}.`);
  }
  const json = await res.json();
  return json.paginas as PaginaBruta[];
}

/** Converte base64 em bytes. */
function base64ParaBytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Baixa todas as partes de um material e devolve as paginas (JPEG) e,
 * opcionalmente, os PNGs originais.
 */
async function coletarMaterial(
  sessaoId: string,
  item: ManifestoMaterial,
  incluirPngs: boolean,
): Promise<{ jpegs: PaginaParte[]; pngs: { pagina: number; bytes: Uint8Array }[] }> {
  const jpegs: PaginaParte[] = [];
  const pngs: { pagina: number; bytes: Uint8Array }[] = [];

  for (const parte of item.partes) {
    // JPEG (leve) para montar o PDF.
    const paginasJpg = await baixarParte(sessaoId, item.materialId, parte, 'jpg');
    for (const p of paginasJpg) {
      jpegs.push({
        pagina: p.pagina,
        jpeg: p.dados,
        largura: p.largura,
        altura: p.altura,
      });
    }

    // PNG original, se pedido.
    if (incluirPngs) {
      const paginasPng = await baixarParte(sessaoId, item.materialId, parte, 'png');
      for (const p of paginasPng) {
        pngs.push({ pagina: p.pagina, bytes: base64ParaBytes(p.dados) });
      }
    }
  }

  return { jpegs, pngs };
}

/**
 * Baixa um material completo e gera o PDF no navegador.
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
      lote.map((p) => baixarParte(sessaoId, materialId, p, 'jpg')),
    );

    for (const r of resultados) {
      for (const p of r) {
        paginas.push({
          pagina: p.pagina,
          jpeg: p.dados,
          largura: p.largura,
          altura: p.altura,
        });
      }
    }
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

/**
 * Baixa TODOS os materiais de uma instituicao e gera um unico ZIP.
 *
 * Cada material vira um PDF dentro do ZIP. Com `incluirPngs`, tambem sao
 * adicionadas as paginas originais em PNG, em uma pasta por material.
 */
export async function baixarInstituicaoComoZip(
  sessaoId: string,
  slug: string,
  opcoes: OpcoesExportacao = {},
  aoProgredir?: (p: Progresso) => void,
): Promise<{ blob: Blob; nome: string; totalMateriais: number; totalPaginas: number }> {
  const incluirPngs = opcoes.incluirPngs === true;

  aoProgredir?.({
    partesConcluidas: 0,
    partesTotal: 1,
    paginasBaixadas: 0,
    paginasTotal: 0,
    etapa: 'Preparando o download...',
  });

  // 1) manifesto consolidado da instituicao
  const resMan = await fetch(
    `/api/instituicao/manifesto?sessaoId=${encodeURIComponent(sessaoId)}&slug=${encodeURIComponent(slug)}`,
  );
  if (!resMan.ok) {
    const corpo = await resMan.json().catch(() => ({}));
    throw new Error(corpo.erro || 'Não foi possível preparar o download.');
  }

  const manifesto = (await resMan.json()) as ManifestoInstituicao;

  aoProgredir?.({
    partesConcluidas: 0,
    partesTotal: manifesto.totalPartes,
    paginasBaixadas: 0,
    paginasTotal: manifesto.totalPaginas,
    etapa: `Baixando ${manifesto.totalMateriais} materiais (${manifesto.totalPaginas} páginas)...`,
  });

  // 2) baixa material a material
  const zip = new JSZip();
  let partesConcluidas = 0;
  let paginasBaixadas = 0;

  for (const item of manifesto.materiais) {
    const { jpegs, pngs } = await coletarMaterial(sessaoId, item, incluirPngs);

    const pdf = await montarPdf(jpegs, item.titulo);
    const nomeBase = sanitizarNome(item.titulo);
    zip.file(`${nomeBase}.pdf`, pdf);

    if (incluirPngs && pngs.length) {
      const pasta = zip.folder(`${nomeBase}_imagens`);
      if (pasta) {
        for (const p of pngs) {
          pasta.file(`pagina_${String(p.pagina).padStart(3, '0')}.png`, p.bytes);
        }
      }
    }

    partesConcluidas += item.partes.length;
    paginasBaixadas += item.totalPaginas;

    aoProgredir?.({
      partesConcluidas,
      partesTotal: manifesto.totalPartes,
      paginasBaixadas,
      paginasTotal: manifesto.totalPaginas,
      etapa: `Baixando... (${paginasBaixadas}/${manifesto.totalPaginas} páginas)`,
    });
  }

  // 3) gera o ZIP
  aoProgredir?.({
    partesConcluidas: manifesto.totalPartes,
    partesTotal: manifesto.totalPartes,
    paginasBaixadas,
    paginasTotal: manifesto.totalPaginas,
    etapa: 'Compactando o arquivo ZIP...',
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 4 },
  });

  return {
    blob,
    nome: `materiais_${sanitizarNome(manifesto.instituicao || slug)}.zip`,
    totalMateriais: manifesto.totalMateriais,
    totalPaginas: manifesto.totalPaginas,
  };
}

/**
 * Baixa varios materiais selecionados e gera um unico ZIP.
 */
export async function baixarSelecaoComoZip(
  sessaoId: string,
  materialIds: number[],
  opcoes: OpcoesExportacao = {},
  aoProgredir?: (p: Progresso) => void,
): Promise<{ blob: Blob; nome: string; totalMateriais: number }> {
  const incluirPngs = opcoes.incluirPngs === true;

  const zip = new JSZip();
  let paginasBaixadas = 0;
  let paginasTotal = 0;

  // 1) descobre o total de paginas de cada material
  const itens: ManifestoMaterial[] = [];
  for (const id of materialIds) {
    const res = await fetch(
      `/api/pdf/manifesto?sessaoId=${encodeURIComponent(sessaoId)}&materialId=${id}`,
    );
    if (!res.ok) continue;
    const m = (await res.json()) as Manifesto;
    itens.push({
      materialId: m.materialId,
      titulo: m.titulo,
      totalPaginas: m.totalPaginas,
      partes: m.partes,
    });
    paginasTotal += m.totalPaginas;
  }

  if (itens.length === 0) {
    throw new Error('Nenhum material pôde ser preparado.');
  }

  const partesTotal = itens.reduce((s, i) => s + i.partes.length, 0);
  let partesConcluidas = 0;

  // 2) baixa e monta
  for (const item of itens) {
    const { jpegs, pngs } = await coletarMaterial(sessaoId, item, incluirPngs);

    const pdf = await montarPdf(jpegs, item.titulo);
    const nomeBase = sanitizarNome(item.titulo);
    zip.file(`${nomeBase}.pdf`, pdf);

    if (incluirPngs && pngs.length) {
      const pasta = zip.folder(`${nomeBase}_imagens`);
      if (pasta) {
        for (const p of pngs) {
          pasta.file(`pagina_${String(p.pagina).padStart(3, '0')}.png`, p.bytes);
        }
      }
    }

    partesConcluidas += item.partes.length;
    paginasBaixadas += item.totalPaginas;

    aoProgredir?.({
      partesConcluidas,
      partesTotal,
      paginasBaixadas,
      paginasTotal,
      etapa: `Baixando... (${paginasBaixadas}/${paginasTotal} páginas)`,
    });
  }

  aoProgredir?.({
    partesConcluidas: partesTotal,
    partesTotal,
    paginasBaixadas,
    paginasTotal,
    etapa: 'Compactando o arquivo ZIP...',
  });

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 4 },
  });

  return {
    blob,
    nome: 'materiais_apmed.zip',
    totalMateriais: itens.length,
  };
}

/** Nome de arquivo seguro. */
export function sanitizarNome(titulo: string): string {
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
