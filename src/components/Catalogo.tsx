'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from './Icone';
import { useDialogo } from './Modal';
import {
  chaves,
  combina,
  corDe,
  dataPortal,
  diasRestantes,
  extrairAno,
  gravar,
  ler,
  normalizarBusca,
  plural,
  sigla,
  type Material,
} from '@/lib/cliente';
import { calcularOrcamento, formatarReais, PRECO_BASE } from '@/lib/precos';

type Ordem = 'titulo' | 'recentes' | 'instituicao' | 'id';
type Situacao = 'todos' | 'disponiveis' | 'comprados';

/** Destaca os termos da busca dentro do texto. */
function Destaque({ texto, busca }: { texto: string; busca: string }) {
  const termos = normalizarBusca(busca).split(' ').filter((t) => t.length > 1);
  if (!termos.length) return <>{texto}</>;
  const norm = normalizarBusca(texto);
  // Mapa de posicoes destacadas (normalizar preserva o comprimento para letras latinas).
  const marcar = new Array(texto.length).fill(false);
  if (norm.length === texto.length) {
    for (const t of termos) {
      let i = norm.indexOf(t);
      while (i !== -1) {
        for (let k = i; k < i + t.length; k++) marcar[k] = true;
        i = norm.indexOf(t, i + t.length);
      }
    }
  }
  const pedacos: React.ReactNode[] = [];
  let i = 0;
  while (i < texto.length) {
    let j = i;
    while (j < texto.length && marcar[j] === marcar[i]) j++;
    const trecho = texto.slice(i, j);
    pedacos.push(marcar[i] ? <mark key={i}>{trecho}</mark> : trecho);
    i = j;
  }
  return <>{pedacos}</>;
}

