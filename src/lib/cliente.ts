/**
 * Utilidades do navegador: armazenamento local, licencas, busca e
 * pequenos formatadores. Nada aqui e confiavel para o servidor - e apenas
 * conveniencia para a interface.
 */

export type Material = {
  id: number;
  titulo: string;
  descricao: string;
  tags: string[];
  instituicao: string;
  slug: string;
  atualizadoEm: string;
};

export type LicencaLocal = {
  token: string;
  expiraEm: number;
  materialIds: number[];
  pagamentoId: string;
};

export type Pedido = {
  id: string;
  criadoEm: number;
  materialIds: number[];
  titulos: string[];
  valor: number;
  status: 'pendente' | 'aprovado' | 'expirado' | 'recusado';
};

export type PixPendente = {
  id: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiraEm: number;
  simulado: boolean;
  materialIds: number[];
  valor: number;
};

/* ------------------------------------------------------------------ */
/* Armazenamento seguro (nunca quebra a pagina)                         */
/* ------------------------------------------------------------------ */

function armazenamento(tipo: 'local' | 'sessao'): Storage | null {
  try {
    return tipo === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function ler<T>(chave: string, padrao: T, tipo: 'local' | 'sessao' = 'local'): T {
  try {
    const bruto = armazenamento(tipo)?.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

export function gravar(chave: string, valor: unknown, tipo: 'local' | 'sessao' = 'local') {
  try {
    if (valor === null || valor === undefined) armazenamento(tipo)?.removeItem(chave);
    else armazenamento(tipo)?.setItem(chave, JSON.stringify(valor));
  } catch {
    /* modo anonimo ou cota cheia: segue sem persistir */
  }
}

export const chaves = {
  tema: 'apmed:tema',
  email: 'apmed:email',
  sessao: 'apmed:sessao',
  vista: 'apmed:vista',
  ordem: 'apmed:ordem',
  opcoes: 'apmed:opcoes-download',
  carrinho: (conta: string) => `apmed:carrinho:${conta}`,
  licencas: (conta: string) => `apmed:licencas:${conta}`,
  pedidos: (conta: string) => `apmed:pedidos:${conta}`,
  pix: (conta: string) => `apmed:pix:${conta}`,
  baixados: (conta: string) => `apmed:baixados:${conta}`,
};

/* ------------------------------------------------------------------ */
/* Licencas                                                            */
/* ------------------------------------------------------------------ */

export function licencasValidas(lista: LicencaLocal[], agora = Date.now()): LicencaLocal[] {
  return lista.filter((l) => l && typeof l.token === 'string' && l.expiraEm > agora);
}

/** Mapa materialId -> maior data de expiracao entre as licencas validas. */
export function materiaisLiberados(lista: LicencaLocal[]): Map<number, number> {
  const mapa = new Map<number, number>();
  for (const l of licencasValidas(lista)) {
    for (const id of l.materialIds) mapa.set(id, Math.max(mapa.get(id) || 0, l.expiraEm));
  }
  return mapa;
}

/* ------------------------------------------------------------------ */
/* Busca                                                               */
/* ------------------------------------------------------------------ */

export function normalizarBusca(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Todas as palavras da busca precisam aparecer (em qualquer ordem). */
export function combina(material: Material, busca: string): boolean {
  const termos = normalizarBusca(busca).split(' ').filter(Boolean);
  if (!termos.length) return true;
  const alvo = normalizarBusca(
    `${material.titulo} ${material.descricao} ${material.instituicao} ${material.tags.join(' ')} #${material.id}`,
  );
  return termos.every((t) => alvo.includes(t));
}

export function extrairAno(titulo: string): string | null {
  const m = titulo.match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

/** Converte "dd/mm/aaaa" (formato do portal) em timestamp para ordenar. */
export function dataPortal(texto: string): number {
  const m = (texto || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime() : 0;
}

/* ------------------------------------------------------------------ */
/* Visual                                                              */
/* ------------------------------------------------------------------ */

const PALETA = [
  ['#3355ff', '#6f86ff'],
  ['#0fa89a', '#34d1c1'],
  ['#7c3aed', '#a78bfa'],
  ['#db2777', '#f472b6'],
  ['#ea580c', '#fb923c'],
  ['#0284c7', '#38bdf8'],
  ['#16a34a', '#4ade80'],
  ['#ca8a04', '#facc15'],
  ['#be123c', '#fb7185'],
  ['#4f46e5', '#818cf8'],
];

/** Gradiente estavel por instituicao (mesma banca, mesma cor). */
export function corDe(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const [a, b] = PALETA[h % PALETA.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

/** Sigla curta para a capa (ex.: "BIBLIA UNICAMP 2027" -> "UNICAMP"). */
export function sigla(material: Material): string {
  const inst = material.instituicao && material.instituicao !== 'Outros' ? material.instituicao : '';
  if (inst) return inst.toUpperCase().slice(0, 14);
  const palavras = material.titulo.replace(/\b20\d{2}\b/, '').split(/\s+/).filter(Boolean);
  return (palavras.find((p) => !/^biblia$/i.test(p)) || palavras[0] || 'APMED').toUpperCase().slice(0, 14);
}

/* ------------------------------------------------------------------ */
/* Formatadores                                                        */
/* ------------------------------------------------------------------ */

export function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function formatarData(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}min ${String(r).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}min`;
}

export function formatarRelogio(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function diasRestantes(expiraEm: number, agora = Date.now()): number {
  return Math.max(0, Math.ceil((expiraEm - agora) / (24 * 60 * 60 * 1000)));
}
