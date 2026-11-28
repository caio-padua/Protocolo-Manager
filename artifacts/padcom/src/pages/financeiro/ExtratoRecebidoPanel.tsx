import { useCallback, useEffect, useState } from "react";
import { Landmark, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { collabAuthHeaders } from "@/lib/collab-auth";

const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

interface Linha {
  chargeId: string; rotulo: string | null; tabela: string | null; localId: number | null; statusAsaas: string;
  brutoCentavos: number; liquidoApiCentavos: number | null; extratoTaxasCentavos: number | null;
  extratoLiquidoCentavos: number | null; dataPagamento: string | null; dataCredito: string | null;
  causa: string | null; situacao: string; liquidoApiDivergeDoExtrato: boolean;
}
type Totais = Record<string, number>;

const brl = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

const SITUACAO: Record<string, string> = {
  em_aberto: "Em aberto", vencida: "Vencida", paga_sem_lancamento: "Paga, ainda sem lançamento no extrato",
  recebida_no_extrato: "Recebida no extrato", estornada: "Estornada", removida: "Removida",
};
const CAUSA: Record<string, string> = {
  conciliado: "Conciliado", divergencia_genuina: "Asaas pago, sistema não", valor_diverge: "Valor diferente",
  sem_vinculo: "Sem vínculo no sistema", mapeamento_status: "Só rótulo de status", fluxo_proprio: "Pedido Concierge (fluxo próprio)",
  estorno_ou_cancelada: "Estornada ou cancelada", local_pago_sem_prova: "Sistema pago, Asaas não confirma",
  local_cancelado_asaas_pago: "Sistema cancelou, Asaas recebeu",
};

export default function ExtratoRecebidoPanel({ onChanged }: { onChanged: () => void }) {
  const [visivel, setVisivel] = useState(true);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [totais, setTotais] = useState<Totais>({});
  const [busy, setBusy] = useState(false);
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const receber = (d: { linhas?: Linha[]; totais?: Totais }) => { if (d.linhas) setLinhas(d.linhas); if (d.totais) setTotais(d.totais); };

  const carregar = useCallback(async () => {
    const r = await fetch(`${apiBase}/asaas/conciliacao/extrato`, { headers: collabAuthHeaders() });
    if (r.status === 401 || r.status === 403) { setVisivel(false); return; }
    if (r.ok) receber(await r.json());
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!visivel) return null;

  async function auditar() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${apiBase}/asaas/conciliacao/auditar`, { method: "POST", headers: collabAuthHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, texto: d.error || `Erro ${r.status}` }); return; }
      receber(d);
      setMsg({ ok: d.falhas.length === 0, texto: `${d.consultadas} cobranças consultadas no Asaas (somente leitura), ${d.falhas.length} falhas. Nenhum status foi alterado.` });
    } finally { setBusy(false); }
  }

  async function aplicar(l: Linha) {
    const texto = `Marcar como PAGO no sistema a cobrança ${l.chargeId} (${l.rotulo ?? "sem nome"}, ${brl(l.brutoCentavos)})? O sistema consultará o Asaas de novo e só aplica se o pagamento estiver comprovado.`;
    if (!window.confirm(texto)) return;
    setAplicando(l.chargeId); setMsg(null);
    try {
      const r = await fetch(`${apiBase}/asaas/conciliacao/cobranca/${l.chargeId}/aplicar`, {
        method: "POST", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ confirmo: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, texto: d.error || `Erro ${r.status}` });
      else setMsg({ ok: d.acao === "aplicada", texto: d.acao === "aplicada" ? `Cobrança ${l.chargeId} marcada como paga.` : `Nada alterado: ${d.motivo ?? "sem prova suficiente"}.` });
      await carregar(); onChanged();
    } finally { setAplicando(null); }
  }

  const kpis: Array<[string, string]> = [
    ["Cobrado (bruto)", brl(totais.cobradoCentavos ?? 0)],
    ["Em aberto", brl(totais.emAbertoCentavos ?? 0)],
    ["Recebido no extrato (bruto)", brl(totais.recebidoNoExtratoBrutoCentavos ?? 0)],
    ["Taxas no extrato", brl(totais.taxasNoExtratoCentavos ?? 0)],
    ["Líquido efetivo", brl(totais.liquidoEfetivoNoExtratoCentavos ?? 0)],
    ["Líquido prometido pela API", brl(totais.liquidoPrometidoPelaApiCentavos ?? 0)],
  ];

  return (
    <section className="panel-3d p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5">
          <Landmark className="w-4 h-4 text-primary" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Extrato efetivamente recebido</span>
        </div>
        <Button variant="outline" className="btn-3d-soft shrink-0" onClick={auditar} disabled={busy}>
          <RefreshCw className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`} /> Auditar agora
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Cobrança paga no Asaas não é dinheiro na conta até existir lançamento no extrato. Aqui o valor recebido, as taxas
        (Pix e mensageria) e o líquido vêm do extrato real, separados do que foi cobrado.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {kpis.map(([k, v]) => (
          <div key={k} className="screen-3d p-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{k}</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {msg ? <p role="status" className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{msg.texto}</p> : null}

      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum retrato financeiro ainda. Clique em "Auditar agora" para consultar o Asaas.</p>
      ) : (
        <div className="space-y-2">
          <div className="hidden lg:grid grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_0.9fr_1.3fr_auto] gap-2 px-3 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <span>Cobrança</span><span className="text-right">Bruto</span><span className="text-right">Taxas</span>
            <span className="text-right">Líquido efetivo</span><span>Crédito</span><span>Situação / causa</span><span className="text-right">Ação</span>
          </div>
          {linhas.map((l) => (
            <div key={l.chargeId} className="panel-3d-sub p-3 grid grid-cols-2 lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_0.9fr_1.3fr_auto] gap-2 items-center text-sm">
              <div className="col-span-2 lg:col-span-1 min-w-0">
                <div className="font-medium truncate">{l.rotulo ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground truncate">{l.chargeId} · pago {dataBR(l.dataPagamento)}</div>
              </div>
              <div className="text-right tabular-nums">{brl(l.brutoCentavos)}</div>
              <div className="text-right tabular-nums">{brl(l.extratoTaxasCentavos)}</div>
              <div className="text-right tabular-nums">
                {brl(l.extratoLiquidoCentavos)}
                {l.liquidoApiDivergeDoExtrato ? <div className="text-[10px] text-amber-600 dark:text-amber-400">API dizia {brl(l.liquidoApiCentavos)}</div> : null}
              </div>
              <div className="tabular-nums">{dataBR(l.dataCredito)}</div>
              <div className="text-[12px]">
                <div className="font-semibold">{SITUACAO[l.situacao] ?? l.situacao}</div>
                <div className="text-muted-foreground">{CAUSA[l.causa ?? ""] ?? l.causa ?? "—"}</div>
              </div>
              <div className="col-span-2 lg:col-span-1 flex justify-end">
                {l.causa === "divergencia_genuina" && l.tabela === "payments" ? (
                  <Button size="sm" variant="outline" className="btn-3d-soft" disabled={aplicando === l.chargeId} onClick={() => void aplicar(l)}>
                    <ShieldCheck className="w-4 h-4 mr-1" /> Marcar pago
                  </Button>
                ) : <span className="text-muted-foreground">—</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
