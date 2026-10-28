'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cabecalho, type Aba, type Tema } from '@/components/Cabecalho';
import { Carrinho } from '@/components/Carrinho';
import { Catalogo } from '@/components/Catalogo';
import { Checkout, type EstadoPix } from '@/components/Checkout';
import { Faq } from '@/components/Faq';
import { Icone } from '@/components/Icone';
import { MeusDownloads, type DownloadEmAndamento, type OpcoesDownload } from '@/components/MeusDownloads';
import { TelaLogin } from '@/components/TelaLogin';
import { ProvedorToasts, useToast } from '@/components/Toasts';
import {
  chaves,
  gravar,
  ler,
  licencasValidas,
  materiaisLiberados,
  plural,
  type LicencaLocal,
  type Material,
  type Pedido,
  type PixPendente,
} from '@/lib/cliente';
import { baixarMaterial, baixarVariosComoZip, ErroDefinitivo, salvarArquivo } from '@/lib/download';
import { calcularOrcamento, formatarReais, MAX_ITENS_PEDIDO } from '@/lib/precos';

type Sessao = { sessaoId: string; conta: string; email: string; expiraEm: number };
type Config = { pagamento: 'mercadopago' | 'simulado' | 'desativado'; diasLicenca: number };

export default function Pagina() {
  return (
    <ProvedorToasts>
      <App />
    </ProvedorToasts>
  );
}

function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', tema === 'escuro' ? 'dark' : 'light');
}

