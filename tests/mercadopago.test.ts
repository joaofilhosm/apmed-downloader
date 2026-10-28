import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { dataMercadoPago, validarAssinaturaWebhook } from '../src/lib/mercadopago.ts';

const SEGREDO = 'segredo-webhook';

function assinar(id: string, req: string, ts: string) {
  const v1 = createHmac('sha256', SEGREDO).update(`id:${id};request-id:${req};ts:${ts};`).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

test('assinatura valida do webhook e aceita', () => {
  const ts = String(Math.floor(Date.now() / 1000));
  assert.ok(validarAssinaturaWebhook(assinar('123', 'req-1', ts), 'req-1', '123', SEGREDO));
});

test('assinatura invalida, antiga ou sem segredo e recusada', () => {
  const ts = String(Math.floor(Date.now() / 1000));
  assert.ok(!validarAssinaturaWebhook(assinar('123', 'req-1', ts), 'req-1', '124', SEGREDO));
  assert.ok(!validarAssinaturaWebhook(assinar('123', 'req-1', ts), 'req-2', '123', SEGREDO));
  assert.ok(!validarAssinaturaWebhook(assinar('123', 'req-1', ts), 'req-1', '123', ''));
  assert.ok(!validarAssinaturaWebhook(null, 'req-1', '123', SEGREDO));
  const velho = String(Math.floor(Date.now() / 1000) - 3600);
  assert.ok(!validarAssinaturaWebhook(assinar('123', 'req-1', velho), 'req-1', '123', SEGREDO));
});

test('data no fuso de Brasilia', () => {
  const ms = Date.UTC(2026, 9, 28, 15, 0, 0);
  assert.equal(dataMercadoPago(ms), '2026-10-28T12:00:00.000-03:00');
});
