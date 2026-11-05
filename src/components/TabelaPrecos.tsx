import { FAIXAS, PRECO_BASE, calcularOrcamento, formatarReais } from '@/lib/precos';

/** Tabela das faixas de preco, destacando a faixa do carrinho atual. */
export function TabelaPrecos({ quantidade, compacta = false }: { quantidade: number; compacta?: boolean }) {
  const atual = quantidade > 0 ? calcularOrcamento(quantidade).faixa : null;
  return (
    <div className="faixas" role="table" aria-label="Preço por material conforme a quantidade">
      {FAIXAS.map((f) => {
        const off = Math.round((1 - f.unitario / PRECO_BASE) * 100);
        return (
          <div
            key={f.minimo}
            role="row"
            className={`faixa ${atual?.minimo === f.minimo ? 'atual' : ''}`}
            aria-current={atual?.minimo === f.minimo ? 'true' : undefined}
          >
            <span role="cell">{f.rotulo}</span>
            <span role="cell">
              {formatarReais(f.unitario)}
              {!compacta && <span className="muted pequeno"> /cada</span>}
              {off > 0 && <span className="off">-{off}%</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Barra "faltam N materiais para o proximo desconto". */
export function MetaDesconto({ quantidade }: { quantidade: number }) {
  const o = calcularOrcamento(quantidade);
  if (!o.proxima) {
    return (
      <div className="meta-desconto">
        <div className="trilho">
          <div className="enchimento" style={{ width: '100%' }} />
        </div>
        <p>
          🎉 Você chegou ao <strong>maior desconto</strong>: {formatarReais(o.unitario)} por material.
        </p>
      </div>
    );
  }
  const base = o.faixa.minimo;
  const alvo = o.proxima.faixa.minimo;
  const pct = quantidade === 0 ? 0 : Math.min(100, ((quantidade - base + 1) / (alvo - base + 1)) * 100);
  return (
    <div className="meta-desconto">
      <div className="trilho" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="enchimento" style={{ width: `${pct}%` }} />
      </div>
      <p>
        {quantidade === 0 ? (
          <>Adicione materiais ao carrinho para começar.</>
        ) : (
          <>
            Adicione mais <strong>{o.proxima.faltam}</strong>{' '}
            {o.proxima.faltam === 1 ? 'material' : 'materiais'} e pague{' '}
            <strong>{formatarReais(o.proxima.faixa.unitario)}</strong> em cada um.
          </>
        )}
      </p>
    </div>
  );
}
