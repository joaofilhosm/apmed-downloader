/**
 * Tokens stateless assinados com HMAC-SHA256.
 *
 * Usados para a sessao (carrega o PHPSESSID do APMED) e para as licencas de
 * download (carregam os materiais pagos). Cada tipo de token usa um
 * "proposito" diferente na assinatura, entao um token de sessao nunca e
 * aceito como licenca e vice-versa.
 *
 * Formato: <payload base64url>.<assinatura base64url>
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const SEGREDO_DEV = 'apmed-dev-secret-troque-em-producao';

/**
 * Segredo do HMAC. Em producao a variavel e obrigatoria: com o segredo
 * padrao qualquer pessoa poderia forjar uma licenca.
 */
export function segredo(): string {
  const valor = process.env.APMED_SESSION_SECRET;
  if (valor && valor.length >= 16) return valor;
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('APMED_SESSION_SECRET ausente ou curto demais (minimo 16 caracteres).');
  }
  return SEGREDO_DEV;
}

export function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function assinatura(proposito: string, payload: string, chave: string): string {
  return b64url(createHmac('sha256', chave).update(`${proposito}.${payload}`).digest());
}

/** Gera um token assinado. `dados.e` (expiracao em ms) e obrigatorio. */
export function assinarToken<T extends { e: number }>(
  proposito: string,
  dados: T,
  chave = segredo(),
): string {
  const payload = b64url(Buffer.from(JSON.stringify(dados)));
  return `${payload}.${assinatura(proposito, payload, chave)}`;
}

/** Valida assinatura e expiracao. Retorna os dados ou null. */
export function lerToken<T extends { e: number }>(
  proposito: string,
  token: string,
  chave = segredo(),
  agora = Date.now(),
): T | null {
  if (!token || typeof token !== 'string' || token.length > 8192) return null;
  const partes = token.split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  const [payload, recebida] = partes;

  const a = Buffer.from(recebida);
  const b = Buffer.from(assinatura(proposito, payload, chave));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const dados = JSON.parse(b64urlDecode(payload).toString('utf8')) as T;
    if (typeof dados?.e !== 'number' || agora > dados.e) return null;
    return dados;
  } catch {
    return null;
  }
}

/**
 * Identificador estavel e anonimo da conta APMED (HMAC do e-mail).
 * Liga sessao, pagamento e licenca sem guardar o e-mail em lugar nenhum.
 */
export function idConta(email: string, chave = segredo()): string {
  return b64url(
    createHmac('sha256', chave).update(`conta.${email.trim().toLowerCase()}`).digest(),
  ).slice(0, 32);
}
