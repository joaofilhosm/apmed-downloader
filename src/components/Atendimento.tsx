'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icone } from './Icone';
import { PainelProgresso, type DownloadEmAndamento, type OpcoesDownload } from './MeusDownloads';
import { ProvedorToasts, useToast } from './Toasts';
import { chaves, combina, corDe, gravar, ler, plural, type Material } from '@/lib/cliente';
import { baixarMaterial, baixarVariosComoZip, ErroDefinitivo, salvarArquivo } from '@/lib/download';

type Operador = { token: string; expiraEm: number };
type Cliente = { sessaoId: string; expiraEm: number; email: string };

const CHAVE_OPERADOR = 'apmed:operador';
const CHAVE_CLIENTE = 'apmed:atendimento-cliente';

export function Atendimento() {
  return (
    <ProvedorToasts>
      <Tela />
    </ProvedorToasts>
  );
}

function Tela() {
  const avisar = useToast();

  const [pronto, setPronto] = useState(false);
  const [operador, setOperador] = useState<Operador | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [opcoes, setOpcoes] = useState<OpcoesDownload>({ qualidade: 'padrao', incluirPngs: false });
  const [emAndamento, setEmAndamento] = useState<DownloadEmAndamento | null>(null);
  const abortar = useRef<AbortController | null>(null);

  /* ------------------------------------------------------------ inicio */
  useEffect(() => {
    const op = ler<Operador | null>(CHAVE_OPERADOR, null, 'sessao');
    if (op && op.expiraEm > Date.now()) setOperador(op);
    else gravar(CHAVE_OPERADOR, null, 'sessao');

    const tema = ler<string>(chaves.tema, 'sistema');
    if (tema === 'escuro') document.documentElement.setAttribute('data-theme', 'dark');
    if (tema === 'claro') document.documentElement.setAttribute('data-theme', 'light');

    // Retoma o cliente em atendimento depois de um F5.
    const c = ler<Cliente | null>(CHAVE_CLIENTE, null, 'sessao');
    if (op && c && c.expiraEm > Date.now() + 30_000) {
      setCliente(c);
      fetch('/api/materiais', { headers: { 'x-sessao': c.sessaoId } })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok) setMateriais(j.materiais);
          else voltarParaCliente('A sessão do cliente expirou. Abra o atendimento de novo.');
        })
        .catch(() => {})
        .finally(() => setPronto(true));
    } else {
      gravar(CHAVE_CLIENTE, null, 'sessao');
      setPronto(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = emAndamento?.progresso?.paginasTotal
      ? `${Math.round((emAndamento.progresso.paginasBaixadas / emAndamento.progresso.paginasTotal) * 100)}% baixado - Atendimento`
      : 'Atendimento - APMED Downloader';
  }, [emAndamento]);

  useEffect(() => {
    if (!emAndamento) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [emAndamento]);

  /* ------------------------------------------------------------ operador */
  async function entrarOperador(email: string, senha: string) {
    setErro('');
    setCarregando(true);
    try {
      const res = await fetch('/api/operador/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const json = await res.json().catch(() => ({ ok: false, erro: 'Resposta inválida do servidor.' }));
      if (!json.ok) return setErro(json.erro || 'Não foi possível entrar.');
      const novo: Operador = { token: json.token, expiraEm: json.expiraEm };
      setOperador(novo);
      gravar(CHAVE_OPERADOR, novo, 'sessao');
    } catch {
      setErro('Sem conexão com o servidor.');
    } finally {
      setCarregando(false);
    }
  }

  function sairOperador() {
    if (emAndamento && !confirm('Há um download em andamento. Sair mesmo assim?')) return;
    abortar.current?.abort();
    encerrarCliente();
    setOperador(null);
    gravar(CHAVE_OPERADOR, null, 'sessao');
  }

  /* ------------------------------------------------------------ cliente */
  const voltarParaCliente = useCallback((motivo?: string) => {
    setCliente(null);
    setMateriais([]);
    setMarcados(new Set());
    setBusca('');
    gravar(CHAVE_CLIENTE, null, 'sessao');
    if (motivo) setErro(motivo);
  }, []);

  function encerrarCliente() {
    if (cliente) fetch('/api/materiais', { method: 'DELETE', headers: { 'x-sessao': cliente.sessaoId } }).catch(() => {});
    voltarParaCliente();
  }

  async function abrirCliente(email: string, senha: string) {
    if (!operador) return;
    setErro('');
    setCarregando(true);
    try {
      const res = await fetch('/api/operador/atender', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-operador': operador.token },
        body: JSON.stringify({ email, senha }),
      });
      const json = await res.json().catch(() => ({ ok: false, erro: 'Resposta inválida do servidor.' }));
      if (res.status === 401 && json.erro?.includes('operador')) {
        setOperador(null);
        gravar(CHAVE_OPERADOR, null, 'sessao');
        return setErro(json.erro);
      }
      if (!json.ok) return setErro(json.erro || 'Não foi possível abrir a conta do cliente.');
      const novo: Cliente = { sessaoId: json.sessaoId, expiraEm: json.expiraEm, email };
      setCliente(novo);
      setMateriais(json.materiais);
      gravar(CHAVE_CLIENTE, novo, 'sessao');
      avisar(`Conta aberta: ${plural(json.total, 'material', 'materiais')}.`, 'sucesso', 3000);
    } catch {
      setErro('Sem conexão com o servidor.');
    } finally {
      setCarregando(false);
    }
  }

  /* ------------------------------------------------------------ downloads */
  const credenciais = () => ({ sessaoId: cliente!.sessaoId, licencas: [] as string[] });
  const atualizar = (progresso: DownloadEmAndamento['progresso']) =>
    setEmAndamento((a) => (a ? { ...a, progresso } : a));

  async function executar(rotulo: string, tarefa: (signal: AbortSignal) => Promise<void>) {
    if (!cliente || abortar.current) return;
    const controle = new AbortController();
    abortar.current = controle;
    setEmAndamento({ rotulo, inicio: Date.now(), progresso: null });
    try {
      await tarefa(controle.signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') avisar('Download cancelado.', 'info');
      else if (e instanceof ErroDefinitivo && e.status === 401)
        voltarParaCliente('A sessão do cliente expirou. Abra o atendimento de novo.');
      else avisar(e instanceof Error ? e.message : 'Erro durante o download.', 'erro', 8000);
    } finally {
      abortar.current = null;
      setEmAndamento(null);
    }
  }

  function baixarUm(m: Material) {
    executar(m.titulo, async (signal) => {
      const r = await baixarMaterial(credenciais(), m.id, { ...opcoes, signal }, atualizar);
      salvarArquivo(r.blob, r.nome);
      avisar(`"${m.titulo}" (${r.totalPaginas} páginas) salvo.`, 'sucesso', 5000);
    });
  }

  function baixarSelecionados(ids: number[]) {
    if (ids.length === 1) {
      const m = materiais.find((x) => x.id === ids[0]);
      if (m) return baixarUm(m);
    }
    executar(`Pacote com ${ids.length} materiais`, async (signal) => {
      const r = await baixarVariosComoZip(credenciais(), ids, { ...opcoes, signal }, atualizar);
      salvarArquivo(r.blob, r.nome);
      if (r.falhas.length) {
        avisar(`${plural(r.totalMateriais, 'material salvo', 'materiais salvos')}; ${r.falhas.length} falharam (veja o LEIA-ME no ZIP).`, 'alerta', 9000);
      } else {
        avisar(`ZIP com ${plural(r.totalMateriais, 'material', 'materiais')} salvo.`, 'sucesso', 5000);
      }
    });
  }

  /* ------------------------------------------------------------ lista */
  const visiveis = useMemo(
    () =>
      materiais
        .filter((m) => combina(m, busca))
        .sort((a, b) => a.instituicao.localeCompare(b.instituicao, 'pt-BR') || a.titulo.localeCompare(b.titulo, 'pt-BR')),
    [materiais, busca],
  );
  const selecionados = [...marcados].filter((id) => materiais.some((m) => m.id === id));

  function alternar(id: number) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  /* ------------------------------------------------------------ render */
  return (
    <div className="app">
      <header className="topo">
        <div className="topo-inner">
          <span className="marca">
            <span className="marca-logo">
              <Icone nome="livro" tamanho={18} />
            </span>
            <span>Atendimento</span>
          </span>
          <div className="topo-acoes">
            {cliente && <span className="muted pequeno" title="Cliente em atendimento">{cliente.email}</span>}
            {operador && (
              <button className="icone-btn" onClick={sairOperador} aria-label="Sair do modo atendimento" title="Sair">
                <Icone nome="sair" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="conteudo" className="conteudo">
        {!pronto ? (
          <div className="vazio" aria-busy="true">
            <span className="girando" style={{ margin: '0 auto' }} />
          </div>
        ) : !operador ? (
          <FormularioEntrada
            key="operador"
            titulo="Entrar como operador"
            descricao="Acesso restrito. Com ele você baixa os materiais de quem pagou direto com você."
            rotuloEmail="Seu e-mail"
            rotuloSenha="Sua senha"
            botao="Entrar"
            carregando={carregando}
            erro={erro}
            aoEnviar={entrarOperador}
          />
        ) : !cliente ? (
          <FormularioEntrada
            key="cliente"
            titulo="Abrir a conta do cliente"
            descricao="Digite o e-mail e a senha do APMED que o cliente enviou. Nada é guardado: a sessão termina em 30 minutos."
            rotuloEmail="E-mail do cliente no APMED"
            rotuloSenha="Senha do cliente no APMED"
            botao="Abrir materiais do cliente"
            carregando={carregando}
            erro={erro}
            aoEnviar={abrirCliente}
            limparAoEnviar
          />
        ) : (
          <section aria-labelledby="titulo-atendimento">
            <div className="cabeca-secao">
              <div>
                <h1 id="titulo-atendimento">Materiais do cliente</h1>
                <p>
                  {plural(materiais.length, 'material na conta', 'materiais na conta')}. Marque o que ele pediu e baixe.
                </p>
              </div>
              <button className="btn btn-secundario btn-pequeno" onClick={encerrarCliente} disabled={!!emAndamento}>
                Trocar de cliente
              </button>
            </div>

            {emAndamento && <PainelProgresso atual={emAndamento} aoCancelar={() => abortar.current?.abort()} />}

            <div className="downloads-layout">
              <div>
                <div className="busca-linha">
                  <div className="entrada-grupo busca">
                    <Icone nome="busca" className="icone-esq" />
                    <input
                      className="entrada com-icone"
                      type="search"
                      placeholder="Buscar banca ou ano"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      aria-label="Buscar materiais"
                    />
                  </div>
                </div>
                <div className="resumo-lista">
                  <span aria-live="polite">
                    {plural(visiveis.length, 'material', 'materiais')}
                    {selecionados.length > 0 && <>, {selecionados.length} marcado(s)</>}
                  </span>
                  <div className="acoes">
                    <button
                      className="btn btn-fantasma btn-pequeno"
                      onClick={() => setMarcados((a) => new Set([...a, ...visiveis.map((m) => m.id)]))}
                    >
                      Marcar os {visiveis.length}
                    </button>
                    {selecionados.length > 0 && (
                      <button className="btn btn-fantasma btn-pequeno" onClick={() => setMarcados(new Set())}>
                        Limpar
                      </button>
                    )}
                  </div>
                </div>
                <ul className="lista-downloads">
                  {visiveis.map((m) => (
                    <li key={m.id} className="linha-download">
                      <input
                        type="checkbox"
                        checked={marcados.has(m.id)}
                        onChange={() => alternar(m.id)}
                        aria-label={`Marcar ${m.titulo}`}
                      />
                      <span className="cor" style={{ background: corDe(m.slug) }} aria-hidden />
                      <div className="info">
                        <strong title={m.titulo}>{m.titulo}</strong>
                        {m.atualizadoEm && <span>Atualizado em {m.atualizadoEm}</span>}
                      </div>
                      <button className="btn btn-secundario btn-pequeno" onClick={() => baixarUm(m)} disabled={!!emAndamento}>
                        <Icone nome="arquivo" tamanho={15} /> PDF
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <aside className="lateral">
                <div className="bloco">
                  <strong>Baixar o que foi pedido</strong>
                  <p className="muted pequeno mt-8">
                    {selecionados.length
                      ? `Gera um ZIP com os ${selecionados.length} marcados.`
                      : 'Marque os materiais na lista para baixar em um ZIP.'}
                  </p>
                  <button
                    className="btn btn-primario btn-bloco mt-12"
                    onClick={() => baixarSelecionados(selecionados)}
                    disabled={!!emAndamento || selecionados.length === 0}
                  >
                    <Icone nome="pacote" /> Baixar {plural(selecionados.length, 'material', 'materiais')}
                  </button>
                </div>
                <div className="bloco">
                  <strong>Opções do arquivo</strong>
                  <div className="coluna mt-12">
                    <span className="rotulo">Qualidade das páginas</span>
                    <div className="segmentado" role="group" aria-label="Qualidade">
                      <button aria-pressed={opcoes.qualidade === 'padrao'} onClick={() => setOpcoes({ ...opcoes, qualidade: 'padrao' })}>
                        Padrão (leve)
                      </button>
                      <button aria-pressed={opcoes.qualidade === 'alta'} onClick={() => setOpcoes({ ...opcoes, qualidade: 'alta' })}>
                        Alta (nítida)
                      </button>
                    </div>
                    <label className="check mt-8">
                      <input
                        type="checkbox"
                        checked={opcoes.incluirPngs}
                        onChange={(e) => setOpcoes({ ...opcoes, incluirPngs: e.target.checked })}
                      />
                      <span>
                        <strong>Incluir imagens originais (PNG)</strong>
                        <span className="dica">O arquivo fica bem maior.</span>
                      </span>
                    </label>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function FormularioEntrada({
  titulo,
  descricao,
  rotuloEmail,
  rotuloSenha,
  botao,
  carregando,
  erro,
  aoEnviar,
  limparAoEnviar = false,
}: {
  titulo: string;
  descricao: string;
  rotuloEmail: string;
  rotuloSenha: string;
  botao: string;
  carregando: boolean;
  erro: string;
  aoEnviar: (email: string, senha: string) => void;
  limparAoEnviar?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);

  // A senha do cliente nao fica na tela depois do envio.
  useEffect(() => {
    if (limparAoEnviar && carregando) setSenha('');
  }, [limparAoEnviar, carregando]);

  return (
    <form
      className="login-form"
      style={{ maxWidth: 440, margin: '32px auto' }}
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim() && senha) aoEnviar(email.trim(), senha);
      }}
    >
      <h2>{titulo}</h2>
      <p>{descricao}</p>

      {erro && (
        <div className="aviso aviso-erro mb-16" role="alert">
          <Icone nome="erro" />
          <span>{erro}</span>
        </div>
      )}

      <div className="campo">
        <label htmlFor="at-email">{rotuloEmail}</label>
        <input
          id="at-email"
          className="entrada"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={carregando}
          required
        />
      </div>
      <div className="campo">
        <label htmlFor="at-senha">{rotuloSenha}</label>
        <div className="entrada-grupo">
          <input
            id="at-senha"
            className="entrada"
            type={mostrar ? 'text' : 'password'}
            autoComplete="off"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={carregando}
            required
          />
          <button
            type="button"
            className="acao-dir"
            onClick={() => setMostrar((v) => !v)}
            aria-label={mostrar ? 'Esconder senha' : 'Mostrar senha'}
            aria-pressed={mostrar}
          >
            <Icone nome={mostrar ? 'olhoFechado' : 'olho'} />
          </button>
        </div>
      </div>

      <button className="btn btn-primario btn-bloco btn-grande" type="submit" disabled={carregando}>
        {carregando ? (
          <>
            <span className="girando" /> Conectando...
          </>
        ) : (
          botao
        )}
      </button>
    </form>
  );
}
