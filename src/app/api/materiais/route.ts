import { NextRequest, NextResponse } from 'next/server';
import {
  criarSessao,
  listarMateriais,
  obterSessao,
  destruirSessao,
  ApmedError,
  type Material,
} from '@/lib/apmed';

// Downstream pode precisar de mais de 60s para responder.
export const dynamic = 'force-dynamic';

/** Rate limit simples por IP: maximo de 20 logins por 10 minutos. */
const tentativas = new Map<string, number[]>();
const LIMITE = 20;
const JANELA_MS = 10 * 60 * 1000;

function excedeu(ip: string): boolean {
  const agora = Date.now();
  const lista = (tentativas.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  lista.push(agora);
  tentativas.set(ip, lista);
  return lista.length > LIMITE;
}

function ip(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'desconhecido'
  );
}

function erro(mensagem: string, status = 500) {
  return NextResponse.json({ ok: false, erro: mensagem }, { status });
}

/**
 * POST /api/materiais
 * Body: { email, senha, instituicoes?: string[] }
 * Cria a sessao e devolve a lista de materiais (ja filtrada seasked).
 */
export async function POST(req: NextRequest) {
  if (excedeu(ip(req))) {
    return erro('Muitas tentativas de acesso. Aguarde alguns minutos e tente de novo.', 429);
  }

  let body: { email?: string; senha?: string; instituicoes?: string[] };
  try {
    body = await req.json();
  } catch {
    return erro('Requisicao invalida.', 400);
  }

  const email = (body.email || '').trim();
  const senha = body.senha || '';

  if (!email || !senha) {
    return erro('Preencha o e-mail e a senha.', 400);
  }

  try {
    const sessao = await criarSessao(email, senha);
    const materiais = await listarMateriais(sessao.cookie);

    const filtro = (body.instituicoes || []).map((s) => s.toLowerCase().trim());
    const selecionados: Material[] = filtro.length
      ? materiais.filter((m) => filtro.includes(m.slug))
      : materiais;

    return NextResponse.json({
      ok: true,
      sessaoId: sessao.id,
      total: materiais.length,
      materiais: selecionados.map((m) => ({
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
    console.error('[apmed] erro inesperado no login:', e instanceof Error ? e.message : e);
    return erro('Nao foi possivel conectar ao portal APMED agora. Tente novamente.', 502);
  }
}

/**
 * GET /api/materiais?sessaoId=...&slug=...
 * Reusa uma sessao ja criada (usado ao trocar o filtro na interface).
 */
export async function GET(req: NextRequest) {
  const sessaoId = req.nextUrl.searchParams.get('sessaoId') || '';
  const slug = (req.nextUrl.searchParams.get('slug') || '').toLowerCase().trim();

  const sessao = obterSessao(sessaoId);
  if (!sessao) return erro('Sua sessao expirou. Entre novamente.', 401);

  try {
    const materiais = await listarMateriais(sessao.cookie);
    const filtrados = slug ? materiais.filter((m) => m.slug === slug) : materiais;
    return NextResponse.json({ ok: true, total: materiais.length, materiais: filtrados });
  } catch (e) {
    if (e instanceof ApmedError) return erro(e.message, e.status);
    return erro('Falha ao recarregar a lista.', 502);
  }
}

/** DELETE /api/materiais?sessaoId=... encerra a sessao. */
export async function DELETE(req: NextRequest) {
  const sessaoId = req.nextUrl.searchParams.get('sessaoId') || '';
  await destruirSessao(sessaoId);
  return NextResponse.json({ ok: true });
}
