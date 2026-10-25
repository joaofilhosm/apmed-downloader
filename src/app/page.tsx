'use client';

import { useMemo, useState } from 'react';
import { baixarMaterialComoPdf, type Progresso } from '@/lib/download';

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

  const instituicoes = useMemo(() => {
    const set = new Set<string>();
    materiais.forEach((m) => m.slug && set.add(m.slug));
    return [...set].sort();
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
      setErro(
        e instanceof Error ? e.message : 'Erro de conexão durante o download.',
      );
      setBaixando('');
      setProgresso(null);
    }
  }

  async function baixarTodos() {
    setErro('');
    const ids = [...selecionados];
    if (!ids.length) {
      setErro('Selecione pelo menos um material.');
      return;
    }
    setBaixando(
      `Gerando ${ids.length} material(is). Materiais grandes levam alguns minutos...`,
    );
    try {
      const JSZipMod = await import('jszip');
      const zip = new JSZipMod.default();

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const material = materiais.find((m) => m.id === id);
        const { blob, nome } = await baixarMaterialComoPdf(
          sessaoId,
          id,
          (p) =>
            setProgresso({
              ...p,
              etapa: `Material ${i + 1} de ${ids.length}: ${p.etapa}`,
            }),
        );
        zip.file(nome, blob);
      }

      const buffer = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      salvarArquivo(buffer, 'materiais_apmed.zip');
      setMensagem(`${ids.length} material(is) baixados em um arquivo ZIP!`);
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
            Clique nas caixas para marcar os materiais. Depois vá para o passo 3
            para baixar.
          </p>

          {mensagem && <div className="aviso sucesso">{mensagem}</div>}
          {erro && <div className="aviso erro">{erro}</div>}

          {instituicoes.length > 1 && (
            <div className="filtros">
              <button
                className={`chip ${filtro === '' ? 'ativo' : ''}`}
                onClick={() => setFiltro('')}
              >
                Todas
              </button>
              {instituicoes.map((inst) => (
                <button
                  key={inst}
                  className={`chip ${filtro === inst ? 'ativo' : ''}`}
                  onClick={() => setFiltro(inst)}
                >
                  {inst.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}

          <div className="contador">
            {visiveis.length} material(is) encontrado(s)
          </div>

          <div className="lista">
            {visiveis.map((m) => (
              <label key={m.id} className={`item ${selecionados.has(m.id) ? 'selecionado' : ''}`}>
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

          <div className="linha-botoes">
            <button
              className="botao"
              onClick={() => setEtapa(3)}
              disabled={selecionados.size === 0}
            >
              {selecionados.size === 0
                ? 'Marque pelo menos 1 material'
                : `Ir para o passo 3 (${selecionados.size} selecionado${selecionados.size > 1 ? 's' : ''})`}
            </button>
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
              onClick={baixarTodos}
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
