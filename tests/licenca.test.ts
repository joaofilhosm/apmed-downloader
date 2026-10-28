import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assinarToken, idConta, lerToken } from '../src/lib/tokens.ts';
import { emitirLicenca, lerLicenca, licencaCobre } from '../src/lib/licenca.ts';

const CHAVE = 'chave-de-teste-com-tamanho-suficiente';

test('token assinado e lido de volta', () => {
  const t = assinarToken('x', { a: 1, e: Date.now() + 1000 }, CHAVE);
  assert.equal(lerToken<{ a: number; e: number }>('x', t, CHAVE)?.a, 1);
});

test('token expirado, adulterado ou de outro proposito e recusado', () => {
  const t = assinarToken('x', { a: 1, e: Date.now() + 1000 }, CHAVE);
  assert.equal(lerToken('x', t, CHAVE, Date.now() + 5000), null);
  assert.equal(lerToken('y', t, CHAVE), null);
  assert.equal(lerToken('x', t, 'outra-chave-qualquer-1234'), null);
  const [payload, sig] = t.split('.');
  const falso = Buffer.from(JSON.stringify({ a: 2, e: Date.now() + 1000 })).toString('base64url');
  assert.equal(lerToken('x', `${falso}.${sig}`, CHAVE), null);
  assert.equal(lerToken('x', `${payload}`, CHAVE), null);
  assert.equal(lerToken('x', '', CHAVE), null);
});

test('idConta ignora caixa e espacos', () => {
  assert.equal(idConta(' Fulano@Ex.com ', CHAVE), idConta('fulano@ex.com', CHAVE));
  assert.notEqual(idConta('a@ex.com', CHAVE), idConta('b@ex.com', CHAVE));
});

test('licenca cobre apenas a conta e os materiais pagos', () => {
  const conta = idConta('aluno@ex.com', CHAVE);
  const { token } = emitirLicenca(conta, [3, 1, 3], 'pg1', Date.now(), CHAVE);
  assert.deepEqual(lerLicenca(token, CHAVE)?.m, [1, 3]);
  assert.ok(licencaCobre([token], conta, 1, CHAVE));
  assert.ok(licencaCobre(['lixo', token], conta, 3, CHAVE));
  assert.ok(!licencaCobre([token], conta, 2, CHAVE));
  assert.ok(!licencaCobre([token], idConta('outro@ex.com', CHAVE), 1, CHAVE));
});

test('licenca expira', () => {
  const conta = 'c';
  const { token, expiraEm } = emitirLicenca(conta, [1], 'pg', Date.now(), CHAVE);
  assert.ok(!licencaCobre([token], conta, 1, CHAVE, expiraEm + 1));
});

test('token de sessao nao serve como licenca', () => {
  const sessao = assinarToken('sessao.v2', { c: 'cookie', u: 'c', m: [1], e: Date.now() + 1e6 }, CHAVE);
  assert.ok(!licencaCobre([sessao], 'c', 1, CHAVE));
});
