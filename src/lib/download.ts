import { base64ParaBytes, montarPdf, type PaginaParte } from '@/lib/pdf-client';
import JSZip from 'jszip';

/**
 * Baixa materiais do APMED e gera PDF/ZIP no navegador.
 *
 * Materiais grandes sao divididos em partes pelo servidor (cada parte cabe
 * no limite da funcao serverless). As partes sao baixadas em paralelo,
 * com novas tentativas automaticas, e o PDF unico e montado no cliente.
 *
 * Toda chamada leva a sessao e as licencas pagas nos cabecalhos - nunca na
 * URL, para nao vazar em historico ou logs.
 */

export type Credenciais = {
  sessaoId: string;
  licencas: string[];
};

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
  materialAtual?: string;
  materiaisConcluidos?: number;
  materiaisTotal?: number;
  etapa: string;
};

export type Qualidade = 'padrao' | 'alta';

export type OpcoesExportacao = {
  /** Incluir os PNGs originais (2400px) alem do PDF. */
  incluirPngs?: boolean;
  /** Resolucao do JPEG usado no PDF. */
  qualidade?: Qualidade;
  signal?: AbortSignal;
};

type PaginaBruta = {
  pagina: number;
  dados: string; // base64
  largura: number;
  altura: number;
};

/** Erro que nao adianta repetir (sessao expirada, nao pago, inexistente). */
export class ErroDefinitivo extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function cabecalhos(c: Credenciais): HeadersInit {
  return { 'x-sessao': c.sessaoId, 'x-licencas': c.licencas.join(' ') };
}

function esperar(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Cancelado', 'AbortError'));
    });
  });
}

/**
 * GET com ate 3 tentativas. 401/402/403/404 sao definitivos; o resto
 * (rede, 5xx, 429, timeout do servidor) e repetido com espera crescente.
 */
async function obterJson<T>(url: string, c: Credenciais, signal?: AbortSignal): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url, { headers: cabecalhos(c), signal });
      const corpo = await res.json().catch(() => ({}));
      if (res.ok && corpo.ok !== false) return corpo as T;
      const msg = corpo.erro || `Falha no servidor (HTTP ${res.status}).`;
      if ([400, 401, 402, 403, 404].includes(res.status)) throw new ErroDefinitivo(msg, res.status);
      ultimo = new Error(msg);
    } catch (e) {
      if (e instanceof ErroDefinitivo) throw e;
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      ultimo = e;
    }
    await esperar(1000 * 2 ** tentativa, signal);
  }
  throw ultimo instanceof Error ? ultimo : new Error('Falha de conexão.');
}

export async function obterManifesto(
  c: Credenciais,
  materialId: number,
  signal?: AbortSignal,
): Promise<Manifesto> {
  return obterJson<Manifesto>(`/api/pdf/manifesto?materialId=${materialId}`, c, signal);
}

async function baixarParte(
  c: Credenciais,
  materialId: number,
  parte: ParteManifesto,
  formato: 'jpg' | 'png',
  qualidade: Qualidade,
  signal?: AbortSignal,
): Promise<PaginaBruta[]> {
  const url =
    `/api/pdf/parte?materialId=${materialId}&de=${parte.de}&ate=${parte.ate}` +
    `&formato=${formato}&qualidade=${qualidade}`;
  const json = await obterJson<{ paginas: PaginaBruta[] }>(url, c, signal);
  return json.paginas;
}

type MaterialColetado = {
  manifesto: Manifesto;
  jpegs: PaginaParte[];
  pngs: { pagina: number; bytes: Uint8Array }[];
};

/**
 * Baixa todas as partes de um material (2 em paralelo).
 * `aoAvancar` recebe quantas paginas acabaram de chegar.
 */
