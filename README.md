# 📚 APMED Downloader

Aplicação web que baixa os materiais de estudo do portal **gestaoapmed.com.br** em
formato PDF, com uma interface de 3 passos pensada para quem não é da área técnica.

**Produção:** https://apmed.vercel.app

---

## ✨ Como funciona

1. **Entrar** — o usuário digita o e-mail e a senha que já usa no portal APMED
2. **Escolher** — o app lista todos os materiais da conta, com filtro por instituição
3. **Baixar** — baixa um PDF por material ou gera um único ZIP com todos os selecionados

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
│   ├── page.tsx                     # Wizard de 3 passos (client)
│   ├── api/
│   │   ├── materiais/route.ts        # POST login + lista | GET refiltra | DELETE logout
│   │   ├── pdf/route.ts              # PDF completo no servidor (materias <= ~60 pág.)
│   │   ├── pdf/manifesto/route.ts    # total real de páginas + plano de partes
│   │   ├── pdf/parte/route.ts        # baixa e converte um intervalo de páginas
│   │   └── zip/route.ts              # ZIP com vários materiais
├── lib/
│   ├── apmed.ts                     # Cliente do portal + varredura de páginas
│   ├── imagem.ts                    # Conversão PNG -> JPEG via sharp
│   ├── pdf.ts                       # Montagem de PDF no servidor (pdf-lib)
│   ├── pdf-client.ts                # Montagem de PDF no navegador (pdf-lib)
│   └── download.ts                  # Orquestração do download por partes
└── app/globals.css
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
| Rate limit: 20 logins / 10 min por IP | `api/materiais/route.ts` |
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
| Env vars | `APMED_BASE_URL`, `APMED_TIMEOUT_MS`, `APMED_SESSION_SECRET` |

### Rodar localmente

```bash
npm install
npm run dev      # http://localhost:3000
```

Build de produção:

```bash
npm run build && npm start
```

---

## ⚙️ Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `APMED_SESSION_SECRET` | **sim** em produção | — | Segredo do HMAC que assina as sessões |
| `APMED_BASE_URL` | não | `https://gestaoapmed.com.br/provas` | URL base do portal |
| `APMED_TIMEOUT_MS` | não | `25000` | Timeout de cada requisição ao APMED |

---

## 🛠️ Stack

- **Next.js 16.4.3** (App Router) + **React 19**
- **pdf-lib** — geração de PDF (servidor e cliente)
- **sharp** — conversão PNG → JPEG
- **jszip** — geração do ZIP no navegador
- **TypeScript** strict

---

## 📄 Licença

Uso pessoal. Este projeto acessa uma API interna do portal APMED em nome do
usuário que fornece as próprias credenciais.
