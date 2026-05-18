import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, RefreshCw, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchLeads, fetchPipelines } from "@/lib/kommo-api";
import { isConnected } from "@/lib/kommo-storage";
import type { KommoLead } from "@/types/kommo";

// ── Funil principal ─────────────────────────────────────────────
const PIPELINE_ID = 11048703;

const FUNIL_STAGES: { id: number; label: string }[] = [
  { id: 84757263, label: "Tentativas" },
  { id: 86451807, label: "Em qualificação [IA]" },
  { id: 84757267, label: "Qualificado / agendar" },
  { id: 84757271, label: "Reunião Marcada" },
  { id: 84757275, label: "Reunião Realizada / FUP" },
  { id: 84757283, label: "Dúvidas / Fechamento" },
  { id: 84820679, label: "Aguardando Assinatura" },
  { id: 142, label: "Venda ganha" },
];
const STATUS_PERDIDO = 143;
const STATUS_GANHO = 142;
const STATUS_REUNIAO_MARCADA = 84757271;

const FIELD = {
  STATUS_REUNIAO: 993021,
  CLOSER: 979464,
  MRR: 933652,
  IMPLEMENTACAO: 979860,
  ENTRADA: 938535,
  ORIGEM: 934892,
  NO_SHOW: 980662,
};

type Periodo = "hoje" | "7d" | "30d" | "todos";

// ── Helpers ─────────────────────────────────────────────────────
function fieldValue(lead: KommoLead, fieldId: number): string | null {
  const f = lead.custom_fields_values?.find((c) => c.field_id === fieldId);
  if (!f || !f.values?.length) return null;
  const v = String(f.values[0].value ?? "").trim();
  return v && v.toLowerCase() !== "selecione" ? v : null;
}
function fieldNumber(lead: KommoLead, fieldId: number): number {
  const v = fieldValue(lead, fieldId);
  if (!v) return 0;
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
function fmtPct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

// ── UI atoms ────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`sr-card ${className}`}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="sr-label">{children}</div>;
}
function Kpi({ value, sub }: { value: string | number; sub?: string }) {
  return (
    <div>
      <div className="sr-kpi">{value}</div>
      {sub && <div className="text-sm mt-1" style={{ color: "rgba(248,249,250,0.70)" }}>{sub}</div>}
    </div>
  );
}

