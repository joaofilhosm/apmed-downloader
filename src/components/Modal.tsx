'use client';

import { useEffect, useRef } from 'react';
import { Icone } from './Icone';

/** Seletor dos elementos que podem receber foco dentro do dialogo. */
const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Prende o foco dentro do elemento, fecha com Esc e devolve o foco a quem
 * abriu. Usado pelo modal e pela gaveta do carrinho.
 */
export function useDialogo(aberto: boolean, aoFechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // Guardado em ref: o efeito nao deve reiniciar (e roubar o foco) a cada render.
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>(FOCAVEIS)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar.current();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const itens = [...el.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (!itens.length) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, [aberto]);

  return ref;
}

export function Modal({
  aberto,
  titulo,
  aoFechar,
  children,
  fecharNoVeu = true,
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
  fecharNoVeu?: boolean;
}) {
  const ref = useDialogo(aberto, aoFechar);
  if (!aberto) return null;

  return (
    <div className="modal-envoltorio">
      <div className="veu" onClick={fecharNoVeu ? aoFechar : undefined} />
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="icone-btn" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" />
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>
  );
}
