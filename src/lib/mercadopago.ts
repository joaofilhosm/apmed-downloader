/**
 * Integracao com o Mercado Pago (Pix).
 *
 * Fluxo:
 *  1. criarPix(): POST /v1/payments com payment_method_id=pix. O Mercado
 *     Pago devolve o QR Code e o "copia e cola".
 *  2. consultarPagamento(): GET /v1/payments/{id}. E a UNICA fonte da
 *     verdade sobre o pagamento - nunca confiamos no que o navegador diz.
 *  3. Webhook (opcional): o Mercado Pago avisa quando o status muda. A
 *     assinatura `x-signature` e validada com MERCADOPAGO_WEBHOOK_SECRET.
 *
 * Os materiais e a conta vao no `metadata` do pagamento. Assim, ao liberar
 * o download, o servidor le do proprio Mercado Pago o que foi pago - o
 * cliente nao consegue trocar os itens depois de pagar.
 *
 * Sem MERCADOPAGO_ACCESS_TOKEN, em desenvolvimento, entra o modo simulado:
 * o pagamento e aprovado sozinho apos alguns segundos (para testar a
 * interface). Em producao o modo simulado nunca e ativado.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { assinarToken, lerToken } from './tokens';

const API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 20000;

/** Validade do QR Code Pix, em minutos. */
export const MINUTOS_PIX = Math.min(
  Math.max(Number(process.env.PIX_EXPIRACAO_MINUTOS || 30), 5),
  24 * 60,
);

/** Em modo simulado, depois de quantos ms o pagamento "cai". */
const SIMULADO_APROVA_EM_MS = 8000;

export type StatusPagamento =
  | 'pending'
  | 'approved'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back'
  | 'expired';

export type PixCriado = {
  id: string;
  status: StatusPagamento;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiraEm: number;
  simulado: boolean;
};

export type PagamentoConsultado = {
  id: string;
  status: StatusPagamento;
  valor: number; // centavos
  conta: string;
  materiais: number[];
  simulado: boolean;
};

export class PagamentoError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'PagamentoError';
    this.status = status;
  }
}