export default function Vendas() {
  const navigate = useNavigate();
  const connected = isConnected();
  const [periodo, setPeriodo] = useState<Periodo>("todos");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["vendas-data"],
    queryFn: async () => {
      const [leads, pipelines] = await Promise.all([fetchLeads({ pipeline_id: 11048703 }), fetchPipelines()]);
      return { leads, pipelines };
    },
    enabled: connected,
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });

  // ── Filtro por created_at ──
  const leads = useMemo(() => {
    if (!data) return [] as KommoLead[];
    const all = data.leads.filter((l) => l.pipeline_id === PIPELINE_ID);
    if (periodo === "todos") return all;
    const now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const cutoff = (() => {
      switch (periodo) {
        case "hoje":
          return t0;
        case "7d":
          return t0 - 7 * 86400000;
        case "30d":
          return t0 - 30 * 86400000;
        default:
          return 0;
      }
    })();
    return all.filter((l) => l.created_at * 1000 >= cutoff);
  }, [data, periodo]);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Zap className="w-10 h-10 text-primary" />
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
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p style={{ color: "rgba(248,249,250,0.70)" }}>Carregando dados de vendas...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="w-10 h-10 text-primary" />
        <p className="text-sm" style={{ color: "rgba(248,249,250,0.70)" }}>
          {error instanceof Error ? error.message : "Erro"}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
        </Button>
      </div>
    );
  }

  // ── Bloco 1 — Funil ──
  const funil = FUNIL_STAGES.map((s) => {
    const stageLeads = leads.filter((l) => l.status_id === s.id);
    return {
      ...s,
      count: stageLeads.length,
      value: stageLeads.reduce((sum, l) => sum + (l.price || 0), 0),
    };
  });
  const perdidos = leads.filter((l) => l.status_id === STATUS_PERDIDO);
  const perdidosCount = perdidos.length;
  const perdidosValue = perdidos.reduce((s, l) => s + (l.price || 0), 0);

  // ── Bloco 2 — Reuniões ──
  const reunioesMarcadas = leads.filter((l) => l.status_id === STATUS_REUNIAO_MARCADA).length;
  const reunioesRealizadas = leads.filter(
    (l) => (fieldValue(l, FIELD.STATUS_REUNIAO) || "").toLowerCase() === "realizada"
  ).length;
  const noShows = leads.filter(
    (l) => (fieldValue(l, FIELD.STATUS_REUNIAO) || "").toLowerCase() === "no-show"
  ).length;
  const taxaShow = reunioesMarcadas > 0 ? reunioesRealizadas / reunioesMarcadas : 0;

  const closersAlvo = ["João", "Isabelle"];
  const tabelaClosers = closersAlvo.map((nome) => {
    const meus = leads.filter((l) => {
      const c = (fieldValue(l, FIELD.CLOSER) || "").toLowerCase();
      return c.includes(nome.toLowerCase());
    });
    const realizadas = meus.filter(
      (l) => (fieldValue(l, FIELD.STATUS_REUNIAO) || "").toLowerCase() === "realizada"
    ).length;
    const ns = meus.filter(
      (l) => (fieldValue(l, FIELD.STATUS_REUNIAO) || "").toLowerCase() === "no-show"
    ).length;
    const fechados = meus.filter((l) => l.status_id === STATUS_GANHO);
    const receita = fechados.reduce(
      (s, l) => s + (l.price || 0) + fieldNumber(l, FIELD.MRR) + fieldNumber(l, FIELD.IMPLEMENTACAO) + fieldNumber(l, FIELD.ENTRADA),
      0
    );
    return {
      nome,
      realizadas,
      noShows: ns,
      taxa: realizadas + ns > 0 ? realizadas / (realizadas + ns) : 0,
      fechados: fechados.length,
      receita,
    };
  });

  // ── Bloco 3 — Origem ──
  const origensMap = new Map<string, { total: number; fechados: number; valor: number }>();
  for (const l of leads) {
    const o = fieldValue(l, FIELD.ORIGEM) || "Sem origem";
    const cur = origensMap.get(o) || { total: 0, fechados: 0, valor: 0 };
    cur.total++;
    if (l.status_id === STATUS_GANHO) {
      cur.fechados++;
      cur.valor += (l.price || 0) + fieldNumber(l, FIELD.MRR);
    }
    origensMap.set(o, cur);
  }
  const origens = Array.from(origensMap.entries())
    .map(([nome, v]) => ({
      nome,
      ...v,
      taxa: v.total > 0 ? v.fechados / v.total : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  // ── Bloco 4 — Performance por closer ──
  const perfClosers = closersAlvo.map((nome) => {
    const meus = leads.filter((l) =>
      (fieldValue(l, FIELD.CLOSER) || "").toLowerCase().includes(nome.toLowerCase())
    );
    const realizadas = meus.filter(
      (l) => (fieldValue(l, FIELD.STATUS_REUNIAO) || "").toLowerCase() === "realizada"
    ).length;
    const fechados = meus.filter((l) => l.status_id === STATUS_GANHO);
    const mrr = fechados.reduce((s, l) => s + fieldNumber(l, FIELD.MRR), 0);
    const pontual = fechados.reduce(
      (s, l) => s + fieldNumber(l, FIELD.IMPLEMENTACAO) + fieldNumber(l, FIELD.ENTRADA),
      0
    );
    return {
      nome,
      realizadas,
      fechados: fechados.length,
      mrr,
      pontual,
      receita: mrr + pontual + fechados.reduce((s, l) => s + (l.price || 0), 0),
    };
  });

  // ── Bloco 5 — Leads parados sem tarefa ──
  const nowSec = Date.now() / 1000;
  const isAtivoSemTarefa = (l: KommoLead) =>
    l.status_id !== STATUS_GANHO &&
    l.status_id !== STATUS_PERDIDO &&
    (!l.closest_task_at || l.closest_task_at < nowSec);

  const paradoPontual = leads.filter(
    (l) =>
      isAtivoSemTarefa(l) &&
      (fieldNumber(l, FIELD.IMPLEMENTACAO) > 0 || fieldNumber(l, FIELD.ENTRADA) > 0)
  );
  const paradoMRR = leads.filter(
    (l) => isAtivoSemTarefa(l) && fieldNumber(l, FIELD.MRR) > 0
  );

  const paradoPontualValor = paradoPontual.reduce(
    (s, l) => s + fieldNumber(l, FIELD.IMPLEMENTACAO) + fieldNumber(l, FIELD.ENTRADA),
    0
  );
  const paradoMRRValor = paradoMRR.reduce((s, l) => s + fieldNumber(l, FIELD.MRR), 0);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Header + filtro */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(248,249,250,0.50)" }}>
            Funil principal — {leads.length} leads no período
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["hoje", "7d", "30d", "todos"] as Periodo[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors"
              style={{
                borderRadius: "4px",
                background: periodo === p ? "hsl(var(--primary))" : "transparent",
                color: periodo === p ? "#fff" : "rgba(248,249,250,0.70)",
                border: "1px solid rgba(248,249,250,0.14)",
              }}
            >
              {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Todos"}
            </button>
          ))}
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            disabled={isFetching}
            className="ml-2"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Bloco 1: Funil ── */}
      <section className="space-y-3">
        <Label>Funil de conversão</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {funil.map((s, i) => {
            const next = funil[i + 1];
            const taxa = next && s.count > 0 ? next.count / s.count : null;
            return (
              <div key={s.id} className="relative">
                <Card className="!p-4 h-full">
                  <div className="sr-label !text-[10px]">{s.label}</div>
                  <div className="text-2xl font-bold mt-2">{s.count}</div>
                  <div className="text-xs mt-1" style={{ color: "rgba(248,249,250,0.70)" }}>
                    {fmtBRL(s.value)}
                  </div>
                </Card>
                {taxa !== null && (
                  <div
                    className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 text-[10px] z-10 px-1"
                    style={{
                      color: "rgba(248,249,250,0.50)",
                      background: "hsl(var(--background))",
                    }}
                  >
                    → {fmtPct(taxa)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Card className="!p-4" >
          <div className="flex items-center justify-between">
            <div>
              <div className="sr-label !text-[10px]" style={{ color: "#E31937" }}>
                Leads perdidos
              </div>
              <div className="text-2xl font-bold mt-2" style={{ color: "#E31937" }}>
                {perdidosCount}
              </div>
            </div>
            <div className="text-sm" style={{ color: "rgba(248,249,250,0.70)" }}>
              {fmtBRL(perdidosValue)}
            </div>
          </div>
        </Card>
      </section>

      {/* ── Bloco 2: Reuniões ── */}
      <section className="space-y-3">
        <Label>Reuniões</Label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><Label>Marcadas</Label><div className="sr-kpi mt-2">{reunioesMarcadas}</div></Card>
          <Card><Label>Realizadas</Label><div className="sr-kpi mt-2">{reunioesRealizadas}</div></Card>
          <Card><Label>No-shows</Label><div className="sr-kpi mt-2" style={{ color: "#E31937" }}>{noShows}</div></Card>
          <Card><Label>Taxa de show</Label><div className="sr-kpi mt-2 sr-positive">{fmtPct(taxaShow)}</div></Card>
        </div>

        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(248,249,250,0.08)" }}>
                <th className="text-left p-4 sr-label">Closer</th>
                <th className="text-right p-4 sr-label">Realizadas</th>
                <th className="text-right p-4 sr-label">No-shows</th>
                <th className="text-right p-4 sr-label">Taxa show</th>
                <th className="text-right p-4 sr-label">Fechados</th>
                <th className="text-right p-4 sr-label">Receita</th>
              </tr>
            </thead>
            <tbody>
              {tabelaClosers.map((c, idx) => (
                <tr
                  key={c.nome}
                  style={{
                    borderTop: idx === 0 ? "none" : "1px solid rgba(248,249,250,0.08)",
                  }}
                >
                  <td className="p-4 font-medium">{c.nome}</td>
                  <td className="p-4 text-right">{c.realizadas}</td>
                  <td className="p-4 text-right" style={{ color: c.noShows > 0 ? "#E31937" : undefined }}>
                    {c.noShows}
                  </td>
                  <td className="p-4 text-right sr-positive">{fmtPct(c.taxa)}</td>
                  <td className="p-4 text-right">{c.fechados}</td>
                  <td className="p-4 text-right font-medium">{fmtBRL(c.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ── Bloco 3: Fonte × Resultado ── */}
      <section className="space-y-3">
        <Label>Fonte × Resultado</Label>
        <Card className="!p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(248,249,250,0.08)" }}>
                <th className="text-left p-4 sr-label">Origem</th>
                <th className="text-right p-4 sr-label">Leads</th>
                <th className="text-right p-4 sr-label">Fechados</th>
                <th className="text-right p-4 sr-label">Taxa</th>
                <th className="text-right p-4 sr-label">Valor fechado</th>
              </tr>
            </thead>
            <tbody>
              {origens.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center" style={{ color: "rgba(248,249,250,0.50)" }}>Sem dados</td></tr>
              )}
              {origens.map((o, idx) => (
                <tr
                  key={o.nome}
                  style={{
                    borderTop: idx === 0 ? "none" : "1px solid rgba(248,249,250,0.08)",
                  }}
                >
                  <td className="p-4 font-medium">{o.nome}</td>
                  <td className="p-4 text-right">{o.total}</td>
                  <td className="p-4 text-right">{o.fechados}</td>
                  <td className="p-4 text-right sr-positive">{fmtPct(o.taxa)}</td>
                  <td className="p-4 text-right font-medium">{fmtBRL(o.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* ── Bloco 4: Performance por Closer ── */}
      <section className="space-y-3">
        <Label>Performance por closer</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {perfClosers.map((c) => (
            <Card key={c.nome}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg font-bold">{c.nome}</h3>
                <span className="sr-label !text-[10px]">Receita total</span>
              </div>
              <div className="sr-kpi mt-2">{fmtBRL(c.receita)}</div>
              <div className="grid grid-cols-2 gap-4 mt-5 pt-5" style={{ borderTop: "1px solid rgba(248,249,250,0.08)" }}>
                <div><Label>Reuniões realizadas</Label><div className="text-xl font-bold mt-1">{c.realizadas}</div></div>
                <div><Label>Fechamentos</Label><div className="text-xl font-bold mt-1">{c.fechados}</div></div>
                <div><Label>MRR gerado</Label><div className="text-base font-medium mt-1">{fmtBRL(c.mrr)}</div></div>
                <div><Label>Venda pontual</Label><div className="text-base font-medium mt-1">{fmtBRL(c.pontual)}</div></div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Bloco 5: Leads parados sem tarefa ── */}
      <section className="space-y-3">
        <Label>Leads parados sem tarefa</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <Label>Venda pontual parada</Label>
            <div className="sr-kpi mt-2">{paradoPontual.length}</div>
            <div className="text-sm mt-1" style={{ color: "rgba(248,249,250,0.70)" }}>
              {fmtBRL(paradoPontualValor)}
            </div>
            <div className="text-xs mt-3" style={{ color: "rgba(248,249,250,0.50)" }}>
              Implementação + Entrada, sem tarefa ativa
            </div>
          </Card>
          <Card>
            <Label>MRR parado</Label>
            <div className="sr-kpi mt-2">{paradoMRR.length}</div>
            <div className="text-sm mt-1" style={{ color: "rgba(248,249,250,0.70)" }}>
              {fmtBRL(paradoMRRValor)}
            </div>
            <div className="text-xs mt-3" style={{ color: "rgba(248,249,250,0.50)" }}>
              Recorrência (MRR), sem tarefa ativa
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
