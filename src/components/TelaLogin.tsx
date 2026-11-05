'use client';

import { useEffect, useRef, useState } from 'react';
import { Icone } from './Icone';
import { TabelaPrecos } from './TabelaPrecos';
import { chaves, gravar, ler } from '@/lib/cliente';
import { FAIXAS, formatarReais } from '@/lib/precos';

// Lombadas da estante: bancas reais do portal, alturas e cores variadas.
const ESTANTE = [
  { nome: 'USP-SP', altura: 188, cor: '#3a5a8c' },
  { nome: 'UNICAMP', altura: 164, cor: '#2e6b5e' },
  { nome: 'SUS-SP', altura: 196, cor: '#9c4335', grifada: true },
  { nome: 'HSL', altura: 150, cor: '#14262b' },
  { nome: 'UNIFESP', altura: 178, cor: '#7a4e8c' },
  { nome: 'PSU-MG', altura: 158, cor: '#806418' },
  { nome: 'SCMSP', altura: 184, cor: '#2f7f95' },
  { nome: 'ENAMED', altura: 200, cor: '#5c6b2e', grifada: true },
  { nome: 'AMRIGS', altura: 166, cor: '#8a3b5c' },
  { nome: 'IAMSPE', altura: 176, cor: '#3a5a8c' },
  { nome: 'HCPA', altura: 154, cor: '#2e6b5e' },
  { nome: 'UERJ', altura: 182, cor: '#9c4335' },
  { nome: 'FMABC', altura: 170, cor: '#806418' },
];

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
        <h1>As bíblias das suas bancas, em PDF, para estudar onde quiser.</h1>
        <p>
          Entre com a conta do portal APMED, separe as bancas que vai prestar e pague com Pix. O PDF
          completo de cada material fica pronto para baixar assim que o pagamento cai.
        </p>

        <div className="estante" aria-hidden>
          {ESTANTE.map((l) => (
            <span
              key={l.nome}
              className={`lombada ${l.grifada ? 'grifada' : ''}`}
              style={{ height: l.altura, background: l.cor }}
            >
              {l.nome}
            </span>
          ))}
        </div>

        <ol className="como-funciona">
          <li>
            <strong>Entre</strong> com o e-mail e a senha do APMED.
          </li>
          <li>
            <strong>Separe</strong> as bancas que quer baixar.
          </li>
          <li>
            <strong>Pague</strong> com Pix e baixe os PDFs.
          </li>
        </ol>
      </div>

      <form className="login-form" onSubmit={enviar} noValidate>
        <h2>Entrar</h2>
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
              Entrar e ver meus materiais
            </>
          )}
        </button>

        <p className="dica mt-12">
          A senha só abre a sessão no portal e nunca é guardada. A sessão termina sozinha em 30 minutos.
        </p>

        <div className="preco-login">
          <h3>Preço de cada material</h3>
          <TabelaPrecos quantidade={0} />
          <p className="dica mt-12">
            De {formatarReais(FAIXAS[0].unitario)} com um material a {formatarReais(FAIXAS[FAIXAS.length - 1].unitario)} a
            partir de {FAIXAS[FAIXAS.length - 1].minimo} no mesmo pedido.
          </p>
        </div>
      </form>
    </section>
  );
}
