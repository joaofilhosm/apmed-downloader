import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOrcamento, faixaPara, FAIXAS, PRECO_BASE } from '../src/lib/precos.ts';

test('1 material custa o preco cheio', () => {
  const o = calcularOrcamento(1);
  assert.equal(o.unitario, PRECO_BASE);
  assert.equal(o.total, 1500);
  assert.equal(o.desconto, 0);
});

test('o preco unitario nunca sobe quando a quantidade aumenta', () => {
  let anterior = Infinity;
  for (let q = 1; q <= 60; q++) {
    const { unitario } = calcularOrcamento(q);
    assert.ok(unitario <= anterior, `subiu em q=${q}`);
    anterior = unitario;
  }
});

test('o total nunca diminui ao adicionar um material', () => {
  for (let q = 1; q < 60; q++) {
    assert.ok(calcularOrcamento(q + 1).total > calcularOrcamento(q).total, `q=${q}`);
  }
});

test('faixas conhecidas', () => {
  assert.equal(calcularOrcamento(2).total, 2700);
  assert.equal(calcularOrcamento(3).total, 3600);
  assert.equal(calcularOrcamento(5).total, 5250);
  assert.equal(calcularOrcamento(10).total, 9500);
  assert.equal(calcularOrcamento(10).percentualDesconto, 37);
});

test('proxima faixa informa quantos faltam', () => {
  const o = calcularOrcamento(3);
  assert.equal(o.proxima?.faixa.minimo, 5);
  assert.equal(o.proxima?.faltam, 2);
  assert.equal(calcularOrcamento(10).proxima, null);
});

test('carrinho vazio e entradas invalidas', () => {
  assert.equal(calcularOrcamento(0).total, 0);
  assert.equal(calcularOrcamento(-3).total, 0);
  assert.equal(calcularOrcamento(2.9).quantidade, 2);
  assert.equal(faixaPara(1000), FAIXAS[FAIXAS.length - 1]);
});
