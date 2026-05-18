# Dashboard CRM Kommo

Dashboard de métricas para CRM Kommo com integração via Supabase Edge Functions.

## Setup Rápido

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar Supabase
- Crie um projeto no [supabase.com](https://supabase.com)
- Copie `.env.example` para `.env` e preencha:
```bash
cp .env.example .env
```

### 3. Deploy da Edge Function
```bash
supabase login
supabase link --project-ref SEU_PROJECT_ID
supabase functions deploy kommo-engine
```

### 4. Criar tabela no Supabase
Execute no SQL Editor:
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
```

### 5. Configurar credenciais Kommo
Edite `src/lib/kommo-storage.ts` e preencha `DEFAULT_CREDENTIALS` com seu subdomínio e token da Kommo. Ou deixe vazio para configurar pela tela de Integrações.

### 6. Configurar Field IDs
Edite os IDs dos campos personalizados em `src/lib/kommo-api.ts` (FIELD_IDS) e `supabase/functions/kommo-engine/index.ts` (FIELD_IDS) de acordo com os campos do seu Kommo.

### 7. Rodar
```bash
npm run dev
```
Acesse `http://localhost:8080`

## Documentação Completa
Leia o arquivo `SKILL_DASHBOARD_KOMMO.md` para o guia completo com explicação de toda a arquitetura, APIs, eventos e KPIs.
