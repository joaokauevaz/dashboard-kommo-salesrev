import { supabase, getSupabaseUrl, isSupabaseConfigured } from "./supabase";
import { getCredentials } from "./kommo-storage";
import type {
  KommoEngineRequest,
  KommoEngineResponse,
  KommoLead,
  KommoPipeline,
  DashboardKPIs,
  CadenciaBreakdown,
  RecuperacaoBreakdown,
  ReuniaoBreakdown,
  CadenciaRecuperacaoRow,
} from "@/types/kommo";

// ── Edge Function caller ──
async function callEngine(
  action: KommoEngineRequest["action"],
  extra?: Record<string, unknown>
): Promise<KommoEngineResponse> {
  const creds = getCredentials();
  if (!creds) throw new Error("Sem credenciais Kommo configuradas");

  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env"
    );
  }

  const body: KommoEngineRequest = {
    action,
    subdomain: creds.subdomain,
    api_token: creds.apiToken,
    ...extra,
  };

  const res = await fetch(`${getSupabaseUrl()}/functions/v1/kommo-engine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabase?.["supabaseKey"] ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: KommoEngineResponse;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Resposta inválida da Edge Function (${res.status}): ${text.substring(0, 200)}`);
  }

  if (!res.ok || !json.success) {
    throw new Error(json.error || `Erro na Edge Function (${res.status})`);
  }

  return json;
}

// ── Public API ──
export async function testConnection(): Promise<{
  success: boolean;
  account?: { id: number; name: string };
  error?: string;
}> {
  return callEngine("test_connection");
}

export async function fetchLeads(): Promise<KommoLead[]> {
  const res = await callEngine("fetch_leads");
  return (res.leads ?? []) as KommoLead[];
}

export async function fetchPipelines(): Promise<KommoPipeline[]> {
  const res = await callEngine("fetch_pipelines");
  return (res.pipelines ?? []) as KommoPipeline[];
}

export const IA_TAG = "Em Atendimento IA";

// IDs dos campos (espelhados da Edge Function)
export const FIELD_IDS = {
  STATUS_REUNIAO: 993021,
  CADENCIA: 993023,
  RECUPERACAO: 993025,
  SITUACAO: 0,
  CLOSER: 979464,
};

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

export async function fetchDashboardData(): Promise<{
  leads: KommoLead[];
  lostTagLeads: KommoLead[];
  pipelines: KommoPipeline[];
  kpis: DashboardKPIs;
  events: FieldEvent[];
  tagDeletedEvents: TagDeletedEvent[];
  tag: string;
  totalFetched: number;
}> {
  const res = await callEngine("crm_data", { tag: IA_TAG });
  const leads = (res.leads ?? []) as KommoLead[];
  const lostTagLeads = ((res as any).lostTagLeads ?? []) as KommoLead[];
  const pipelines = (res.pipelines ?? []) as KommoPipeline[];
  const kpis = res.kpis ?? computeKPIs(leads);
  const events = ((res as any).events ?? []) as FieldEvent[];
  const tagDeletedEvents = ((res as any).tagDeletedEvents ?? []) as TagDeletedEvent[];
  const tag = (res as any).tag ?? IA_TAG;
  const totalFetched = (res as any).totalFetched ?? leads.length;
  return { leads, lostTagLeads, pipelines, kpis: kpis as DashboardKPIs, events, tagDeletedEvents, tag, totalFetched };
}

// ── Helpers ──

/**
 * Partial case-insensitive matching on custom field names.
 * Each keyword must appear (via .includes()) in the field_name.
 * Returns null for empty strings or "selecione".
 */
function getCustomFieldValue(
  lead: KommoLead,
  ...keywords: string[]
): string | null {
  if (!lead.custom_fields_values) return null;
  const field = lead.custom_fields_values.find((f) => {
    const name = f.field_name.toLowerCase();
    return keywords.every((kw) => name.includes(kw.toLowerCase()));
  });
  if (!field || !field.values.length) return null;
  const val = String(field.values[0].value ?? "").trim();
  if (!val || val.toLowerCase() === "selecione") return null;
  return val;
}

