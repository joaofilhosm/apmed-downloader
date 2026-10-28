'use client';

import { useEffect, useState } from 'react';
import { Icone } from './Icone';
import { Modal } from './Modal';
import { formatarRelogio, plural, type PixPendente } from '@/lib/cliente';
import { formatarReais } from '@/lib/precos';

export type EstadoPix = 'aguardando' | 'aprovado' | 'expirado' | 'recusado';

export function Checkout({
  pix,
  estado,
  aoFechar,
  aoCancelar,
  aoVerificarAgora,
  aoIrParaDownloads,
  verificando,
}: {
  pix: PixPendente | null;
  estado: EstadoPix;
  aoFechar: () => void;
  aoCancelar: () => void;
  aoVerificarAgora: () => void;
  aoIrParaDownloads: () => void;
  verificando: boolean;
}) {
  const [agora, setAgora] = useState(Date.now());
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!pix || estado !== 'aguardando') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pix, estado]);

  if (!pix) return null;
  const restante = pix.expiraEm - agora;
  const vencido = estado === 'expirado' || (estado === 'aguardando' && restante <= 0);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pix!.qrCode);
    } catch {
      // Navegadores antigos/sem permissao: seleciona o texto para copiar manualmente.
      const area = document.createElement('textarea');
      area.value = pix!.qrCode;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  if (estado === 'aprovado') {
    return (
      <Modal aberto titulo="Pagamento confirmado" aoFechar={aoFechar}>
        <div className="sucesso-grande">
          <div className="circulo">
            <Icone nome="check" tamanho={38} />
          </div>
          <h3>Pix recebido! 🎉</h3>
          <p className="muted mt-8">
            {plural(pix.materialIds.length, 'material foi liberado', 'materiais foram liberados')} para
            download. Você pode baixar quantas vezes quiser durante a validade.
          </p>
          <button className="btn btn-primario btn-grande btn-bloco mt-24" onClick={aoIrParaDownloads}>
            <Icone nome="download" /> Ir para meus downloads
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal aberto titulo="Pague com Pix" aoFechar={aoFechar} fecharNoVeu={false}>
      <div className="linha entre mb-16">
        <div>
          <div className="muted pequeno">Total</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 850 }}>{formatarReais(pix.valor)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="muted pequeno">{vencido ? 'Situação' : 'Expira em'}</div>
          <div className="cronometro" style={{ color: restante < 120000 ? 'var(--warning)' : undefined }}>
            {vencido ? 'Expirado' : estado === 'recusado' ? 'Recusado' : formatarRelogio(restante)}
          </div>
        </div>
      </div>

      <div className="pix-area">
        <div className={`qr ${vencido ? 'expirado' : ''}`}>
          {pix.qrCodeBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code do Pix" />
          ) : (
            <div className="simulado">
              <Icone nome="pix" tamanho={48} />
              <p className="mt-8">
                {pix.simulado ? 'Modo de teste: aprovação automática em alguns segundos' : 'Use o copia e cola'}
              </p>
            </div>
          )}
        </div>

        <div>
          <strong>Pix copia e cola</strong>
          <div className="copia-cola">
            <code title={pix.qrCode}>{pix.qrCode}</code>
            <button className="btn btn-secundario btn-pequeno" onClick={copiar} disabled={vencido}>
              <Icone nome={copiado ? 'check' : 'copiar'} tamanho={15} />
              {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <ol className="passos-pix">
            <li>Abra o app do seu banco e escolha <strong>Pix</strong>.</li>
            <li>Escaneie o QR Code ou cole o código.</li>
            <li>Confirme o pagamento. Esta tela atualiza sozinha.</li>
          </ol>
          {pix.ticketUrl && (
            <a className="btn btn-fantasma btn-pequeno mt-8" href={pix.ticketUrl} target="_blank" rel="noreferrer">
              <Icone nome="externo" tamanho={14} /> Abrir no Mercado Pago
            </a>
          )}
        </div>
      </div>

      <div
        className={`status-pix mt-16 ${estado === 'recusado' || vencido ? 'falhou' : ''}`}
        role="status"
        aria-live="polite"
      >
        {estado === 'recusado' ? (
          <>
            <Icone nome="erro" /> O pagamento foi recusado ou cancelado. Gere um novo Pix.
          </>
        ) : vencido ? (
          <>
            <Icone nome="relogio" /> Este Pix expirou. Feche e gere um novo pelo carrinho.
          </>
        ) : (
          <>
            <span className="girando" /> Aguardando a confirmação do pagamento...
          </>
        )}
      </div>

      <div className="linha entre mt-16">
        <button className="btn btn-perigo btn-pequeno" onClick={aoCancelar}>
          {vencido || estado === 'recusado' ? 'Descartar' : 'Cancelar pedido'}
        </button>
        {!vencido && estado === 'aguardando' && (
          <button className="btn btn-secundario btn-pequeno" onClick={aoVerificarAgora} disabled={verificando}>
            {verificando ? <span className="girando" /> : <Icone nome="recarregar" tamanho={15} />}
            Já paguei, verificar
          </button>
        )}
      </div>
      <p className="dica mt-12">
        Pode fechar esta janela: o pedido fica salvo e a verificação continua. Ao pagar, o download é
        liberado automaticamente.
      </p>
    </Modal>
  );
}
