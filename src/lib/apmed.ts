/**
 * Cliente do portal APMED (gestaoapmed.com.br).
 *
 * Responsavel por:
 *  - Autenticar (POST /provas/login.php) e guardar o PHPSESSID
 *  - Listar os materiais do aluno (GET /provas/aluno/materiais.php)
 *  - Obter o token de leitura (GET .../material_visualizar.php?id=N&reader_token=1)
 *  - Descobrir o total de paginas (GET /provas/api/material_reader.php?material_id=N)
 *  - Baixar as paginas renderizadas (GET /provas/api/material_page.php?... -> PNG)
 *
 * SEGURANCA: a senha nunca e persistida em disco nem logada. A sessao vive
 * apenas em memoria (Map) e expira sozinha.
 */

const BASE = process.env.APMED_BASE_URL || 'https://gestaoapmed.com.br/provas';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

/** Sessões ativas: sessionId -> { cookie, criadoEm, ultimoUso } */
const sessoes = new Map();

/** Tempo maximo de vida de uma sessao (30 min). */
const SESSAO_TTL_MS = 30 * 60 * 1000;

/** Tempo maximo de uma requisicao ao APMED. */
const TIMEOUT_MS = Number(process.env.APMED_TIMEOUT_MS || 25000);

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

export function gerarId(): string {
  return (
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  );
}

function limparSessoesExpiradas() {
  const agora = Date.now();
  for (const [id, s] of sessoes) {
    if (agora - s.ultimoUso > SESSAO_TTL_MS) sessoes.delete(id);
  }
}

/** Remove acentos, normaliza caixa e separadores, para comparar nomes. */
export function normalizar(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-_/.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai o valor de um cookie do cabecalho Set-Cookie. */
function extrairCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const match = setCookie.match(/PHPSESSID=([^;]+)/);
  return match ? `PHPSESSID=${match[1]}` : null;
}

/* ------------------------------------------------------------------ */
/* Requisicoes HTTP                                                    */
/* ------------------------------------------------------------------ */

type OpcoesFetch = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  cookie?: string | null;
  timeout?: number;
};

async function req(url: string, opts: OpcoesFetch = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? TIMEOUT_MS);
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept-Language': 'pt,en;q=0.9',
    ...(opts.headers || {}),
  };
  if (opts.cookie) headers.Cookie = opts.cookie;

  try {
    return await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body,
      redirect: 'manual',
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Sessao                                                              */
/* ------------------------------------------------------------------ */

export type Sessao = {
  id: string;
  cookie: string;
  criadoEm: number;
  ultimoUso: number;
};

export function criarSessao(email: string, senha: string): Promise<Sessao> {
  limparSessoesExpiradas();

  const body = new URLSearchParams({ email, password: senha }).toString();

  return (async () => {
    const res = await req(`${BASE}/login.php`, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://gestaoapmed.com.br',
        Referer: `${BASE}/login.php`,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
          'image/webp,image/apng,*/*;q=0.8',
      },
    });

    // O login responde 302 para /aluno/dashboard.php quando funciona.
    if (res.status !== 302 && res.status !== 301 && res.status !== 200) {
      throw new ApmedError(
        `O servidor recusou o login (HTTP ${res.status}). Tente novamente em instantes.`,
        401,
      );
    }

    const cookie = extrairCookie(res.headers.get('set-cookie'));
    if (!cookie) {
      throw new ApmedError(
        'Login nao reconhecido: o servidor nao devolveu uma sessao valida. ' +
          'Confira o e-mail e a senha.',
        401,
      );
    }

    // Confirma que a sessao realmente vale para a area do aluno.
    const dash = await req(`${BASE}/aluno/dashboard.php`, {
      headers: { Referer: `${BASE}/login.php`, Accept: 'text/html,*/*;q=0.8' },
      cookie,
    });

    if (dash.status === 302 || dash.status === 301) {
      const loc = dash.headers.get('location') || '';
      if (loc.includes('login')) {
        throw new ApmedError(
          'O servidor recusou a sessao imediatamente apos o login. ' +
            'Verifique as credenciais.',
          401,
        );
      }
    }

    const sessao: Sessao = {
      id: gerarId(),
      cookie,
      criadoEm: Date.now(),
      ultimoUso: Date.now(),
    };
    sessoes.set(sessao.id, sessao);
    return sessao;
  })();
}