/**
 * Check if a Unix timestamp (in seconds) falls on today's date.
 */
function isToday(timestamp: number): boolean {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Normalise a cadência value (UPPERCASE from Kommo) into a canonical key.
 * Examples: "MENSAGEM INICIAL" -> "mensagem inicial"
 *           "MENSAGEM 1"       -> "mensagem 1"
 */
function normaliseCadencia(raw: string): string {
  return raw.toLowerCase().trim();
}

/** Map a normalised cadência key to the ordered label used in the cross-tab. */
const CADENCIA_STEPS = [
  "CAD 1",
  "CAD 2",
  "CAD 3",
  "CAD 4",
  "CAD 5",
  "CAD 6",
  "CAD 7",
] as const;

function matchCadenciaStep(normalised: string): string | null {
  if (normalised.includes("cad 1") || normalised === "1") return "CAD 1";
  if (normalised.includes("cad 2") || normalised === "2") return "CAD 2";
  if (normalised.includes("cad 3") || normalised === "3") return "CAD 3";
  if (normalised.includes("cad 4") || normalised === "4") return "CAD 4";
  if (normalised.includes("cad 5") || normalised === "5") return "CAD 5";
  if (normalised.includes("cad 6") || normalised === "6") return "CAD 6";
  if (normalised.includes("cad 7") || normalised === "7") return "CAD 7";
  return null;
}

// ── Period type ──
export type Period = "hoje" | "ontem" | "7d" | "30d" | "todos";

// ── Compute KPIs following the MASTER FILTER TABLE ──
// Each block uses DIFFERENT date filters. See rules doc.
export function computeKPIs(allLeads: KommoLead[], period: Period = "todos"): DashboardKPIs {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Build updated_at range for the selected period
  let periodStartTs: number;
  let periodEndTs: number = (todayStart.getTime() + 86400000) / 1000;

  switch (period) {
    case "hoje":
      periodStartTs = todayStart.getTime() / 1000;
      break;
    case "ontem":
      periodStartTs = (todayStart.getTime() - 86400000) / 1000;
      periodEndTs = todayStart.getTime() / 1000;
      break;
    case "7d":
      periodStartTs = (todayStart.getTime() - 7 * 86400000) / 1000;
      break;
    case "30d":
      periodStartTs = (todayStart.getTime() - 30 * 86400000) / 1000;
      break;
    default: // "todos"
      periodStartTs = 0;
      periodEndTs = Infinity;
  }

  function inPeriodByUpdatedAt(lead: KommoLead): boolean {
    return lead.updated_at >= periodStartTs && lead.updated_at < periodEndTs;
  }

  // ── Accumulators ──
  let leadsHoje = 0;                          // created_at = today, ALWAYS
  let leadsAtivos = 0;                        // no date filter, not closed
  let followUps = 0;                          // updated_at in period + has cadência
  let reunioesAgendado = 0;                   // updated_at in period + agendada
  let reunioesReagendado = 0;                 // updated_at in period + reagendada

  // Cadência TOTAL: no date filter
  const cadTotal: Record<string, number> = {};
  // Cadência RECUPERADOS: updated_at in period
  const cadRec: Record<string, number> = {};
  // Cadência NÃO RECUPERADOS: updated_at in period
  const cadNaoRec: Record<string, number> = {};

  // Recuperação TOTAL: no date filter
  let recTotal = 0;
  // Recuperação RECUPERADOS: updated_at in period
  let recRecuperados = 0;
  // Recuperação NÃO RECUPERADOS: updated_at in period
  let recNaoRecuperados = 0;

  for (const step of CADENCIA_STEPS) {
    cadTotal[step] = 0;
    cadRec[step] = 0;
    cadNaoRec[step] = 0;
  }

  const porCadencia: Record<string, number> = {};

  for (const lead of allLeads) {
    const inPeriod = inPeriodByUpdatedAt(lead);

    // ── LEADS HOJE: created_at = today, ALWAYS (ignores period) ──
    if (isToday(lead.created_at)) leadsHoje++;

    // ── LEADS ATIVOS: no date filter, not closed ──
    if (!lead.closed_at) leadsAtivos++;

    // Parse custom fields once
    const cadVal = getCustomFieldValue(lead, "cad");
    const cadStep = cadVal ? matchCadenciaStep(normaliseCadencia(cadVal)) : null;
    const recVal = getCustomFieldValue(lead, "recupera");
    const reuniaoVal = getCustomFieldValue(lead, "status", "reuni");

    // Determine recovery status
    let isRecuperado = false;
    let isNaoRecuperado = false;
    if (recVal) {
      const rk = recVal.toLowerCase();
      if (rk.includes("não") || rk.includes("nao")) isNaoRecuperado = true;
      else if (rk.includes("recuperado")) isRecuperado = true;
    }

    // ── FOLLOW-UPS: updated_at in period + has cadência ──
    if (cadVal && inPeriod) followUps++;

    // ── REUNIÕES: updated_at in period ──
    if (reuniaoVal && inPeriod) {
      const rk = reuniaoVal.toLowerCase();
      if (rk.includes("reagendad")) reunioesReagendado++;
      else if (rk.includes("agendad")) reunioesAgendado++;
    }

    // ── CADÊNCIA TOTAL: no date filter ──
    if (cadStep) {
      cadTotal[cadStep]++;
      const key = normaliseCadencia(cadVal!);
      porCadencia[key] = (porCadencia[key] || 0) + 1;
    }

    // ── CADÊNCIA RECUPERADOS / NÃO RECUPERADOS: updated_at in period ──
    if (cadStep && inPeriod) {
      if (isRecuperado) cadRec[cadStep]++;
      if (isNaoRecuperado) cadNaoRec[cadStep]++;
    }

    // ── RECUPERAÇÃO TOTAL: no date filter ──
    if (isRecuperado || isNaoRecuperado) recTotal++;

    // ── RECUPERAÇÃO RECUPERADOS / NÃO RECUPERADOS: updated_at in period ──
    if (inPeriod) {
      if (isRecuperado) recRecuperados++;
      if (isNaoRecuperado) recNaoRecuperados++;
    }
  }

  // ── CADÊNCIA EM ABERTO = TOTAL - RECUPERADOS - NÃO RECUPERADOS (cálculo) ──
  const cadenciaRecuperacao: CadenciaRecuperacaoRow[] = CADENCIA_STEPS.map((step) => ({
    cadencia: step,
    total: cadTotal[step],
    recuperados: cadRec[step],
    naoRecuperados: cadNaoRec[step],
    emAberto: cadTotal[step] - cadRec[step] - cadNaoRec[step],
  }));

  // Legacy cadencia breakdown (for type compat)
  const cadencia: CadenciaBreakdown = {
    mensagemInicial: 0,
    mensagem1: cadTotal["CAD 1"] ?? 0,
    mensagem2: cadTotal["CAD 2"] ?? 0,
    mensagem3: cadTotal["CAD 3"] ?? 0,
    mensagem4: cadTotal["CAD 4"] ?? 0,
    mensagem5: cadTotal["CAD 5"] ?? 0,
    mensagem6: cadTotal["CAD 6"] ?? 0,
  };

  return {
    leadsHoje,
    leadsAtivos,
    followUps: { total: followUps, porCadencia },
    cadencia,
    recuperacao: { recuperado: recRecuperados, naoRecuperado: recNaoRecuperados, total: recTotal },
    reunioes: { agendado: reunioesAgendado, reagendado: reunioesReagendado, total: reunioesAgendado + reunioesReagendado },
    cadenciaRecuperacao,
    totalLeads: allLeads.length,
  };
}
