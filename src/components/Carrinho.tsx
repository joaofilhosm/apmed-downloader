'use client';

import { useEffect, useState } from 'react';
import { Icone } from './Icone';
import { useDialogo } from './Modal';
import { MetaDesconto, TabelaPrecos } from './TabelaPrecos';
import { corDe, plural, type Material } from '@/lib/cliente';
import { calcularOrcamento, formatarReais, MAX_ITENS_PEDIDO, PRECO_BASE } from '@/lib/precos';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Props = {
  itens: Material[];
  emailPadrao: string;
  gerando: boolean;
  pagamentoAtivo: boolean;
  cartaoAtivo: boolean;
  aoRemover: (id: number) => void;
  aoLimpar: () => void;
  aoFinalizar: (email: string, metodo: 'pix' | 'cartao') => void;
  aoFechar?: () => void;
};

/** Conteudo do carrinho, usado no painel fixo (desktop) e na gaveta. */
function ConteudoCarrinho({
  itens,
  emailPadrao,
  gerando,
  pagamentoAtivo,
  cartaoAtivo,
  aoRemover,
  aoLimpar,
  aoFinalizar,
  aoFechar,
}: Props) {
  const [email, setEmail] = useState(emailPadrao);
  useEffect(() => setEmail((e) => e || emailPadrao), [emailPadrao]);

  const o = calcularOrcamento(itens.length);
  const excesso = itens.length > MAX_ITENS_PEDIDO;
  const emailOk = EMAIL_VALIDO.test(email.trim());
  const bloqueado = gerando || !emailOk || excesso || !pagamentoAtivo;

  return (
    <>
      <div className="carrinho-topo">
        <h2>
          <Icone nome="carrinho" /> Seu pedido
        </h2>
        {aoFechar ? (
          <button className="icone-btn" onClick={aoFechar} aria-label="Fechar carrinho">
            <Icone nome="x" />
          </button>
        ) : (
          itens.length > 0 && (
            <button className="btn btn-fantasma btn-pequeno" onClick={aoLimpar}>
              Esvaziar
            </button>
          )
        )}
      </div>

      <div className="carrinho-corpo">
        <TabelaPrecos quantidade={itens.length} />
        <MetaDesconto quantidade={itens.length} />

        {itens.length === 0 ? (
          <p className="muted pequeno">
            Clique em <strong>Adicionar</strong> nos materiais que quer baixar. Eles ficam grifados na lista.
          </p>
        ) : (
          <ul className="itens-carrinho">
            {itens.map((m) => (
              <li key={m.id} className="item-carrinho">
                <span className="cor" style={{ background: corDe(m.slug) }} aria-hidden />
                <div className="info">
                  <strong title={m.titulo}>{m.titulo}</strong>
                  <span className="muted">
                    {o.unitario < PRECO_BASE && <s>{formatarReais(PRECO_BASE)}</s>} {formatarReais(o.unitario)}
                  </span>
                </div>
                <button
                  className="icone-btn remover"
                  onClick={() => aoRemover(m.id)}
                  aria-label={`Remover ${m.titulo}`}
                  title="Remover"
                >
                  <Icone nome="x" tamanho={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {aoFechar && itens.length > 0 && (
          <button className="btn btn-fantasma btn-pequeno" onClick={aoLimpar} style={{ alignSelf: 'flex-start' }}>
            Esvaziar o pedido
          </button>
        )}
      </div>

      {itens.length > 0 && (
        <div className="carrinho-rodape">
          <div className="linha-total">
            <span>{plural(itens.length, 'material', 'materiais')}</span>
            <span>{formatarReais(o.subtotal)}</span>
          </div>
          {o.desconto > 0 && (
            <div className="linha-total desconto">
              <span>Desconto por quantidade</span>
              <span>−{formatarReais(o.desconto)}</span>
            </div>
          )}
          <div className="linha-total final">
            <span>Total</span>
            <span>{formatarReais(o.total)}</span>
          </div>

          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor={aoFechar ? 'email-pix-gaveta' : 'email-pix'}>E-mail para o comprovante</label>
            <input
              id={aoFechar ? 'email-pix-gaveta' : 'email-pix'}
              className="entrada"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={email.length > 0 && !emailOk}
              autoComplete="email"
            />
          </div>

          {excesso && (
            <div className="aviso aviso-alerta pequeno">
              <Icone nome="alerta" />
              <span>Cada pedido aceita até {MAX_ITENS_PEDIDO} materiais. Remova alguns.</span>
            </div>
          )}
          {!pagamentoAtivo && (
            <div className="aviso aviso-alerta pequeno">
              <Icone nome="alerta" />
              <span>Os pagamentos ainda não foram ativados neste servidor.</span>
            </div>
          )}

          <button
            className="btn btn-pix btn-bloco btn-grande"
            onClick={() => aoFinalizar(email.trim(), 'pix')}
            disabled={bloqueado}
          >
            {gerando ? (
              <>
                <span className="girando" /> Gerando o pagamento...
              </>
            ) : (
              <>
                <Icone nome="pix" /> Pagar {formatarReais(o.total)} com Pix
              </>
            )}
          </button>
          {cartaoAtivo && (
            <button
              className="btn btn-secundario btn-bloco"
              onClick={() => aoFinalizar(email.trim(), 'cartao')}
              disabled={bloqueado}
            >
              Pagar com cartão
            </button>
          )}
          <p className="dica">O download é liberado assim que o Mercado Pago confirma o pagamento.</p>
        </div>
      )}
    </>
  );
}

/** Painel fixo ao lado da lista (telas largas). */
export function PainelCarrinho(props: Props) {
  return (
    <aside className="painel-carrinho" aria-label="Seu pedido">
      <ConteudoCarrinho {...props} />
    </aside>
  );
}

/** Gaveta lateral (tablet e celular). */
export function Carrinho({ aberto, aoFechar, ...props }: Props & { aberto: boolean; aoFechar: () => void }) {
  const ref = useDialogo(aberto, aoFechar);
  if (!aberto) return null;
  return (
    <>
      <div className="veu" onClick={aoFechar} />
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label="Seu pedido" ref={ref}>
        <ConteudoCarrinho {...props} aoFechar={aoFechar} />
      </aside>
    </>
  );
}