async function coletarMaterial(
  c: Credenciais,
  manifesto: Manifesto,
  opcoes: OpcoesExportacao,
  aoAvancar: (paginas: number) => void,
): Promise<MaterialColetado> {
  const { incluirPngs = false, qualidade = 'padrao', signal } = opcoes;
  const jpegs: PaginaParte[] = [];
  const pngs: { pagina: number; bytes: Uint8Array }[] = [];
  const partes = [...manifesto.partes];
  const paralelo = Math.max(1, Math.min(manifesto.partesPorDownload || 2, 3));

  let proximo = 0;
  async function trabalhador() {
    while (proximo < partes.length) {
      const parte = partes[proximo++];
      const paginas = await baixarParte(c, manifesto.materialId, parte, 'jpg', qualidade, signal);
      for (const p of paginas) {
        jpegs.push({ pagina: p.pagina, jpeg: p.dados, largura: p.largura, altura: p.altura });
      }
      if (incluirPngs) {
        const originais = await baixarParte(c, manifesto.materialId, parte, 'png', qualidade, signal);
        for (const p of originais) pngs.push({ pagina: p.pagina, bytes: base64ParaBytes(p.dados) });
      }
      aoAvancar(paginas.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(paralelo, partes.length) }, trabalhador));

  return { manifesto, jpegs, pngs };
}

function adicionarAoZip(zip: JSZip, nomeBase: string, pdf: Blob, pngs: MaterialColetado['pngs']) {
  zip.file(`${nomeBase}.pdf`, pdf);
  if (pngs.length) {
    const pasta = zip.folder(`${nomeBase}_imagens`);
    for (const p of pngs.sort((a, b) => a.pagina - b.pagina)) {
      pasta?.file(`pagina_${String(p.pagina).padStart(3, '0')}.png`, p.bytes);
    }
  }
}

/**
 * Baixa um material completo. Sem PNGs devolve o PDF; com PNGs devolve um
 * ZIP com o PDF e a pasta de imagens.
 */
export async function baixarMaterial(
  c: Credenciais,
  materialId: number,
  opcoes: OpcoesExportacao = {},
  aoProgredir?: (p: Progresso) => void,
): Promise<{ blob: Blob; nome: string; totalPaginas: number }> {
  aoProgredir?.({
    partesConcluidas: 0,
    partesTotal: 1,
    paginasBaixadas: 0,
    paginasTotal: 0,
    etapa: 'Contando as páginas do material...',
  });

  const manifesto = await obterManifesto(c, materialId, opcoes.signal);
  let baixadas = 0;
  let partesFeitas = 0;

  const coletado = await coletarMaterial(c, manifesto, opcoes, (n) => {
    baixadas += n;
    partesFeitas += 1;
    aoProgredir?.({
      partesConcluidas: partesFeitas,
      partesTotal: manifesto.partes.length,
      paginasBaixadas: baixadas,
      paginasTotal: manifesto.totalPaginas,
      materialAtual: manifesto.titulo,
      etapa: `Baixando páginas (${baixadas}/${manifesto.totalPaginas})`,
    });
  });

  aoProgredir?.({
    partesConcluidas: manifesto.partes.length,
    partesTotal: manifesto.partes.length,
    paginasBaixadas: manifesto.totalPaginas,
    paginasTotal: manifesto.totalPaginas,
    etapa: 'Montando o PDF...',
  });

  const pdf = await montarPdf(coletado.jpegs, {
    titulo: manifesto.titulo,
    instituicao: manifesto.instituicao,
  });
  const nomeBase = sanitizarNome(manifesto.titulo);

  if (!coletado.pngs.length) {
    return { blob: pdf, nome: `${nomeBase}.pdf`, totalPaginas: manifesto.totalPaginas };
  }

  const zip = new JSZip();
  adicionarAoZip(zip, nomeBase, pdf, coletado.pngs);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, nome: `${nomeBase}.zip`, totalPaginas: manifesto.totalPaginas };
}

/**
 * Baixa varios materiais e gera um unico ZIP (um PDF por material).
 * Materiais que falharem nao derrubam o pacote: entram na lista `falhas`
 * e num arquivo LEIA-ME dentro do ZIP.
 */