export function obterSessao(id: string): Sessao | null {
  limparSessoesExpiradas();
  const s = sessoes.get(id);
  if (!s) return null;
  s.ultimoUso = Date.now();
  return s;
}

export function destruirSessao(id: string): void {
  sessoes.delete(id);
}

/* ------------------------------------------------------------------ */
/* Listagem de materiais                                               */
/* ------------------------------------------------------------------ */

export type Material = {
  id: number;
  titulo: string;
  descricao: string;
  tags: string[];
  atualizadoEm: string;
  instituicao: string;
  slug: string;
};

function limparHtml(fragmento: string): string {
  return (fragmento || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai do HTML os cards de material.
 * Cada card tem: link material_visualizar.php?id=N, pills, <h2> titulo,
 * <p> descricao e a data de atualizacao.
 */
export function extrairMateriais(html: string): Material[] {
  const cards = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) || [];
  const materiais: Material[] = [];

  for (const card of cards) {
    const idMatch = card.match(/material_visualizar\.php\?id=(\d+)/);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);

    const tags = [...card.matchAll(/<span class="ap-pill[^"]*">([\s\S]*?)<\/span>/g)].map(
      (m) => limparHtml(m[1]),
    );

    const tituloMatch = card.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const titulo = tituloMatch ? limparHtml(tituloMatch[1]) : `Material ${id}`;

    const descMatch = card.match(
      /<p class="text-sm text-slate-500[^"]*"[^>]*>([\s\S]*?)<\/p>/,
    );
    const descricao = descMatch ? limparHtml(descMatch[1]) : '';

    const updMatch = card.match(/Atualizado em ([^<]+)<\/p>/);
    const atualizadoEm = updMatch ? updMatch[1].trim() : '';

    const { instituicao, slug } = detectarInstituicao(titulo, descricao, tags);

    materiais.push({
      id,
      titulo,
      descricao,
      tags,
      atualizadoEm,
      instituicao,
      slug,
    });
  }

  materiais.sort((a, b) => a.id - b.id);
  return materiais;
}

/**
 * Heuristica para descobrir a instituicao (banca) de um material.
 * Os titulos no site seguem o padrao "BIBLIA <INSTITUICAO> <ANO>".
 */
const PALAVRAS_INSTITUICAO = [
  'unicamp', 'usp-rp', 'usp-sp', 'usp rp', 'usp sp', 'hrpp', 'sus-sp',
  'sus sp', 'famerp', 'famema', 'fmabc', 'fmj', 'scmrp', 'scmsp', 'iamspe',
  'unifesp', 'puc-sp', 'puc-pr', 'puc sp', 'ufcspa', 'santa casa de limeira',
  'banco de olhos', 'uerj', 'uel', 'uema', 'uem', 'unesp', 'unitaú', 'unitaú',
  'uninove', 'amrigs', 'psu-es', 'psu-mg', 'psu-go', 'hcor', 'hsL', 'hsl',
  'hcor', 'unitaú', 'fao', 'hosp', 'hc', 'sao paulo', 'são paulo',
];

export function detectarInstituicao(
  titulo: string,
  descricao = '',
  tags: string[] = [],
): { instituicao: string; slug: string } {
  const alvo = normalizar(`${titulo} ${descricao}`);

  // Preferencia: tag especifica diferente de "Biblias AP MED".
  for (const tag of tags) {
    const t = normalizar(tag);
    if (t && !t.includes('biblia') && !t.includes('ap med')) {
      return { instituicao: tag, slug: gerarSlug(tag) };
    }
  }

  // Depois: palavra-chave conhecida dentro do titulo.
  const semAcento = alvo;
  for (const chave of PALAVRAS_INSTITUICAO) {
    const k = normalizar(chave);
    if (!k) continue;
    if (semAcento.includes(k)) {
      const bonito = chave
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
      return { instituicao: bonito, slug: gerarSlug(chave) };
    }
  }

  return { instituicao: 'Outros', slug: 'outros' };
}

