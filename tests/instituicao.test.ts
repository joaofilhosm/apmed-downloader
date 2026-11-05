import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectarInstituicao } from '../src/lib/instituicao.ts';

// Titulos reais do portal.
const casos: [string, string][] = [
  ['BIBLIA HSL 2027', 'HSL'],
  ['BIBLIA PUC-PR 2027', 'PUC-PR'],
  ['BIBLIA HOSPITAL DO TRABALHADOR 2027', 'HOSPITAL DO TRABALHADOR'],
  ['BIBLIA HOSPITAL SANTA LUCIA 2027', 'HOSPITAL SANTA LUCIA'],
  ['BIBLIA SANTA CASA DE ARAÇATUBA', 'SANTA CASA DE ARAÇATUBA'],
  ['AMPLIADA BÍBLIA SUS-SP 2027', 'SUS-SP'],
  ['BÍBLIA HUSF 2027', 'HUSF'],
  ['BIBLIA FBHC 2027', 'FBHC'],
  ['BIBLIA PEDIATRIA ENAMED', 'ENAMED'],
  ['BIBLIA CLINICA MÉDICA ENAMED', 'ENAMED'],
  ['BIBLIA CLINICA MÉDICA ESTAGIO - DERMATOLOGIA', 'CLINICA MÉDICA ESTAGIO - DERMATOLOGIA'],
];

for (const [titulo, esperado] of casos) {
  test(titulo, () => assert.equal(detectarInstituicao(titulo).instituicao, esperado));
}

test('versao ampliada fica na mesma instituicao da normal', () => {
  assert.equal(
    detectarInstituicao('AMPLIADA BÍBLIA SUS-SP 2027').slug,
    detectarInstituicao('BIBLIA SUS-SP 2027').slug,
  );
});

test('hospitais diferentes nao se misturam', () => {
  assert.notEqual(
    detectarInstituicao('BIBLIA HOSPITAL DO TRABALHADOR 2027').slug,
    detectarInstituicao('BIBLIA HOSPITAL SANTA LUCIA 2027').slug,
  );
});
