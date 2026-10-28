'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from './Icone';
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
type Vista = 'grade' | 'lista';
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
  const [vista, setVista] = useState<Vista>('grade');
  const buscaRef = useRef<HTMLInputElement>(null);

  // Preferencias de visualizacao persistidas.
  useEffect(() => {
    setVista(ler<Vista>(chaves.vista, 'grade'));
    setOrdem(ler<Ordem>(chaves.ordem, 'titulo'));
  }, []);
  useEffect(() => gravar(chaves.vista, vista), [vista]);
  useEffect(() => gravar(chaves.ordem, ordem), [ordem]);

  // Atalho "/" foca a busca; Esc limpa.
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
      else mapa.set(m.slug, { slug: m.slug, nome: m.instituicao.replace(/_/g, ' '), total: 1 });
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
      titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true }),
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
  const unitarioAtual = calcularOrcamento(Math.max(1, noCarrinho.size)).unitario;

  function limparFiltros() {
    setBusca('');
    setInstituicao('');
    setAno('');
    setSituacao('todos');
  }

  return (
    <section aria-labelledby="titulo-catalogo">
      <div className="secao-titulo">
        <div>
          <h1 id="titulo-catalogo">Seus materiais</h1>
          <p>
            {plural(materiais.length, 'material disponível', 'materiais disponíveis')} na sua conta
            {liberados.size > 0 && <> · {plural(liberados.size, 'já liberado', 'já liberados')}</>}
          </p>
        </div>
        <div className="linha">
          {liberados.size > 0 && (
            <button className="btn btn-secundario btn-pequeno" onClick={aoIrParaDownloads}>
              <Icone nome="download" tamanho={16} /> Meus downloads
            </button>
          )}
          <button
            className="btn btn-fantasma btn-pequeno"
            onClick={aoRecarregar}
            disabled={carregando}
            title="Buscar a lista de novo no portal"
          >
            <Icone nome="recarregar" tamanho={16} /> Atualizar
          </button>
        </div>
      </div>

      <div className="cartao barra-ferramentas">
        <div className="entrada-grupo busca">
          <Icone nome="busca" className="icone-esq" />
          <input
            ref={buscaRef}
            className="entrada com-icone"
            type="search"
            placeholder="Buscar por nome, instituição ou ano..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setBusca('')}
            aria-label="Buscar materiais"
          />
          {!busca && <kbd className="atalho" aria-hidden>/</kbd>}
        </div>
        {anos.length > 1 && (
          <select className="seletor" value={ano} onChange={(e) => setAno(e.target.value)} aria-label="Filtrar por ano">
            <option value="">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <select
          className="seletor"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as Situacao)}
          aria-label="Filtrar por situação"
        >
          <option value="todos">Todos</option>
          <option value="disponiveis">Ainda não comprados</option>
          <option value="comprados">Já liberados</option>
        </select>
        <select className="seletor" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
          <option value="titulo">Ordem alfabética</option>
          <option value="recentes">Atualizados recentemente</option>
          <option value="instituicao">Por instituição</option>
          <option value="id">Ordem do portal</option>
        </select>
        <div className="segmentado" role="group" aria-label="Modo de exibição">
          <button aria-pressed={vista === 'grade'} onClick={() => setVista('grade')} title="Grade">
            <Icone nome="grade" tamanho={16} />
            <span className="sr-only">Grade</span>
          </button>
          <button aria-pressed={vista === 'lista'} onClick={() => setVista('lista')} title="Lista">
            <Icone nome="lista" tamanho={16} />
            <span className="sr-only">Lista</span>
          </button>
        </div>
      </div>

      {instituicoes.length > 1 && (
        <div className="chips" role="group" aria-label="Filtrar por instituição">
          <button className="chip" aria-pressed={instituicao === ''} onClick={() => setInstituicao('')}>
            Todas <span className="n">{materiais.length}</span>
          </button>
          {instituicoes.map((i) => (
            <button
              key={i.slug}
              className="chip"
              aria-pressed={instituicao === i.slug}
              onClick={() => setInstituicao(instituicao === i.slug ? '' : i.slug)}
            >
              {i.nome} <span className="n">{i.total}</span>
            </button>
          ))}
        </div>
      )}

      <div className="resumo-lista">
        <span aria-live="polite">
          {plural(visiveis.length, 'material encontrado', 'materiais encontrados')}
          {filtrando && (
            <>
              {' · '}
              <button className="btn btn-fantasma btn-pequeno" onClick={limparFiltros}>
                Limpar filtros
              </button>
            </>
          )}
        </span>
        {disponiveisVisiveis.length > 0 && (
          <div className="acoes">
            {todosNoCarrinho ? (
              <button
                className="btn btn-secundario btn-pequeno"
                onClick={() => aoRemoverVarios(disponiveisVisiveis.map((m) => m.id))}
              >
                <Icone nome="menos" tamanho={14} /> Tirar estes do carrinho
              </button>
            ) : (
              <button
                className="btn btn-secundario btn-pequeno"
                onClick={() => aoAdicionarVarios(disponiveisVisiveis.map((m) => m.id))}
              >
                <Icone nome="mais" tamanho={14} />
                {instituicao
                  ? ` Adicionar toda a ${instituicoes.find((i) => i.slug === instituicao)?.nome ?? 'instituição'}`
                  : ` Adicionar os ${disponiveisVisiveis.length} visíveis`}
              </button>
            )}
          </div>
        )}
      </div>

      {carregando && materiais.length === 0 ? (
        <div className="grade" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="esqueleto" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="cartao vazio">
          <div className="icone-grande">
            <Icone nome="busca" tamanho={28} />
          </div>
          <h3>Nada encontrado</h3>
          <p>Tente outra palavra ou limpe os filtros.</p>
          {filtrando && (
            <button className="btn btn-secundario mt-16" onClick={limparFiltros}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className={`grade ${vista === 'lista' ? 'lista' : ''}`}>
          {visiveis.map((m) => {
            const expira = liberados.get(m.id);
            const no = noCarrinho.has(m.id);
            const anoM = extrairAno(m.titulo);
            return (
              <article
                key={m.id}
                className={`material ${no ? 'no-carrinho' : ''} ${expira ? 'comprado' : ''}`}
              >
                <div className="capa" style={{ background: corDe(m.slug) }} aria-hidden>
                  <span>{sigla(m)}</span>
                  {anoM && <span className="ano">{anoM}</span>}
                </div>
                <div className="info">
                  <h3 title={m.titulo}>
                    <Destaque texto={m.titulo} busca={buscaAdiada} />
                  </h3>
                  <div className="meta mt-8">
                    <span className="etiqueta">{m.instituicao.replace(/_/g, ' ')}</span>
                    {m.atualizadoEm && <span>Atualizado {m.atualizadoEm}</span>}
                    {expira && (
                      <span className="etiqueta sucesso">
                        <Icone nome="check" tamanho={12} /> Liberado · {diasRestantes(expira)}d
                      </span>
                    )}
                  </div>
                </div>
                <div className="rodape">
                  {expira ? (
                    <>
                      <span className="muted pequeno">Pago</span>
                      <button className="btn btn-secundario btn-pequeno" onClick={aoIrParaDownloads}>
                        <Icone nome="download" tamanho={15} /> Baixar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="preco">
                        {unitarioAtual < PRECO_BASE && <s>{formatarReais(PRECO_BASE)}</s>}
                        {formatarReais(unitarioAtual)}
                      </span>
                      <button
                        className={`btn btn-pequeno ${no ? 'btn-secundario' : 'btn-primario'}`}
                        onClick={() => aoAlternar(m.id)}
                        aria-pressed={no}
                        aria-label={no ? `Remover ${m.titulo} do carrinho` : `Adicionar ${m.titulo} ao carrinho`}
                      >
                        <Icone nome={no ? 'check' : 'mais'} tamanho={15} />
                        {no ? 'No carrinho' : 'Adicionar'}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
