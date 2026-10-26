'use client';

import { useMemo, useState } from 'react';
import {
  baixarMaterialComoPdf,
  baixarInstituicaoComoZip,
  baixarSelecaoComoZip,
  type Progresso,
} from '@/lib/download';

type Material = {
  id: number;
  titulo: string;
  descricao: string;
  tags: string[];
  instituicao: string;
  slug: string;
  atualizadoEm: string;
};

type Etapa = 1 | 2 | 3;

/** Como o usuario quer baixar. */
type ModoDownload = 'individual' | 'instituicao';

export default function Pagina() {
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [sessaoId, setSessaoId] = useState('');
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [filtro, setFiltro] = useState<string>('');
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [baixando, setBaixando] = useState('');
  const [progresso, setProgresso] = useState<Progresso | null>(null);

  // Preferencias de download
  const [modo, setModo] = useState<ModoDownload>('individual');
  const [incluirPngs, setIncluirPngs] = useState(false);

  const instituicoes = useMemo(() => {
    const mapa = new Map<string, { slug: string; nome: string; total: number }>();
    materiais.forEach((m) => {
      if (!m.slug) return;
      const atual = mapa.get(m.slug);
      if (atual) atual.total += 1;
      else mapa.set(m.slug, { slug: m.slug, nome: m.instituicao, total: 1 });
    });
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [materiais]);

  const visiveis = useMemo(
    () => (filtro ? materiais.filter((m) => m.slug === filtro) : materiais),
    [materiais, filtro],
  );

  /* ---------------- Passo 1 - Entrar ---------------- */
  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const res = await fetch('/api/materiais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErro(json.erro || 'Não foi possível entrar.');
        return;
      }
      setSessaoId(json.sessaoId);
      setMateriais(json.materiais);
      setEtapa(2);
      setMensagem(`Conectado! Encontramos ${json.total} materiais na sua conta.`);
    } catch {
      setErro('Não foi possível falar com o servidor. Verifique sua internet.');
    } finally {
      setCarregando(false);
    }
  }

  /* ---------------- Passo 2 - Escolher ---------------- */
  function alternar(id: number) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  /* ---------------- Passo 3 - Baixar ---------------- */
  async function baixarIndividual(materialId: number, titulo: string) {
    setErro('');
    setProgresso(null);
    setBaixando(`Preparando "${titulo}"...`);
    try {
      const { blob, nome, totalPaginas } = await baixarMaterialComoPdf(
        sessaoId,
        materialId,
        setProgresso,
      );
      salvarArquivo(blob, nome);
      setMensagem(`"${titulo}" (${totalPaginas} páginas) foi baixado com sucesso!`);
      setBaixando('');
      setProgresso(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro de conexão durante o download.');
      setBaixando('');
      setProgresso(null);
    }
  }

  async function baixarSelecao() {
    setErro('');
    const ids = [...selecionados];
    if (!ids.length) {
      setErro('Selecione pelo menos um material.');
      return;
    }
    setBaixando(`Gerando ${ids.length} material(is). Materiais grandes levam alguns minutos...`);
    try {
      const { blob, nome, totalMateriais } = await baixarSelecaoComoZip(
        sessaoId,
        ids,
        { incluirPngs },
        setProgresso,
      );
      salvarArquivo(blob, nome);
      setMensagem(
        `${totalMateriais} material(is) baixados em um arquivo ZIP${
          incluirPngs ? ' (com os PNGs originais)' : ''
        }!`,
      );
      setBaixando('');
      setProgresso(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar o ZIP.');
      setBaixando('');
      setProgresso(null);
    }
  }

  async function baixarInstituicao() {
    setErro('');
    if (!filtro) {
      setErro('Escolha uma instituição no filtro acima.');
      return;
    }
    const inst = instituicoes.find((i) => i.slug === filtro);
    setBaixando(
      `Baixando todos os materiais de ${inst?.nome ?? filtro} (${
        inst?.total ?? 0
      } material(is)). Pode levar bastante tempo...`,
    );
    try {
      const { blob, nome, totalMateriais, totalPaginas } =
        await baixarInstituicaoComoZip(
          sessaoId,
          filtro,
          { incluirPngs },
          setProgresso,
        );
      salvarArquivo(blob, nome);
      setMensagem(
        `${totalMateriais} material(is) de ${inst?.nome ?? filtro} (${totalPaginas} páginas) baixados!`,
      );
      setBaixando('');
      setProgresso(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao gerar o ZIP.');
      setBaixando('');
      setProgresso(null);
    }
  }

  function recomecar() {
    setEtapa(1);
    setSessaoId('');
    setMateriais([]);
    setSelecionados(new Set());
    setFiltro('');
    setErro('');
    setMensagem('');
    setSenha('');
  }

  const percentual = progresso?.paginasTotal
    ? Math.round((progresso.paginasBaixadas / progresso.paginasTotal) * 100)
    : 0;

  /* ---------------- Render ---------------- */
  return (
    <main className="container">
      <header className="cabecalho">
        <h1>📚 APMED Downloader</h1>
        <p>Baixe seus materiais de estudo do portal APMED em PDF, em 3 passos.</p>
      </header>

      <div className="passos">
        <div className={`passo ${etapa === 1 ? 'ativo' : etapa > 1 ? 'feito' : ''}`}>
          <span className="num">{etapa > 1 ? '✓' : '1'}</span>
          <span className="texto-passo">Entrar</span>
        </div>
        <div className={`passo ${etapa === 2 ? 'ativo' : etapa > 2 ? 'feito' : ''}`}>
          <span className="num">{etapa > 2 ? '✓' : '2'}</span>
          <span className="texto-passo">Escolher</span>
        </div>
        <div className={`passo ${etapa === 3 ? 'ativo' : ''}`}>
          <span className="num">3</span>
          <span className="texto-passo">Baixar</span>
        </div>
      </div>

      {/* PASSO 1 */}
      {etapa === 1 && (
        <div className="cartao">
          <h2>1. Entre com sua conta</h2>
          <p className="ajuda">
            Use o mesmo e-mail e senha que você usa no site do APMED. Suas
            credenciais não ficam salvas — a sessão dura apenas 30 minutos.
          </p>

          {erro && <div className="aviso erro">{erro}</div>}

          <form onSubmit={entrar}>
            <div className="campo">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={carregando}
              />
            </div>

            <div className="campo">
              <label htmlFor="senha">Senha</label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                placeholder="Sua senha do APMED"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                disabled={carregando}
              />
              <p className="dica">
                Sua senha é usada apenas para abrir a sessão e nunca é gravada.
              </p>
            </div>

            {carregando && (
              <div className="carregando">
                <span className="girando" />
                <span>Entrando no portal APMED...</span>
              </div>
            )}

            <button className="botao" type="submit" disabled={carregando}>
              {carregando ? 'Entrando...' : 'Continuar'}
            </button>
          </form>
        </div>
      )}

      {/* PASSO 2 */}
      {etapa === 2 && (
        <div className="cartao">
          <h2>2. Escolha o que baixar</h2>
          <p className="ajuda">
            Escolha como quer baixar: material por material, uma seleção sua, ou
            tudo de uma instituição de uma vez.
          </p>

          {mensagem && <div className="aviso sucesso">{mensagem}</div>}
          {erro && <div className="aviso erro">{erro}</div>}

          {/* Modo de download */}
          <div className="campo">
            <label>Como você quer baixar?</label>
            <div className="filtros" style={{ marginTop: 4 }}>
              <button
                className={`chip ${modo === 'individual' ? 'ativo' : ''}`}
                onClick={() => setModo('individual')}
              >
                Escolher material por material
              </button>
              <button
                className={`chip ${modo === 'instituicao' ? 'ativo' : ''}`}
                onClick={() => setModo('instituicao')}
              >
                Baixar uma instituição inteira
              </button>
            </div>
          </div>

          {/* Opção de PNGs */}
          <label
            className="opcao-checkbox"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '12px 14px',
              border: '2px solid #e2e8f0',
              borderRadius: 10,
              marginBottom: 18,
              cursor: 'pointer',
              background: incluirPngs ? '#eff6ff' : '#fff',
              borderColor: incluirPngs ? '#1d4ed8' : '#e2e8f0',
            }}
          >
            <input
              type="checkbox"
              checked={incluirPngs}
              onChange={(e) => setIncluirPngs(e.target.checked)}
              style={{ width: 18, height: 18, marginTop: 2, accentColor: '#1d4ed8' }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                Incluir as imagens originais (PNG) junto com o PDF
              </div>
              <div className="dica" style={{ marginTop: 2 }}>
                Cada material ganha uma pasta com as páginas em PNG de 2400px.
                Deixa o ZIP bem maior, mas mantém a qualidade original.
              </div>
            </div>
          </label>

          {/* Filtro de instituição */}
          {instituicoes.length > 1 && (
            <div className="campo">
              <label>Instituição</label>
              <div className="filtros" style={{ marginTop: 4 }}>
                <button
                  className={`chip ${filtro === '' ? 'ativo' : ''}`}
                  onClick={() => setFiltro('')}
                >
                  Todas
                </button>
                {instituicoes.map((inst) => (
                  <button
                    key={inst.slug}
                    className={`chip ${filtro === inst.slug ? 'ativo' : ''}`}
                    onClick={() => setFiltro(inst.slug)}
                    title={`${inst.total} material(is)`}
                  >
                    {inst.nome.replace(/_/g, ' ')} ({inst.total})
                  </button>
                ))}
              </div>
            </div>
          )}

          {modo === 'instituicao' ? (
            <div className="aviso info">
              <strong>Download de instituição inteira.</strong>
              <br />
              Selecione acima a instituição desejada e clique no botão abaixo.
              Todos os materiais dela serão baixados em um único arquivo ZIP.
              {filtro && (
                <>
                  <br />
                  Instituição selecionada:{' '}
                  <strong>
                    {instituicoes.find((i) => i.slug === filtro)?.nome ?? filtro}
                  </strong>{' '}
                  (
                  {instituicoes.find((i) => i.slug === filtro)?.total ?? 0}{' '}
                  material(is))
                </>
              )}
            </div>
          ) : (
            <>
              <div className="contador">
                {visiveis.length} material(is) encontrado(s)
              </div>

              <div className="lista">
                {visiveis.map((m) => (
                  <label
                    key={m.id}
                    className={`item ${selecionados.has(m.id) ? 'selecionado' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selecionados.has(m.id)}
                      onChange={() => alternar(m.id)}
                    />
                    <div className="texto">
                      <div className="titulo" title={m.titulo}>
                        {m.titulo}
                      </div>
                      <div className="meta">
                        <span className="tag">{m.instituicao}</span>
                        {m.atualizadoEm && <span>Atualizado: {m.atualizadoEm}</span>}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="linha-botoes">
                <button
                  className="botao secundario"
                  onClick={() => setSelecionados(new Set(visiveis.map((m) => m.id)))}
                >
                  Marcar todos
                </button>
                <button
                  className="botao secundario"
                  onClick={() => setSelecionados(new Set())}
                >
                  Desmarcar
                </button>
              </div>
            </>
          )}

          <div className="linha-botoes">
            {modo === 'instituicao' ? (
              <button
                className="botao"
                onClick={baixarInstituicao}
                disabled={!filtro || !!baixando}
              >
                {filtro
                  ? `📦 Baixar ${instituicoes.find((i) => i.slug === filtro)?.nome ?? filtro} inteira`
                  : 'Escolha uma instituição acima'}
              </button>
            ) : (
              <button
                className="botao"
                onClick={() => setEtapa(3)}
                disabled={selecionados.size === 0}
              >
                {selecionados.size === 0
                  ? 'Marque pelo menos 1 material'
                  : `Ir para o passo 3 (${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* PASSO 3 */}
      {etapa === 3 && (
        <div className="cartao">
          <h2>3. Baixar</h2>
          <p className="ajuda">
            Baixe um material por vez ou gere um único ZIP com todos os
            selecionados.
          </p>

          {mensagem && <div className="aviso sucesso">{mensagem}</div>}
          {erro && <div className="aviso erro">{erro}</div>}

          {baixando && (
            <div className="carregando">
              <span className="girando" />
              <span>{baixando}</span>
            </div>
          )}

          {progresso && progresso.paginasTotal > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  height: 10,
                  background: '#e2e8f0',
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${percentual}%`,
                    height: '100%',
                    background: '#1d4ed8',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
              <p className="dica" style={{ marginTop: 6 }}>
                {progresso.etapa} — {percentual}%
              </p>
            </div>
          )}

          <div className="lista">
            {materiais
              .filter((m) => selecionados.has(m.id))
              .map((m) => (
                <div key={m.id} className="item">
                  <div className="texto">
                    <div className="titulo" title={m.titulo}>
                      {m.titulo}
                    </div>
                    <div className="meta">
                      <span className="tag">{m.instituicao}</span>
                    </div>
                  </div>
                  <button
                    className="botao secundario pequeno"
                    onClick={() => baixarIndividual(m.id, m.titulo)}
                    disabled={!!baixando}
                  >
                    Baixar PDF
                  </button>
                </div>
              ))}
          </div>

          <div className="barra-selecao">
            <div className="info">
              <strong>{selecionados.size}</strong> material(is) selecionado(s)
            </div>
            <button
              className="botao"
              style={{ flex: '0 0 auto', width: 'auto' }}
              onClick={baixarSelecao}
              disabled={!!baixando || selecionados.size === 0}
            >
              📦 Baixar tudo em ZIP
            </button>
          </div>

          <div className="linha-botoes">
            <button className="botao secundario" onClick={() => setEtapa(2)}>
              Voltar
            </button>
            <button className="botao secundario" onClick={recomecar}>
              Sair / Trocar conta
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/** Dispara o download de um Blob no navegador. */
function salvarArquivo(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
