import { NextRequest, NextResponse } from 'next/server';
import { erro, excedeuLimite, ipDe } from '@/lib/http';
import { credencialOperadorValida, emitirTokenOperador, operadorAtivo } from '@/lib/operador';

export const dynamic = 'force-dynamic';

/**
 * POST /api/operador/entrar
 * Body: { email, senha }
 *
 * Login do operador (modo atendimento). Limite apertado de tentativas e uma
 * pequena espera nas falhas, porque este login libera downloads sem pagamento.
 */
export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  if (excedeuLimite(`operador:${ip}`, 8, 15 * 60 * 1000)) {
    return erro('Muitas tentativas. Aguarde 15 minutos e tente de novo.', 429);
  }

  if (!operadorAtivo()) {
    return erro('O modo atendimento não está ativado neste servidor.', 503);
  }

  let body: { email?: unknown; senha?: unknown };
  try {
    body = await req.json();
  } catch {
    return erro('Requisição inválida.', 400);
  }

  const email = String(body.email || '').slice(0, 200);
  const senha = String(body.senha || '').slice(0, 200);

  if (!(await credencialOperadorValida(email, senha))) {
    await new Promise((r) => setTimeout(r, 700));
    return erro('E-mail ou senha incorretos.', 401);
  }

  const { token, expiraEm } = emitirTokenOperador();
  return NextResponse.json({ ok: true, token, expiraEm });
}