function accessToken(): string {
  return (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

export function modoPagamento(): 'mercadopago' | 'simulado' | 'desativado' {
  if (accessToken()) return 'mercadopago';
  if (process.env.NODE_ENV !== 'production') return 'simulado';
  return 'desativado';
}

/** Data no formato que o Mercado Pago aceita, no fuso de Brasilia. */
export function dataMercadoPago(ms: number): string {
  const brt = new Date(ms - 3 * 60 * 60 * 1000);
  return brt.toISOString().replace('Z', '-03:00');
}

function materiaisDeTexto(texto: unknown): number[] {
  return String(texto ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

async function chamar(caminho: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    throw new PagamentoError('Nao foi possivel falar com o Mercado Pago. Tente de novo.', 502);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Criar Pix                                                           */
/* ------------------------------------------------------------------ */

export type PedidoPix = {
  valor: number; // centavos
  descricao: string;
  email: string;
  conta: string;
  materiais: number[];
  urlNotificacao?: string;
};

export async function criarPix(pedido: PedidoPix): Promise<PixCriado> {
  const expiraEm = Date.now() + MINUTOS_PIX * 60 * 1000;
  const modo = modoPagamento();

  if (modo === 'desativado') {
    throw new PagamentoError(
      'Pagamentos ainda nao foram configurados neste servidor. Avise o administrador.',
      503,
    );
  }

  if (modo === 'simulado') {
    const id = `sim_${assinarToken('pix.simulado', {
      c: pedido.conta,
      m: pedido.materiais,
      v: pedido.valor,
      t: Date.now(),
      e: expiraEm,
    })}`;
    return {
      id,
      status: 'pending',
      qrCode: `00020126SIMULADO-APMED-${pedido.valor}-${pedido.materiais.join('-')}5204000053039865802BR6304TEST`,
      qrCodeBase64: '',
      ticketUrl: '',
      expiraEm,
      simulado: true,
    };
  }

  const corpo: Record<string, unknown> = {
    transaction_amount: Number((pedido.valor / 100).toFixed(2)),
    description: pedido.descricao.slice(0, 250),
    payment_method_id: 'pix',
    date_of_expiration: dataMercadoPago(expiraEm),
    external_reference: `apmed-${randomUUID()}`,
    payer: { email: pedido.email },
    metadata: {
      conta: pedido.conta,
      materiais: pedido.materiais.join(','),
      origem: 'apmed-downloader',
    },
  };
  if (pedido.urlNotificacao) corpo.notification_url = pedido.urlNotificacao;

  const res = await chamar('/v1/payments', {
    method: 'POST',
    body: JSON.stringify(corpo),
    headers: { 'X-Idempotency-Key': randomUUID() },
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    console.error('[mercadopago] erro ao criar pix:', res.status, json?.message);
    throw new PagamentoError('O Mercado Pago recusou a criacao do Pix. Tente novamente.', 502);
  }

  const dados = json.point_of_interaction?.transaction_data || {};
  if (!json.id || !dados.qr_code) {
    throw new PagamentoError('O Mercado Pago nao devolveu o QR Code do Pix.', 502);
  }

  return {
    id: String(json.id),
    status: json.status as StatusPagamento,
    qrCode: String(dados.qr_code),
    qrCodeBase64: String(dados.qr_code_base64 || ''),
    ticketUrl: String(dados.ticket_url || ''),
    expiraEm,
    simulado: false,
  };
}

/* ------------------------------------------------------------------ */
/* Consultar                                                           */
/* ------------------------------------------------------------------ */

export function idValido(id: string): boolean {
  if (id.startsWith('sim_')) return id.length < 4096;
  return /^\d{1,20}$/.test(id);
}

export async function consultarPagamento(id: string): Promise<PagamentoConsultado> {
  if (!idValido(id)) throw new PagamentoError('Pagamento invalido.', 400);

  if (id.startsWith('sim_')) {
    if (modoPagamento() !== 'simulado') throw new PagamentoError('Pagamento invalido.', 400);
    const dados = lerToken<{ c: string; m: number[]; v: number; t: number; e: number }>(
      'pix.simulado',
      id.slice(4),
      undefined,
      // o token simulado continua legivel apos expirar, para mostrar "expirado"
      0,
    );
    if (!dados) throw new PagamentoError('Pagamento nao encontrado.', 404);
    const agora = Date.now();
    const status: StatusPagamento =
      agora - dados.t >= SIMULADO_APROVA_EM_MS ? 'approved' : agora > dados.e ? 'expired' : 'pending';
    return { id, status, valor: dados.v, conta: dados.c, materiais: dados.m, simulado: true };
  }

  const res = await chamar(`/v1/payments/${id}`);
  if (res.status === 404) throw new PagamentoError('Pagamento nao encontrado.', 404);
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new PagamentoError('Nao foi possivel consultar o pagamento.', 502);

  return {
    id: String(json.id),
    status: json.status as StatusPagamento,
    valor: Math.round(Number(json.transaction_amount || 0) * 100),
    conta: String(json.metadata?.conta || ''),
    materiais: materiaisDeTexto(json.metadata?.materiais),
    simulado: false,
  };
}

/* ------------------------------------------------------------------ */
/* Webhook                                                             */
/* ------------------------------------------------------------------ */

/**
 * Valida o cabecalho `x-signature` do Mercado Pago.
 * Manifesto: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 */
export function validarAssinaturaWebhook(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string,
  chave = process.env.MERCADOPAGO_WEBHOOK_SECRET || '',
  agora = Date.now(),
  toleranciaMs = 10 * 60 * 1000,
): boolean {
  if (!chave || !xSignature) return false;
  const partes = Object.fromEntries(
    xSignature.split(',').map((p) => {
      const [k, ...v] = p.split('=');
      return [k.trim(), v.join('=').trim()];
    }),
  );
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;

  const tsMs = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(agora - tsMs) > toleranciaMs) return false;

  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifesto = '';
  if (id) manifesto += `id:${id};`;
  if (xRequestId) manifesto += `request-id:${xRequestId};`;
  manifesto += `ts:${ts};`;

  const esperado = createHmac('sha256', chave).update(manifesto).digest('hex');
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Status que liberam o download. */
export function pagamentoAprovado(status: StatusPagamento): boolean {
  return status === 'approved';
}

/** Status finais sem aprovacao (nao adianta continuar consultando). */
export function pagamentoEncerrado(status: StatusPagamento): boolean {
  return ['rejected', 'cancelled', 'refunded', 'charged_back', 'expired'].includes(status);
}
