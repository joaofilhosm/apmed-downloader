import { NextRequest, NextResponse } from 'next/server';
import { ApmedError, criarSessao, listarMateriais } from '@/lib/apmed';
import { erro, excedeuLimite, tokenOperadorDe } from '@/lib/http';
import { tokenOperadorValido } from '@/lib/operador';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_VALIDO = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

/**
 * POST /api/operador/atender   (cabecalho x-operador)
 * Body: { email, senha }  -> credenciais APMED do CLIENTE
 *
 * Abre a conta do cliente no portal e devolve uma sessao de atendimento:
 * ela baixa qualquer material da conta sem passar pelo pagamento. Sem o
 * token do operador, nao existe como obter essa sessao.
 */
export async function POST(req: NextRequest) {
  const token = tokenOperadorDe(req);
  if (!tokenOperadorValido(token)) {
    return erro('Sua entrada como operador expirou. Entre de novo.', 401);
  }
  if (excedeuLimite(`atender:${token.slice(-16)}`, 60, 60 * 60 * 1000)) {
    return erro('Muitos atendimentos seguidos. Aguarde um pouco.', 429);
  }

  let body: { email?: unknown; senha?: unknown };
  try {
    body = await req.json();
  } catch {
    return erro('Requisição inválida.', 400);
  }

  const email = String(body.email || '').trim();
  const senha = String(body.senha || '');
  if (!email || !senha) return erro('Preencha o e-mail e a senha do cliente.', 400);
  if (!EMAIL_VALIDO.test(email)) return erro('Esse e-mail não parece válido.', 400);
  if (senha.length > 200) return erro('Senha longa demais.', 400);

  try {
    const sessao = await criarSessao(email, senha, true);
    const materiais = await listarMateriais(sessao.cookie, false);
    // Registro de auditoria sem dados pessoais: so o id anonimo da conta.
    console.info('[operador] atendimento aberto', sessao.conta, `${materiais.length} materiais`);

    return NextResponse.json({
      ok: true,
      sessaoId: sessao.id,
      conta: sessao.conta,
      expiraEm: sessao.expiraEm,
      total: materiais.length,
      materiais: materiais.map((m) => ({
        id: m.id,
        titulo: m.titulo,
        descricao: m.descricao,
        tags: m.tags,
        instituicao: m.instituicao,
        slug: m.slug,
        atualizadoEm: m.atualizadoEm,
      })),
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[operador] erro ao abrir atendimento:', e instanceof Error ? e.message : e);
    return erro('Não foi possível conectar ao portal APMED agora. Tente novamente.', 502);
  }
}