export async function baixarVariosComoZip(
  c: Credenciais,
  materialIds: number[],
  opcoes: OpcoesExportacao = {},
  aoProgredir?: (p: Progresso) => void,
): Promise<{
  blob: Blob;
  nome: string;
  totalMateriais: number;
  totalPaginas: number;
  falhas: { materialId: number; motivo: string }[];
}> {
  const zip = new JSZip();
  const falhas: { materialId: number; motivo: string }[] = [];
  const manifestos: Manifesto[] = [];

  // 1) descobre o total de paginas de cada material
  for (let i = 0; i < materialIds.length; i++) {
    aoProgredir?.({
      partesConcluidas: 0,
      partesTotal: 1,
      paginasBaixadas: 0,
      paginasTotal: 0,
      materiaisConcluidos: i,
      materiaisTotal: materialIds.length,
      etapa: `Preparando material ${i + 1} de ${materialIds.length}...`,
    });
    try {
      manifestos.push(await obterManifesto(c, materialIds[i], opcoes.signal));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      falhas.push({ materialId: materialIds[i], motivo: e instanceof Error ? e.message : 'erro' });
    }
  }

  if (manifestos.length === 0) {
    throw new Error(falhas[0]?.motivo || 'Nenhum material pôde ser preparado.');
  }

  const paginasTotal = manifestos.reduce((s, m) => s + m.totalPaginas, 0);
  const partesTotal = manifestos.reduce((s, m) => s + m.partes.length, 0);
  let paginasBaixadas = 0;
  let partesConcluidas = 0;
  let concluidos = 0;
  let totalPaginasOk = 0;
  let sucessos = 0;

  // 2) baixa e monta material a material (mantem a memoria sob controle)
  for (const manifesto of manifestos) {
    try {
      const coletado = await coletarMaterial(c, manifesto, opcoes, (n) => {
        paginasBaixadas += n;
        partesConcluidas += 1;
        aoProgredir?.({
          partesConcluidas,
          partesTotal,
          paginasBaixadas,
          paginasTotal,
          materialAtual: manifesto.titulo,
          materiaisConcluidos: concluidos,
          materiaisTotal: manifestos.length,
          etapa: `Baixando "${manifesto.titulo}"`,
        });
      });
      const pdf = await montarPdf(coletado.jpegs, {
        titulo: manifesto.titulo,
        instituicao: manifesto.instituicao,
      });
      adicionarAoZip(zip, sanitizarNome(manifesto.titulo), pdf, coletado.pngs);
      totalPaginasOk += manifesto.totalPaginas;
      sucessos += 1;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      falhas.push({
        materialId: manifesto.materialId,
        motivo: `${manifesto.titulo}: ${e instanceof Error ? e.message : 'erro'}`,
      });
    }
    concluidos += 1;
  }

  if (sucessos === 0) {
    throw new Error(falhas[0]?.motivo || 'Nenhum material pôde ser baixado.');
  }

  if (falhas.length) {
    zip.file(
      'LEIA-ME_falhas.txt',
      'Estes materiais nao puderam ser baixados. Tente novamente pela area "Meus downloads":\n\n' +
        falhas.map((f) => `- ${f.motivo}`).join('\n'),
    );
  }

  aoProgredir?.({
    partesConcluidas: partesTotal,
    partesTotal,
    paginasBaixadas: paginasTotal,
    paginasTotal,
    materiaisConcluidos: concluidos,
    materiaisTotal: manifestos.length,
    etapa: 'Compactando o arquivo ZIP...',
  });

  // PDF e PNG ja sao comprimidos - STORE gera o ZIP muito mais rapido.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const data = new Date().toISOString().slice(0, 10);

  return {
    blob,
    nome: `materiais_apmed_${data}.zip`,
    totalMateriais: sucessos,
    totalPaginas: totalPaginasOk,
    falhas,
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

/** Dispara o download de um Blob no navegador. */
export function salvarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
