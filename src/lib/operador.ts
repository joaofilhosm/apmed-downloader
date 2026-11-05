/**
 * Modo atendimento (venda direta).
 *
 * O operador (dono do servico) entra com um usuario fixo e, para cada cliente
 * que pagou por fora, abre a conta APMED dele e baixa o que foi pedido, sem
 * passar pelo carrinho e pelo Pix.
 *
 * A senha do operador NUNCA fica no codigo nem no repositorio: so o hash
 * (scrypt) vem das variaveis de ambiente. Sem OPERADOR_SENHA_HASH o modo
 * atendimento fica desligado.
 *
 *   OPERADOR_EMAIL       e-mail do operador (padrao: joaofilhophp@gmail.com)
 *   OPERADOR_SENHA_HASH  gerado por `npm run operador:hash`
 */

import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { assinarToken, lerToken } from './tokens';

const PROPOSITO = 'operador.v1';
const EMAIL_PADRAO = 'joaofilhophp@gmail.com';

/** Quanto tempo o operador fica logado (8h: um turno de atendimento). */
export const OPERADOR_TTL_MS = 8 * 60 * 60 * 1000;

const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const TAMANHO = 64;

export function emailOperador(): string {
  return (process.env.OPERADOR_EMAIL || EMAIL_PADRAO).trim().toLowerCase();
}

export function operadorAtivo(): boolean {
  return /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/.test(process.env.OPERADOR_SENHA_HASH || '');
}

/** Gera o hash que vai em OPERADOR_SENHA_HASH. */
export function gerarHashSenha(senha: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, TAMANHO, PARAMS);
  return `scrypt$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

function derivar(senha: string, sal: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(senha, sal, TAMANHO, PARAMS, (e, chave) => (e ? reject(e) : resolve(chave))),
  );
}

/** Compara em tempo constante. `hash` no formato de gerarHashSenha. */
export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  const [tipo, sal, esperado] = hash.split('$');
  if (tipo !== 'scrypt' || !sal || !esperado) return false;
  try {
    const a = await derivar(senha, Buffer.from(sal, 'base64url'));
    const b = Buffer.from(esperado, 'base64url');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Hash descartavel para gastar o mesmo tempo quando o modo esta desligado.
const HASH_FALSO = gerarHashSenha('x');

/** Confere e-mail e senha do operador. Sempre gasta o mesmo trabalho. */
export async function credencialOperadorValida(email: string, senha: string): Promise<boolean> {
  const ativo = operadorAtivo();
  const senhaOk = await conferirSenha(senha, ativo ? (process.env.OPERADOR_SENHA_HASH as string) : HASH_FALSO);
  const emailOk = email.trim().toLowerCase() === emailOperador();
  return ativo && emailOk && senhaOk;
}

export function emitirTokenOperador(agora = Date.now(), chave?: string): { token: string; expiraEm: number } {
  const e = agora + OPERADOR_TTL_MS;
  return { token: assinarToken(PROPOSITO, { e }, chave), expiraEm: e };
}

export function tokenOperadorValido(token: string, chave?: string, agora?: number): boolean {
  return !!lerToken<{ e: number }>(PROPOSITO, token, chave, agora);
}
