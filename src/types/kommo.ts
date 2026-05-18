// ── Kommo Connection ──
export interface KommoCredentials {
  subdomain: string;
  apiToken: string;
}

// ── Kommo API Types ──
export interface KommoLead {
  id: number;
  name: string;
  price: number;
  responsible_user_id: number;
  group_id: number;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  updated_at: number;
  closed_at: number | null;
  closest_task_at: number | null;
  custom_fields_values: KommoCustomField[] | null;
  _embedded?: {
    tags?: { id: number; name: string }[];
    contacts?: { id: number }[];
  };
}

export interface KommoCustomField {
  field_id: number;
  field_name: string;
  field_code: string | null;
  field_type: string;
  values: { value: string; enum_id?: number; enum_code?: string }[];
}

export interface KommoPipeline {
  id: number;
  name: string;
  sort: number;
  is_main: boolean;
  _embedded: {
    statuses: KommoStatus[];
  };
}

export interface KommoStatus {
  id: number;
  name: string;
  sort: number;
  is_editable: boolean;
  pipeline_id: number;
  color: string;
  type: number;
}

// ── Dashboard KPIs ──
export interface DashboardKPIs {
  leadsHoje: number;
  leadsAtivos: number;
  followUps: FollowUpBreakdown;
  cadencia: CadenciaBreakdown;
  recuperacao: RecuperacaoBreakdown;
  reunioes: ReuniaoBreakdown;
  cadenciaRecuperacao: CadenciaRecuperacaoRow[];
  totalLeads: number;
}

export interface FollowUpBreakdown {
  total: number;
  porCadencia: Record<string, number>;
}

export interface CadenciaBreakdown {
  mensagemInicial: number;
  mensagem1: number;
  mensagem2: number;
  mensagem3: number;
  mensagem4: number;
  mensagem5: number;
  mensagem6: number;
}

export interface RecuperacaoBreakdown {
  recuperado: number;
  naoRecuperado: number;
  total: number;
}

export interface ReuniaoBreakdown {
  agendado: number;
  reagendado: number;
  total: number;
}

export interface CadenciaRecuperacaoRow {
  cadencia: string;
  total: number;
  recuperados: number;
  naoRecuperados: number;
  emAberto: number;
}

// ── Edge Function Request/Response ──
export interface KommoEngineRequest {
  action: "test_connection" | "crm_data" | "fetch_leads" | "fetch_pipelines";
  subdomain: string;
  api_token: string;
  filters?: Record<string, unknown>;
}

export interface KommoEngineResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  account?: { id: number; name: string };
  leads?: KommoLead[];
  pipelines?: KommoPipeline[];
  kpis?: DashboardKPIs;
}
