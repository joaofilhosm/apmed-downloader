import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  conferirSenha,
  credencialOperadorValida,
  emailOperador,
  emitirTokenOperador,
  gerarHashSenha,
  operadorAtivo,
  tokenOperadorValido,
} from '../src/lib/operador.ts';
import { assinarToken } from '../src/lib/tokens.ts';

const CHAVE = 'chave-de-teste-com-tamanho-suficiente';

test('hash confere a senha certa e recusa a errada', async () => {
  const hash = gerarHashSenha('senha secreta');
  assert.ok(hash.startsWith('scrypt$'));
  assert.ok(!hash.includes('senha secreta'));
  assert.ok(await conferirSenha('senha secreta', hash));
  assert.ok(!(await conferirSenha('outra', hash)));
  assert.ok(!(await conferirSenha('senha secreta', 'lixo')));
});

test('hashes da mesma senha sao diferentes (sal)', () => {
  assert.notEqual(gerarHashSenha('x'), gerarHashSenha('x'));
});

test('modo desligado sem hash: ninguem entra', async () => {
  delete process.env.OPERADOR_SENHA_HASH;
  assert.ok(!operadorAtivo());
  assert.ok(!(await credencialOperadorValida(emailOperador(), 'qualquer')));
});

test('com hash configurado: so e-mail e senha corretos entram', async () => {
  process.env.OPERADOR_SENHA_HASH = gerarHashSenha('abc12345');
  process.env.OPERADOR_EMAIL = 'dono@exemplo.com';
  assert.ok(operadorAtivo());
  assert.ok(await credencialOperadorValida('Dono@Exemplo.com ', 'abc12345'));
  assert.ok(!(await credencialOperadorValida('dono@exemplo.com', 'errada')));
  assert.ok(!(await credencialOperadorValida('outro@exemplo.com', 'abc12345')));
  delete process.env.OPERADOR_SENHA_HASH;
  delete process.env.OPERADOR_EMAIL;
});

test('token do operador expira e nao aceita outros tipos de token', () => {
  const { token, expiraEm } = emitirTokenOperador(Date.now(), CHAVE);
  assert.ok(tokenOperadorValido(token, CHAVE));
  assert.ok(!tokenOperadorValido(token, CHAVE, expiraEm + 1));
  assert.ok(!tokenOperadorValido(assinarToken('sessao.v2', { e: Date.now() + 1e6 }, CHAVE), CHAVE));
  assert.ok(!tokenOperadorValido(assinarToken('licenca.v1', { e: Date.now() + 1e6 }, CHAVE), CHAVE));
  assert.ok(!tokenOperadorValido('', CHAVE));
});
