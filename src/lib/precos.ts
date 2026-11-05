/**
 * Motor de precos progressivos.
 *
 * Compartilhado entre navegador (exibicao do carrinho) e servidor (valor
 * cobrado). O servidor SEMPRE recalcula o valor - o que o navegador mostra
 * e apenas informativo.
 *
 * Regra: quanto mais materiais no mesmo pedido, menor o preco de CADA um.
 * O preco da faixa vale para todos os itens do pedido.
 *
 * Todos os valores sao em centavos para evitar erro de ponto flutuante.
 */

export type Faixa = {
  /** Quantidade minima de materiais para entrar na faixa. */
  minimo: number;
  /** Preco unitario em centavos. */
  unitario: number;
  /** Rotulo curto para a interface. */
  rotulo: string;
};

/** Preco cheio de um material, em centavos. */
export const PRECO_BASE = 1500;

/** Faixas ordenadas da menor para a maior quantidade. */
export const FAIXAS: Faixa[] = [
  { minimo: 1, unitario: 1500, rotulo: '1 material' },
  { minimo: 2, unitario: 1350, rotulo: '2 materiais' },
  { minimo: 3, unitario: 1200, rotulo: '3 a 4 materiais' },
  { minimo: 5, unitario: 1050, rotulo: '5 a 9 materiais' },
  { minimo: 10, unitario: 950, rotulo: '10 ou mais' },
];

/** Limite de materiais por pedido (protege contra abuso e erros de clique). */
export const MAX_ITENS_PEDIDO = 60;

export type Orcamento = {
  quantidade: number;
  unitario: number;
  subtotal: number;
  desconto: number;
  total: number;
  percentualDesconto: number;
  faixa: Faixa;
  /** Proxima faixa, se existir, e quantos itens faltam para chegar nela. */
  proxima: { faixa: Faixa; faltam: number; economiaPorItem: number } | null;
};

export function faixaPara(quantidade: number): Faixa {
  let atual = FAIXAS[0];
  for (const f of FAIXAS) if (quantidade >= f.minimo) atual = f;
  return atual;
}

export function calcularOrcamento(quantidade: number): Orcamento {
  const q = Math.max(0, Math.floor(quantidade));
  const faixa = faixaPara(Math.max(1, q));
  const subtotal = q * PRECO_BASE;
  const total = q * faixa.unitario;
  const desconto = subtotal - total;

  const idx = FAIXAS.indexOf(faixa);
  const seguinte = FAIXAS[idx + 1];
  const proxima = seguinte
    ? {
        faixa: seguinte,
        faltam: Math.max(0, seguinte.minimo - q),
        economiaPorItem: faixa.unitario - seguinte.unitario,
      }
    : null;

  return {
    quantidade: q,
    unitario: q ? faixa.unitario : 0,
    subtotal,
    desconto,
    total,
    percentualDesconto: subtotal ? Math.round((desconto / subtotal) * 100) : 0,
    faixa,
    proxima,
  };
}

/** Formata centavos como moeda brasileira (R$ 12,34). */
export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
