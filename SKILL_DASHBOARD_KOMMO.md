# Skill: Dashboard CRM com Kommo + Supabase + React

> Guia completo para montar um Dashboard de CRM integrado com a Kommo, usando Supabase Edge Functions como backend e React no frontend. Replicável via Lovable, Claude Code ou qualquer ferramenta.

---

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Stack Tecnológica](#2-stack-tecnológica)
3. [Setup Inicial do Projeto](#3-setup-inicial-do-projeto)
4. [Configurando o Supabase](#4-configurando-o-supabase)
5. [Entendendo a API da Kommo](#5-entendendo-a-api-da-kommo)
6. [Edge Function: kommo-engine](#6-edge-function-kommo-engine)
7. [Frontend: Biblioteca de Integração](#7-frontend-biblioteca-de-integração)
8. [Frontend: Dashboard Principal](#8-frontend-dashboard-principal)
9. [Sistema de Eventos da Kommo](#9-sistema-de-eventos-da-kommo)
10. [Tracking de Tag Removida](#10-tracking-de-tag-removida)
11. [Cálculo de KPIs](#11-cálculo-de-kpis)
12. [Deploy no Lovable](#12-deploy-no-lovable)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Visão Geral da Arquitetura

```
┌──────────────────────┐
│   FRONTEND (React)   │
│   - Dashboard UI     │
│   - Filtros/Período  │
│   - Listas de Leads  │
└──────────┬───────────┘
           │ POST /functions/v1/kommo-engine
           ▼
┌──────────────────────┐
│  SUPABASE EDGE FN    │
│  - Processa request  │
│  - Calcula KPIs      │
│  - Tracking de tags  │
└──────────┬───────────┘
           │ GET /api/v4/leads, /events, etc.
           ▼
┌──────────────────────┐
│   KOMMO CRM (API)    │
│   - Leads            │
│   - Eventos          │
│   - Pipelines        │
└──────────────────────┘
```

**Por que essa arquitetura?**
- O frontend NÃO chama a Kommo direto (CORS bloquearia)
- A Edge Function atua como proxy/middleware
- O Supabase guarda snapshots pra rastrear tags removidas
- React Query faz cache de 2 min pra não sobrecarregar a API

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Pra quê |
|--------|-----------|---------|
| Frontend | React 18 + TypeScript | UI do dashboard |
| Build | Vite | Dev server rápido, HMR |
| UI Components | shadcn/ui + Radix | Cards, Badges, Sheets, etc. |
| Estilização | Tailwind CSS | Classes utilitárias |
| Estado | React Query (TanStack) | Cache, loading, refetch |
| Roteamento | React Router v6 | Páginas (Dashboard, Integrações) |
| Backend | Supabase Edge Functions (Deno) | Proxy pra Kommo API |
| Banco | Supabase PostgreSQL | Tabela lead_snapshots |
| CRM | Kommo (ex-amoCRM) | Fonte dos dados |

### Dependências principais (package.json)
```json
{
  "@supabase/supabase-js": "^2.100.0",
  "@tanstack/react-query": "^5.83.0",
  "react": "^18.3.1",
  "react-router-dom": "^6.30.1",
  "lucide-react": "^0.462.0",
  "tailwindcss": "^3.4.17"
}
```

---

## 3. Setup Inicial do Projeto

### 3.1 Criar o projeto
```bash
npm create vite@latest dashboard-crm -- --template react-ts
cd dashboard-crm
npm install
```

### 3.2 Instalar dependências
```bash
# UI
npx shadcn-ui@latest init
npx shadcn-ui@latest add card badge button tabs sheet

# Estado e roteamento
npm install @tanstack/react-query react-router-dom

# Supabase
npm install @supabase/supabase-js

# Ícones
npm install lucide-react
```

### 3.3 Variáveis de ambiente
Criar `.env` na raiz:
```env
VITE_SUPABASE_URL=https://SEU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

### 3.4 Estrutura de pastas
```
src/
  ├── components/
  │   ├── ui/          ← shadcn components
  │   └── AppLayout.tsx
  ├── lib/
  │   ├── supabase.ts
  │   ├── kommo-api.ts
  │   └── kommo-storage.ts
  ├── pages/
  │   ├── Dashboard.tsx
  │   └── Integracoes.tsx
  ├── types/
  │   └── kommo.ts
  ├── App.tsx
  └── main.tsx
supabase/
  └── functions/
      └── kommo-engine/
          └── index.ts
```

---

## 4. Configurando o Supabase

### 4.1 Criar projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. Anote a **URL** e a **Anon Key** (Settings > API)
3. Anote a **Service Role Key** (usada pela Edge Function)

### 4.2 Criar tabela lead_snapshots
No SQL Editor do Supabase:
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

-- Permitir acesso pela Edge Function
ALTER TABLE lead_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON lead_snapshots
  FOR ALL USING (true) WITH CHECK (true);
```

### 4.3 Deploy da Edge Function
```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Link com seu projeto
supabase link --project-ref SEU_PROJECT_ID

# Deploy
supabase functions deploy kommo-engine
```

---

## 5. Entendendo a API da Kommo

### 5.1 Autenticação
A Kommo usa **Bearer Token** (JWT de longa duração):
```
Authorization: Bearer eyJ0eXAiOiJKV1Q...
```

Para obter o token:
1. Kommo > Configurações > Integrações
2. Criar integração privada
3. Copiar o **Token da API**

### 5.2 Base URL
```
https://{subdomain}.kommo.com/api/v4
```
O `subdomain` é o que aparece antes de `.kommo.com` na URL do seu CRM.

### 5.3 Endpoints que usamos

#### Leads (com filtro por tag)
```
GET /api/v4/leads?query={tag_name}&limit=250&page=1&with=contacts
    &order[updated_at]=desc
```
Retorna leads que contenham a tag no nome/tags. Máximo 250 por página.

**Campos importantes de um lead:**
```json
{
  "id": 20725205,
  "name": "Roberta Coelli",
  "price": 0,
  "created_at": 1711324800,    // Unix timestamp em SEGUNDOS
  "updated_at": 1711411200,
  "closed_at": null,
  "pipeline_id": 8520270,
  "status_id": 70979958,
  "custom_fields_values": [
    {
      "field_id": 1033231,
      "field_name": "Cadência",
      "values": [{ "value": "MENSAGEM 1 (IA)" }]
    }
  ],
  "_embedded": {
    "tags": [{ "id": 123, "name": "IA-PPT" }]
  }
}
```

#### Eventos (mudanças de campos)
```
GET /api/v4/events?filter[type][]=custom_field_value_changed
    &filter[type][]=entity_tag_deleted
    &filter[created_at][from]={timestamp}
    &filter[created_at][to]={timestamp}
    &limit=250&page=1
```

**Tipos de evento que usamos:**
- `custom_field_value_changed` — campo personalizado foi alterado
- `entity_tag_deleted` — tag foi removida de um lead

**Estrutura de um evento:**
```json
{
  "id": "abc123",
  "type": "custom_field_value_changed",
  "entity_id": 20725205,         // ID do lead
  "entity_type": "lead",
  "created_at": 1711411200,      // Quando aconteceu
  "value_after": [
    {
      "custom_field_value": {
        "field_id": 1033231,       // Qual campo mudou
        "text": "MENSAGEM 2 (IA)" // Novo valor
      }
    }
  ],
  "value_before": [
    {
      "custom_field_value": {
        "field_id": 1033231,
        "text": "MENSAGEM 1 (IA)" // Valor anterior
      }
    }
  ]
}
```

#### Pipelines
```
GET /api/v4/leads/pipelines
```

#### Account (teste de conexão)
```
GET /api/v4/account
```

### 5.4 Rate Limits da Kommo
- **7 requisições por segundo** por conta
- Respeite o header `Retry-After` em caso de 429
- Nossa Edge Function faz máximo de 3 chamadas em paralelo

---

## 6. Edge Function: kommo-engine

Esta é a peça central do backend. Roda no Deno (Supabase Edge Functions).

### 6.1 Estrutura geral

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const FIELD_IDS = {
  STATUS_REUNIAO: 1018164,   // Campo "Status da reunião?"
  CADENCIA: 1033231,          // Campo "Cadência"
  RECUPERACAO: 1033233,       // Campo "Recuperação de Rmk"
  SITUACAO: 1020140,          // Campo "Situação" (vendas)
};

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await req.json();
  const { action, subdomain, api_token } = body;

  // Validação
  if (!subdomain || !api_token) {
    return jsonResponse({ success: false, error: "subdomain e api_token são obrigatórios" });
  }

  // Roteamento por action
  switch (action) {
    case "test_connection": // ...
    case "crm_data":        // ...
    case "fetch_leads":     // ...
    // etc.
  }
});
```

### 6.2 Funções de fetch da Kommo

#### fetchLeadsByTag — Busca leads com tag
```typescript
async function fetchLeadsByTag(subdomain: string, token: string, tag: string) {
  const baseUrl = `https://${subdomain}.kommo.com/api/v4`;
  const allLeads: any[] = [];
  const seenIds = new Set<number>();

  // 2 passes: primeiro por updated_at, depois por created_at
  for (const order of ["updated_at", "created_at"]) {
    for (let page = 1; page <= 10; page++) {
      const url = `${baseUrl}/leads?query=${encodeURIComponent(tag)}&limit=250&page=${page}&with=contacts&order[${order}]=desc`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 204) break; // Sem mais resultados
      const data = await res.json();
      const leads = data?._embedded?.leads ?? [];
      if (leads.length === 0) break;

      for (const lead of leads) {
        if (!seenIds.has(lead.id)) {
          seenIds.add(lead.id);
          // Verifica se realmente tem a tag
          const tags = lead._embedded?.tags?.map((t: any) => t.name) ?? [];
          if (tags.some((t: string) => t.toLowerCase().includes(tag.toLowerCase()))) {
            allLeads.push(lead);
          }
        }
      }
    }
  }

  return { leads: allLeads };
}
```

**Por que 2 passes?**
Leads recém-criados podem não aparecer no sort por `updated_at` se não foram atualizados ainda. O segundo pass por `created_at` garante que novos leads sejam capturados.

#### fetchAllFieldEvents — Busca eventos dos últimos 30 dias
```typescript
async function fetchAllFieldEvents(subdomain: string, token: string, dateFrom: number, dateTo: number) {
  const baseUrl = `https://${subdomain}.kommo.com/api/v4`;
  const allEvents: any[] = [];

  for (let page = 1; page <= 20; page++) {
    const url = `${baseUrl}/events?filter[type][]=custom_field_value_changed&filter[type][]=entity_tag_deleted&filter[created_at][from]=${dateFrom}&filter[created_at][to]=${dateTo}&limit=250&page=${page}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 204) break;
    const data = await res.json();
    const events = data?._embedded?.events ?? [];
    if (events.length === 0) break;

    allEvents.push(...events);
    if (allEvents.length >= 5000) break; // Limite de segurança
  }

  return { events: allEvents };
}
```

**Limite de 5.000 eventos:** Equilíbrio entre ter dados suficientes e não sobrecarregar a API. Em contas muito ativas, pode precisar ajustar.

### 6.3 Action crm_data — A action principal

```typescript
if (action === "crm_data") {
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 86400;

  // 3 chamadas em PARALELO (performance!)
  const [leadsResult, pipelines, eventsResult] = await Promise.all([
    fetchLeadsByTag(subdomain, api_token, tag),
    fetchPipelines(subdomain, api_token),
    fetchAllFieldEvents(subdomain, api_token, thirtyDaysAgo, now),
  ]);

  // Calcular KPIs
  const kpis = computeKPIs(leadsResult.leads);

  // Tracking de quem perdeu a tag
  const lostTagLeads = await trackTaggedLeads(leadsResult.leads, tag);

  // Parsear eventos de campo customizado
  const events = eventsResult.events
    .filter(evt => evt.type === "custom_field_value_changed")
    .map(evt => ({
      lead_id: evt.entity_id,
      field_id: evt.value_after?.[0]?.custom_field_value?.field_id,
      value: evt.value_after?.[0]?.custom_field_value?.text ?? "",
      created_at: evt.created_at,
    }))
    .filter(e => e.field_id); // Só eventos com field_id válido

  // Parsear eventos de tag removida
  const tagDeletedEvents = eventsResult.events
    .filter(evt => {
      if (evt.type !== "entity_tag_deleted") return false;
      const raw = JSON.stringify(evt.value_before ?? "") + JSON.stringify(evt.value_after ?? "");
      return raw.toLowerCase().includes(tag.toLowerCase());
    })
    .map(evt => ({
      lead_id: evt.entity_id,
      created_at: evt.created_at,
    }));

  return jsonResponse({
    success: true,
    leads: leadsResult.leads,
    lostTagLeads,
    pipelines,
    kpis,
    events,
    tagDeletedEvents,
    tag,
    totalFetched: leadsResult.leads.length,
  });
}
```

---

## 7. Frontend: Biblioteca de Integração

### 7.1 supabase.ts — Client Supabase
```typescript
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
```

### 7.2 kommo-storage.ts — Credenciais no localStorage
```typescript
const STORAGE_KEY = "psi_kommo_credentials";

export interface KommoCredentials {
  subdomain: string;
  apiToken: string;
}

// Credenciais padrão (opcional — pra auto-conectar)
const DEFAULT_CREDENTIALS: KommoCredentials = {
  subdomain: "meusubdominio",
  apiToken: "meu_jwt_token",
};

export function getCredentials(): KommoCredentials | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CREDENTIALS; // ou null se não quiser auto-conectar
  try { return JSON.parse(raw); }
  catch { return DEFAULT_CREDENTIALS; }
}

export function saveCredentials(creds: KommoCredentials): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function isConnected(): boolean {
  return !!getCredentials();
}
```

### 7.3 kommo-api.ts — Chamadas pra Edge Function

```typescript
import { supabase, getSupabaseUrl } from "./supabase";
import { getCredentials } from "./kommo-storage";

// Função central — chama a Edge Function
async function callEngine(action: string, extra?: Record<string, unknown>) {
  const creds = getCredentials();
  if (!creds) throw new Error("Não conectado");

  const url = `${getSupabaseUrl()}/functions/v1/kommo-engine`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabase?.supabaseKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      action,
      subdomain: creds.subdomain,
      api_token: creds.apiToken,
      ...extra,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Erro desconhecido");
  return data;
}

// Tag padrão
export const IA_TAG = "IA-PPT";

// IDs dos campos personalizados (pegar no Kommo > campo > ID)
export const FIELD_IDS = {
  STATUS_REUNIAO: 1018164,
  CADENCIA: 1033231,
  RECUPERACAO: 1033233,
  SITUACAO: 1020140,
  CLOSER: 1017300,
};

// Interfaces
export interface FieldEvent {
  lead_id: number;
  field_id: number;
  value: string;
  created_at: number;
}

export interface TagDeletedEvent {
  lead_id: number;
  created_at: number;
}

// API pública
export async function testConnection() {
  return callEngine("test_connection");
}

export async function fetchDashboardData() {
  const res = await callEngine("crm_data", { tag: IA_TAG });
  return {
    leads: res.leads ?? [],
    lostTagLeads: res.lostTagLeads ?? [],
    pipelines: res.pipelines ?? [],
    kpis: res.kpis,
    events: res.events ?? [],
    tagDeletedEvents: res.tagDeletedEvents ?? [],
    tag: res.tag ?? IA_TAG,
    totalFetched: res.totalFetched ?? 0,
  };
}
```

---

## 8. Frontend: Dashboard Principal

### 8.1 Estrutura do Dashboard
```
┌─────────────────────────────────────────────────┐
│  Header: Título + Filtros (Hoje/Ontem/7d/30d)   │
├─────────┬───────────┬───────────┬───────────────┤
│ Leads   │ Já passou │ Vendas    │ Taxa Conversão│
│ Hoje    │ pela IA   │           │ de Follow-up  │
├─────────┴───────────┴───────────┴───────────────┤
│  [Lista expandida do bloco clicado]              │
├──────────────────────────────────────────────────┤
│  Closer Responsável (cards por closer)           │
├──────────────────────────────────────────────────┤
│  Situação de Reunião (Agendada/Compareceu/etc.)  │
├──────────────────────────────────────────────────┤
│  Cadência de Follow-ups (Msg 1 até Msg 6)        │
├──────────────────────────────────────────────────┤
│  Recuperação / Remarketing (Recuperado/Perdido)  │
└──────────────────────────────────────────────────┘
```

### 8.2 React Query — Fetch e cache
```typescript
const { data, isLoading, error, refetch, isFetching } = useQuery({
  queryKey: ["dashboard-data"],
  queryFn: fetchDashboardData,
  enabled: isConnected(),    // Só busca se tiver credenciais
  retry: 1,                  // Tenta 1x se falhar
  staleTime: 2 * 60 * 1000, // Cache de 2 minutos
});
```

### 8.3 Filtros por período
O dashboard permite filtrar por período. Cada painel usa regras diferentes:

```typescript
type Filtro = "hoje" | "ontem" | "7d" | "30d" | "todos";

// Filtro por created_at do lead (para "Total de Leads")
function filterByCreatedAt(lead: KommoLead): boolean {
  const createdAt = lead.created_at * 1000; // Kommo usa segundos!
  const todayStart = new Date().setHours(0, 0, 0, 0);

  switch (filtro) {
    case "hoje": return createdAt >= todayStart;
    case "ontem": return createdAt >= todayStart - 86400000 && createdAt < todayStart;
    case "7d": return createdAt >= todayStart - 7 * 86400000;
    case "30d": return createdAt >= todayStart - 30 * 86400000;
    default: return true;
  }
}

// Filtro por created_at do EVENTO (para painéis baseados em eventos)
function eventInPeriod(evt: FieldEvent): boolean {
  const evtMs = evt.created_at * 1000;
  // Mesma lógica acima, mas aplicada ao timestamp do evento
}
```

**IMPORTANTE:** A Kommo usa timestamps em **segundos** (Unix), não milissegundos. Sempre multiplique por 1000 pra converter pra JS Date.

---

## 9. Sistema de Eventos da Kommo

Esta é a parte mais poderosa e complexa. Os eventos permitem saber EXATAMENTE quando um campo mudou.

### 9.1 Por que usar eventos?
- **Leads** só mostram o estado ATUAL (ex: Cadência = Msg 3)
- **Eventos** mostram o HISTÓRICO (ex: Msg 1 → Msg 2 → Msg 3)
- Com eventos, sabemos QUANDO cada mudança aconteceu
- Permite filtrar por período com precisão

### 9.2 Como filtramos eventos por campo

Cada campo personalizado tem um **field_id** numérico. Para saber o ID:
1. Vá no Kommo > Lead > Campo personalizado
2. O ID aparece na URL ou nas configurações do campo

```typescript
// Filtrar eventos de um campo específico
const reuniaoEvents = data.events.filter(
  e => e.field_id === FIELD_IDS.STATUS_REUNIAO
    && eventInPeriod(e)
    && allIaLeadIds.has(e.lead_id) // Só leads com tag IA
);
```

### 9.3 Contagem de leads únicos por valor

```typescript
const counts = { agendada: 0, compareceu: 0 };
const seen = { agendada: new Set(), compareceu: new Set() };

for (const evt of reuniaoEvents) {
  const val = String(evt.value).toLowerCase().trim();
  if (val in counts && !seen[val].has(evt.lead_id)) {
    seen[val].add(evt.lead_id);
    counts[val]++;
  }
}
```

**Por que usar Set?** Um lead pode ter múltiplos eventos do mesmo campo (ex: foi agendado 2x). O Set garante que contamos cada lead uma só vez.

### 9.4 Match flexível de valores

Os nomes dos campos podem mudar no Kommo. Eventos antigos guardam o nome antigo. O match precisa ser flexível:

```typescript
function matchCadStep(val: string): string | null {
  const v = val.toUpperCase().trim();
  // Match exato primeiro
  for (const step of cadSteps) {
    if (v === step) return step;
  }
  // Fallback: match pelo número
  const numMatch = v.match(/MENSAGEM\s*(\d+)/);
  if (numMatch) {
    return cadSteps.find(s => s.includes(`MENSAGEM ${numMatch[1]}`)) || null;
  }
  return null;
}
```

Assim, "MENSAGEM 1" (antigo) casa com "MENSAGEM 1 (IA)" (novo).

### 9.5 Evento entity_tag_deleted

Quando uma tag é removida de um lead, a Kommo gera um evento especial:
```json
{
  "type": "entity_tag_deleted",
  "entity_id": 20725205,
  "created_at": 1711411200,
  "value_before": [{ "tag": { "name": "IA-PPT" } }]
}
```

Usamos isso pra contar "Já passou pela IA" — leads que tinham a tag mas perderam.

---

## 10. Tracking de Tag Removida

### 10.1 O problema
A API da Kommo só retorna leads que TÊM a tag. Se um lead perdeu a tag, ele some da busca. Precisamos rastrear isso.

### 10.2 Duas soluções combinadas

**Solução 1: lead_snapshots (Supabase)**
```typescript
async function trackTaggedLeads(currentLeads, tag) {
  // Salva estado atual no Supabase
  await supabase.from("lead_snapshots").upsert(
    currentLeads.map(l => ({
      lead_id: l.id,
      lead_name: l.name,
      snapshot_date: new Date().toISOString().split("T")[0],
    }))
  );

  // Busca quem estava no snapshot mas não está mais
  const currentIds = new Set(currentLeads.map(l => l.id));
  const { data: snapshots } = await supabase
    .from("lead_snapshots")
    .select("lead_id");

  const lostIds = snapshots
    .filter(s => !currentIds.has(s.lead_id))
    .map(s => s.lead_id);

  // Busca dados dos leads perdidos na Kommo
  // (em batches de 50)
  return fetchLeadsByIds(lostIds);
}
```

**Solução 2: tagDeletedEvents (API de eventos)**
Os eventos `entity_tag_deleted` dão a data exata da remoção. No frontend, incluímos esses IDs nos filtros:

```typescript
const allIaLeadIds = new Set([
  ...allLeads.map(l => l.id),          // Tem tag agora
  ...data.lostTagLeads.map(l => l.id), // Perdeu tag (snapshot)
  ...data.tagDeletedEvents.map(e => e.lead_id), // Perdeu tag (evento)
]);
```

---

## 11. Cálculo de KPIs

### 11.1 Total de Leads (primeiro bloco)
```
Total = leads com tag criados no período
      + leads que perderam tag mas foram criados no período
```
O número grande mostra o total. Se alguém perdeu a tag, aparece `(-X sem tag)`.

### 11.2 Já passou pela IA (segundo bloco)
```
Count = leads únicos com evento entity_tag_deleted no período
```
Baseado nos eventos de remoção de tag, não nos leads em si.

### 11.3 Vendas (terceiro bloco)
```
Vendas = leads com evento no campo SITUACAO
         onde valor ≠ "selecione" e ≠ ""
         no período
```
Agrupa por tipo: "Pag Integral", "Parcial", "Boleto".

### 11.4 Taxa de Conversão de Follow-up (quarto bloco)
```
Denominador = leads únicos com evento de CADENCIA no período
              (exclui "Recuperado" e "Perdido" — são resultado, não input)
Numerador   = leads únicos com "Recuperado" no campo CADENCIA
Taxa        = Numerador / Denominador × 100
```

### 11.5 Situação de Reunião
Baseado em eventos do campo STATUS_REUNIAO:
- Agendada
- Reagendada
- Compareceu
- Não compareceu

### 11.6 Cadência de Follow-ups
Baseado em eventos do campo CADENCIA:
- MENSAGEM 1 (IA)
- MENSAGEM 2 (IA)
- MENSAGEM 3 (BOT) até MENSAGEM 6 (BOT)

### 11.7 Recuperação / Remarketing
Baseado no campo CADENCIA:
- **Recuperado** = valor contém "RECUPERADO"
- **Não recuperado** = valor contém "PERDIDO"
- Cross-tab: de qual Msg o lead saiu antes de virar Recuperado

```typescript
// Para cada lead recuperado, encontrar o último step antes do RECUPERADO
for (const evt of leadEvents.sort(byDate)) {
  if (val.includes("RECUPERADO")) break;
  if (isMsgStep(val)) lastStep = val;
}
// lastStep = de onde o lead "converteu"
```

---

## 12. Deploy no Lovable

### 12.1 Subir código pro GitHub
```bash
git init
git add .
git commit -m "feat: dashboard CRM Kommo"
git remote add origin https://github.com/SEU_USER/dashboard-crm.git
git push -u origin main
```

### 12.2 Conectar no Lovable
1. Crie um novo projeto no Lovable
2. Conecte ao repositório GitHub
3. Conecte ao Supabase: clique no ícone Supabase > "Already have a Supabase project? Connect it here"
4. O build roda automaticamente

### 12.3 Credenciais Supabase
Se o Lovable não injeta as env vars automaticamente, hardcode como fallback:
```typescript
// src/lib/supabase.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
  || "https://SEU_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
  || "sua_anon_key";
```

### 12.4 Credenciais Kommo (auto-conectar)
Para que o dashboard já abra conectado sem o usuário precisar digitar:
```typescript
// src/lib/kommo-storage.ts
const DEFAULT_CREDENTIALS = {
  subdomain: "seusubdominio",
  apiToken: "seu_jwt_token",
};

export function getCredentials() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_CREDENTIALS; // Auto-conecta!
  // ...
}
```

---

## 13. Troubleshooting

### "Supabase não configurado"
- Verifique se `.env` tem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- No Lovable: hardcode como fallback em `supabase.ts`

### "subdomain e api_token são obrigatórios"
- O token Kommo pode ter expirado
- Verifique se `getCredentials()` retorna valores válidos
- Confira se o `DEFAULT_CREDENTIALS` está preenchido

### Eventos zerados em algum painel
- Verifique o `field_id` do campo no Kommo (pode mudar entre contas)
- Use `console.log` pra ver os valores reais: `new Set(events.map(e => e.value))`
- Nomes de campos renomeados no Kommo precisam de match flexível

### Lead recuperado não aparece
- O lead pode ter perdido a tag IA-PPT — inclua `tagDeletedEvents` nos IDs
- O lead pode não ter dados completos — use placeholder: `{ id, name: "Lead #ID" }`

### Taxa de conversão mostra 0%
- Com poucos recuperados e muitos leads, a taxa é <1%
- Mostre `<1%` em vez de `0%`:
  ```typescript
  {taxa === 0 && count > 0 ? "<1" : taxa}%
  ```

### Nomes de cadência mudaram
- Eventos antigos guardam o nome antigo
- Use match pelo número, não pelo nome exato
- Ex: `/MENSAGEM\s*(\d+)/` casa com qualquer formato

---

## Checklist para replicar

- [ ] Criar projeto React + Vite + TypeScript
- [ ] Instalar shadcn/ui, React Query, React Router, Supabase
- [ ] Criar projeto no Supabase
- [ ] Criar tabela `lead_snapshots`
- [ ] Criar Edge Function `kommo-engine`
- [ ] Configurar `.env` com URLs do Supabase
- [ ] Criar integração privada na Kommo e pegar o token
- [ ] Identificar os `field_id` dos seus campos personalizados
- [ ] Definir a tag de filtro (ex: "IA-PPT")
- [ ] Deploy da Edge Function (`supabase functions deploy`)
- [ ] Testar conexão via página de Integrações
- [ ] Verificar dados no Dashboard
- [ ] Deploy no Lovable / Vercel / Netlify

---

*Documento gerado a partir do projeto Dashboard PSI — PSI Terapia no Exterior*
*Mantido por metrik-sales*
