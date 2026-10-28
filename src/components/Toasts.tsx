'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Icone, type NomeIcone } from './Icone';

type Tipo = 'sucesso' | 'erro' | 'info' | 'alerta';
type Toast = { id: number; tipo: Tipo; texto: string };

type Api = (texto: string, tipo?: Tipo, duracaoMs?: number) => void;

const Contexto = createContext<Api>(() => {});

const ICONES: Record<Tipo, NomeIcone> = {
  sucesso: 'check',
  erro: 'erro',
  info: 'info',
  alerta: 'alerta',
};

/** Notificacoes rapidas no canto da tela, anunciadas a leitores de tela. */
export function ProvedorToasts({ children }: { children: React.ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const proximoId = useRef(1);

  const fechar = useCallback((id: number) => {
    setLista((l) => l.filter((t) => t.id !== id));
  }, []);

  const avisar = useCallback<Api>(
    (texto, tipo = 'info', duracaoMs = 4500) => {
      const id = proximoId.current++;
      // Nao empilha a mesma mensagem duas vezes; no maximo 4 na tela.
      setLista((l) => [...l.filter((t) => t.texto !== texto), { id, tipo, texto }].slice(-4));
      setTimeout(() => fechar(id), duracaoMs);
    },
    [fechar],
  );

  const valor = useMemo(() => avisar, [avisar]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {lista.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            <Icone nome={ICONES[t.tipo]} />
            <span>{t.texto}</span>
            <button className="fechar" onClick={() => fechar(t.id)} aria-label="Fechar aviso">
              <Icone nome="x" tamanho={16} />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): Api {
  return useContext(Contexto);
}
