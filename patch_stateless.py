import pathlib

p = pathlib.Path('/workspace/apmed-app/src/lib/apmed.ts')
s = p.read_text(encoding='utf-8')

# 1) Trocar o storage em memoria por sessoes stateless assinadas (HMAC)
old_block_start = s.index('/** Sessões ativas: sessionId -> { cookie, criadoEm, ultimoUso } */')
old_block_end = s.index('/* ------------------------------------------------------------------ */\n/* Requisicoes HTTP')

new_block = '''/**
 * Sessoes stateless assinadas.
 *
 * Em serverless, cada requisicao pode cair numa instancia diferente e o
 * `Map` em memoria nao sobrevive. Por isso a sessao e um token assinado
 * (HMAC-SHA256) que carrega o PHPSESSID do APMED dentro do payload.
 * O servidor valida a assinatura a cada uso, sem precisar de estado.
 *
 * A senha nunca entra no token - apenas o cookie de sessao do APMED.
 */

const SEGREDO = process.env.APMED_SESSION_SECRET || 'apmed-dev-secret-troque-em-producao';

/** Tempo maximo de vida de uma sessao (30 min). */
const SESSAO_TTL_MS = 30 * 60 * 1000;

''' 

s = s[:old_block_start] + new_block + s[old_block_end:]

p.write_text(s, encoding='utf-8')
print("bloco de sessoes substituido (parte 1)")
