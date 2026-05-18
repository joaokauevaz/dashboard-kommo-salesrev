# Tutorial Completo: Como Usar o Template do Dashboard Kommo

> Passo a passo para pegar este template e ter seu próprio Dashboard CRM funcionando do zero.

---

## O que você vai precisar

- Uma conta na **Kommo** (com acesso à API)
- Uma conta no **Supabase** (grátis)
- Uma conta no **GitHub** (grátis)
- **Node.js** instalado (v18+) — [nodejs.org](https://nodejs.org)
- Um editor de código (VS Code, Cursor, etc.) OU o **Lovable** pra editar online

---

## PASSO 1: Subir o projeto no GitHub

### Opção A: Pelo site do GitHub
1. Acesse [github.com/new](https://github.com/new)
2. Crie um repositório novo (ex: `meu-dashboard-kommo`)
3. Deixe **público** ou **privado** (tanto faz)
4. **NÃO** marque "Add a README" (o projeto já tem)
5. Clique em **Create repository**

### Opção B: Pelo terminal
```bash
cd dashboard-kommo
git init
git add .
git commit -m "feat: template dashboard Kommo"
git remote add origin https://github.com/SEU_USUARIO/meu-dashboard-kommo.git
git push -u origin main
```

Se você fez a Opção A pelo site, siga as instruções que o GitHub mostra na tela do repositório vazio pra fazer o push.

---

## PASSO 2: Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e faça login
2. Clique em **New Project**
3. Escolha um nome (ex: `dashboard-kommo`)
4. Escolha uma senha pro banco (anote!)
5. Região: escolha a mais próxima de você
6. Clique em **Create new project** e aguarde

### Anotar as credenciais
Depois de criado, vá em **Settings > API** e copie:
- **Project URL** — algo como `https://abc123xyz.supabase.co`
- **anon public key** — um JWT grande que começa com `eyJhbGci...`

Guarde esses dois valores, vamos usar já já.

---

## PASSO 3: Criar a tabela no Supabase

1. No Supabase, vá em **SQL Editor** (menu lateral)
2. Clique em **New query**
3. Cole este SQL:

```sql
CREATE TABLE lead_snapshots (
  lead_id BIGINT PRIMARY KEY,
  lead_name TEXT,
  pipeline_id BIGINT,
  status_id BIGINT,
  cadencia TEXT,
  recuperacao TEXT,
  situacao_reuniao TEXT,
  custom_fields JSONB,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lead_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON lead_snapshots
  FOR ALL USING (true) WITH CHECK (true);
```

4. Clique em **Run** (botão verde)
5. Deve aparecer "Success"

---

## PASSO 4: Deploy da Edge Function

A Edge Function é o "backend" — ela faz a ponte entre o frontend e a API da Kommo.

### 4.1 Instalar o Supabase CLI
```bash
npm install -g supabase
```

### 4.2 Fazer login
```bash
supabase login
```
Vai abrir o navegador pra você autorizar. Clique em **Authorize**.

### 4.3 Linkar com seu projeto
```bash
cd dashboard-kommo
supabase link --project-ref SEU_PROJECT_REF
```

O `SEU_PROJECT_REF` é a parte do meio da URL do seu projeto. Exemplo:
- URL: `https://abc123xyz.supabase.co`
- Project ref: `abc123xyz`

### 4.4 Fazer deploy
```bash
supabase functions deploy kommo-engine
```

Deve aparecer algo como:
```
Deploying function kommo-engine...
Function kommo-engine deployed successfully.
```

Se der erro de permissão, rode:
```bash
supabase functions deploy kommo-engine --no-verify-jwt
```

---

## PASSO 5: Configurar as variáveis de ambiente

### 5.1 Criar o arquivo .env
Na raiz do projeto, copie o exemplo:
```bash
cp .env.example .env
```

### 5.2 Preencher com seus dados
Abra o `.env` e cole:
```env
VITE_SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_gigante_aqui
```

Use os valores que você anotou no Passo 2.

---

## PASSO 6: Pegar o token da Kommo

### 6.1 Criar integração privada
1. Na Kommo, clique no **menu lateral > Configurações** (engrenagem)
2. Vá em **Integrações**
3. Clique em **+ Criar integração** (canto superior direito)
4. Escolha **Integração privada**
5. Dê um nome (ex: "Dashboard")
6. Marque as permissões: **CRM**, **Notificações**
7. Clique em **Salvar**

### 6.2 Copiar o token
1. Após salvar, clique na integração que você criou
2. Copie o **Token de API** (JWT longo)
3. Anote também o **subdomínio** — é o que aparece antes de `.kommo.com` na URL
   - Ex: URL `https://meucrm.kommo.com` → subdomínio = `meucrm`

---

## PASSO 7: Descobrir os IDs dos campos personalizados

Esta é uma parte importante. O dashboard usa campos personalizados da Kommo (Cadência, Status de Reunião, etc.) e cada campo tem um **ID numérico** único na sua conta.

### Como descobrir o ID de um campo
1. Na Kommo, abra qualquer **lead**
2. Clique no campo personalizado que você quer
3. Olhe na **URL do navegador** ou no canto do campo — o ID aparece como um número (ex: `1033231`)

### Alternativa: pela API
Acesse no navegador:
```
https://SEU_SUBDOMINIO.kommo.com/api/v4/leads/custom_fields
```
(precisa estar logado na Kommo)

Vai retornar um JSON com todos os campos e seus IDs.

### Onde configurar os IDs

Você precisa alterar em **2 arquivos**:

**Arquivo 1:** `src/lib/kommo-api.ts` (linha ~82)
```typescript
export const FIELD_IDS = {
  STATUS_REUNIAO: 1018164,  // ← Troque pelo ID do seu campo "Status da reunião"
  CADENCIA: 1033231,         // ← Troque pelo ID do seu campo "Cadência"
  RECUPERACAO: 1033233,      // ← Troque pelo ID do seu campo "Recuperação"
  SITUACAO: 1020140,         // ← Troque pelo ID do seu campo "Situação" (vendas)
  CLOSER: 1017300,           // ← Troque pelo ID do seu campo "Closer"
};
```

**Arquivo 2:** `supabase/functions/kommo-engine/index.ts` (linha ~13)
```typescript
const FIELD_IDS = {
  STATUS_REUNIAO: 1018164,   // ← Mesmo ID de cima
  CADENCIA: 1033231,
  RECUPERACAO: 1033233,
  SITUACAO: 1020140,
};
```

**IMPORTANTE:** Os IDs nos dois arquivos devem ser **iguais**. E devem corresponder aos campos da SUA conta Kommo.

---

## PASSO 8: Configurar a tag de filtro

O dashboard filtra leads por uma **tag**. No nosso caso é `IA-PPT`, mas a sua pode ser diferente.

### Onde alterar
**Arquivo:** `src/lib/kommo-api.ts` (linha ~79)
```typescript
export const IA_TAG = "IA-PPT";  // ← Troque pela sua tag
```

**Arquivo:** `supabase/functions/kommo-engine/index.ts` (linha ~10)
```typescript
const DEFAULT_TAG = "IA-PPT";  // ← Troque pela sua tag
```

---

## PASSO 9: Configurar os nomes das cadências

O dashboard mostra os steps de cadência. Você precisa ajustar os nomes conforme os valores do SEU campo de Cadência na Kommo.

### Onde alterar
**Arquivo:** `src/pages/Dashboard.tsx` — procure por `cadSteps`:
```typescript
const cadSteps = [
  "MENSAGEM 1 (IA)",     // ← Troque pelos valores do seu campo
  "MENSAGEM 2 (IA)",
  "MENSAGEM 3 (BOT)",
  "MENSAGEM 4 (BOT)",
  "MENSAGEM 5 (BOT)",
  "MENSAGEM 6 (BOT)",
];
```

Esses nomes devem ser **EXATAMENTE** iguais aos valores configurados no campo de Cadência da sua Kommo (em maiúsculo).

Tem DOIS lugares com `cadSteps` no Dashboard.tsx — altere os dois.

---

## PASSO 10: Configurar os nomes dos Closers

Se você usa o campo "Closer Responsável", altere os nomes.

### Onde alterar
**Arquivo:** `src/pages/Dashboard.tsx` — procure por `closerNames` ou pelo array de closers:
```typescript
const closerNames = ["Arthur", "Karenn", "Hélvio", "Douglas", "Thaina"];
// ← Troque pelos nomes dos seus closers
```

---

## PASSO 11: Configurar credenciais padrão (opcional)

Se quiser que o dashboard abra já conectado (sem o usuário ter que digitar):

**Arquivo:** `src/lib/kommo-storage.ts`
```typescript
const DEFAULT_CREDENTIALS: KommoCredentials = {
  subdomain: "meusubdominio",   // ← Seu subdomínio
  apiToken: "eyJ0eXAi...",      // ← Seu token
};
```

Se deixar vazio, o usuário terá que ir em Integrações e conectar manualmente (o que também funciona).

---

## PASSO 12: Testar localmente

### 12.1 Instalar dependências
```bash
cd dashboard-kommo
npm install
```

### 12.2 Rodar o dev server
```bash
npm run dev
```

### 12.3 Acessar
Abra no navegador: `http://localhost:8080`

### O que você deve ver
1. Se configurou DEFAULT_CREDENTIALS: o dashboard carrega direto
2. Se não: aparece "Conecte sua Kommo" → vá em Integrações e cole subdomínio + token

### Se der erro
- **"Supabase não configurado"** → verifique o `.env`
- **"subdomain e api_token são obrigatórios"** → verifique as credenciais Kommo
- **Dados zerados** → verifique se os FIELD_IDS estão corretos pra sua conta
- **"Failed to fetch"** → verifique se fez deploy da Edge Function (Passo 4)

---

## PASSO 13: Deploy (colocar online)

### Opção A: Lovable (mais fácil)
1. Acesse [lovable.dev](https://lovable.dev)
2. Crie um projeto e conecte ao seu repositório GitHub
3. Conecte ao Supabase (ícone Supabase > "Already have a project? Connect it here")
4. Se o Supabase não injetar as variáveis, hardcode o fallback em `src/lib/supabase.ts`:
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://seuproject.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sua_anon_key";
```
5. O Lovable faz deploy automático a cada push

### Opção B: Vercel
1. Acesse [vercel.com](https://vercel.com)
2. Importe o repositório do GitHub
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clique em Deploy

### Opção C: Netlify
1. Acesse [netlify.com](https://netlify.com)
2. "Add new site" > "Import an existing project" > GitHub
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Em Environment Variables, adicione as mesmas do Vercel
6. Deploy

---

## PASSO 14: Re-deploy da Edge Function após alterações

Se você mexer no arquivo `supabase/functions/kommo-engine/index.ts`, precisa fazer deploy de novo:

```bash
supabase functions deploy kommo-engine
```

Alterações no frontend (pasta `src/`) NÃO precisam de re-deploy da Edge Function — só um push pro GitHub e o Lovable/Vercel rebuilda automaticamente.

---

## Resumo dos arquivos que você PRECISA editar

| Arquivo | O que alterar |
|---------|--------------|
| `.env` | URLs do Supabase |
| `src/lib/kommo-api.ts` | FIELD_IDS, IA_TAG |
| `src/lib/kommo-storage.ts` | DEFAULT_CREDENTIALS (opcional) |
| `src/lib/supabase.ts` | Fallback hardcoded (se Lovable) |
| `src/pages/Dashboard.tsx` | cadSteps, closerNames |
| `supabase/functions/kommo-engine/index.ts` | FIELD_IDS, DEFAULT_TAG |

---

## Resumo dos serviços que você precisa configurar

| Serviço | O que fazer | Custo |
|---------|------------|-------|
| GitHub | Criar repositório | Grátis |
| Supabase | Criar projeto + tabela + deploy Edge Function | Grátis (tier free) |
| Kommo | Criar integração privada + pegar token | Já incluso no plano |
| Lovable/Vercel | Conectar ao GitHub pra deploy | Grátis (tier free) |

---

## Dúvidas frequentes

### "Posso usar com outra tag que não IA-PPT?"
Sim! Basta trocar o valor de `IA_TAG` em `kommo-api.ts` e `DEFAULT_TAG` em `index.ts`.

### "Meus campos são diferentes, não tenho Cadência/Reunião/etc."
Sem problema. Remova os painéis que não se aplicam do `Dashboard.tsx` e adapte os que fizerem sentido pro seu negócio. A lógica de eventos funciona pra qualquer campo personalizado — basta trocar o `field_id`.

### "Posso adicionar mais painéis?"
Sim! Siga o padrão dos painéis existentes: filtre eventos por `field_id`, conte leads únicos por valor, renderize cards clicáveis com lista expandida.

### "O dashboard tá lento"
- Reduza o limite de eventos (está em 5000 no `index.ts`)
- O cache do React Query é de 2 minutos — não aperte "Atualizar" a todo momento
- A Kommo tem rate limit de 7 req/s — o dashboard respeita isso

### "Posso usar com amoCRM em vez de Kommo?"
Kommo É o amoCRM (mudou de nome). A API é a mesma. Só muda o domínio de `amocrm.com` para `kommo.com`.

---

## Leitura complementar

- **SKILL_DASHBOARD_KOMMO.md** — Documento técnico completo com toda a arquitetura, código explicado, fluxo de dados, e como cada KPI é calculado
- **Documentação da API Kommo** — https://www.kommo.com/developers/content/api/auth
- **Documentação Supabase Edge Functions** — https://supabase.com/docs/guides/functions

---

*Template criado por metrik-sales*
