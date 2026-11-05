# Melhorias desta versão

Lista do que foi implementado na reformulação (carrinho + Pix + nova interface).

## Carrinho e preços
1. Carrinho de compras com gaveta lateral.
2. Preço progressivo por quantidade (R$ 15,00 → R$ 9,50 por material).
3. Faixas ajustadas para que adicionar um material nunca reduza o total do pedido.
4. Valores em centavos (sem erro de arredondamento).
5. Barra de progresso "adicione mais N e pague R$ X em cada".
6. Aviso quando uma nova faixa de desconto é desbloqueada.
7. Subtotal, desconto e total exibidos separadamente.
8. Tabela de descontos dentro do carrinho e na tela inicial.
9. Preço riscado (cheio) ao lado do preço com desconto em cada card.
10. Carrinho salvo por conta no navegador (sobrevive a recarregar e a novo login).
11. Itens já pagos ou que sumiram da conta saem do carrinho automaticamente.
12. Limite de 60 materiais por pedido.
13. Botão "esvaziar carrinho".
14. "Adicionar os visíveis" / "Adicionar toda a instituição" de uma vez.
15. "Tirar estes do carrinho" para a seleção atual.
16. Barra flutuante com total e economia no celular.
17. Contador do carrinho com animação ao adicionar.

## Pagamento Pix (Mercado Pago)
18. Criação de cobrança Pix pela API `/v1/payments` do Mercado Pago.
19. QR Code em imagem e código copia e cola.
20. Botão copiar com alternativa para navegadores sem permissão de área de transferência.
21. Cronômetro de expiração do Pix.
22. Verificação automática do pagamento a cada 4s (15s com a aba em segundo plano).
23. Verificação imediata ao voltar para a aba.
24. Botão "Já paguei, verificar".
25. Pix pendente salvo: fechar a janela ou recarregar não perde o pedido.
26. Aviso no topo para reabrir o QR Code de um Pix pendente.
27. Tela de sucesso com atalho para os downloads.
28. Notificação do navegador quando o Pix é confirmado com a aba em segundo plano.
29. Tratamento de Pix recusado, cancelado ou expirado.
30. Link "Abrir no Mercado Pago" quando disponível.
31. E-mail do comprovante editável (pré-preenchido com o da conta).
32. Chave de idempotência em cada cobrança.
33. Webhook do Mercado Pago com validação da assinatura `x-signature`.
34. Modo simulado automático em desenvolvimento (sem token).
35. Checkout desativado em produção quando o Mercado Pago não está configurado.

## Segurança
36. Download liberado somente com licença emitida após o Pix aprovado.
37. Licença assinada (HMAC-SHA256) com conta, materiais e validade.
38. Materiais liberados lidos do `metadata` do pagamento no Mercado Pago, não do navegador.
39. Valor cobrado calculado só no servidor.
40. Conferência do valor pago contra a tabela antes de liberar.
41. Pagamento de uma conta não libera nada para outra conta (403).
42. Id anônimo da conta (HMAC do e-mail): nenhum e-mail fica gravado no servidor.
43. Tokens com "propósito" separado: sessão não vale como licença e vice-versa.
44. Produção recusa operar sem `APMED_SESSION_SECRET` forte.
45. Sessão e licenças enviadas em cabeçalhos, fora das URLs e dos logs.
46. Não cobra de novo material com licença válida.
47. Rate limit de Pix por conta e de consultas de status.
48. Validação de e-mail e de tamanho de campos no servidor.
49. Headers de segurança: HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
50. Cabeçalho `X-Powered-By` removido.
51. Rotas antigas sem controle de pagamento removidas (`/api/pdf`, `/api/zip`, `/api/instituicao`).
52. Caches em memória com limite de tamanho (sem crescimento infinito).

