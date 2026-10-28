'use client';

import { useEffect, useState } from 'react';
import { Icone } from './Icone';
import { useDialogo } from './Modal';
import { MetaDesconto, TabelaPrecos } from './TabelaPrecos';
import { corDe, plural, sigla, type Material } from '@/lib/cliente';
import { calcularOrcamento, formatarReais, MAX_ITENS_PEDIDO, PRECO_BASE } from '@/lib/precos';

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Carrinho({
  aberto,
  itens,
  emailPadrao,
  gerando,
  pagamentoAtivo,
  aoFechar,
  aoRemover,
  aoLimpar,
  aoFinalizar,
}: {
  aberto: boolean;
  itens: Material[];
  emailPadrao: string;
  gerando: boolean;
  pagamentoAtivo: boolean;
  aoFechar: () => void;
  aoRemover: (id: number) => void;
  aoLimpar: () => void;
  aoFinalizar: (email: string) => void;
}) {
  const ref = useDialogo(aberto, aoFechar);
  const [email, setEmail] = useState(emailPadrao);
  const [verTabela, setVerTabela] = useState(false);
  useEffect(() => setEmail((e) => e || emailPadrao), [emailPadrao]);

  if (!aberto) return null;

  const o = calcularOrcamento(itens.length);
  const excesso = itens.length > MAX_ITENS_PEDIDO;
  const emailOk = EMAIL_VALIDO.test(email.trim());

  return (
    <>
      <div className="veu" onClick={aoFechar} />
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label="Carrinho" ref={ref}>
        <div className="gaveta-topo">
          <h2>
            <Icone nome="carrinho" /> Carrinho
            <span className="etiqueta primaria">{itens.length}</span>
          </h2>
          <button className="icone-btn" onClick={aoFechar} aria-label="Fechar carrinho">
            <Icone nome="x" />
          </button>
        </div>

        <div className="gaveta-corpo">
          {itens.length === 0 ? (
            <div className="vazio">
              <div className="icone-grande">
                <Icone nome="carrinho" tamanho={28} />
              </div>
              <h3>Seu carrinho está vazio</h3>
              <p>Adicione materiais da lista para montar seu pedido.</p>
              <button className="btn btn-primario mt-16" onClick={aoFechar}>
                Ver materiais
              </button>
            </div>
          ) : (
            <>
              <MetaDesconto quantidade={itens.length} />

              <div className="coluna" style={{ gap: 8 }}>
                {itens.map((m) => (
                  <div key={m.id} className="item-carrinho">
                    <div className="mini-capa" style={{ background: corDe(m.slug) }} aria-hidden>
                      {sigla(m).slice(0, 5)}
                    </div>
                    <div className="info">
                      <strong title={m.titulo}>{m.titulo}</strong>
                      <span>
                        {o.unitario < PRECO_BASE && <s>{formatarReais(PRECO_BASE)} </s>}
                        {formatarReais(o.unitario)}
                      </span>
                    </div>
                    <button
                      className="icone-btn"
                      onClick={() => aoRemover(m.id)}
                      aria-label={`Remover ${m.titulo}`}
                      title="Remover"
                    >
                      <Icone nome="lixo" tamanho={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="linha entre">
                <button className="btn btn-fantasma btn-pequeno" onClick={() => setVerTabela((v) => !v)}>
                  <Icone nome="etiqueta" tamanho={15} /> {verTabela ? 'Esconder' : 'Ver'} tabela de descontos
                </button>
                <button className="btn btn-perigo btn-pequeno" onClick={aoLimpar}>
                  Esvaziar
                </button>
              </div>
              {verTabela && <TabelaPrecos quantidade={itens.length} />}
            </>
          )}
        </div>

        {itens.length > 0 && (
          <div className="gaveta-rodape">
            <div className="linha-total">
              <span>Subtotal ({plural(itens.length, 'material', 'materiais')})</span>
              <span>{formatarReais(o.subtotal)}</span>
            </div>
            {o.desconto > 0 && (
              <div className="linha-total desconto">
                <span>Desconto por quantidade ({o.percentualDesconto}%)</span>
                <span>−{formatarReais(o.desconto)}</span>
              </div>
            )}
            <div className="linha-total final">
              <span>Total no Pix</span>
              <span>{formatarReais(o.total)}</span>
            </div>

            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="email-pix">E-mail para o comprovante</label>
              <input
                id="email-pix"
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
                <span>Cada pedido aceita até {MAX_ITENS_PEDIDO} materiais. Remova alguns itens.</span>
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
              onClick={() => aoFinalizar(email.trim())}
              disabled={gerando || !emailOk || excesso || !pagamentoAtivo}
            >
              {gerando ? (
                <>
                  <span className="girando" /> Gerando Pix...
                </>
              ) : (
                <>
                  <Icone nome="pix" /> Pagar {formatarReais(o.total)} com Pix
                </>
              )}
            </button>
            <p className="dica" style={{ textAlign: 'center' }}>
              Pagamento processado pelo Mercado Pago.
              O download libera assim que o Pix é confirmado.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
