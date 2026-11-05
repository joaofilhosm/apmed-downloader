'use client';

import { useEffect, useRef, useState } from 'react';
import { Icone } from './Icone';
import { TabelaPrecos } from './TabelaPrecos';
import { chaves, gravar, ler } from '@/lib/cliente';
import { FAIXAS, PRECO_BASE } from '@/lib/precos';

const DESCONTO_MAXIMO = Math.round((1 - FAIXAS[FAIXAS.length - 1].unitario / PRECO_BASE) * 100);

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function TelaLogin({
  aoEntrar,
  carregando,
  erro,
}: {
  aoEntrar: (email: string, senha: string) => void;
  carregando: boolean;
  erro: string;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [lembrar, setLembrar] = useState(true);
  const [tocado, setTocado] = useState(false);
  const senhaRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Lembra o e-mail (nunca a senha) do ultimo acesso.
  useEffect(() => {
    const salvo = ler<string>(chaves.email, '');
    if (salvo) {
      setEmail(salvo);
      senhaRef.current?.focus();
    } else {
      emailRef.current?.focus();
    }
  }, []);

  const emailInvalido = tocado && email.length > 0 && !EMAIL_VALIDO.test(email.trim());

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setTocado(true);
    if (!EMAIL_VALIDO.test(email.trim()) || !senha) return;
    gravar(chaves.email, lembrar ? email.trim() : null);
    aoEntrar(email.trim(), senha);
  }

  function verificarCaps(e: React.KeyboardEvent) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  }

  return (
    <section className="login">
      <div className="login-hero">
        <span className="selo">
          <span className="ponto" /> Pagamento via Pix, liberação na hora
        </span>
        <h1>
          Seus materiais do APMED em <span className="grad">PDF</span>, prontos para estudar offline.
        </h1>
        <p>
          Entre com a sua conta, escolha os materiais, pague com Pix e baixe. Quanto mais
          materiais no mesmo pedido, menor o preço de cada um.
        </p>

        <div className="passos-hero">
          <div className="passo-hero">
            <div className="num">1</div>
            <strong>Escolha</strong>
            <span>Monte seu carrinho com os materiais da sua conta.</span>
          </div>
          <div className="passo-hero">
            <div className="num">2</div>
            <strong>Pague com Pix</strong>
            <span>QR Code ou copia e cola, confirmação automática.</span>
          </div>
          <div className="passo-hero">
            <div className="num">3</div>
            <strong>Baixe</strong>
            <span>PDF completo, ou ZIP com tudo de uma vez.</span>
          </div>
        </div>

        <div className="cartao cartao-corpo mt-24">
          <div className="linha entre mb-12">
            <strong>Preço por material</strong>
            <span className="etiqueta sucesso">até {DESCONTO_MAXIMO}% off</span>
          </div>
          <TabelaPrecos quantidade={0} compacta />
        </div>

        <div className="confianca">
          <span>
            <Icone nome="cadeado" tamanho={15} /> Senha nunca é gravada
          </span>
          <span>
            <Icone nome="escudo" tamanho={15} /> Pagamento pelo Mercado Pago
          </span>
          <span>
            <Icone nome="raio" tamanho={15} /> PDF montado no seu navegador
          </span>
        </div>
      </div>

      <form className="cartao login-form" onSubmit={enviar} noValidate>
        <h2>Entrar com a conta APMED</h2>
        <p>Use o mesmo e-mail e senha do portal gestaoapmed.com.br.</p>

        {erro && (
          <div className="aviso aviso-erro mb-16" role="alert">
            <Icone nome="erro" />
            <span>{erro}</span>
          </div>
        )}

        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <div className="entrada-grupo">
            <input
              ref={emailRef}
              id="email"
              className="entrada"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTocado(true)}
              aria-invalid={emailInvalido}
              aria-describedby={emailInvalido ? 'email-erro' : undefined}
              disabled={carregando}
              required
            />
          </div>
          {emailInvalido && (
            <span id="email-erro" className="dica erro">
              Confira o e-mail digitado.
            </span>
          )}
        </div>

        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <div className="entrada-grupo">
            <input
              ref={senhaRef}
              id="senha"
              className="entrada"
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Sua senha do APMED"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyUp={verificarCaps}
              onKeyDown={verificarCaps}
              disabled={carregando}
              required
            />
            <button
              type="button"
              className="acao-dir"
              onClick={() => setMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}
              aria-pressed={mostrarSenha}
            >
              <Icone nome={mostrarSenha ? 'olhoFechado' : 'olho'} />
            </button>
          </div>
          {capsLock && <span className="dica alerta">Caps Lock está ligado.</span>}
        </div>

        <label className="linha pequeno mb-16" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={lembrar}
            onChange={(e) => setLembrar(e.target.checked)}
            style={{ accentColor: 'var(--primary)' }}
          />
          Lembrar meu e-mail neste aparelho
        </label>

        <button className="btn btn-primario btn-bloco btn-grande" type="submit" disabled={carregando}>
          {carregando ? (
            <>
              <span className="girando" /> Conectando ao APMED...
            </>
          ) : (
            <>
              Entrar e ver meus materiais <Icone nome="sair" tamanho={16} />
            </>
          )}
        </button>

        <p className="dica mt-12">
          A senha só é usada para abrir a sessão no portal e nunca é armazenada. A sessão expira
          sozinha em 30 minutos.
        </p>
      </form>
    </section>
  );
}