## Interface
53. Interface recriada do zero com design system próprio.
54. Tema escuro, claro e automático (segue o sistema), lembrado entre visitas.
55. Tema aplicado antes da primeira pintura (sem "piscar").
56. Layout responsivo com abas e barra flutuante no celular.
57. Cabeçalho fixo com navegação, conta, carrinho e tempo de sessão.
58. Cards com capa colorida estável por instituição e ano em destaque.
59. Modo grade ou lista, lembrado entre visitas.
60. Busca sem acento, por várias palavras, por instituição, ano ou `#id`.
61. Termos buscados destacados no título.
62. Atalho `/` para focar a busca; `Esc` limpa.
63. Filtro por instituição em chips com contagem.
64. Filtro por ano.
65. Filtro "ainda não comprados" / "já liberados".
66. Ordenação: alfabética, mais recentes, por instituição, ordem do portal.
67. Botão "limpar filtros" e estado vazio com orientação.
68. Esqueleto de carregamento.
69. Selo "Liberado · Nd" nos materiais pagos.
70. Notificações (toasts) acessíveis, sem duplicar mensagens.
71. Modais com foco preso, fechamento por `Esc` e retorno do foco.
72. Link "pular para o conteúdo".
73. Respeita "reduzir movimento" do sistema.
74. Rótulos e `aria-*` em botões de ícone, barras de progresso e filtros.
75. Seção de perguntas frequentes.
76. Rodapé com aviso de uso pessoal e de não afiliação.
77. Favicon e cor do tema do navegador.

## Login e sessão
78. Mostrar/ocultar senha.
79. Aviso de Caps Lock.
80. Lembrar e-mail (nunca a senha), com opção de desligar.
81. Validação do e-mail antes de enviar.
82. Sessão mantida ao recarregar a página (apenas na aba atual).
83. Contagem regressiva da sessão no cabeçalho.
84. Aviso 3 minutos antes da sessão expirar.
85. Saída automática ao expirar, mantendo carrinho e compras.
86. Sessão que expira no meio de um download volta ao login com mensagem clara, sem perder o que foi pago.
87. Botão "Atualizar" para recarregar a lista do portal sem novo login.

## Downloads
88. Área "Meus downloads" com tudo que foi pago e a validade de cada um.
89. Baixar de novo quantas vezes quiser durante a validade (padrão 7 dias).
90. Marcar materiais e baixar só os marcados em ZIP.
91. Opção de qualidade: padrão (1700px) ou alta (2400px).
92. Opção de incluir os PNGs originais (também para material único, em ZIP).
93. Preferências de download lembradas.
94. Cancelar download em andamento.
95. Barra de progresso com %, páginas, material atual, tempo decorrido e estimativa restante.
96. Progresso no título da aba.
97. Aviso ao tentar fechar a aba durante um download.
98. Novas tentativas automáticas com espera crescente (navegador e servidor).
99. Partes baixadas em paralelo no navegador.
100. Páginas de cada parte baixadas em paralelo no servidor.
101. Um material com falha não derruba o ZIP: os demais são salvos e um `LEIA-ME_falhas.txt` explica.
102. ZIP gerado sem recompressão (PDF/PNG já são comprimidos): bem mais rápido.
103. Nome do ZIP com a data.
104. PDF com título, assunto, palavras-chave e data de criação.
105. PDF aceita página em PNG quando a conversão para JPEG falha no servidor.
106. Páginas duplicadas descartadas na montagem do PDF.
107. Marcação "já baixado" em cada material.
108. Notificação do navegador ao concluir um download em segundo plano.
109. Histórico de pedidos com valor, data, status e número.

## Desempenho do servidor
110. Cache curto da lista de materiais por sessão (antes era baixada em cada parte).
111. Cache do token de leitura do portal enquanto ele vale.
112. Erros 403/404 do portal não são repetidos; erros temporários são.

## Desenvolvimento e operação
113. Portal APMED falso (`npm run mock:apmed`) para testar sem conta real.
114. Testes automatizados de preços, licenças, tokens e webhook (`npm test`).
115. Workflow de CI (tipos, testes e build) em PRs e branches.
116. Deploy só acontece se tipos e testes passarem.
117. `.env.example` documentando todas as variáveis.
118. Rota `/api/saude` para monitoramento.
119. Rota `/api/config` com faixas de preço e modo de pagamento.
120. Aviso visível de "modo de teste" quando os pagamentos são simulados.
121. README atualizado com o fluxo de pagamento e a arquitetura.
