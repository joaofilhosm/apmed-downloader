'use client';

import { useMemo, useState } from 'react';
import { Icone } from './Icone';
import {
  corDe,
  diasRestantes,
  formatarData,
  formatarDuracao,
  plural,
  sigla,
  type Material,
  type Pedido,
} from '@/lib/cliente';
import type { Progresso, Qualidade } from '@/lib/download';
import { formatarReais } from '@/lib/precos';

export type OpcoesDownload = { qualidade: Qualidade; incluirPngs: boolean };

export type DownloadEmAndamento = {
  rotulo: string;
  inicio: number;
  progresso: Progresso | null;
};

function PainelProgresso({
  atual,
  aoCancelar,
}: {
  atual: DownloadEmAndamento;
  aoCancelar: () => void;
}) {
  const p = atual.progresso;
  const pct = p && p.paginasTotal ? Math.min(100, Math.round((p.paginasBaixadas / p.paginasTotal) * 100)) : 0;
  const decorrido = (Date.now() - atual.inicio) / 1000;
  // Estimativa simples: ritmo medio ate agora.
  const eta = pct > 3 && pct < 100 ? (decorrido / pct) * (100 - pct) : null;

  return (
    <div className="cartao painel-progresso" role="region" aria-label="Download em andamento">
      <div className="linha">
        <span className="girando" style={{ color: 'var(--primary)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{atual.rotulo}</strong>
          <div className="muted pequeno">{p?.etapa || 'Preparando...'}</div>
        </div>
        <button className="btn btn-perigo btn-pequeno" onClick={aoCancelar}>
          <Icone nome="x" tamanho={14} /> Cancelar
        </button>
      </div>
      <div
        className={`barra ${!p?.paginasTotal ? 'indeterminada' : ''}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do download"
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="numeros">
        <span>{pct}%</span>
        {p?.paginasTotal ? (
          <span>
            {p.paginasBaixadas}/{p.paginasTotal} páginas
          </span>
        ) : null}
        {p?.materiaisTotal ? (
          <span>
            Material {Math.min((p.materiaisConcluidos ?? 0) + 1, p.materiaisTotal)}/{p.materiaisTotal}
          </span>
        ) : null}
        <span>Tempo: {formatarDuracao(decorrido)}</span>
        {eta !== null && <span>Faltam ~{formatarDuracao(eta)}</span>}
      </div>
      <p className="dica mt-8">Mantenha esta aba aberta até o arquivo ser salvo.</p>
    </div>
  );
}

export function MeusDownloads({
  materiais,
  liberados,
  pedidos,
  baixados,
  opcoes,
  emAndamento,
  aoMudarOpcoes,
  aoBaixarUm,
  aoBaixarVarios,
  aoCancelar,
  aoIrParaCatalogo,
}: {
  materiais: Material[];
  liberados: Map<number, number>;
  pedidos: Pedido[];
  baixados: Set<number>;
  opcoes: OpcoesDownload;
  emAndamento: DownloadEmAndamento | null;
  aoMudarOpcoes: (o: OpcoesDownload) => void;
  aoBaixarUm: (id: number) => void;
  aoBaixarVarios: (ids: number[]) => void;
  aoCancelar: () => void;
  aoIrParaCatalogo: () => void;
}) {
  const [marcados, setMarcados] = useState<Set<number>>(new Set());

  const pagos = useMemo(
    () =>
      materiais
        .filter((m) => liberados.has(m.id))
        .sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true })),
    [materiais, liberados],
  );

  const ocupado = !!emAndamento;
  const selecionados = pagos.filter((m) => marcados.has(m.id)).map((m) => m.id);
  const alvoZip = selecionados.length ? selecionados : pagos.map((m) => m.id);

  function alternar(id: number) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <section aria-labelledby="titulo-downloads">
      <div className="secao-titulo">
        <div>
          <h1 id="titulo-downloads">Meus downloads</h1>
          <p>Materiais pagos ficam liberados para baixar de novo enquanto a licença valer.</p>
        </div>
        <button className="btn btn-secundario btn-pequeno" onClick={aoIrParaCatalogo}>
          <Icone nome="livro" tamanho={16} /> Ver catálogo
        </button>
      </div>

      {emAndamento && <PainelProgresso atual={emAndamento} aoCancelar={aoCancelar} />}

      <div className="downloads-layout">
        <div>
          {pagos.length === 0 ? (
            <div className="cartao vazio">
              <div className="icone-grande">
                <Icone nome="download" tamanho={28} />
              </div>
              <h3>Nenhum material liberado ainda</h3>
              <p>Adicione materiais ao carrinho e pague com Pix para liberar o download.</p>
              <button className="btn btn-primario mt-16" onClick={aoIrParaCatalogo}>
                Escolher materiais
              </button>
            </div>
          ) : (
            <>
              <div className="resumo-lista">
                <span>
                  {plural(pagos.length, 'material liberado', 'materiais liberados')}
                  {selecionados.length > 0 && <> · {selecionados.length} marcado(s)</>}
                </span>
                <div className="acoes">
                  <button
                    className="btn btn-fantasma btn-pequeno"
                    onClick={() =>
                      setMarcados(selecionados.length === pagos.length ? new Set() : new Set(pagos.map((m) => m.id)))
                    }
                  >
                    {selecionados.length === pagos.length ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
              </div>
              <div className="lista-downloads">
                {pagos.map((m) => (
                  <div key={m.id} className="linha-download">
                    <input
                      type="checkbox"
                      checked={marcados.has(m.id)}
                      onChange={() => alternar(m.id)}
                      aria-label={`Marcar ${m.titulo}`}
                      style={{ width: 18, height: 18, accentColor: 'var(--primary)' }}
                    />
                    <div
                      className="mini-capa"
                      style={{
                        background: corDe(m.slug),
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: '0.6rem',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                      aria-hidden
                    >
                      {sigla(m).slice(0, 5)}
                    </div>
                    <div className="info">
                      <strong title={m.titulo}>{m.titulo}</strong>
                      <span>
                        Liberado por mais {plural(diasRestantes(liberados.get(m.id)!), 'dia', 'dias')}
                        {baixados.has(m.id) && ' · já baixado'}
                      </span>
                    </div>
                    <button
                      className="btn btn-secundario btn-pequeno"
                      onClick={() => aoBaixarUm(m.id)}
                      disabled={ocupado}
                    >
                      <Icone nome="arquivo" tamanho={15} /> PDF
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="lateral">
          {pagos.length > 0 && (
            <div className="cartao cartao-corpo">
              <strong>Baixar em pacote</strong>
              <p className="muted pequeno mt-8">
                {selecionados.length
                  ? `Gera um ZIP com os ${selecionados.length} marcados.`
                  : `Gera um ZIP com todos os ${pagos.length} materiais liberados.`}
              </p>
              <button
                className="btn btn-primario btn-bloco mt-12"
                onClick={() => aoBaixarVarios(alvoZip)}
                disabled={ocupado}
              >
                <Icone nome="pacote" /> Baixar {plural(alvoZip.length, 'material', 'materiais')} em ZIP
              </button>
            </div>
          )}

          <div className="cartao cartao-corpo">
            <strong>Opções do arquivo</strong>
            <div className="coluna mt-12">
              <span className="rotulo">Qualidade das páginas</span>
              <div className="segmentado" role="group" aria-label="Qualidade">
                <button
                  aria-pressed={opcoes.qualidade === 'padrao'}
                  onClick={() => aoMudarOpcoes({ ...opcoes, qualidade: 'padrao' })}
                >
                  Padrão (leve)
                </button>
                <button
                  aria-pressed={opcoes.qualidade === 'alta'}
                  onClick={() => aoMudarOpcoes({ ...opcoes, qualidade: 'alta' })}
                >
                  Alta (nítida)
                </button>
              </div>
              <label className="check mt-8">
                <input
                  type="checkbox"
                  checked={opcoes.incluirPngs}
                  onChange={(e) => aoMudarOpcoes({ ...opcoes, incluirPngs: e.target.checked })}
                />
                <span>
                  <strong>Incluir imagens originais (PNG)</strong>
                  <span className="dica">Uma pasta com as páginas em 2400px. O arquivo fica bem maior.</span>
                </span>
              </label>
            </div>
          </div>

          {pedidos.length > 0 && (
            <div className="cartao cartao-corpo">
              <div className="linha">
                <Icone nome="recibo" />
                <strong>Histórico de pedidos</strong>
              </div>
              <div className="coluna mt-12" style={{ gap: 8 }}>
                {pedidos.slice(0, 8).map((p) => (
                  <div key={p.id} className="pedido">
                    <div className="topo-pedido">
                      <span>{formatarReais(p.valor)}</span>
                      <span
                        className={`etiqueta ${
                          p.status === 'aprovado' ? 'sucesso' : p.status === 'pendente' ? 'alerta' : ''
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <span className="muted">
                      {formatarData(p.criadoEm)} · {plural(p.materialIds.length, 'material', 'materiais')}
                    </span>
                    <span className="muted" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                      Pedido {p.id.startsWith('sim_') ? 'de teste' : `#${p.id}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