export function gerarSlug(texto: string): string {
  return normalizar(texto).replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'outros';
}

export async function listarMateriais(cookie: string): Promise<Material[]> {
  const res = await req(`${BASE}/aluno/materiais.php`, {
    headers: {
      Referer: `${BASE}/aluno/dashboard.php`,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,' +
        'image/webp,image/apng,*/*;q=0.8',
    },
    cookie,
  });

  if (res.status === 302 || res.status === 301) {
    throw new ApmedError('Sua sessao expirou. Entre novamente.', 401);
  }
  if (!res.ok) {
    throw new ApmedError(`Nao foi possivel carregar a lista de materiais (HTTP ${res.status}).`, 502);
  }

  const html = await res.text();
  const materiais = extrairMateriais(html);
  if (materiais.length === 0) {
    throw new ApmedError(
      'Nenhum material encontrado. A conta pode nao ter materiais liberados.',
      404,
    );
  }
  return materiais;
}

/* ------------------------------------------------------------------ */
/* Leitura / paginas                                                   */
/* ------------------------------------------------------------------ */

export type TokenLeitura = { exp: number; token: string };

export async function obterTokenLeitura(
  cookie: string,
  materialId: number,
): Promise<TokenLeitura> {
  const res = await req(
    `${BASE}/aluno/material_visualizar.php?id=${materialId}&reader_token=1`,
    {
      headers: {
        Referer: `${BASE}/aluno/material_visualizar.php?id=${materialId}`,
        Accept: 'application/json,text/plain,*/*',
      },
      cookie,
    },
  );

  if (!res.ok) {
    throw new ApmedError(`Falha ao obter o token de leitura (HTTP ${res.status}).`, 502);
  }
  const json = (await res.json()) as { ok?: boolean; exp?: number; token?: string; message?: string };
  if (!json.ok || !json.token || !json.exp) {
    throw new ApmedError(
      json.message || 'O servidor nao liberou a leitura deste material.',
      403,
    );
  }
  return { exp: Number(json.exp), token: String(json.token) };
}

export async function contarPaginas(
  cookie: string,
  materialId: number,
): Promise<number> {
  const res = await req(`${BASE}/api/material_reader.php?material_id=${materialId}`, {
    headers: {
      Referer: `${BASE}/aluno/material_visualizar.php?id=${materialId}`,
      Accept: 'application/json,text/plain,*/*',
    },
    cookie,
  });

  if (!res.ok) return 0;
  try {
    const json = (await res.json()) as Record<string, unknown>;
    const cand =
      json.last_page ?? json.page_count ?? json.total_pages ?? json.total ?? 0;
    return Number(cand) || 0;
  } catch {
    return 0;
  }
}

export async function baixarPagina(
  cookie: string,
  materialId: number,
  pagina: number,
  token: TokenLeitura,
  largura = 2400,
): Promise<Buffer> {
  const url =
    `${BASE}/api/material_page.php?material_id=${materialId}&page=${pagina}` +
    `&width=${largura}&exp=${token.exp}&token=${token.token}`;

  const res = await req(url, {
    headers: {
      Referer: `${BASE}/aluno/material_visualizar.php?id=${materialId}`,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
    cookie,
  });

  if (!res.ok) {
    throw new ApmedError(`Falha ao baixar a pagina ${pagina} (HTTP ${res.status}).`, 502);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 512) {
    throw new ApmedError(`A pagina ${pagina} veio vazia do servidor.`, 502);
  }
  return buffer;
}

/* ------------------------------------------------------------------ */
/* Erros                                                               */
/* ------------------------------------------------------------------ */

export class ApmedError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ApmedError';
    this.status = status;
  }
}
