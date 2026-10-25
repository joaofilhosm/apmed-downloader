# 📚 APMED Downloader

Aplicação web que baixa os materiais de estudo do portal **gestaoapmed.com.br** em
formato PDF, com uma interface de 3 passos pensada para quem não é da área técnica.

---

## ✨ Como funciona

1. **Entrar** — o usuário digita o e-mail e a senha que já usa no portal APMED
2. **Escolher** — o app lista todos os materiais da conta, com filtro por instituição
3. **Baixar** — baixa um PDF por material ou gera um único ZIP com todos os selecionados

---

## 🚀 Deploy na Vercel

### Opção 1 — Pela interface (mais simples)

1. Suba este projeto em um repositório GitHub
2. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório
3. A Vercel detecta o Next.js automaticamente — **não precisa configurar nada**
4. Clique em **Deploy**

### Opção 2 — Pela CLI

```bash
npm i -g vercel
vercel          # primeira vez: login e link do projeto
vercel --prod   # deploy de produção
```

### ⚙️ Configuração importante na Vercel

As rotas `/api/pdf` e `/api/zip` precisam de mais tempo de execução para baixar
várias páginas do portal. No painel da Vercel:

| Configuração | Valor |
|---|---|
| **Fluid compute** | Ativado (Settings → Functions) |
| **Function max duration** | 300s (Settings → Functions → Max Duration) |

Sem isso, materiais com many pages retornam timeout (504).

> **Nota sobre o plano Hobby:** o limite padrão é 60s. Materiais de até ~12 páginas
> funcionam em 60s; os maiores podem precisar do `maxDuration: 300` já declarado
> no código — habilite o Fluid compute para que ele valha.

### 🔐 Variáveis de ambiente (opcionais)

| Variável | Padrão | Descrição |
|---|---|---|
| `APMED_BASE_URL` | `https://gestaoapmed.com.br/provas` | URL base do portal |
| `APMED_TIMEOUT_MS` | `25000` | Timeout de cada requisição ao APMED |

**O app NÃO pede configuração de credenciais.** Cada usuário digita a própria
conta no navegador — as senhas nunca passam pelo servidor da Vercel além do
login no APMED, e não são gravadas em disco nem em logs.

---

## 🏗️ Rodar localmente

```bash
npm install
npm run dev
# abre em http://localhost:3000
```

Build de produção:

```bash
npm run build
npm start
```

---

## 📁 Estrutura

```
src/
├── app/
│   ├── page.tsx              # Wizard de 3 passos (client component)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── materiais/route.ts   # POST login + lista | GET refiltra | DELETE logout
│       ├── pdf/route.ts         # GET  PDF individual
│       └── zip/route.ts         # POST ZIP com vários materiais
└── lib/
    ├── apmed.ts             # Cliente do portal (login, listagem, token, páginas)
    └── pdf.ts               # Montagem do PDF com pdf-lib
```

---

## 🔐 Segurança implementada

| Proteção | Onde |
|---|---|
| Senha nunca gravada em disco | `lib/apmed.ts` — só existe no escopo da requisição |
| Sessão apenas em memória, expira em 30 min | `Map` no módulo `lib/apmed.ts` |
| Rate limit: 20 logins / 10 min por IP | `api/materiais/route.ts` |
| Material precisa pertencer à conta do usuário | Validado contra a lista real em `/api/pdf` e `/api/zip` |
| `Cache-Control: no-store` em todas as rotas de API | `next.config.js` |
| Erros não expõem detalhes internos | Mensagens genéricas para o usuário |

---

## ⚠️ Limitações conhecidas

- **Materiais com mais de 120 páginas** são bloqueados no PDF individual (protege a
  memória da função serverless). O ZIP tem limite de 150 páginas somadas.
- **Até 12 materiais por ZIP.**
- A sessão expira em 30 minutos — se o download demorar, é preciso entrar de novo.
- A detecção de instituição é heurística (baseada no título). Instituições com nomes
  muito atípicos podem cair em "Outros" — o filtro manual sempre funciona.

---

## 🛠️ Stack

- **Next.js 16** (App Router) + **React 19**
- **pdf-lib** — geração de PDF em JavaScript puro (sem binários, roda em qualquer runtime)
- **jszip** — geração do ZIP
- **TypeScript** strict

---

## 📄 Licença

Uso pessoal. Este projeto acessa uma API interna do portal APMED em nome do
usuário que fornece as próprias credenciais.
