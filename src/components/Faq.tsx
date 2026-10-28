import { FAIXAS, formatarReais } from '@/lib/precos';

export function Faq({ diasLicenca }: { diasLicenca: number }) {
  const menor = FAIXAS[FAIXAS.length - 1];
  const perguntas: [string, string][] = [
    [
      'Quanto custa?',
      `Cada material sai por ${formatarReais(FAIXAS[0].unitario)}. Quanto mais materiais no mesmo pedido, menor o preço de cada um, chegando a ${formatarReais(menor.unitario)} a partir de ${menor.minimo} materiais.`,
    ],
    [
      'Como funciona o pagamento?',
      'O pagamento é feito por Pix, processado pelo Mercado Pago. Você escaneia o QR Code ou usa o copia e cola no app do banco, e o download é liberado sozinho assim que o pagamento é confirmado, normalmente em segundos.',
    ],
    [
      'Posso baixar de novo depois?',
      `Sim. Cada material pago fica liberado por ${diasLicenca} dias neste navegador, para você baixar quantas vezes precisar.`,
    ],
    [
      'Minha senha fica salva?',
      'Não. A senha é usada só para abrir a sessão no portal APMED e nunca é gravada. A sessão expira sozinha em 30 minutos.',
    ],
    [
      'Quais materiais aparecem?',
      'Somente os materiais liberados na sua própria conta do portal APMED. O app não dá acesso a conteúdo que você não tenha.',
    ],
    [
      'Paguei e não liberou. E agora?',
      'Clique em "Já paguei, verificar" na tela do Pix. O pedido fica salvo mesmo se você fechar a janela: ao entrar de novo com a mesma conta, a verificação continua. Se o problema persistir, guarde o número do pedido que aparece no histórico e fale com o suporte.',
    ],
    [
      'O download é demorado?',
      'Materiais grandes (100+ páginas) levam alguns minutos, porque cada página é baixada e o PDF é montado no seu navegador. Mantenha a aba aberta até o arquivo ser salvo.',
    ],
  ];

  return (
    <section className="faq" aria-labelledby="titulo-faq">
      <h2 id="titulo-faq">Perguntas frequentes</h2>
      {perguntas.map(([p, r]) => (
        <details key={p}>
          <summary>{p}</summary>
          <p>{r}</p>
        </details>
      ))}
    </section>
  );
}
