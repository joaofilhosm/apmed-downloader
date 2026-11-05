# 📚 APMED Downloader

Aplicação web que baixa os materiais de estudo do portal **gestaoapmed.com.br** em
formato PDF, com uma interface de 3 passos pensada para quem não é da área técnica.

**Produção:** https://apmed.vercel.app

---

## ✨ Como funciona

1. **Entrar** — o usuário digita o e-mail e a senha que já usa no portal APMED
2. **Escolher** — monta um carrinho com os materiais da própria conta (busca, filtros por instituição/ano, grade ou lista)
3. **Pagar** — Pix pelo Mercado Pago, com QR Code e copia e cola; a tela detecta o pagamento sozinha
4. **Baixar** — o download só é liberado depois que o Mercado Pago confirma o Pix; PDF individual ou ZIP com tudo

### 💰 Preço progressivo

O preço de **cada** material cai conforme a quantidade no mesmo pedido
(`src/lib/precos.ts`, valores em centavos):

| Quantidade no pedido | Preço por material | Desconto |
|---|---|---|
| 1 | R$ 15,00 | — |
| 2 | R$ 13,50 | 10% |
| 3 a 4 | R$ 12,00 | 20% |
| 5 a 9 | R$ 10,50 | 30% |
| 10 ou mais | R$ 9,50 | 37% |

As faixas são escolhidas para que **adicionar um material nunca reduza o total**
(há teste automatizado para isso). O servidor sempre recalcula o valor — o navegador nunca diz quanto cobrar.

### 🔐 Como o pagamento libera o download

```
carrinho ──POST /api/pagamento──▶ Mercado Pago cria o Pix (metadata: conta + materiais)
                                         │
navegador ──GET /api/pagamento/:id──▶ consulta o Mercado Pago (fonte da verdade)
                                         │ status = approved
                                         ▼
                            licença assinada (HMAC) com conta + materiais + validade
                                         │
/api/pdf/manifesto e /api/pdf/parte ◀────┘ exigem licença válida, da mesma conta, cobrindo o material
```

- Os materiais pagos vêm do `metadata` do próprio pagamento no Mercado Pago, não do navegador.
- A licença é ligada ao **id anônimo da conta** (HMAC do e-mail): não serve para outra conta.
- Toda rota de download ainda confere se o material pertence à conta APMED logada.
- Sem `MERCADOPAGO_ACCESS_TOKEN`: em desenvolvimento os pagamentos são **simulados**
  (aprovam sozinhos em ~8s); em produção o checkout fica **desativado**.

---

## 🐛 O problema do `last_page`

A API oficial do APMED (`material_reader.php`) devolve um `last_page` **desatualizado**:
ele reflete o **progresso de leitura do aluno**, não o total de páginas do material.

Exemplos reais (conta de teste):

| Material | `last_page` da API | Páginas reais |
|---|---|---|
| BIBLIA HSL 2027 | 1 | **59** |
| BIBLIA UNICAMP 2027 | 12 | **106** |
| BIBLIA SUS-SP 2027 | 1 | **150** |
| BIBLIA HRPP 2027 | 18 | **127** |

Por isso o app **não confia** no `last_page`: ele descobre o total real por
**varredura sequencial paralela** (`src/lib/apmed.ts` → `contarPaginas`).

---

## 🏗️ Arquitetura

```
src/
├── app/
│   ├── page.tsx                     # App (login, catálogo, carrinho, Pix, downloads)
│   ├── layout.tsx                   # Metadados + tema sem "piscar"
│   ├── globals.css                  # Design system (claro/escuro, responsivo)
│   └── api/
│       ├── materiais/route.ts        # POST login + lista | GET recarrega | DELETE logout
│       ├── pagamento/route.ts        # POST cria o Pix do carrinho
│       ├── pagamento/[id]/route.ts   # GET status; aprovado => licença assinada
│       ├── pagamento/webhook/route.ts# notificação do Mercado Pago (assinatura validada)
│       ├── pdf/manifesto/route.ts    # total real de páginas + plano de partes (exige licença)
│       ├── pdf/parte/route.ts        # baixa e converte um intervalo de páginas (exige licença)
│       ├── config/route.ts           # faixas de preço e modo de pagamento
│       └── saude/route.ts            # health check
├── components/                      # Cabecalho, Catalogo, Carrinho, Checkout, MeusDownloads...
└── lib/
    ├── apmed.ts                     # Cliente do portal + varredura de páginas + caches
    ├── precos.ts                    # Faixas de preço (compartilhado cliente/servidor)
    ├── mercadopago.ts               # Pix, consulta, webhook, modo simulado
    ├── licenca.ts / tokens.ts       # Licenças e sessões assinadas (HMAC-SHA256)
    ├── http.ts                      # Rate limit, leitura de sessão/licenças
    ├── imagem.ts                    # Conversão PNG -> JPEG via sharp
    ├── pdf-client.ts                # Montagem de PDF no navegador (pdf-lib)
    ├── download.ts                  # Download por partes com retry e cancelamento
    └── cliente.ts                   # Armazenamento local, busca, formatadores
scripts/mock-apmed.mjs               # Portal APMED falso para desenvolvimento
tests/                               # Testes (node:test)
```

