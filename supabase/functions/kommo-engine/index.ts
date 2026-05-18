import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_TAG = "Em Atendimento IA";

// IDs dos campos personalizados na Kommo
const FIELD_IDS = {
  STATUS_REUNIAO: 993021,
  CADENCIA: 993023,
  RECUPERACAO: 993025,
  SITUACAO: 0,
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

interface RequestBody {
  action:
    | "test_connection"
    | "crm_data"
    | "fetch_leads"
    | "fetch_pipelines"
    | "list_tags"
    | "list_custom_fields"
    | "field_events";
  subdomain: string;
  api_token: string;
  tag?: string;
  field_id?: number;
  value_after?: string;
  date_from?: number;
  date_to?: number;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Kommo API helper ──
async function kommoFetch(
  subdomain: string,
  token: string,
  path: string
): Promise<{ ok: boolean; status: number; data: any; text: string }> {
  const url = `https://${subdomain}.kommo.com/api/v4${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: `Erro de rede: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON
  }

  return { ok: res.ok, status: res.status, data, text };
}

// ── Resolve tag name → tag ID ──
async function resolveTagId(
  subdomain: string,
  token: string,
  tagName: string
): Promise<number | null> {
  const res = await kommoFetch(
    subdomain,
    token,
    `/leads/tags?limit=250`
  );
  if (!res.ok || !res.data) return null;

  const tags = res.data?._embedded?.tags ?? [];
  const found = tags.find(
    (t: any) => String(t.name).trim().toLowerCase() === tagName.trim().toLowerCase()
  );
  return found ? found.id : null;
}

// ── Check if lead has exact tag ──
function leadHasTag(lead: any, tagName: string): boolean {
  const tags = lead._embedded?.tags ?? [];
  return tags.some(
    (t: any) => String(t.name).trim().toLowerCase() === tagName.trim().toLowerCase()
  );
}

// ── Save current tagged leads to DB and find who lost the tag ──
async function trackTaggedLeads(
  currentLeads: any[],
  subdomain: string,
  token: string,
  tagName: string
): Promise<{ lostTagLeads: any[]; debug: string }> {
  try {
    const sb = getSupabase();
    const currentIds = currentLeads.map((l) => l.id);

    // Upsert current leads into lead_snapshots
    if (currentIds.length > 0) {
      const rows = currentLeads.map((l) => ({
        lead_id: l.id,
        lead_name: l.name || `Lead #${l.id}`,
        pipeline_id: l.pipeline_id,
        status_id: l.status_id,
        cadencia: getFieldValue(l, "cad") || null,
        recuperacao: getFieldValue(l, "recupera") || null,
        situacao_reuniao: getFieldValue(l, "status", "reuni") || null,
        custom_fields: {},
        snapshot_date: new Date().toISOString().split("T")[0],
      }));

      await sb.from("lead_snapshots").upsert(rows, {
        onConflict: "lead_id,snapshot_date",
        ignoreDuplicates: false,
      });
    }

    // Find leads that were previously tracked but no longer have the tag
    const { data: allTracked } = await sb
      .from("lead_snapshots")
      .select("lead_id, lead_name, cadencia, recuperacao, situacao_reuniao")
      .order("created_at", { ascending: false });

    if (!allTracked || allTracked.length === 0) {
      return { lostTagLeads: [], debug: "Nenhum lead histórico no banco." };
    }

    // Distinct lead IDs that are NOT in the current set
    const currentIdSet = new Set(currentIds);
    const seenIds = new Set<number>();
    const lostIds: number[] = [];
    const lostSnapshots: Record<number, any> = {};

    for (const row of allTracked) {
      if (!seenIds.has(row.lead_id) && !currentIdSet.has(row.lead_id)) {
        seenIds.add(row.lead_id);
        lostIds.push(row.lead_id);
        lostSnapshots[row.lead_id] = row;
      }
    }

    if (lostIds.length === 0) {
      return { lostTagLeads: [], debug: `${allTracked.length} leads no histórico, todos ainda com tag.` };
    }

    // Fetch lost leads from Kommo by ID (batch of 50 max)
    const lostLeads: any[] = [];
    const batchSize = 50;
    for (let i = 0; i < Math.min(lostIds.length, 200); i += batchSize) {
      const batch = lostIds.slice(i, i + batchSize);
      const idFilter = batch.map((id, idx) => `filter%5Bid%5D%5B${idx}%5D=${id}`).join("&");
      const res = await kommoFetch(subdomain, token, `/leads?${idFilter}`);
      if (res.ok && res.data?._embedded?.leads) {
        lostLeads.push(...res.data._embedded.leads);
      }
    }

    // For leads we couldn't fetch from Kommo, use snapshot data
    const fetchedIds = new Set(lostLeads.map((l: any) => l.id));
    for (const id of lostIds) {
      if (!fetchedIds.has(id) && lostSnapshots[id]) {
        lostLeads.push({
          id,
          name: lostSnapshots[id].lead_name,
          _from_snapshot: true,
          _snapshot: lostSnapshots[id],
        });
      }
    }

    return {
      lostTagLeads: lostLeads,
      debug: `${lostIds.length} leads perderam a tag. ${lostLeads.length} recuperados.`,
    };
  } catch (e) {
    console.error("trackTaggedLeads error:", e);
    return { lostTagLeads: [], debug: `Erro no tracking: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Fetch leads by tag with two passes: updated_at desc + created_at desc ──
async function fetchLeadsByTag(
  subdomain: string,
  token: string,
  tagName: string
): Promise<{ leads: any[]; debug: string }> {
  const seenIds = new Set<number>();
  const allMatched: any[] = [];
  const query = encodeURIComponent(tagName);
  const limit = 250;
  const maxPages = 10;

  // Pass 1: recently active leads (updated_at desc)
  // Pass 2: newest leads (created_at desc)
  const orders = ["updated_at", "created_at"];

  for (const order of orders) {
    let page = 1;
    while (page <= maxPages) {
      const res = await kommoFetch(
        subdomain,
        token,
        `/leads?query=${query}&limit=${limit}&page=${page}&order[${order}]=desc`
      );

      if (res.status === 204) break;
      if (!res.ok || !res.data) break;

      const leads = res.data?._embedded?.leads ?? [];
      if (leads.length === 0) break;

      for (const lead of leads) {
        if (leadHasTag(lead, tagName) && !seenIds.has(lead.id)) {
          seenIds.add(lead.id);
          allMatched.push(lead);
        }
      }

      if (leads.length < limit) break;
      page++;
    }
  }

  return {
    leads: allMatched,
    debug: `Query "${tagName}": ${allMatched.length} leads (2 passes: updated_at + created_at).`,
  };
}

// ── Fetch pipelines ──
async function fetchPipelines(
  subdomain: string,
  token: string
): Promise<any[]> {
  const res = await kommoFetch(subdomain, token, "/leads/pipelines");
  if (!res.ok || !res.data) {
    throw new Error(
      `Kommo pipelines erro (${res.status}): ${res.data?.detail || res.text.substring(0, 200)}`
    );
  }
  return res.data?._embedded?.pipelines ?? [];
}

// ── Cadência steps ──
const CADENCIA_STEPS = [
  "Mensagem Inicial", "Mensagem 1", "Mensagem 2",
  "Mensagem 3", "Mensagem 4", "Mensagem 5", "Mensagem 6",
];

function matchCadenciaStep(key: string): string | null {
  if (key.includes("inicial")) return "Mensagem Inicial";
  if (key === "mensagem 1" || key === "1") return "Mensagem 1";
  if (key === "mensagem 2" || key === "2") return "Mensagem 2";
  if (key === "mensagem 3" || key === "3") return "Mensagem 3";
  if (key === "mensagem 4" || key === "4") return "Mensagem 4";
  if (key === "mensagem 5" || key === "5") return "Mensagem 5";
  if (key === "mensagem 6" || key === "6") return "Mensagem 6";
  return null;
}

function getFieldValue(lead: any, ...keywords: string[]): string | null {
  const fields = lead.custom_fields_values ?? [];
  for (const field of fields) {
    const fname = String(field.field_name || "").toLowerCase().trim();
    if (keywords.every((kw) => fname.includes(kw.toLowerCase()))) {
      const val = String(field.values?.[0]?.value ?? "").trim();
      if (val && val.toLowerCase() !== "selecione") return val;
    }
  }
  return null;
}

// ── Compute KPIs ──
function computeKPIs(leads: any[]) {
  const now = new Date();
  const todayStart =
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;

  const cadencia = {
    mensagemInicial: 0, mensagem1: 0, mensagem2: 0,
    mensagem3: 0, mensagem4: 0, mensagem5: 0, mensagem6: 0,
  };
  const recuperacao = { recuperado: 0, naoRecuperado: 0, total: 0 };
  const reunioes = { agendado: 0, reagendado: 0, total: 0 };

  let leadsHoje = 0;
  let followUpTotal = 0;
  const porCadencia: Record<string, number> = {};

  // Cross-tab: cadência x recuperação
  const crossTab: Record<string, { total: number; recuperados: number; naoRecuperados: number; emAberto: number }> = {};
  for (const step of CADENCIA_STEPS) {
    crossTab[step] = { total: 0, recuperados: 0, naoRecuperados: 0, emAberto: 0 };
  }

  for (const lead of leads) {
    if (lead.created_at >= todayStart) leadsHoje++;

    // Cadência
    const cadVal = getFieldValue(lead, "cad");
    const cadKey = cadVal ? cadVal.toLowerCase().trim() : null;
    const cadStep = cadKey ? matchCadenciaStep(cadKey) : null;

    if (cadVal && cadKey) {
      followUpTotal++;
      porCadencia[cadKey] = (porCadencia[cadKey] || 0) + 1;

      if (cadKey.includes("inicial")) cadencia.mensagemInicial++;
      else if (cadKey === "mensagem 1" || cadKey === "1") cadencia.mensagem1++;
      else if (cadKey === "mensagem 2" || cadKey === "2") cadencia.mensagem2++;
      else if (cadKey === "mensagem 3" || cadKey === "3") cadencia.mensagem3++;
      else if (cadKey === "mensagem 4" || cadKey === "4") cadencia.mensagem4++;
      else if (cadKey === "mensagem 5" || cadKey === "5") cadencia.mensagem5++;
      else if (cadKey === "mensagem 6" || cadKey === "6") cadencia.mensagem6++;
    }

    // Recuperação
    const recVal = getFieldValue(lead, "recupera");
    let recStatus: "recuperado" | "nao_recuperado" | "em_aberto" = "em_aberto";

    if (recVal) {
      recuperacao.total++;
      const recKey = recVal.toLowerCase().trim();
      if (recKey.includes("não") || recKey.includes("nao")) {
        recuperacao.naoRecuperado++;
        recStatus = "nao_recuperado";
      } else if (recKey.includes("recuperado")) {
        recuperacao.recuperado++;
        recStatus = "recuperado";
      }
    }

    // Cross-tab
    if (cadStep) {
      const row = crossTab[cadStep];
      row.total++;
      if (recStatus === "recuperado") row.recuperados++;
      else if (recStatus === "nao_recuperado") row.naoRecuperados++;
      else row.emAberto++;
    }

    // Reuniões
    const reuniaoVal = getFieldValue(lead, "status", "reuni");
    if (reuniaoVal) {
      const rKey = reuniaoVal.toLowerCase().trim();
      if (rKey.includes("reagendad")) { reunioes.reagendado++; reunioes.total++; }
      else if (rKey.includes("agendad")) { reunioes.agendado++; reunioes.total++; }
    }
  }

  const cadenciaRecuperacao = CADENCIA_STEPS.map((step) => ({
    cadencia: step, ...crossTab[step],
  }));

  return {
    leadsHoje,
    leadsAtivos: leads.filter((l: any) => !l.closed_at).length,
    followUps: { total: followUpTotal, porCadencia },
    cadencia,
    recuperacao,
    reunioes,
    cadenciaRecuperacao,
    totalLeads: leads.length,
  };
}

// ── Fetch custom fields definitions (to get IDs) ──
async function fetchCustomFields(
  subdomain: string,
  token: string
): Promise<any[]> {
  const res = await kommoFetch(subdomain, token, "/leads/custom_fields?limit=250");
  if (!res.ok || !res.data) return [];
  return res.data?._embedded?.custom_fields ?? [];
}

// ── Fetch ALL custom_field_value_changed events in a date range ──
async function fetchAllFieldEvents(
  subdomain: string,
  token: string,
  dateFrom: number,
  dateTo: number
): Promise<any[]> {
  let allEvents: any[] = [];
  let page = 1;
  const limit = 250;
  const maxPages = 20; // até 5.000 eventos

  while (page <= maxPages) {
    // Fetch both custom_field_value_changed AND entity_tag_deleted events
    const url = `/events?limit=${limit}&page=${page}&filter%5Btype%5D%5B%5D=custom_field_value_changed&filter%5Btype%5D%5B%5D=entity_tag_deleted&filter%5Bcreated_at%5D%5Bfrom%5D=${dateFrom}&filter%5Bcreated_at%5D%5Bto%5D=${dateTo}`;

    const res = await kommoFetch(subdomain, token, url);
    if (res.status === 204) break;
    if (!res.ok || !res.data) break;

    const events = res.data?._embedded?.events ?? [];
    if (events.length === 0) break;

    allEvents = [...allEvents, ...events];
    if (events.length < limit) break;
    page++;
  }

  return { events: allEvents, debugInfo: { totalFetched: allEvents.length } };
}

// ── Parse events into field-specific counts ──
function countFieldEvents(
  events: any[],
  taggedLeadIds: Set<number>
): {
  reuniao: Record<string, { total: number; withTag: number; leadIds: number[] }>;
  cadencia: Record<string, { total: number; withTag: number; leadIds: number[] }>;
  recuperacao: Record<string, { total: number; withTag: number; leadIds: number[] }>;
} {
  const result = {
    reuniao: {} as Record<string, { total: number; withTag: number; leadIds: number[] }>,
    cadencia: {} as Record<string, { total: number; withTag: number; leadIds: number[] }>,
    recuperacao: {} as Record<string, { total: number; withTag: number; leadIds: number[] }>,
    situacao: {} as Record<string, { total: number; withTag: number; leadIds: number[] }>,
  };

  // Track unique lead IDs per field+value (avoid counting same lead twice)
  const seen = {
    reuniao: {} as Record<string, Set<number>>,
    cadencia: {} as Record<string, Set<number>>,
    recuperacao: {} as Record<string, Set<number>>,
    situacao: {} as Record<string, Set<number>>,
  };

  for (const evt of events) {
    const va = evt.value_after;
    if (!va) continue;

    // value_after can be array or object
    const items = Array.isArray(va) ? va : [va];

    for (const item of items) {
      const cf = item?.custom_field_value ?? item;
      const fieldId = cf?.field_id;
      const value = cf?.text ?? cf?.value;

      if (!fieldId || !value) continue;

      const leadId = evt.entity_id;
      if (!leadId) continue;

      const val = String(value).toLowerCase().trim();
      let category: "reuniao" | "cadencia" | "recuperacao" | "situacao" | null = null;

      if (fieldId === FIELD_IDS.STATUS_REUNIAO) category = "reuniao";
      else if (fieldId === FIELD_IDS.CADENCIA) category = "cadencia";
      else if (fieldId === FIELD_IDS.SITUACAO) category = "situacao";
      else if (fieldId === FIELD_IDS.RECUPERACAO) category = "recuperacao";

      if (!category) continue;

      // Initialize if needed
      if (!seen[category][val]) {
        seen[category][val] = new Set();
        result[category][val] = { total: 0, withTag: 0, leadIds: [] };
      }

      // Only count each lead once per value
      if (!seen[category][val].has(leadId)) {
        seen[category][val].add(leadId);
        result[category][val].total++;
        if (taggedLeadIds.has(leadId)) {
          result[category][val].withTag++;
          result[category][val].leadIds.push(leadId);
        }
      }
    } // end for items
  } // end for events

  return result;
}

// ── Main handler ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { action, subdomain, api_token } = body;
    const tag = body.tag || DEFAULT_TAG;

    if (!subdomain || !api_token) {
      return jsonResponse(
        { success: false, error: "subdomain e api_token são obrigatórios" },
        400
      );
    }

    // ── Test Connection ──
    if (action === "test_connection") {
      const res = await kommoFetch(subdomain, api_token, "/account");
      if (!res.ok || !res.data) {
        return jsonResponse({
          success: false,
          error: `Falha na conexão (${res.status}): ${res.data?.detail || "Resposta inválida"}`,
        });
      }
      return jsonResponse({
        success: true,
        account: { id: res.data.id, name: res.data.name },
      });
    }

    // ── Debug: inspect actual field names/values from leads ──
    if (action === "debug_fields" as any) {
      const result = await fetchLeadsByTag(subdomain, api_token, tag);
      const sample = result.leads.slice(0, 10).map((lead: any) => ({
        id: lead.id,
        name: lead.name,
        tags: (lead._embedded?.tags ?? []).map((t: any) => t.name),
        fields: (lead.custom_fields_values ?? []).map((f: any) => ({
          field_name: f.field_name,
          value: f.values?.[0]?.value,
        })),
      }));
      return jsonResponse({ success: true, debug: result.debug, totalLeads: result.leads.length, sample });
    }

    // ── List Tags ──
    if (action === "list_tags") {
      const res = await kommoFetch(subdomain, api_token, "/leads/tags?limit=250");
      if (!res.ok || !res.data) {
        return jsonResponse({
          success: false,
          error: `Erro ao listar tags (${res.status})`,
        });
      }
      const tags = res.data?._embedded?.tags ?? [];
      return jsonResponse({
        success: true,
        tags: tags.map((t: any) => ({ id: t.id, name: t.name })),
      });
    }

    // ── List Custom Fields (get IDs) ──
    if (action === "list_custom_fields") {
      const fields = await fetchCustomFields(subdomain, api_token);
      return jsonResponse({
        success: true,
        fields: fields.map((f: any) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          enums: f.enums?.map((e: any) => ({ id: e.id, value: e.value })) ?? [],
        })),
      });
    }

    // ── Field Events (exact change tracking) ──
    if (action === "field_events") {
      const { field_id, value_after, date_from, date_to } = body;
      if (!field_id || !date_from || !date_to) {
        return jsonResponse({ success: false, error: "field_id, date_from e date_to são obrigatórios" }, 400);
      }

      // Get tagged lead IDs for cross-reference
      const leadsResult = await fetchLeadsByTag(subdomain, api_token, tag);
      const taggedIds = new Set(leadsResult.leads.map((l: any) => l.id));

      const events = await fetchFieldEvents(
        subdomain, api_token, field_id, value_after ?? null, date_from, date_to, taggedIds
      );

      return jsonResponse({
        success: true,
        ...events,
        tag,
      });
    }

    // ── Fetch Leads (by tag) ──
    if (action === "fetch_leads") {
      const result = await fetchLeadsByTag(subdomain, api_token, tag);
      return jsonResponse({
        success: true,
        leads: result.leads,
        tag,
        debug: result.debug,
      });
    }

    // ── Fetch Pipelines ──
    if (action === "fetch_pipelines") {
      const pipelines = await fetchPipelines(subdomain, api_token);
      return jsonResponse({ success: true, pipelines });
    }

    // ── CRM Data (full dashboard) ──
    if (action === "crm_data") {
      // Fetch leads, pipelines, and events for last 30 days in parallel
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 86400;

      const [leadsResult, pipelines, eventsResult] = await Promise.all([
        fetchLeadsByTag(subdomain, api_token, tag),
        fetchPipelines(subdomain, api_token),
        fetchAllFieldEvents(subdomain, api_token, thirtyDaysAgo, now),
      ]);

      const rawEvents = eventsResult.events;
      const eventsDebugInfo = eventsResult.debugInfo;

      const kpis = computeKPIs(leadsResult.leads);
      const taggedIds = new Set(leadsResult.leads.map((l: any) => l.id));
      const fieldEvents = countFieldEvents(rawEvents, taggedIds);

      // Track tagged leads + find who lost the tag
      let lostTagLeads: any[] = [];
      let trackDebug = "";
      try {
        const trackResult = await trackTaggedLeads(
          leadsResult.leads, subdomain, api_token, tag
        );
        lostTagLeads = trackResult.lostTagLeads;
        trackDebug = trackResult.debug;
      } catch (e) {
        trackDebug = `Tracking error: ${e}`;
      }

      // Parse events - value_after can be array or object in Kommo
      // Parse custom field events
      const eventsWithTimestamp = rawEvents
        .map((evt: any) => {
          const va = evt.value_after;
          if (!va) return null;

          const items = Array.isArray(va) ? va : [va];
          for (const item of items) {
            const cf = item?.custom_field_value ?? item;
            const fid = cf?.field_id;
            const val = cf?.text ?? cf?.value;
            if (fid && (fid === FIELD_IDS.STATUS_REUNIAO || fid === FIELD_IDS.CADENCIA || fid === FIELD_IDS.RECUPERACAO || fid === FIELD_IDS.SITUACAO)) {
              return {
                lead_id: evt.entity_id,
                field_id: fid,
                value: String(val ?? ""),
                created_at: evt.created_at,
              };
            }
          }
          return null;
        })
        .filter(Boolean);

      // Parse tag deleted events — find leads that lost tag IA-PPT
      // Check both value_before AND value_after for the tag name (structure varies)
      const tagDeletedEvents = rawEvents
        .filter((evt: any) => {
          if (evt.type !== "entity_tag_deleted") return false;
          const raw = JSON.stringify(evt.value_before ?? "") + JSON.stringify(evt.value_after ?? "");
          return raw.toLowerCase().includes(tag.toLowerCase());
        })
        .map((evt: any) => ({
          lead_id: evt.entity_id,
          created_at: evt.created_at,
        }));

      return jsonResponse({
        success: true,
        leads: leadsResult.leads,
        lostTagLeads,
        pipelines,
        kpis,
        fieldEvents,
        events: eventsWithTimestamp,
        tagDeletedEvents,
        tag,
        totalFetched: leadsResult.leads.length,
        debug: `${leadsResult.debug} | ${trackDebug} | ${rawEvents.length} events | ${tagDeletedEvents.length} tag removida`,
        eventsDebug: eventsDebugInfo,
      });
    }

    return jsonResponse(
      { success: false, error: `Ação desconhecida: ${action}` },
      400
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("kommo-engine error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
