import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, RefreshCw, ArrowRight, Zap, Users, ChevronDown, Calendar, CheckCircle, XCircle, RotateCcw, UserMinus, MessageSquare, ShieldCheck, TrendingUp, DollarSign, UserCheck } from "lucide-react";
import { fetchDashboardData, IA_TAG, FIELD_IDS, type FieldEvent, type TagDeletedEvent } from "@/lib/kommo-api";
import { isConnected } from "@/lib/kommo-storage";
import { useNavigate } from "react-router-dom";
import type { KommoLead } from "@/types/kommo";

export default function Dashboard() {
  const navigate = useNavigate();
  const connected = isConnected();
  const [listOpen, setListOpen] = useState(false);
  const [lostTagOpen, setLostTagOpen] = useState(false);
  const [agendadosOpen, setAgendadosOpen] = useState<string | false>(false);
  const [cadenciaOpen, setCadenciaOpen] = useState<string | false>(false);
  const [recuperacaoOpen, setRecuperacaoOpen] = useState<string | false>(false);
  const [vendasOpen, setVendasOpen] = useState(false);
  const [visibleVendas, setVisibleVendas] = useState(100);
  const [visibleCount, setVisibleCount] = useState(100);
  const [visibleLostTag, setVisibleLostTag] = useState(100);
  const [visibleAgendados, setVisibleAgendados] = useState(100);
  const [visibleCadencia, setVisibleCadencia] = useState(100);
  const [visibleRecuperacao, setVisibleRecuperacao] = useState(100);
  const [closerOpen, setCloserOpen] = useState<string | false>(false);
  const [visibleCloser, setVisibleCloser] = useState(100);
  const [filtro, setFiltro] = useState<"hoje" | "ontem" | "7d" | "30d" | "todos">("todos");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard-data"],
    queryFn: fetchDashboardData,
    enabled: connected,
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Zap className="w-10 h-10 text-psi-wine" />
        <h2 className="text-xl font-bold">Conecte sua Kommo</h2>
        <Button onClick={() => navigate("/integracoes")} className="bg-primary text-primary-foreground">
          <ArrowRight className="w-4 h-4 mr-2" /> Ir para Integrações
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 text-psi-wine animate-spin" />
        <p className="text-muted-foreground">Carregando dados da Kommo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Erro"}</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const allLeads = data.leads;

  // Filtro por created_at
  function filterByCreatedAt(lead: KommoLead): boolean {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const createdAt = lead.created_at * 1000;

    switch (filtro) {
      case "hoje":
        return createdAt >= todayStart.getTime();
      case "ontem": {
        const ontemStart = todayStart.getTime() - 86400000;
        return createdAt >= ontemStart && createdAt < todayStart.getTime();
      }
      case "7d":
        return createdAt >= todayStart.getTime() - 7 * 86400000;
      case "30d":
        return createdAt >= todayStart.getTime() - 30 * 86400000;
      default:
        return true;
    }
  }

  const leads = filtro === "todos" ? allLeads : allLeads.filter(filterByCreatedAt);

  // "Já passou pela IA" — baseado em eventos entity_tag_deleted (data exata da remoção)
  function tagDeletedInPeriod(evt: TagDeletedEvent): boolean {
    const evtMs = evt.created_at * 1000;
    const now2 = new Date();
    const ts = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
    switch (filtro) {
      case "hoje": return evtMs >= ts.getTime();
      case "ontem": return evtMs >= ts.getTime() - 86400000 && evtMs < ts.getTime();
      case "7d": return evtMs >= ts.getTime() - 7 * 86400000;
      case "30d": return evtMs >= ts.getTime() - 30 * 86400000;
      default: return true;
    }
  }

  // Contagem de leads únicos que perderam tag no período
  const tagDeletedFiltered = data.tagDeletedEvents.filter(tagDeletedInPeriod);
  const tagDeletedLeadIds = new Set(tagDeletedFiltered.map(e => e.lead_id));
  const lostTagCount = tagDeletedLeadIds.size;

  // Mapear IDs pra objetos lead (quando disponível, pra lista expandida)
  const allLeadMap = new Map([
    ...allLeads.map(l => [l.id, l] as [number, KommoLead]),
    ...data.lostTagLeads.map(l => [l.id, l] as [number, KommoLead]),
  ]);
  const lostTagFiltered = [...tagDeletedLeadIds]
    .map(id => allLeadMap.get(id) ?? { id, name: `Lead #${id}`, created_at: 0, updated_at: 0, price: 0, responsible_user_id: 0, group_id: 0, status_id: 0, pipeline_id: 0, closed_at: null, closest_task_at: null, custom_fields_values: null } as KommoLead);

  // Pra contagem no primeiro bloco: leads que perderam tag E foram criados no período
  // Como não temos created_at de todos os leads que perderam tag,
  // usamos o count direto dos eventos filtrados por período
  const lostTagInPeriodCount = lostTagCount;

  // Taxa de conversão real: recuperados / cadências no período (baseado em eventos)
  const allIaIds = new Set([...allLeads.map(l => l.id), ...data.lostTagLeads.map(l => l.id), ...data.tagDeletedEvents.map(e => e.lead_id)]);
  const periodFilter = (evt: FieldEvent) => {
    const evtMs = evt.created_at * 1000;
    const now2 = new Date();
    const ts = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
    switch (filtro) {
      case "hoje": return evtMs >= ts.getTime();
      case "ontem": return evtMs >= ts.getTime() - 86400000 && evtMs < ts.getTime();
      case "7d": return evtMs >= ts.getTime() - 7 * 86400000;
      case "30d": return evtMs >= ts.getTime() - 30 * 86400000;
      default: return true;
    }
  };
  // Só eventos de mensagem (exclui recuperado/perdido do denominador)
  const cadEventsPeriod = data.events.filter(e => e.field_id === FIELD_IDS.CADENCIA && periodFilter(e) && allIaIds.has(e.lead_id) && !String(e.value).toLowerCase().includes("recuperado") && !String(e.value).toLowerCase().includes("perdido"));
  const recEventsPeriod = data.events.filter(e => e.field_id === FIELD_IDS.CADENCIA && periodFilter(e) && allIaIds.has(e.lead_id) && String(e.value).toLowerCase().includes("recuperado"));
  const cadLeadsUnique = new Set(cadEventsPeriod.map(e => e.lead_id)).size;
  const recLeadsUnique = new Set(recEventsPeriod.map(e => e.lead_id)).size;
  const taxaConversao = cadLeadsUnique > 0 ? Math.round((recLeadsUnique / cadLeadsUnique) * 100) : 0;

  // Vendas: campo Situação (1020140) com qualquer valor ≠ selecione = venda
  const vendaEvents = data.events.filter(
    e => e.field_id === FIELD_IDS.SITUACAO && periodFilter(e) && allIaIds.has(e.lead_id)
      && String(e.value).toLowerCase() !== "selecione" && String(e.value).trim() !== ""
  );
  const vendaLeadsSeen = new Set<number>();
  const vendaPorTipo: Record<string, number> = {};
  for (const evt of vendaEvents) {
    if (vendaLeadsSeen.has(evt.lead_id)) continue;
    vendaLeadsSeen.add(evt.lead_id);
    const val = String(evt.value).trim();
    vendaPorTipo[val] = (vendaPorTipo[val] || 0) + 1;
  }
  const totalVendas = vendaLeadsSeen.size;

  // Leads que perderam tag no período E foram criados no período (pra somar ao primeiro bloco)
  const leadsIdsComTag = new Set(leads.map(l => l.id));
  const lostTagCreatedInPeriod = lostTagFiltered.filter(l => filterByCreatedAt(l) && !leadsIdsComTag.has(l.id));
  const lostInFirstBlock = lostTagCreatedInPeriod.length;

  // Total = leads com tag + leads que perderam tag (ambos criados no período)
  const totalComHistorico = leads.length + lostInFirstBlock;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Dashboard IA</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">SalesRev</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={filtro} onValueChange={(v) => { setFiltro(v as typeof filtro); setVisibleCount(100); }}>
            <TabsList className="h-8 sm:h-9">
              <TabsTrigger value="hoje" className="text-[10px] sm:text-xs px-2 sm:px-3">Hoje</TabsTrigger>
              <TabsTrigger value="ontem" className="text-[10px] sm:text-xs px-2 sm:px-3">Ontem</TabsTrigger>
              <TabsTrigger value="7d" className="text-[10px] sm:text-xs px-2 sm:px-3">7d</TabsTrigger>
              <TabsTrigger value="30d" className="text-[10px] sm:text-xs px-2 sm:px-3">30d</TabsTrigger>
              <TabsTrigger value="todos" className="text-[10px] sm:text-xs px-2 sm:px-3">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-8 sm:h-9 px-2 sm:px-3">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline ml-2">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Grid de blocos — até 4 por fileira */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

      {/* Bloco Total de Leads */}
      <Card
        className="border-2 border-psi-wine/20 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => { setListOpen(!listOpen); setAgendadosOpen(false); setVisibleCount(100); }}
      >
        <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-psi-wine/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-psi-wine" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {filtro === "todos" ? "Total de Leads" : filtro === "hoje" ? "Leads Hoje" : filtro === "ontem" ? "Leads Ontem" : filtro === "7d" ? "Leads 7 dias" : "Leads 30 dias"}
                </p>
                <p className="text-2xl sm:text-4xl font-bold text-psi-wine">{totalComHistorico}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filtro === "todos" ? "Leads com tag " : "Criados no período com tag "}
                  <Badge className="bg-psi-wine-light text-psi-wine text-[10px] ml-1">{IA_TAG}</Badge>
                  {filtro !== "todos" && lostInFirstBlock > 0 && (
                    <span className="ml-1.5 text-amber-600 font-medium">(-{lostInFirstBlock} sem tag)</span>
                  )}
                </p>
              </div>
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${listOpen ? "rotate-180" : ""}`} />
          </div>
        </CardContent>
      </Card>

      {/* Bloco Já passou pela IA */}
      <Card
        className="border-2 border-amber-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => { setLostTagOpen(!lostTagOpen); setListOpen(false); setAgendadosOpen(false); setVisibleLostTag(100); }}
      >
        <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-amber-50 flex items-center justify-center">
                <UserMinus className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Já passou pela IA</p>
                <p className="text-2xl sm:text-4xl font-bold text-amber-600">{lostTagCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tag removida
                </p>
              </div>
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${lostTagOpen ? "rotate-180" : ""}`} />
          </div>
        </CardContent>
      </Card>

      {/* Bloco Vendas — clicável */}
      <Card
        className="border-2 border-green-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => { setVendasOpen(!vendasOpen); setListOpen(false); setLostTagOpen(false); setAgendadosOpen(false); setVisibleVendas(100); }}
      >
        <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-green-50 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vendas</p>
                <p className="text-2xl sm:text-4xl font-bold text-green-600">{totalVendas}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Object.entries(vendaPorTipo).map(([tipo, count], i) => (
                    <span key={tipo}>
                      {i > 0 && " · "}
                      <span className="text-green-600 font-medium">{count}</span> {tipo}
                    </span>
                  ))}
                  {totalVendas === 0 && "Nenhuma venda no período"}
                </p>
              </div>
            </div>
            <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${vendasOpen ? "rotate-180" : ""}`} />
          </div>
        </CardContent>
      </Card>

      {/* Bloco Taxa de Conversão de Follow-up */}
      <Card className="border-2 border-emerald-200 shadow-sm">
        <CardContent className="pt-3 pb-3 px-3 sm:pt-5 sm:pb-4 sm:px-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Taxa de Conversão de Follow-up</p>
              <p className="text-2xl sm:text-4xl font-bold text-emerald-600">{taxaConversao === 0 && recLeadsUnique > 0 ? "<1" : taxaConversao}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="text-emerald-600 font-medium">{recLeadsUnique}</span> recuperados de{" "}
                <span className="font-medium">{cadLeadsUnique}</span> cadências
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      </div>{/* fecha grid blocos */}

      {/* Lista Total de Leads */}
      {listOpen && (() => {
        const allListLeads = [...leads, ...lostTagCreatedInPeriod];
        return (
        <Card className="border border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Mostrando {Math.min(visibleCount, allListLeads.length)} de {allListLeads.length} leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {allListLeads.slice(0, visibleCount).map((lead) => {
                const hasTag = leadsIdsComTag.has(lead.id);
                const closer = lead.custom_fields_values?.find(f => f.field_id === FIELD_IDS.CLOSER || f.field_name.toLowerCase().includes("closer"))?.values?.[0]?.value;
                const closerStr = closer && String(closer).toLowerCase() !== "selecione" && String(closer).toLowerCase() !== "selecionar" ? String(closer) : null;
                const cadencia = lead.custom_fields_values?.find(f => f.field_name.toLowerCase().includes("cad"))?.values?.[0]?.value;
                const recuperacao = lead.custom_fields_values?.find(f => f.field_name.toLowerCase().includes("recupera"))?.values?.[0]?.value;
                const reuniao = lead.custom_fields_values?.find(f => (f.field_name.toLowerCase().includes("status") && f.field_name.toLowerCase().includes("reuni")))?.values?.[0]?.value;
                const cadStr = cadencia && String(cadencia).toLowerCase() !== "selecione" ? String(cadencia) : null;
                const recStr = recuperacao && String(recuperacao).toLowerCase() !== "selecione" ? String(recuperacao) : null;
                const reuStr = reuniao && String(reuniao).toLowerCase() !== "selecione" ? String(reuniao) : null;
                return (
                  <div key={lead.id} className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm hover:bg-muted/50 ${!hasTag ? "opacity-60 border-amber-200 bg-amber-50/30" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">{lead.name || `Lead #${lead.id}`}</span>
                      <div className="flex gap-1 flex-wrap">
                        {hasTag ? (
                          <Badge className="bg-psi-wine-light text-psi-wine text-[10px]">{IA_TAG}</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px]">sem tag</Badge>
                        )}
                        {closerStr && <Badge className="bg-purple-100 text-purple-700 text-[10px]">{closerStr}</Badge>}
                        {cadStr && <Badge className="bg-amber-100 text-amber-700 text-[10px]">{cadStr}</Badge>}
                        {recStr && <Badge className={`text-[10px] ${recStr.toLowerCase().includes("não") || recStr.toLowerCase().includes("nao") ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{recStr}</Badge>}
                        {reuStr && <Badge className="bg-blue-100 text-blue-700 text-[10px]">{reuStr}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                      <span>{lead.created_at ? new Date(lead.created_at * 1000).toLocaleDateString("pt-BR") : "—"}</span>
                      <span className="text-[10px] text-muted-foreground/50">#{lead.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {visibleCount < allListLeads.length && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm"
                  onClick={(e) => { e.stopPropagation(); setVisibleCount(prev => prev + 100); }}
                  className="text-psi-wine border-psi-wine/30 hover:bg-psi-wine-light"
                >
                  Ver mais ({Math.min(100, allListLeads.length - visibleCount)} leads)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        );
      })()}

      {/* Lista Vendas */}
      {vendasOpen && totalVendas > 0 && (() => {
        const vendaLeadsList = [...vendaLeadsSeen]
          .map(id => allLeadMap.get(id) ?? { id, name: `Lead #${id}`, created_at: 0, updated_at: 0, price: 0, responsible_user_id: 0, group_id: 0, status_id: 0, pipeline_id: 0, closed_at: null, closest_task_at: null, custom_fields_values: null } as KommoLead);
        return (
          <Card className="border border-green-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-green-700">
                Mostrando {Math.min(visibleVendas, vendaLeadsList.length)} de {vendaLeadsList.length} vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {vendaLeadsList.slice(0, visibleVendas).map((lead) => {
                  const tipoCompra = lead.custom_fields_values?.find(f => f.field_name.toLowerCase().includes("tipo") && f.field_name.toLowerCase().includes("compra"))?.values?.[0]?.value;
                  const tipoStr = tipoCompra && String(tipoCompra).toLowerCase() !== "selecione" ? String(tipoCompra) : null;
                  const updatedDate = lead.updated_at ? new Date(lead.updated_at * 1000).toLocaleDateString("pt-BR") : "—";
                  return (
                    <div key={lead.id} className="flex items-center justify-between border border-green-100 bg-green-50/50 rounded-lg px-3 py-2 text-sm hover:bg-green-50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">{lead.name || `Lead #${lead.id}`}</span>
                        <div className="flex gap-1 flex-wrap">
                          <Badge className="bg-psi-wine-light text-psi-wine text-[10px]">{IA_TAG}</Badge>
                          {tipoStr && <Badge className="bg-green-100 text-green-700 text-[10px]">{tipoStr}</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                        <span>Atualizado: {updatedDate}</span>
                        <span className="text-[10px] text-muted-foreground/50">#{lead.id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {visibleVendas < vendaLeadsList.length && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm"
                    onClick={(e) => { e.stopPropagation(); setVisibleVendas(prev => prev + 100); }}
                    className="text-green-600 border-green-200 hover:bg-green-50"
                  >
                    Ver mais ({Math.min(100, vendaLeadsList.length - visibleVendas)} leads)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Lista Já passou pela IA */}
      {lostTagOpen && lostTagFiltered.length > 0 && (
        <Card className="border border-amber-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-700">
              Mostrando {Math.min(visibleLostTag, lostTagFiltered.length)} de {lostTagFiltered.length} leads que perderam a tag {IA_TAG}
              {filtro !== "todos" && data.lostTagLeads.length > lostTagFiltered.length && (
                <span className="text-amber-500 font-normal"> ({data.lostTagLeads.length} total)</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {lostTagFiltered.slice(0, visibleLostTag).map((lead) => {
                const reuniao = lead.custom_fields_values?.find(f =>
                  f.field_name.toLowerCase().includes("status") && f.field_name.toLowerCase().includes("reuni")
                )?.values?.[0]?.value;
                const cadencia = lead.custom_fields_values?.find(f => f.field_name.toLowerCase().includes("cad"))?.values?.[0]?.value;
                const reuStr = reuniao && String(reuniao).toLowerCase() !== "selecione" ? String(reuniao) : null;
                const cadStr = cadencia && String(cadencia).toLowerCase() !== "selecione" ? String(cadencia) : null;
                const updatedDate = lead.updated_at ? new Date(lead.updated_at * 1000).toLocaleDateString("pt-BR") : "—";

                return (
                  <div key={lead.id} className="flex items-center justify-between border border-amber-100 bg-amber-50/50 rounded-lg px-3 py-2 text-sm hover:bg-amber-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">{lead.name || `Lead #${lead.id}`}</span>
                      <div className="flex gap-1 flex-wrap">
                        <Badge className="bg-amber-100 text-amber-700 text-[10px]">Tag removida</Badge>
                        {cadStr && <Badge className="bg-gray-100 text-gray-600 text-[10px]">{cadStr}</Badge>}
                        {reuStr && <Badge className="bg-blue-100 text-blue-700 text-[10px]">{reuStr}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                      <span>Atualizado: {updatedDate}</span>
                      <span className="text-[10px] text-muted-foreground/50">#{lead.id}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {visibleLostTag < lostTagFiltered.length && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm"
                  onClick={(e) => { e.stopPropagation(); setVisibleLostTag(prev => prev + 100); }}
                  className="text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  Ver mais ({Math.min(100, lostTagFiltered.length - visibleLostTag)} leads)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lostTagOpen && lostTagFiltered.length === 0 && (
        <Card className="border border-amber-200 shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum lead perdeu a tag ainda. O rastreamento começa a partir do primeiro carregamento do dashboard.</p>
          </CardContent>
        </Card>
      )}

      {/* Painel Closer Responsável — baseado no campo do lead */}
      {(() => {
        // Agrupar leads do período por closer
        const allBlockLeads = [...leads, ...lostTagCreatedInPeriod];
        const closerNames = ["João", "Isabelle"];
        const closerCounts: Record<string, number> = {};
        const closerLeadIds: Record<string, number[]> = {};
        let semCloser = 0;
        const semCloserLeadIds: number[] = [];

        for (const name of closerNames) {
          closerCounts[name] = 0;
          closerLeadIds[name] = [];
        }

        for (const lead of allBlockLeads) {
          const closerField = lead.custom_fields_values?.find(f => f.field_id === FIELD_IDS.CLOSER || f.field_name.toLowerCase().includes("closer"));
          const closerVal = closerField?.values?.[0]?.value;
          const closerStr = closerVal && String(closerVal).toLowerCase() !== "selecione" && String(closerVal).toLowerCase() !== "selecionar" ? String(closerVal).trim() : null;

          if (closerStr) {
            const matched = closerNames.find(n => n.toLowerCase() === closerStr.toLowerCase());
            if (matched) {
              closerCounts[matched]++;
              closerLeadIds[matched].push(lead.id);
            } else {
              closerCounts[closerStr] = (closerCounts[closerStr] || 0) + 1;
              closerLeadIds[closerStr] = closerLeadIds[closerStr] || [];
              closerLeadIds[closerStr].push(lead.id);
            }
          } else {
            semCloser++;
            semCloserLeadIds.push(lead.id);
          }
        }

        const closerColors = [
          { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-600", bgIcon: "bg-purple-100" },
          { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-600", bgIcon: "bg-indigo-100" },
          { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-600", bgIcon: "bg-violet-100" },
          { bg: "bg-fuchsia-50", border: "border-fuchsia-200", text: "text-fuchsia-600", bgIcon: "bg-fuchsia-100" },
          { bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-600", bgIcon: "bg-pink-100" },
        ];

        const closerCards = Object.entries(closerCounts)
          .filter(([, count]) => count > 0)
          .map(([name, count], i) => ({
            name,
            count,
            leadIds: closerLeadIds[name],
            ...closerColors[i % closerColors.length],
          }));

        const totalComCloser = closerCards.reduce((a, c) => a + c.count, 0);

        const closerLeadMap = new Map([
          ...allLeads.map(l => [l.id, l] as [number, KommoLead]),
          ...data.lostTagLeads.map(l => [l.id, l] as [number, KommoLead]),
          ...lostTagCreatedInPeriod.map(l => [l.id, l] as [number, KommoLead]),
        ]);

        return (
          <Card className="border-2 border-border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Closer Responsável</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {totalComCloser} leads atribuídos{semCloser > 0 && ` · ${semCloser} sem closer`}
                    {filtro !== "todos" && (
                      <span className="text-muted-foreground/60"> (no período)</span>
                    )}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {closerCards.map((cc) => (
                  <div
                    key={cc.name}
                    className={`${cc.bg} border ${cc.border} rounded-xl p-4 text-center cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => {
                      setCloserOpen(closerOpen === cc.name ? false : cc.name);
                      setVisibleCloser(100);
                    }}
                  >
                    <UserCheck className={`w-5 h-5 ${cc.text} mx-auto mb-2`} />
                    <p className={`text-3xl font-bold ${cc.text}`}>{cc.count}</p>
                    <p className={`text-xs font-medium ${cc.text} mt-1`}>{cc.name}</p>
                  </div>
                ))}
              </div>

              {/* Lista expandida do closer clicado */}
              {closerCards.map((cc) => {
                if (closerOpen !== cc.name || cc.count === 0) return null;
                const ccLeads = cc.leadIds.map(id => closerLeadMap.get(id)).filter(Boolean) as KommoLead[];
                return (
                  <div key={`closer-list-${cc.name}`} className="space-y-1.5 pt-2 border-t">
                    <p className={`text-xs font-semibold ${cc.text} mb-2`}>
                      {cc.name}: {cc.count} leads
                    </p>
                    {ccLeads.slice(0, visibleCloser).map((lead) => {
                      const hasTag = leadsIdsComTag.has(lead.id);
                      const cadencia = lead.custom_fields_values?.find(f => f.field_name.toLowerCase().includes("cad"))?.values?.[0]?.value;
                      const cadStr = cadencia && String(cadencia).toLowerCase() !== "selecione" ? String(cadencia) : null;
                      const reuniao = lead.custom_fields_values?.find(f => (f.field_name.toLowerCase().includes("status") && f.field_name.toLowerCase().includes("reuni")))?.values?.[0]?.value;
                      const reuStr = reuniao && String(reuniao).toLowerCase() !== "selecione" ? String(reuniao) : null;
                      return (
                        <div key={lead.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm hover:bg-muted/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">{lead.name || `Lead #${lead.id}`}</span>
                            <div className="flex gap-1 flex-wrap">
                              {hasTag ? (
                                <Badge className="bg-psi-wine-light text-psi-wine text-[10px]">{IA_TAG}</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700 text-[10px]">sem tag</Badge>
                              )}
                              {cadStr && <Badge className="bg-amber-100 text-amber-700 text-[10px]">{cadStr}</Badge>}
                              {reuStr && <Badge className="bg-blue-100 text-blue-700 text-[10px]">{reuStr}</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                            <span>{lead.created_at ? new Date(lead.created_at * 1000).toLocaleDateString("pt-BR") : "—"}</span>
                            <span className="text-[10px] text-muted-foreground/50">#{lead.id}</span>
                          </div>
                        </div>
                      );
                    })}
                    {visibleCloser < ccLeads.length && (
                      <div className="flex justify-center pt-3">
                        <Button variant="outline" size="sm"
                          onClick={() => setVisibleCloser(prev => prev + 100)}
                          className={`${cc.text} ${cc.border} hover:${cc.bg}`}
                        >
                          Ver mais ({Math.min(100, ccLeads.length - visibleCloser)} leads)
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

      {/* Painel Situação de Reunião — baseado em EVENTOS (exato como Kommo) */}
      {(() => {
        // Filtrar eventos por created_at do evento (quando o campo foi alterado)
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        function eventInPeriod(evt: FieldEvent): boolean {
          const evtMs = evt.created_at * 1000;
          switch (filtro) {
            case "hoje": return evtMs >= todayStart.getTime();
            case "ontem": return evtMs >= todayStart.getTime() - 86400000 && evtMs < todayStart.getTime();
            case "7d": return evtMs >= todayStart.getTime() - 7 * 86400000;
            case "30d": return evtMs >= todayStart.getTime() - 30 * 86400000;
            default: return true;
          }
        }

        // Leads com tag AGORA + leads que JÁ TIVERAM a tag
        const allIaLeadIds = new Set([
          ...allLeads.map(l => l.id),
          ...data.lostTagLeads.map(l => l.id),
          ...data.tagDeletedEvents.map(e => e.lead_id),
        ]);

        // Filtrar eventos de reunião: no período + lead com/que teve tag
        const reuniaoEvents = data.events.filter(
          e => e.field_id === FIELD_IDS.STATUS_REUNIAO && eventInPeriod(e) && allIaLeadIds.has(e.lead_id)
        );

        // Contar leads únicos por valor
        const counts: Record<string, number> = { agendada: 0, reagendada: 0, compareceu: 0, "não compareceu": 0 };
        const leadIdsByStatus: Record<string, number[]> = { agendada: [], reagendada: [], compareceu: [], "não compareceu": [] };
        const seenByStatus: Record<string, Set<number>> = { agendada: new Set(), reagendada: new Set(), compareceu: new Set(), "não compareceu": new Set() };

        for (const evt of reuniaoEvents) {
          const val = String(evt.value).toLowerCase().trim();
          if (val in counts && !seenByStatus[val].has(evt.lead_id)) {
            seenByStatus[val].add(evt.lead_id);
            counts[val]++;
            leadIdsByStatus[val].push(evt.lead_id);
          }
        }

        // Map pra converter IDs em leads (pra lista expandida)
        const leadMap = new Map([
          ...allLeads.map(l => [l.id, l] as [number, KommoLead]),
          ...data.lostTagLeads.map(l => [l.id, l] as [number, KommoLead]),
        ]);

        const statusCards = [
          { label: "Agendada", key: "agendada", count: counts["agendada"], leadIds: leadIdsByStatus["agendada"], icon: Calendar, bgCard: "bg-blue-50", borderCard: "border-blue-200", textColor: "text-blue-600", bgIcon: "bg-blue-100" },
          { label: "Reagendada", key: "reagendada", count: counts["reagendada"], leadIds: leadIdsByStatus["reagendada"], icon: RotateCcw, bgCard: "bg-amber-50", borderCard: "border-amber-200", textColor: "text-amber-600", bgIcon: "bg-amber-100" },
          { label: "Compareceu", key: "compareceu", count: counts["compareceu"], leadIds: leadIdsByStatus["compareceu"], icon: CheckCircle, bgCard: "bg-emerald-50", borderCard: "border-emerald-200", textColor: "text-emerald-600", bgIcon: "bg-emerald-100" },
          { label: "Não compareceu", key: "não compareceu", count: counts["não compareceu"], leadIds: leadIdsByStatus["não compareceu"], icon: XCircle, bgCard: "bg-red-50", borderCard: "border-red-200", textColor: "text-red-600", bgIcon: "bg-red-100" },
        ];

        const totalReunioes = Object.values(counts).reduce((a, b) => a + b, 0);

        return (
          <Card className="border-2 border-border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Situação de Reunião</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {totalReunioes} leads com status de reunião
                    {filtro !== "todos" && (
                      <span className="text-muted-foreground/60"> (no período)</span>
                    )}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 4 mini cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statusCards.map((sc) => (
                  <div
                    key={sc.label}
                    className={`${sc.bgCard} border ${sc.borderCard} rounded-xl p-4 text-center cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => {
                      setAgendadosOpen(agendadosOpen === sc.label ? false : sc.label as any);
                      setListOpen(false);
                      setVisibleAgendados(100);
                    }}
                  >
                    <sc.icon className={`w-6 h-6 ${sc.textColor} mx-auto mb-2`} />
                    <p className={`text-3xl font-bold ${sc.textColor}`}>{sc.count}</p>
                    <p className={`text-xs font-medium ${sc.textColor} mt-1`}>{sc.label}</p>
                  </div>
                ))}
              </div>

              {/* Lista expandida do status clicado */}
              {statusCards.map((sc) => {
                if (agendadosOpen !== sc.label || sc.count === 0) return null;
                const scLeads = sc.leadIds.map(id => leadMap.get(id)).filter(Boolean) as KommoLead[];
                return (
                  <div key={`list-${sc.label}`} className="space-y-1.5 pt-2 border-t">
                    <p className={`text-xs font-semibold ${sc.textColor} mb-2`}>
                      {sc.label}: {sc.count} leads
                    </p>
                    {scLeads.slice(0, visibleAgendados).map((lead) => {
                      const createdDate = new Date(lead.created_at * 1000).toLocaleDateString("pt-BR");
                      const updatedDate = new Date(lead.updated_at * 1000).toLocaleDateString("pt-BR");
                      const closerVal = lead.custom_fields_values?.find(f => f.field_id === FIELD_IDS.CLOSER || f.field_name.toLowerCase().includes("closer"))?.values?.[0]?.value;
                      const closerStr = closerVal && String(closerVal).toLowerCase() !== "selecione" && String(closerVal).toLowerCase() !== "selecionar" ? String(closerVal) : null;
                      return (
                        <div key={lead.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm hover:bg-muted/50">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">{lead.name || `Lead #${lead.id}`}</span>
                            <Badge className="bg-psi-wine-light text-psi-wine text-[10px]">{IA_TAG}</Badge>
                            <Badge className={`text-[10px] ${sc.bgIcon} ${sc.textColor}`}>{sc.label}</Badge>
                            {closerStr && <Badge className="bg-purple-100 text-purple-700 text-[10px]">{closerStr}</Badge>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                            <span>Criado: {createdDate}</span>
                            <span>Atualizado: {updatedDate}</span>
                            <span className="text-[10px] text-muted-foreground/50">#{lead.id}</span>
                          </div>
                        </div>
                      );
                    })}
                    {visibleAgendados < scLeads.length && (
                      <div className="flex justify-center pt-3">
                        <Button variant="outline" size="sm"
                          onClick={() => setVisibleAgendados(prev => prev + 100)}
                          className={`${sc.textColor} ${sc.borderCard} hover:${sc.bgCard}`}
                        >
                          Ver mais ({Math.min(100, scLeads.length - visibleAgendados)} leads)
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

      {/* Painel Cadência — baseado em EVENTOS */}
      {(() => {
        const allIaLeadIds2 = new Set([
          ...allLeads.map(l => l.id),
          ...data.lostTagLeads.map(l => l.id),
          ...data.tagDeletedEvents.map(e => e.lead_id),
        ]);

        function eventInPeriod2(evt: FieldEvent): boolean {
          const evtMs = evt.created_at * 1000;
          const now2 = new Date();
          const todayStart2 = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
          switch (filtro) {
            case "hoje": return evtMs >= todayStart2.getTime();
            case "ontem": return evtMs >= todayStart2.getTime() - 86400000 && evtMs < todayStart2.getTime();
            case "7d": return evtMs >= todayStart2.getTime() - 7 * 86400000;
            case "30d": return evtMs >= todayStart2.getTime() - 30 * 86400000;
            default: return true;
          }
        }

        const cadEvents = data.events.filter(
          e => e.field_id === FIELD_IDS.CADENCIA && eventInPeriod2(e) && allIaLeadIds2.has(e.lead_id)
        );

        const cadSteps = ["CAD 1", "CAD 2", "CAD 3", "CAD 4", "CAD 5", "CAD 6", "CAD 7"];
        const cadCounts: Record<string, number> = {};
        const cadLeadIds: Record<string, number[]> = {};
        const cadSeen: Record<string, Set<number>> = {};

        for (const step of cadSteps) {
          cadCounts[step] = 0;
          cadLeadIds[step] = [];
          cadSeen[step] = new Set();
        }

        function matchCadStep(val: string): string | null {
          const v = val.toUpperCase().trim();
          for (const step of cadSteps) {
            if (v === step) return step;
          }
          const numMatch = v.match(/CAD\s*(\d+)/);
          if (numMatch) {
            const num = numMatch[1];
            return cadSteps.find(s => s === `CAD ${num}`) || null;
          }
          return null;
        }

        for (const evt of cadEvents) {
          const step = matchCadStep(String(evt.value));
          if (step && !cadSeen[step].has(evt.lead_id)) {
            cadSeen[step].add(evt.lead_id);
            cadCounts[step]++;
            cadLeadIds[step].push(evt.lead_id);
          }
        }

        const totalCadencia = Object.values(cadCounts).reduce((a, b) => a + b, 0);

        const leadMap2 = new Map([
          ...allLeads.map(l => [l.id, l] as [number, KommoLead]),
          ...data.lostTagLeads.map(l => [l.id, l] as [number, KommoLead]),
        ]);

        const cadColors = [
          { bg: "bg-psi-wine-light", border: "border-psi-wine/20", text: "text-psi-wine" },
          { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-600" },
          { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-600" },
          { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-600" },
          { bg: "bg-lime-50", border: "border-lime-200", text: "text-lime-600" },
          { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-600" },
        ];

        return (
          <Card className="border-2 border-border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Cadência de Follow-ups</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {totalCadencia} alterações de cadência{filtro !== "todos" && " no período"}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                {cadSteps.map((step, i) => (
                  <div
                    key={step}
                    className={`${cadColors[i].bg} border ${cadColors[i].border} rounded-xl p-3 text-center cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => { setCadenciaOpen(cadenciaOpen === step ? false : step); setVisibleCadencia(100); }}
                  >
                    <p className={`text-2xl font-bold ${cadColors[i].text}`}>{cadCounts[step]}</p>
                    <p className={`text-[10px] font-medium ${cadColors[i].text} mt-1`}>{step.replace("MENSAGEM ", "Msg ")}</p>
                  </div>
                ))}
              </div>

              {cadSteps.map((step, i) => {
                if (cadenciaOpen !== step || cadCounts[step] === 0) return null;
                const stepLeads = cadLeadIds[step].map(id => leadMap2.get(id)).filter(Boolean) as KommoLead[];
                return (
                  <div key={`cad-list-${step}`} className="space-y-1.5 pt-2 border-t">
                    <p className={`text-xs font-semibold ${cadColors[i].text} mb-2`}>{step}: {cadCounts[step]} leads</p>
                    {stepLeads.slice(0, visibleCadencia).map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm hover:bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">{lead.name || `Lead #${lead.id}`}</span>
                          <Badge className="bg-psi-wine-light text-psi-wine text-[10px]">{IA_TAG}</Badge>
                          <Badge className={`text-[10px] ${cadColors[i].bg} ${cadColors[i].text}`}>{step}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                          <span>{new Date(lead.updated_at * 1000).toLocaleDateString("pt-BR")}</span>
                          <span className="text-[10px] text-muted-foreground/50">#{lead.id}</span>
                        </div>
                      </div>
                    ))}
                    {visibleCadencia < stepLeads.length && (
                      <div className="flex justify-center pt-3">
                        <Button variant="outline" size="sm" onClick={() => setVisibleCadencia(prev => prev + 100)}>
                          Ver mais ({Math.min(100, stepLeads.length - visibleCadencia)} leads)
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

      {/* Painel Recuperação — baseado em EVENTOS */}
      {(() => {
        const allIaLeadIds3 = new Set([
          ...allLeads.map(l => l.id),
          ...data.lostTagLeads.map(l => l.id),
          ...data.tagDeletedEvents.map(e => e.lead_id),
        ]);

        function eventInPeriod3(evt: FieldEvent): boolean {
          const evtMs = evt.created_at * 1000;
          const now3 = new Date();
          const todayStart3 = new Date(now3.getFullYear(), now3.getMonth(), now3.getDate());
          switch (filtro) {
            case "hoje": return evtMs >= todayStart3.getTime();
            case "ontem": return evtMs >= todayStart3.getTime() - 86400000 && evtMs < todayStart3.getTime();
            case "7d": return evtMs >= todayStart3.getTime() - 7 * 86400000;
            case "30d": return evtMs >= todayStart3.getTime() - 30 * 86400000;
            default: return true;
          }
        }

        // Recuperação agora vem do campo CADÊNCIA: "Recuperado Agendado" = recuperado
        const cadEventsAll = data.events.filter(
          e => e.field_id === FIELD_IDS.CADENCIA && eventInPeriod3(e) && allIaLeadIds3.has(e.lead_id)
        );

        const recCounts: Record<string, number> = { "recuperado": 0, "não recuperado": 0 };
        const recLeadIds: Record<string, number[]> = { "recuperado": [], "não recuperado": [] };
        const recSeen: Record<string, Set<number>> = { "recuperado": new Set(), "não recuperado": new Set() };

        // Classificar leads por valor: "Recuperado (Agendado)" ou "Perdido"
        const recuperadoIds = new Set<number>();
        const perdidoIds = new Set<number>();
        for (const evt of cadEventsAll) {
          const val = String(evt.value).toLowerCase();
          if (val.includes("recuperado")) {
            recuperadoIds.add(evt.lead_id);
          }
          if (val.includes("perdido")) {
            perdidoIds.add(evt.lead_id);
          }
        }

        // Contar leads únicos (só recuperado e perdido)
        for (const id of recuperadoIds) {
          recCounts["recuperado"]++;
          recLeadIds["recuperado"].push(id);
          recSeen["recuperado"].add(id);
        }
        for (const id of perdidoIds) {
          if (recuperadoIds.has(id)) continue; // se é recuperado, não conta como perdido
          recCounts["não recuperado"]++;
          recLeadIds["não recuperado"].push(id);
          recSeen["não recuperado"].add(id);
        }

        const totalRec = recCounts["recuperado"] + recCounts["não recuperado"];
        const taxaRec = totalRec > 0 ? Math.round((recCounts["recuperado"] / totalRec) * 100) : 0;

        const leadMap3 = new Map([
          ...allLeads.map(l => [l.id, l] as [number, KommoLead]),
          ...data.lostTagLeads.map(l => [l.id, l] as [number, KommoLead]),
        ]);

        // Cruzamento: recuperados por cadência (de qual step saiu pra "Recuperado Agendado")
        const cadStepsRec = ["CAD 1", "CAD 2", "CAD 3", "CAD 4", "CAD 5", "CAD 6", "CAD 7"];
        const recPorCadencia: { step: string; recuperados: number; total: number; taxa: number }[] = [];

        const recLeadSet = new Set(recLeadIds["recuperado"]);
        const allRecLeadSet = new Set([...recLeadIds["recuperado"], ...recLeadIds["não recuperado"]]);

        const cadByStep: Record<string, { rec: number; total: number }> = {};
        for (const step of cadStepsRec) {
          cadByStep[step] = { rec: 0, total: 0 };
        }

        for (const leadId of allRecLeadSet) {
          const leadEvents = cadEventsAll
            .filter(e => e.lead_id === leadId)
            .sort((a, b) => a.created_at - b.created_at);

          function matchRecStep(val: string): string | null {
            const v = val.toUpperCase().trim();
            for (const step of cadStepsRec) { if (v === step) return step; }
            const numMatch = v.match(/CAD\s*(\d+)/);
            if (numMatch) return cadStepsRec.find(s => s === `CAD ${numMatch[1]}`) || null;
            return null;
          }

          let lastStep: string | null = null;
          for (const evt of leadEvents) {
            const val = String(evt.value).toUpperCase().trim();
            if (val.includes("RECUPERADO") || val.includes("PERDIDO")) break;
            const matched = matchRecStep(val);
            if (matched) lastStep = matched;
          }

          // Se não achou step anterior, tenta o campo atual do lead
          if (!lastStep) {
            const lead = leadMap3.get(leadId);
            const cadField = lead?.custom_fields_values?.find(f => f.field_name.toLowerCase().includes("cad"))?.values?.[0]?.value;
            if (cadField) {
              const matched = matchRecStep(String(cadField));
              if (matched) lastStep = matched;
            }
          }

          if (lastStep && lastStep in cadByStep) {
            cadByStep[lastStep].total++;
            if (recLeadSet.has(leadId)) {
              cadByStep[lastStep].rec++;
            }
          }
        }

        for (const step of cadStepsRec) {
          const d = cadByStep[step];
          recPorCadencia.push({
            step: step.replace("MENSAGEM ", "Msg "),
            recuperados: d.rec,
            total: d.total,
            taxa: d.total > 0 ? Math.round((d.rec / d.total) * 100) : 0,
          });
        }

        const maxBar = Math.max(...recPorCadencia.map(r => r.total), 1);

        const recCards = [
          { label: "Recuperado", key: "recuperado", count: recCounts["recuperado"], leadIds: recLeadIds["recuperado"], icon: CheckCircle, bgCard: "bg-emerald-50", borderCard: "border-emerald-200", textColor: "text-emerald-600", bgIcon: "bg-emerald-100" },
          { label: "Não recuperado", key: "não recuperado", count: recCounts["não recuperado"], leadIds: recLeadIds["não recuperado"], icon: XCircle, bgCard: "bg-red-50", borderCard: "border-red-200", textColor: "text-red-600", bgIcon: "bg-red-100" },
        ];

        return (
          <Card className="border-2 border-border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Recuperação / Remarketing</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {totalRec} alterações{filtro !== "todos" && " no período"} · Taxa: <span className="font-semibold text-emerald-600">{taxaRec}%</span>
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {recCards.map((rc) => (
                  <div
                    key={rc.key}
                    className={`${rc.bgCard} border ${rc.borderCard} rounded-xl p-4 text-center cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => { setRecuperacaoOpen(recuperacaoOpen === rc.key ? false : rc.key); setVisibleRecuperacao(100); }}
                  >
                    <rc.icon className={`w-6 h-6 ${rc.textColor} mx-auto mb-2`} />
                    <p className={`text-3xl font-bold ${rc.textColor}`}>{rc.count}</p>
                    <p className={`text-xs font-medium ${rc.textColor} mt-1`}>{rc.label}</p>
                  </div>
                ))}
              </div>

              {/* Barra de taxa geral */}
              {totalRec > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Taxa de recuperação geral</span>
                    <span className="font-semibold">{taxaRec}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${taxaRec}%` }} />
                  </div>
                </div>
              )}

              {/* Recuperados por Cadência — tabela limpa */}
              {recPorCadencia.some(r => r.total > 0) && (
                <div className="pt-3 border-t space-y-3">
                  <p className="text-xs font-semibold text-foreground">Recuperados por Cadência</p>
                  <div className="space-y-2">
                    {recPorCadencia.filter(r => r.total > 0).map((r) => (
                      <div key={r.step} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground w-24">{r.step}</span>
                          <div className="flex-1 mx-3">
                            <div className="h-6 bg-gray-100 rounded-full overflow-hidden relative">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all flex items-center justify-end pr-2"
                                style={{ width: `${Math.max(r.taxa, 8)}%` }}
                              >
                                {r.taxa >= 20 && (
                                  <span className="text-[10px] font-bold text-white">{r.recuperados}</span>
                                )}
                              </div>
                              {r.taxa < 20 && r.recuperados > 0 && (
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">{r.recuperados}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right w-20">
                            <span className="text-xs font-bold text-emerald-600">{r.taxa}%</span>
                            <span className="text-[10px] text-muted-foreground ml-1">({r.recuperados}/{r.total})</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Recuperados</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-200" /> Não recuperados</span>
                  </div>
                </div>
              )}

              {recCards.map((rc) => {
                if (recuperacaoOpen !== rc.key || rc.count === 0) return null;
                const rcLeads = rc.leadIds.map(id => leadMap3.get(id) ?? { id, name: `Lead #${id}`, created_at: 0, updated_at: 0, custom_fields_values: null } as KommoLead);
                return (
                  <div key={`rec-list-${rc.key}`} className="space-y-1.5 pt-2 border-t">
                    <p className={`text-xs font-semibold ${rc.textColor} mb-2`}>{rc.label}: {rc.count} leads</p>
                    {rcLeads.slice(0, visibleRecuperacao).map((lead) => (
                      <div key={lead.id} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm hover:bg-muted/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate max-w-[120px] sm:max-w-[180px]">{lead.name || `Lead #${lead.id}`}</span>
                          <Badge className="bg-psi-wine-light text-psi-wine text-[10px]">{IA_TAG}</Badge>
                          <Badge className={`text-[10px] ${rc.bgIcon} ${rc.textColor}`}>{rc.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                          <span>{new Date(lead.updated_at * 1000).toLocaleDateString("pt-BR")}</span>
                          <span className="text-[10px] text-muted-foreground/50">#{lead.id}</span>
                        </div>
                      </div>
                    ))}
                    {visibleRecuperacao < rcLeads.length && (
                      <div className="flex justify-center pt-3">
                        <Button variant="outline" size="sm" onClick={() => setVisibleRecuperacao(prev => prev + 100)}>
                          Ver mais ({Math.min(100, rcLeads.length - visibleRecuperacao)} leads)
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })()}

    </div>
  );
}
