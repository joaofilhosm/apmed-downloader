'use client';

import { useEffect, useRef, useState } from 'react';
import { Icone } from './Icone';
import { formatarRelogio } from '@/lib/cliente';

export type Aba = 'catalogo' | 'downloads';
export type Tema = 'claro' | 'escuro' | 'sistema';

export function Cabecalho({
  email,
  expiraEm,
  aba,
  qtdCarrinho,
  qtdLiberados,
  tema,
  aoMudarAba,
  aoAbrirCarrinho,
  aoMudarTema,
  aoSair,
}: {
  email: string | null;
  expiraEm: number;
  aba: Aba;
  qtdCarrinho: number;
  qtdLiberados: number;
  tema: Tema;
  aoMudarAba: (a: Aba) => void;
  aoAbrirCarrinho: () => void;
  aoMudarTema: (t: Tema) => void;
  aoSair: () => void;
}) {
  const [agora, setAgora] = useState(Date.now());
  const [pulsar, setPulsar] = useState(false);
  const anterior = useRef(qtdCarrinho);

  useEffect(() => {
    if (!email) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [email]);

  // Pequena animacao no contador quando um item entra no carrinho.
  useEffect(() => {
    if (qtdCarrinho > anterior.current) {
      setPulsar(true);
      const t = setTimeout(() => setPulsar(false), 500);
      anterior.current = qtdCarrinho;
      return () => clearTimeout(t);
    }
    anterior.current = qtdCarrinho;
  }, [qtdCarrinho]);

  const restante = expiraEm - agora;
  const escuroAgora =
    tema === 'escuro' ||
    (tema === 'sistema' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <header className="topo">
      <div className="topo-inner">
        <a className="marca" href="#conteudo" onClick={(e) => (e.preventDefault(), email && aoMudarAba('catalogo'))}>
          <span className="marca-logo">
            <Icone nome="livro" tamanho={18} />
          </span>
          <span>
            APMED Downloader
            <small>Materiais em PDF</small>
          </span>
        </a>

        {email && (
          <nav className="abas" aria-label="Seções">
            <button className="aba" aria-current={aba === 'catalogo' ? 'page' : undefined} onClick={() => aoMudarAba('catalogo')}>
              <Icone nome="livro" tamanho={16} /> Catálogo
            </button>
            <button className="aba" aria-current={aba === 'downloads' ? 'page' : undefined} onClick={() => aoMudarAba('downloads')}>
              <Icone nome="download" tamanho={16} /> Meus downloads
              {qtdLiberados > 0 && <span className="contagem">{qtdLiberados}</span>}
            </button>
          </nav>
        )}

        <div className="topo-acoes">
          {email && (
            <div className="conta-chip" title={`Conectado como ${email}`}>
              <span className="avatar">{email.charAt(0).toUpperCase()}</span>
              <span className="email">{email}</span>
              <span
                className={`tempo ${restante < 5 * 60 * 1000 ? 'alerta' : ''}`}
                title="Tempo restante da sessão"
              >
                <span className="sr-only">Sessão expira em </span>
                {formatarRelogio(restante)}
              </span>
            </div>
          )}
          <button
            className="icone-btn"
            onClick={() => aoMudarTema(escuroAgora ? 'claro' : 'escuro')}
            aria-label={escuroAgora ? 'Usar tema claro' : 'Usar tema escuro'}
            title={escuroAgora ? 'Tema claro' : 'Tema escuro'}
          >
            <Icone nome={escuroAgora ? 'sol' : 'lua'} />
          </button>
          {email && (
            <>
              <button className="icone-btn" onClick={aoAbrirCarrinho} aria-label={`Abrir carrinho (${qtdCarrinho} itens)`}>
                <Icone nome="carrinho" />
                {qtdCarrinho > 0 && <span className={`badge ${pulsar ? 'pulsar' : ''}`}>{qtdCarrinho}</span>}
              </button>
              <button className="icone-btn" onClick={aoSair} aria-label="Sair da conta" title="Sair">
                <Icone nome="sair" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