### Por que o download é feito em partes

Materiais reais têm **59 a 150 páginas**. Uma única função serverless da Vercel
tem limite de **300s** e **1 GB de memória** — e uma página PNG 2400×3395
descomprime para ~32 MB em RAM.

Solução implementada:

| Camada | Estratégia |
|---|---|
| **Memória** | `sharp` converte cada página para JPEG 1700px (1,1 MB → 180 KB) |
| **Tempo** | Servidor devolve o material em partes de 12 páginas; cada parte cabe em ~18s |
| **Montagem** | O navegador (`pdf-lib`) monta o PDF final — sem limite de tempo ou memória |
| **Fallback** | Se o `sharp` falhar, usa o PNG original em vez de derrubar o download |

---

## 🔐 Segurança implementada

| Proteção | Onde |
|---|---|
| Senha nunca gravada em disco | `lib/apmed.ts` — só existe no escopo da requisição |
| Sessão stateless assinada (HMAC-SHA256) | Token carrega o PHPSESSID; funciona entre instâncias serverless |
| Sessão expira em 30 minutos | Validado na assinatura do token |
| Rate limit: 20 logins / 10 min por IP; 10 Pix / 10 min por conta | `lib/http.ts` |
| Download exige licença paga, da mesma conta | `api/pdf/*` + `lib/licenca.ts` |
| Valor do Pix calculado só no servidor | `api/pagamento/route.ts` |
| Webhook com assinatura `x-signature` validada | `lib/mercadopago.ts` |
| Sessão e licenças em cabeçalhos, não na URL | `lib/http.ts` |
| Headers de segurança (HSTS, X-Frame-Options...) | `next.config.js` |
| Produção recusa rodar sem `APMED_SESSION_SECRET` | `lib/tokens.ts` |
| Material precisa pertencer à conta | Validado contra a lista real em todas as rotas |
| `Cache-Control: no-store` em todas as rotas | `next.config.js` |
| Erros não expõem detalhes internos | Mensagens genéricas para o usuário |

---

## 🚀 Deploy

O repositório está conectado à Vercel com **deploy automático** em cada push na
branch `master`.

```bash
git push origin master   # publica na Vercel
```

### Configuração atual

| Item | Valor |
|---|---|
| Plano | Pro |
| `maxDuration` (`/api/pdf`, `/api/pdf/parte`) | 300s |
| `maxDuration` (`/api/materiais`, `/api/pdf/manifesto`) | 60s |
| Env vars | ver `.env.example` |

### Rodar localmente (com o portal falso)

```bash
npm install
npm run mock:apmed                                  # portal APMED falso em :4010
APMED_BASE_URL=http://localhost:4010/provas npm run dev
```

Qualquer e-mail entra (a senha `errada` simula falha de login) e os pagamentos são simulados.

### Testes

```bash
npm run check    # typecheck + testes (node:test)
```

Build de produção:

```bash
npm run build && npm start
```

---

## ⚙️ Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `APMED_SESSION_SECRET` | **sim** em produção | — | Segredo do HMAC que assina sessões e licenças (mín. 16 caracteres) |
| `MERCADOPAGO_ACCESS_TOKEN` | **sim** para cobrar | — | Access token de produção do Mercado Pago |
| `MERCADOPAGO_WEBHOOK_SECRET` | não | — | Valida a assinatura do webhook |
| `APP_URL` | não | — | URL pública https, usada como `notification_url` do Pix |
| `LICENCA_DIAS` | não | `7` | Por quantos dias o material pago pode ser baixado de novo |
| `PIX_EXPIRACAO_MINUTOS` | não | `30` | Validade do QR Code |
| `APMED_BASE_URL` | não | `https://gestaoapmed.com.br/provas` | URL base do portal |
| `APMED_TIMEOUT_MS` | não | `25000` | Timeout de cada requisição ao APMED |

---

## 🛠️ Stack

- **Next.js 16.4.3** (App Router) + **React 19**
- **Mercado Pago** (API REST `/v1/payments`, Pix)
- **pdf-lib** — geração de PDF (servidor e cliente)
- **sharp** — conversão PNG → JPEG
- **jszip** — geração do ZIP no navegador
- **TypeScript** strict

---

## 📄 Licença

Uso pessoal. Este projeto acessa uma API interna do portal APMED em nome do
usuário que fornece as próprias credenciais.
