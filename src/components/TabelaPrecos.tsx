import { FAIXAS, calcularOrcamento, formatarReais } from '@/lib/precos';

/**
 * Escada de precos: cada degrau e uma faixa, mais baixo quanto mais barato.
 * O degrau do carrinho atual fica grifado.
 */
export function TabelaPrecos({ quantidade }: { quantidade: number }) {
  const atual = quantidade > 0 ? calcularOrcamento(quantidade).faixa : null;
  const maior = FAIXAS[0].unitario;
  const menor = FAIXAS[FAIXAS.length - 1].unitario;

  return (
    <div className="escada" role="list" aria-label="Preço de cada material conforme a quantidade no pedido">
      {FAIXAS.map((f, i) => {
        const proxima = FAIXAS[i + 1];
        const qtd = proxima
          ? proxima.minimo - 1 === f.minimo
            ? `${f.minimo}`
            : `${f.minimo}–${proxima.minimo - 1}`
          : `${f.minimo}+`;
        // Altura proporcional ao preco, com piso para o degrau mais barato continuar visivel.
        const altura = 28 + ((f.unitario - menor) / (maior - menor)) * 52;
        const ehAtual = atual?.minimo === f.minimo;
        return (
          <div
            key={f.minimo}
            role="listitem"
            className={`degrau ${ehAtual ? 'atual' : ''}`}
            aria-current={ehAtual ? 'true' : undefined}
            aria-label={`${f.rotulo}: ${formatarReais(f.unitario)} cada`}
          >
            <span className="valor-degrau">{formatarReais(f.unitario).replace('R$', '').trim()}</span>
            <span className="barra-degrau" style={{ height: altura }} />
            <span className="qtd-degrau">{qtd}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Frase sobre o proximo desconto. */
export function MetaDesconto({ quantidade }: { quantidade: number }) {
  const o = calcularOrcamento(quantidade);
  if (quantidade === 0) return <p className="meta-desconto">Quanto mais bancas no pedido, menor o preço de cada uma.</p>;
  if (!o.proxima) {
    return (
      <p className="meta-desconto">
        Você chegou ao menor preço: <strong>{formatarReais(o.unitario)}</strong> por material.
      </p>
    );
  }
  return (
    <p className="meta-desconto">
      Com mais <strong>{o.proxima.faltam}</strong> {o.proxima.faltam === 1 ? 'material' : 'materiais'}, cada um
      passa a custar <strong>{formatarReais(o.proxima.faixa.unitario)}</strong>.
    </p>
  );
}