function App() {
  const avisar = useToast();

  const [config, setConfig] = useState<Config>({ pagamento: 'mercadopago', diasLicenca: 7 });
  const [tema, setTema] = useState<Tema>('sistema');

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const [entrando, setEntrando] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [aba, setAba] = useState<Aba>('catalogo');

  // Estado por conta (persistido no navegador).
  const [carregado, setCarregado] = useState(false);
  const [carrinho, setCarrinho] = useState<number[]>([]);
  const [licencas, setLicencas] = useState<LicencaLocal[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [baixados, setBaixados] = useState<number[]>([]);
  const [pix, setPix] = useState<PixPendente | null>(null);

  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [checkoutAberto, setCheckoutAberto] = useState(false);
  const [estadoPix, setEstadoPix] = useState<EstadoPix>('aguardando');
  const [gerandoPix, setGerandoPix] = useState(false);
  const [verificando, setVerificando] = useState(false);

  const [opcoes, setOpcoes] = useState<OpcoesDownload>({ qualidade: 'padrao', incluirPngs: false });
  const [emAndamento, setEmAndamento] = useState<DownloadEmAndamento | null>(null);
  const abortar = useRef<AbortController | null>(null);
  const avisouExpiracao = useRef(false);

  /* ------------------------------------------------------------ inicio */
  useEffect(() => {
    const t = ler<Tema>(chaves.tema, 'sistema');
    setTema(t);
    aplicarTema(t);
    setOpcoes(ler<OpcoesDownload>(chaves.opcoes, { qualidade: 'padrao', incluirPngs: false }));

    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => c.ok && setConfig({ pagamento: c.pagamento, diasLicenca: c.diasLicenca }))
      .catch(() => {});

    // Recupera a sessao da aba (sobrevive a um F5, nao a fechar o navegador).
    const salva = ler<Sessao | null>(chaves.sessao, null, 'sessao');
    if (salva && salva.expiraEm > Date.now() + 30_000) {
      setSessao(salva);
      setCarregandoLista(true);
      fetch('/api/materiais', { headers: { 'x-sessao': salva.sessaoId } })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok) setMateriais(j.materiais);
          else encerrarSessao('Sua sessão expirou. Entre novamente.');
        })
        .catch(() => avisar('Não foi possível recarregar a lista agora.', 'erro'))
        .finally(() => {
          setCarregandoLista(false);
          setRestaurando(false);
        });
    } else {
      gravar(chaves.sessao, null, 'sessao');
      setRestaurando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mudarTema(t: Tema) {
    setTema(t);
    aplicarTema(t);
    gravar(chaves.tema, t);
  }

  useEffect(() => gravar(chaves.opcoes, opcoes), [opcoes]);

  /* ------------------------------------------------------------ estado por conta */
  const conta = sessao?.conta || '';
  useEffect(() => {
    if (!conta) {
      setCarregado(false);
      return;
    }
    setCarrinho(ler<number[]>(chaves.carrinho(conta), []));
    setLicencas(licencasValidas(ler<LicencaLocal[]>(chaves.licencas(conta), [])));
    setPedidos(ler<Pedido[]>(chaves.pedidos(conta), []));
    setBaixados(ler<number[]>(chaves.baixados(conta), []));
    const p = ler<PixPendente | null>(chaves.pix(conta), null);
    // Pix pendente de ate 1 dia atras: continua verificando (o usuario pode ter pago depois).
    if (p && p.expiraEm > Date.now() - 24 * 60 * 60 * 1000) {
      setPix(p);
      setEstadoPix('aguardando');
    }
    setCarregado(true);
  }, [conta]);

  useEffect(() => void (carregado && gravar(chaves.carrinho(conta), carrinho)), [carregado, conta, carrinho]);
  useEffect(() => void (carregado && gravar(chaves.licencas(conta), licencas)), [carregado, conta, licencas]);
  useEffect(() => void (carregado && gravar(chaves.pedidos(conta), pedidos.slice(0, 50))), [carregado, conta, pedidos]);
  useEffect(() => void (carregado && gravar(chaves.baixados(conta), baixados)), [carregado, conta, baixados]);
  useEffect(() => void (carregado && gravar(chaves.pix(conta), pix)), [carregado, conta, pix]);

  const liberados = useMemo(() => materiaisLiberados(licencas), [licencas]);
  const idsDaConta = useMemo(() => new Set(materiais.map((m) => m.id)), [materiais]);

  // Remove do carrinho o que ja foi pago ou sumiu da conta.
  useEffect(() => {
    if (!carregado || materiais.length === 0) return;
    setCarrinho((c) => {
      const limpo = c.filter((id) => idsDaConta.has(id) && !liberados.has(id));
      return limpo.length === c.length ? c : limpo;
    });
  }, [carregado, materiais.length, idsDaConta, liberados]);

  const itensCarrinho = useMemo(() => {
    const porId = new Map(materiais.map((m) => [m.id, m]));
    return carrinho.map((id) => porId.get(id)).filter(Boolean) as Material[];
  }, [carrinho, materiais]);
  const noCarrinho = useMemo(() => new Set(carrinho), [carrinho]);

  /* ------------------------------------------------------------ sessao */
  const encerrarSessao = useCallback(
    (motivo?: string) => {
      setSessao(null);
      setMateriais([]);
      setCarrinhoAberto(false);
      setCheckoutAberto(false);
      gravar(chaves.sessao, null, 'sessao');
      avisouExpiracao.current = false;
      if (motivo) {
        setErroLogin(motivo);
        avisar(motivo, 'alerta');
      }
    },
    [avisar],
  );

  // Aviso perto de expirar e logout automatico quando expira.
  useEffect(() => {
    if (!sessao) return;
    const t = setInterval(() => {
      const resta = sessao.expiraEm - Date.now();
      if (resta <= 0) {
        if (abortar.current) return; // nao derruba um download em andamento
        encerrarSessao('Sua sessão de 30 minutos expirou. Entre de novo: seu carrinho e suas compras continuam salvos.');
      } else if (resta < 3 * 60 * 1000 && !avisouExpiracao.current) {
        avisouExpiracao.current = true;
        avisar('Sua sessão expira em menos de 3 minutos.', 'alerta', 8000);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [sessao, encerrarSessao, avisar]);

  async function entrar(email: string, senha: string) {
    setErroLogin('');
    setEntrando(true);
    try {
      const res = await fetch('/api/materiais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      });
      const json = await res.json().catch(() => ({ ok: false, erro: 'Resposta inválida do servidor.' }));
      if (!json.ok) {
        setErroLogin(json.erro || 'Não foi possível entrar.');
        return;
      }
      const nova: Sessao = { sessaoId: json.sessaoId, conta: json.conta, email, expiraEm: json.expiraEm };
      setSessao(nova);
      gravar(chaves.sessao, nova, 'sessao');
      setMateriais(json.materiais);
      setAba('catalogo');
      avisar(`Conectado! ${plural(json.total, 'material encontrado', 'materiais encontrados')}.`, 'sucesso');
    } catch {
      setErroLogin('Não foi possível falar com o servidor. Verifique sua internet.');
    } finally {
      setEntrando(false);
    }
  }

  async function sair() {
    if (emAndamento && !confirm('Há um download em andamento. Sair mesmo assim?')) return;
    abortar.current?.abort();
    const id = sessao?.sessaoId;
    encerrarSessao();
    setErroLogin('');
    if (id) fetch('/api/materiais', { method: 'DELETE', headers: { 'x-sessao': id } }).catch(() => {});
    avisar('Você saiu da conta.', 'info');
  }

  async function recarregarLista() {
    if (!sessao) return;
    setCarregandoLista(true);
    try {
      const res = await fetch('/api/materiais', { headers: { 'x-sessao': sessao.sessaoId } });
      const json = await res.json();
      if (res.status === 401) return encerrarSessao('Sua sessão expirou. Entre novamente.');
      if (!json.ok) return avisar(json.erro || 'Falha ao atualizar.', 'erro');
      setMateriais(json.materiais);
      avisar('Lista atualizada.', 'sucesso', 2500);
    } catch {
      avisar('Sem conexão com o servidor.', 'erro');
    } finally {
      setCarregandoLista(false);
    }
  }

  /* ------------------------------------------------------------ carrinho */
  // Os avisos ficam fora do setState: chamar outro setState durante o
  // calculo do estado gera aviso do React (e roda duas vezes no StrictMode).
  function alternarCarrinho(id: number) {
    if (liberados.has(id)) return;
    if (carrinho.includes(id)) {
      setCarrinho(carrinho.filter((x) => x !== id));
      return;
    }
    if (carrinho.length >= MAX_ITENS_PEDIDO) {
      avisar(`O limite é de ${MAX_ITENS_PEDIDO} materiais por pedido.`, 'alerta');
      return;
    }
    const o = calcularOrcamento(carrinho.length + 1);
    if (o.faixa.minimo === carrinho.length + 1 && carrinho.length > 0) {
      avisar(`Desconto desbloqueado! Agora cada material sai por ${formatarReais(o.unitario)}.`, 'sucesso');
    }
    setCarrinho([...carrinho, id]);
  }

  function adicionarVarios(ids: number[]) {
    const novos = ids.filter((id) => !carrinho.includes(id) && !liberados.has(id));
    const resultado = [...carrinho, ...novos].slice(0, MAX_ITENS_PEDIDO);
    const entraram = resultado.length - carrinho.length;
    if (entraram > 0) {
      const o = calcularOrcamento(resultado.length);
      avisar(
        `${plural(entraram, 'material adicionado', 'materiais adicionados')}. Cada um sai por ${formatarReais(o.unitario)}.`,
        'sucesso',
      );
    }
    if (resultado.length < carrinho.length + novos.length) {
      avisar(`O limite é de ${MAX_ITENS_PEDIDO} materiais por pedido.`, 'alerta');
    }
    setCarrinho(resultado);
  }

  function removerVarios(ids: number[]) {
    const fora = new Set(ids);
    setCarrinho((c) => c.filter((id) => !fora.has(id)));
  }

  /* ------------------------------------------------------------ pagamento */
  async function finalizarCompra(email: string) {
    if (!sessao || carrinho.length === 0) return;
    if (pix && estadoPix === 'aguardando' && pix.expiraEm > Date.now()) {
      if (!confirm('Você já tem um Pix aguardando pagamento. Gerar um novo para o carrinho atual?')) {
        setCarrinhoAberto(false);
        setCheckoutAberto(true);
        return;
      }
    }
    setGerandoPix(true);
    try {
      const res = await fetch('/api/pagamento', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sessao': sessao.sessaoId,
          'x-licencas': licencas.map((l) => l.token).join(' '),
        },
        body: JSON.stringify({ materialIds: carrinho, email }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      if (res.status === 401) return encerrarSessao('Sua sessão expirou. Entre de novo para pagar.');
      if (!json.ok) {
        if (Array.isArray(json.invalidos)) removerVarios(json.invalidos);
        if (Array.isArray(json.jaPagos)) removerVarios(json.jaPagos);
        return avisar(json.erro || 'Não foi possível gerar o Pix.', 'erro', 7000);
      }
      const novo: PixPendente = {
        id: json.pagamento.id,
        qrCode: json.pagamento.qrCode,
        qrCodeBase64: json.pagamento.qrCodeBase64,
        ticketUrl: json.pagamento.ticketUrl,
        expiraEm: json.pagamento.expiraEm,
        simulado: json.pagamento.simulado,
        materialIds: json.materialIds,
        valor: json.orcamento.total,
      };
      setPix(novo);
      setEstadoPix('aguardando');
      setPedidos((p) => [
        {
          id: novo.id,
          criadoEm: Date.now(),
          materialIds: novo.materialIds,
          titulos: itensCarrinho.filter((m) => novo.materialIds.includes(m.id)).map((m) => m.titulo),
          valor: novo.valor,
          status: 'pendente',
        },
        ...p,
      ]);
      setCarrinhoAberto(false);
      setCheckoutAberto(true);
      // Pede permissao para avisar quando o Pix cair (util se o usuario trocar de aba).
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      avisar('Sem conexão com o servidor. Tente de novo.', 'erro');
    } finally {
      setGerandoPix(false);
    }
  }

  const verificarPagamento = useCallback(
    async (manual = false) => {
      if (!sessao || !pix) return;
      if (manual) setVerificando(true);
      try {
        const res = await fetch(`/api/pagamento/${encodeURIComponent(pix.id)}`, {
          headers: { 'x-sessao': sessao.sessaoId },
        });
        const json = await res.json().catch(() => ({ ok: false }));
        if (res.status === 401) return encerrarSessao('Sua sessão expirou. Entre de novo para concluir o pagamento.');
        if (!json.ok) {
          if (manual) avisar(json.erro || 'Não foi possível verificar agora.', 'erro');
          if (res.status === 403 || res.status === 404) setPix(null);
          return;
        }
        if (json.aprovado && json.licenca) {
          const nova: LicencaLocal = {
            token: json.licenca.token,
            expiraEm: json.licenca.expiraEm,
            materialIds: json.materialIds,
            pagamentoId: json.id,
          };
          setLicencas((l) => [...licencasValidas(l).filter((x) => x.pagamentoId !== nova.pagamentoId), nova]);
          setPedidos((p) => p.map((x) => (x.id === pix.id ? { ...x, status: 'aprovado' } : x)));
          removerVarios(json.materialIds);
          setEstadoPix('aprovado');
          setCheckoutAberto(true);
          avisar('Pagamento confirmado! Seus downloads foram liberados.', 'sucesso', 7000);
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('Pix confirmado', { body: 'Seus materiais já podem ser baixados.' });
          }
        } else if (json.encerrado) {
          const st: EstadoPix = json.status === 'expired' || json.status === 'cancelled' ? 'expirado' : 'recusado';
          setEstadoPix(st);
          setPedidos((p) => p.map((x) => (x.id === pix.id ? { ...x, status: st } : x)));
        } else if (manual) {
          avisar('Ainda não recebemos a confirmação. Pode levar alguns segundos.', 'info');
        }
      } catch {
        if (manual) avisar('Sem conexão para verificar o pagamento.', 'erro');
      } finally {
        if (manual) setVerificando(false);
      }
    },
    [sessao, pix, avisar, encerrarSessao],
  );

  // Consulta o status em intervalos (mais espacados com a aba em segundo plano).
  useEffect(() => {
    if (!sessao || !pix || estadoPix !== 'aguardando') return;
    let ativo = true;
    let timer: ReturnType<typeof setTimeout>;
    const ciclo = async () => {
      await verificarPagamento(false);
      if (!ativo) return;
      timer = setTimeout(ciclo, document.hidden ? 15000 : 4000);
    };
    timer = setTimeout(ciclo, 2500);
    const voltar = () => !document.hidden && verificarPagamento(false);
    document.addEventListener('visibilitychange', voltar);
    return () => {
      ativo = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', voltar);
    };
  }, [sessao, pix, estadoPix, verificarPagamento]);

  function fecharCheckout() {
    setCheckoutAberto(false);
    if (estadoPix === 'aprovado') {
      setPix(null);
      setEstadoPix('aguardando');
    } else if (estadoPix === 'aguardando' && pix) {
      avisar('O Pix continua aguardando. Reabra pelo aviso no topo da página.', 'info');
    }
  }

  function cancelarPix() {
    if (estadoPix === 'aguardando' && !confirm('Cancelar este pedido? Se você já pagou, aguarde a confirmação.')) return;
    if (pix) setPedidos((p) => p.map((x) => (x.id === pix.id && x.status === 'pendente' ? { ...x, status: 'expirado' } : x)));
    setPix(null);
    setEstadoPix('aguardando');
    setCheckoutAberto(false);
  }

  /* ------------------------------------------------------------ downloads */
  useEffect(() => {
    if (!emAndamento) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [emAndamento]);

  // O titulo da aba mostra o progresso (util com a aba em segundo plano).
  useEffect(() => {
    const p = emAndamento?.progresso;
    if (p && p.paginasTotal) {
      document.title = `${Math.round((p.paginasBaixadas / p.paginasTotal) * 100)}% · Baixando - APMED`;
    } else if (pix && estadoPix === 'aguardando') {
      document.title = 'Aguardando Pix - APMED Downloader';
    } else {
      document.title = carrinho.length ? `(${carrinho.length}) APMED Downloader` : 'APMED Downloader';
    }
  }, [emAndamento, pix, estadoPix, carrinho.length]);

  async function executarDownload(rotulo: string, ids: number[], tarefa: (signal: AbortSignal) => Promise<void>) {
    if (!sessao || abortar.current) return;
    const controle = new AbortController();
    abortar.current = controle;
    setEmAndamento({ rotulo, inicio: Date.now(), progresso: null });
    try {
      await tarefa(controle.signal);
      setBaixados((b) => [...new Set([...b, ...ids])]);
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Download concluído', { body: rotulo });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        avisar('Download cancelado.', 'info');
      } else if (e instanceof ErroDefinitivo && e.status === 401) {
        encerrarSessao('Sua sessão expirou durante o download. Entre de novo e tente outra vez.');
      } else {
        avisar(e instanceof Error ? e.message : 'Erro durante o download.', 'erro', 8000);
      }
    } finally {
      abortar.current = null;
      setEmAndamento(null);
    }
  }

  const credenciais = () => ({ sessaoId: sessao!.sessaoId, licencas: licencas.map((l) => l.token) });
  const atualizarProgresso = (progresso: DownloadEmAndamento['progresso']) =>
    setEmAndamento((a) => (a ? { ...a, progresso } : a));

  function baixarUm(id: number) {
    const m = materiais.find((x) => x.id === id);
    if (!m) return;
    executarDownload(m.titulo, [id], async (signal) => {
      const r = await baixarMaterial(credenciais(), id, { ...opcoes, signal }, atualizarProgresso);
      salvarArquivo(r.blob, r.nome);
      avisar(`"${m.titulo}" (${r.totalPaginas} páginas) foi salvo!`, 'sucesso', 6000);
    });
  }

  function baixarVarios(ids: number[]) {
    if (ids.length === 1) return baixarUm(ids[0]);
    executarDownload(`Pacote com ${ids.length} materiais`, ids, async (signal) => {
      const r = await baixarVariosComoZip(credenciais(), ids, { ...opcoes, signal }, atualizarProgresso);
      salvarArquivo(r.blob, r.nome);
      if (r.falhas.length) {
        avisar(
          `${plural(r.totalMateriais, 'material salvo', 'materiais salvos')}; ${r.falhas.length} falharam (veja o LEIA-ME no ZIP).`,
          'alerta',
          9000,
        );
      } else {
        avisar(`ZIP com ${plural(r.totalMateriais, 'material', 'materiais')} (${r.totalPaginas} páginas) salvo!`, 'sucesso', 6000);
      }
    });
  }

  function cancelarDownload() {
    abortar.current?.abort();
  }

  /* ------------------------------------------------------------ render */
  const orcamento = calcularOrcamento(carrinho.length);
  const pixAguardando = pix && estadoPix === 'aguardando' && !checkoutAberto;

  return (
    <div className="app">
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Cabecalho
        email={sessao?.email ?? null}
        expiraEm={sessao?.expiraEm ?? 0}
        aba={aba}
        qtdCarrinho={carrinho.length}
        qtdLiberados={liberados.size}
        tema={tema}
        aoMudarAba={setAba}
        aoAbrirCarrinho={() => setCarrinhoAberto(true)}
        aoMudarTema={mudarTema}
        aoSair={sair}
      />

      <main id="conteudo" className="conteudo">
        {restaurando ? (
          <div className="vazio" aria-busy="true">
            <span className="girando" style={{ margin: '0 auto', color: 'var(--primary)' }} />
          </div>
        ) : !sessao ? (
          <>
            <TelaLogin aoEntrar={entrar} carregando={entrando} erro={erroLogin} />
            <Faq diasLicenca={config.diasLicenca} />
          </>
        ) : (
          <>
            {config.pagamento === 'simulado' && (
              <div className="aviso aviso-alerta mb-16">
                <Icone nome="info" />
                <span>
                  <strong>Modo de teste:</strong> o Mercado Pago não está configurado, então os pagamentos são
                  simulados e aprovados sozinhos. Configure <code>MERCADOPAGO_ACCESS_TOKEN</code> para cobrar de verdade.
                </span>
              </div>
            )}
            {pixAguardando && (
              <div className="aviso aviso-info mb-16">
                <Icone nome="pix" />
                <span style={{ flex: 1 }}>
                  Você tem um Pix de <strong>{formatarReais(pix.valor)}</strong> aguardando pagamento.
                </span>
                <button className="btn btn-pix btn-pequeno" onClick={() => setCheckoutAberto(true)}>
                  Ver QR Code
                </button>
              </div>
            )}

            <div className="abas-mobile" role="tablist">
              <button className="chip" aria-pressed={aba === 'catalogo'} onClick={() => setAba('catalogo')}>
                <Icone nome="livro" tamanho={14} /> Catálogo
              </button>
              <button className="chip" aria-pressed={aba === 'downloads'} onClick={() => setAba('downloads')}>
                <Icone nome="download" tamanho={14} /> Meus downloads {liberados.size > 0 && `(${liberados.size})`}
              </button>
            </div>

            {aba === 'catalogo' ? (
              <Catalogo
                materiais={materiais}
                carregando={carregandoLista}
                noCarrinho={noCarrinho}
                liberados={liberados}
                aoAlternar={alternarCarrinho}
                aoAdicionarVarios={adicionarVarios}
                aoRemoverVarios={removerVarios}
                aoRecarregar={recarregarLista}
                aoIrParaDownloads={() => setAba('downloads')}
              />
            ) : (
              <MeusDownloads
                materiais={materiais}
                liberados={liberados}
                pedidos={pedidos}
                baixados={new Set(baixados)}
                opcoes={opcoes}
                emAndamento={emAndamento}
                aoMudarOpcoes={setOpcoes}
                aoBaixarUm={baixarUm}
                aoBaixarVarios={baixarVarios}
                aoCancelar={cancelarDownload}
                aoIrParaCatalogo={() => setAba('catalogo')}
              />
            )}

            {/* Download em andamento visivel tambem no catalogo */}
            {aba === 'catalogo' && emAndamento && (
              <div className="aviso aviso-info mt-16">
                <span className="girando" />
                <span style={{ flex: 1 }}>Baixando: {emAndamento.rotulo}</span>
                <button className="btn btn-secundario btn-pequeno" onClick={() => setAba('downloads')}>
                  Acompanhar
                </button>
              </div>
            )}

            <Faq diasLicenca={config.diasLicenca} />
          </>
        )}
      </main>

      {sessao && carrinho.length > 0 && !carrinhoAberto && !checkoutAberto && (
        <div className="barra-flutuante">
          <div>
            <span className="valor">{formatarReais(orcamento.total)}</span>
            <small>
              {plural(carrinho.length, 'material', 'materiais')}
              {orcamento.desconto > 0 && ` · economia de ${formatarReais(orcamento.desconto)}`}
            </small>
          </div>
          <button className="btn btn-pix btn-pequeno" onClick={() => setCarrinhoAberto(true)}>
            <Icone nome="carrinho" tamanho={16} /> Ver carrinho
          </button>
        </div>
      )}

      <Carrinho
        aberto={carrinhoAberto}
        itens={itensCarrinho}
        emailPadrao={sessao?.email ?? ''}
        gerando={gerandoPix}
        pagamentoAtivo={config.pagamento !== 'desativado'}
        aoFechar={() => setCarrinhoAberto(false)}
        aoRemover={(id) => removerVarios([id])}
        aoLimpar={() => setCarrinho([])}
        aoFinalizar={finalizarCompra}
      />

      {checkoutAberto && (
        <Checkout
          pix={pix}
          estado={estadoPix}
          verificando={verificando}
          aoFechar={fecharCheckout}
          aoCancelar={cancelarPix}
          aoVerificarAgora={() => verificarPagamento(true)}
          aoIrParaDownloads={() => {
            fecharCheckout();
            setAba('downloads');
          }}
        />
      )}

      <footer className="rodape-site">
        <p>APMED Downloader · uso pessoal com a sua própria conta do portal APMED.</p>
        <p>Pagamentos processados pelo Mercado Pago. Este serviço não é afiliado ao APMED.</p>
      </footer>
    </div>
  );
}