export function Catalogo({
  materiais,
  carregando,
  noCarrinho,
  liberados,
  aoAlternar,
  aoAdicionarVarios,
  aoRemoverVarios,
  aoRecarregar,
  aoIrParaDownloads,
}: {
  materiais: Material[];
  carregando: boolean;
  noCarrinho: Set<number>;
  liberados: Map<number, number>;
  aoAlternar: (id: number) => void;
  aoAdicionarVarios: (ids: number[]) => void;
  aoRemoverVarios: (ids: number[]) => void;
  aoRecarregar: () => void;
  aoIrParaDownloads: () => void;
}) {
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca);
  const [instituicao, setInstituicao] = useState('');
  const [ano, setAno] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('todos');
  const [ordem, setOrdem] = useState<Ordem>('titulo');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const refIndice = useDialogo(filtrosAbertos, () => setFiltrosAbertos(false));

  useEffect(() => setOrdem(ler<Ordem>(chaves.ordem, 'titulo')), []);
  useEffect(() => gravar(chaves.ordem, ordem), [ordem]);

  // Atalho "/" foca a busca.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      const digitando = ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
      if (e.key === '/' && !digitando) {
        e.preventDefault();
        buscaRef.current?.focus();
      }
    }
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  const instituicoes = useMemo(() => {
    const mapa = new Map<string, { slug: string; nome: string; total: number }>();
    for (const m of materiais) {
      const atual = mapa.get(m.slug);
      if (atual) atual.total += 1;
      else mapa.set(m.slug, { slug: m.slug, nome: m.instituicao, total: 1 });
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [materiais]);

  const anos = useMemo(
    () =>
      [...new Set(materiais.map((m) => extrairAno(m.titulo)).filter(Boolean) as string[])].sort().reverse(),
    [materiais],
  );

  const visiveis = useMemo(() => {
    const lista = materiais.filter(
      (m) =>
        (!instituicao || m.slug === instituicao) &&
        (!ano || extrairAno(m.titulo) === ano) &&
        (situacao === 'todos' ||
          (situacao === 'comprados' ? liberados.has(m.id) : !liberados.has(m.id))) &&
        combina(m, buscaAdiada),
    );
    const cmp: Record<Ordem, (a: Material, b: Material) => number> = {
      titulo: (a, b) => a.instituicao.localeCompare(b.instituicao, 'pt-BR', { numeric: true }),
      recentes: (a, b) => dataPortal(b.atualizadoEm) - dataPortal(a.atualizadoEm) || b.id - a.id,
      instituicao: (a, b) =>
        a.instituicao.localeCompare(b.instituicao, 'pt-BR') || a.titulo.localeCompare(b.titulo, 'pt-BR'),
      id: (a, b) => a.id - b.id,
    };
    return lista.sort(cmp[ordem]);
  }, [materiais, instituicao, ano, situacao, buscaAdiada, ordem, liberados]);

  const disponiveisVisiveis = visiveis.filter((m) => !liberados.has(m.id));
  const todosNoCarrinho =
    disponiveisVisiveis.length > 0 && disponiveisVisiveis.every((m) => noCarrinho.has(m.id));
  const filtrando = !!(busca || instituicao || ano || situacao !== 'todos');
  const qtdFiltros = (instituicao ? 1 : 0) + (ano ? 1 : 0) + (situacao !== 'todos' ? 1 : 0);
  const unitarioAtual = calcularOrcamento(Math.max(1, noCarrinho.size + 1)).unitario;
  const nomeInstituicao = instituicoes.find((i) => i.slug === instituicao)?.nome;

  function limparFiltros() {
    setBusca('');
    setInstituicao('');
    setAno('');
    setSituacao('todos');
  }

  function escolherBanca(slug: string) {
    setInstituicao(instituicao === slug ? '' : slug);
    setFiltrosAbertos(false);
  }

  return (
    <>
      {filtrosAbertos && <div className="veu" onClick={() => setFiltrosAbertos(false)} />}
      <aside
        className={`indice ${filtrosAbertos ? 'aberto' : ''}`}
        aria-label="Filtros"
        ref={refIndice}
        role={filtrosAbertos ? 'dialog' : undefined}
        aria-modal={filtrosAbertos || undefined}
      >
        {filtrosAbertos && (
          <div className="linha entre">
            <strong>Filtros</strong>
            <button className="icone-btn" onClick={() => setFiltrosAbertos(false)} aria-label="Fechar filtros">
              <Icone nome="x" />
            </button>
          </div>
        )}
        <div className="grupo">
          <span className="rotulo">Mostrar</span>
          <div className="segmentado" role="group" aria-label="Situação">
            <button aria-pressed={situacao === 'todos'} onClick={() => setSituacao('todos')}>
              Todos
            </button>
            <button aria-pressed={situacao === 'disponiveis'} onClick={() => setSituacao('disponiveis')}>
              A comprar
            </button>
            <button aria-pressed={situacao === 'comprados'} onClick={() => setSituacao('comprados')}>
              Pagos
            </button>
          </div>
        </div>
        <div className="seletores">
          {anos.length > 1 && (
            <select className="seletor" value={ano} onChange={(e) => setAno(e.target.value)} aria-label="Ano">
              <option value="">Todos os anos</option>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
          <select className="seletor" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
            <option value="titulo">A a Z</option>
            <option value="recentes">Mais recentes</option>
            <option value="id">Ordem do portal</option>
          </select>
        </div>
        <div className="grupo" style={{ flex: 1, minHeight: 0 }}>
          <span className="rotulo">Bancas ({instituicoes.length})</span>
          <ul className="lista-bancas">
            <li>
              <button aria-pressed={instituicao === ''} onClick={() => escolherBanca('')}>
                <span className="cor" style={{ background: 'var(--linha-forte)' }} />
                <span className="nome">Todas as bancas</span>
                <span className="n">{materiais.length}</span>
              </button>
            </li>
            {instituicoes.map((i) => (
              <li key={i.slug}>
                <button aria-pressed={instituicao === i.slug} onClick={() => escolherBanca(i.slug)}>
                  <span className="cor" style={{ background: corDe(i.slug) }} />
                  <span className="nome" title={i.nome}>
                    {i.nome}
                  </span>
                  <span className="n">{i.total}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section aria-labelledby="titulo-catalogo" style={{ minWidth: 0 }}>
        <div className="cabeca-secao">
          <div>
            <h1 id="titulo-catalogo">{nomeInstituicao ?? 'Seus materiais'}</h1>
            <p>
              {plural(materiais.length, 'material na sua conta', 'materiais na sua conta')}
              {liberados.size > 0 && <>, {plural(liberados.size, 'já pago', 'já pagos')}</>}
            </p>
          </div>
          <div className="linha">
            {liberados.size > 0 && (
              <button className="btn btn-secundario btn-pequeno" onClick={aoIrParaDownloads}>
                <Icone nome="download" tamanho={16} /> <span className="texto-longo">Meus downloads</span>
              </button>
            )}
            <button
              className="btn btn-fantasma btn-pequeno"
              onClick={aoRecarregar}
              disabled={carregando}
              title="Buscar a lista de novo no portal"
            >
              <Icone nome="recarregar" tamanho={16} /> <span className="texto-longo">Atualizar</span>
            </button>
          </div>
        </div>

        <div className="busca-linha">
          <div className="entrada-grupo busca">
            <Icone nome="busca" className="icone-esq" />
            <input
              ref={buscaRef}
              className="entrada com-icone"
              type="search"
              placeholder="Buscar banca ou ano"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setBusca('')}
              aria-label="Buscar materiais"
            />
            {!busca && (
              <kbd className="atalho" aria-hidden>
                /
              </kbd>
            )}
          </div>
          <button className="btn btn-secundario botao-filtros" onClick={() => setFiltrosAbertos(true)}>
            <Icone nome="lista" tamanho={16} /> Filtros{qtdFiltros > 0 && ` (${qtdFiltros})`}
          </button>
        </div>

        <div className="resumo-lista">
          <span aria-live="polite">
            {plural(visiveis.length, 'material', 'materiais')}
            {filtrando && (
              <button className="btn btn-fantasma btn-pequeno" onClick={limparFiltros}>
                Limpar filtros
              </button>
            )}
          </span>
          {disponiveisVisiveis.length > 1 && (
            <div className="acoes">
              {todosNoCarrinho ? (
                <button
                  className="btn btn-secundario btn-pequeno"
                  onClick={() => aoRemoverVarios(disponiveisVisiveis.map((m) => m.id))}
                >
                  Tirar todos do pedido
                </button>
              ) : (
                <button
                  className="btn btn-secundario btn-pequeno"
                  onClick={() => aoAdicionarVarios(disponiveisVisiveis.map((m) => m.id))}
                >
                  <Icone nome="mais" tamanho={14} />
                  {instituicao ? 'Adicionar todos desta banca' : `Adicionar os ${disponiveisVisiveis.length}`}
                </button>
              )}
            </div>
          )}
        </div>

        {carregando && materiais.length === 0 ? (
          <div className="fichas" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="esqueleto" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <div className="fichas vazio">
            <div className="icone-grande">
              <Icone nome="busca" tamanho={24} />
            </div>
            <h3>Nenhum material com esses filtros</h3>
            <p>Tente outro termo ou limpe os filtros.</p>
            {filtrando && (
              <button className="btn btn-secundario" onClick={limparFiltros}>
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <ul className="fichas">
            {visiveis.map((m) => {
              const expira = liberados.get(m.id);
              const no = noCarrinho.has(m.id);
              const unitario = no ? calcularOrcamento(noCarrinho.size).unitario : unitarioAtual;
              return (
                <li key={m.id} className={`ficha ${no ? 'no-carrinho' : ''}`}>
                  <span className="aba-banca" style={{ background: corDe(m.slug) }} aria-hidden>
                    {sigla(m)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h3 title={m.titulo}>
                      <span className={no ? 'grifado' : undefined}>
                        <Destaque texto={m.titulo} busca={buscaAdiada} />
                      </span>
                    </h3>
                    <div className="meta">
                      {m.atualizadoEm && <span>Atualizado em {m.atualizadoEm}</span>}
                      {expira && (
                        <span className="liberado">
                          <Icone nome="check" tamanho={13} /> Pago, liberado por {diasRestantes(expira)} dias
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="acao">
                    {expira ? (
                      <button className="btn btn-secundario btn-pequeno btn-alternar" onClick={aoIrParaDownloads}>
                        <Icone nome="download" tamanho={15} /> Baixar
                      </button>
                    ) : (
                      <>
                        <span className="preco">
                          {unitario < PRECO_BASE && <s>{formatarReais(PRECO_BASE)}</s>}
                          {formatarReais(unitario)}
                        </span>
                        <button
                          className={`btn btn-pequeno btn-alternar ${no ? 'btn-secundario' : 'btn-primario'}`}
                          onClick={() => aoAlternar(m.id)}
                          aria-pressed={no}
                          aria-label={no ? `Tirar ${m.titulo} do pedido` : `Adicionar ${m.titulo} ao pedido`}
                        >
                          <Icone nome={no ? 'check' : 'mais'} tamanho={15} />
                          {no ? 'No pedido' : 'Adicionar'}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
