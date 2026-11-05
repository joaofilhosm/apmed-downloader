// Gera o valor de OPERADOR_SENHA_HASH a partir de uma senha.
//   npm run operador:hash -- 'minha senha'
// A senha nao e gravada em lugar nenhum; so o hash sai na tela.
import { randomBytes, scryptSync } from 'node:crypto';

const senha = process.argv[2];
if (!senha) {
  console.error("Uso: npm run operador:hash -- 'sua senha'");
  process.exit(1);
}
const sal = randomBytes(16);
const hash = scryptSync(senha, sal, 64, { N: 16384, r: 8, p: 1 });
console.log(`scrypt$${sal.toString('base64url')}$${hash.toString('base64url')}`);
