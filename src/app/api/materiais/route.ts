import { NextRequest, NextResponse } from 'next/server';
import {
  criarSessao,
  listarMateriais,
  destruirSessao,
  ApmedError,
  type Material,
} from '@/lib/apmed';
import { erro, excedeuLimite, ipDe, sessaoDe } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMAIL_VALIDO = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function publico(m: Material) {
  return {
    id: m.id,
    titulo: m.titulo,
    descricao: m.descricao,
    tags: m.tags,
    instituicao: m.instituicao,
    slug: m.slug,
    atualizadoEm: m.atualizadoEm,
  };
}

/**
 * POST /api/materiais
 * Body: { email, senha }
 * Cria a sessao e devolve a lista de materiais da conta.
 */
export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  if (excedeuLimite(`login:${ip}`, 20, 10 * 60 * 1000)) {
    return erro('Muitas tentativas de acesso. Aguarde alguns minutos e tente de novo.', 429);
  }

  let body: { email?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return erro('Requisicao invalida.', 400);
  }

  const email = String(body.email || '').trim();
  const senha = String(body.senha || '');

  if (!email || !senha) return erro('Preencha o e-mail e a senha.', 400);
  if (!EMAIL_VALIDO.test(email)) return erro('Esse e-mail nao parece valido.', 400);
  if (senha.length > 200) return erro('Senha longa demais.', 400);

  try {
    const sessao = await criarSessao(email, senha);
    const materiais = await listarMateriais(sessao.cookie, false);

    return NextResponse.json({
      ok: true,
      sessaoId: sessao.id,
      conta: sessao.conta,
      expiraEm: sessao.expiraEm,
      total: materiais.length,
      materiais: materiais.map(publico),
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    console.error('[apmed] erro inesperado no login:', e instanceof Error ? e.message : e);
    return erro('Nao foi possivel conectar ao portal APMED agora. Tente novamente.', 502);
  }
}

/**
 * GET /api/materiais  (cabecalho x-sessao)
 * Recarrega a lista de materiais sem pedir a senha de novo.
 */
export async function GET(req: NextRequest) {
  const sessao = sessaoDe(req);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  try {
    const materiais = await listarMateriais(sessao.cookie, false);
    return NextResponse.json({
      ok: true,
      total: materiais.length,
      expiraEm: sessao.expiraEm,
      materiais: materiais.map(publico),
    });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    return erro('Falha ao recarregar a lista.', 502);
  }
}

/** DELETE /api/materiais  (cabecalho x-sessao) encerra a sessao. */
export async function DELETE(req: NextRequest) {
  const token = req.headers.get('x-sessao') || req.nextUrl.searchParams.get('sessaoId') || '';
  await destruirSessao(token);
  return NextResponse.json({ ok: true });
}
