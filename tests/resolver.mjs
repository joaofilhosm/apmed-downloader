// Permite que os testes importem os modulos do app sem extensao (como o
// bundler do Next faz), resolvendo `./tokens` para `./tokens.ts`.
import { register } from 'node:module';

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(especificador, contexto, proximo) {
  try {
    return await proximo(especificador, contexto);
  } catch (e) {
    if (especificador.startsWith('.') && !/\\.[cm]?[jt]s$/.test(especificador)) {
      return proximo(especificador + '.ts', contexto);
    }
    throw e;
  }
}`),
  import.meta.url,
);
