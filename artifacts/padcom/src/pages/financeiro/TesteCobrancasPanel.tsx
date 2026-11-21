import { useCallback, useEffect, useState } from "react";
import { FlaskConical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { collabAuthHeaders } from "@/lib/collab-auth";
import CobrancaTesteCard, { type CobrancaTeste } from "./CobrancaTesteCard";

const apiBase = import.meta.env.VITE_API_URL || `${import.meta.env.BASE_URL}api`;

interface Resumo { cobrancas: number; totalCentavos: number; maxCobrancas: number; maxTotalCentavos: number; maxCentavosPorCobranca: number }
type Item = CobrancaTeste;

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function TesteCobrancasPanel({ onChanged }: { onChanged: () => void }) {
  const [visivel, setVisivel] = useState(true);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [valor, setValor] = useState("5,00");
  const [tipo, setTipo] = useState("PIX");
  const [descricao, setDescricao] = useState("Teste de conciliacao");
  const [dias, setDias] = useState("1");
  const [confirmo, setConfirmo] = useState(false);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const aplicar = (d: { resumo: Resumo; itens?: Item[] }) => { setResumo(d.resumo); if (d.itens) setItens(d.itens); };

  const carregar = useCallback(async () => {
    const r = await fetch(`${apiBase}/asaas/teste-cobrancas`, { headers: collabAuthHeaders() });
    if (r.status === 401 || r.status === 403) { setVisivel(false); return; }
    if (r.ok) aplicar(await r.json());
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!visivel) return null;

  const centavos = Math.round(parseFloat(valor.replace(",", ".")) * 100);

  async function criar() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${apiBase}/asaas/teste-cobrancas`, {
        method: "POST", headers: collabAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ clientId, valorCentavos: centavos, tipo, descricao, diasVencimento: Number(dias), confirmo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, texto: d.error || `Erro ${r.status}` });
      else { setMsg({ ok: true, texto: `Cobranca ${d.asaasChargeId} criada (${brl(d.valorCentavos)}).` }); setConfirmo(false); }
      await carregar(); onChanged();
    } finally { setBusy(false); }
  }

  async function sincronizar() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`${apiBase}/asaas/teste-cobrancas/sincronizar`, { method: "POST", headers: collabAuthHeaders() });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { aplicar(d); setMsg({ ok: d.falhas === 0, texto: `${d.consultadas} consultadas no Asaas, ${d.falhas} falhas.` }); onChanged(); }
      else setMsg({ ok: false, texto: d.error || `Erro ${r.status}` });
    } finally { setBusy(false); }
  }

  async function enviarLink(id: number) {
    setEnviando(id); setMsg(null);
    try {
      const r = await fetch(`${apiBase}/asaas/teste-cobrancas/${id}/enviar-link`, { method: "POST", headers: collabAuthHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, texto: d.error || `Erro ${r.status}` }); return; }
      if (d.itens) setItens(d.itens);
      setMsg({ ok: d.email !== "recusado" && d.telegram !== "recusado", texto: `E-mail: ${d.email}. Telegram: ${d.telegram}. "aceito" significa aceito pelo provedor, nao recebido.` });
    } finally { setEnviando(null); }
  }

  const podeCriar = !busy && clientId != null && centavos >= 1 && centavos <= (resumo?.maxCentavosPorCobranca ?? 500) && confirmo && descricao.trim().length > 0;

  return (
    <section className="panel-3d p-5 space-y-4">
      <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5">
        <FlaskConical className="w-4 h-4 text-primary" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Laboratorio de cobrancas de teste (PRODUCAO)</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Cria cobrancas REAIS de ate {resumo ? brl(resumo.maxCentavosPorCobranca) : "R$ 5,00"}. Usadas {resumo?.cobrancas ?? 0} de {resumo?.maxCobrancas ?? 10};
        total {brl(resumo?.totalCentavos ?? 0)} de {brl(resumo?.maxTotalCentavos ?? 5000)}. Os limites sao aplicados no servidor.
        Use o seu proprio cadastro: o Asaas pode avisar o cliente da cobranca por e-mail ou mensagem.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
        <div className="lg:col-span-2">
          <label className="text-[11px] uppercase text-muted-foreground">Cliente</label>
          <PaxterClientSelector serverSearch value={clientId} onChange={setClientId} />
        </div>
        <div>
          <label className="text-[11px] uppercase text-muted-foreground">Valor (R$, max {brl(resumo?.maxCentavosPorCobranca ?? 500)})</label>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label className="text-[11px] uppercase text-muted-foreground">Forma</label>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="PIX">PIX</option><option value="BOLETO">Boleto</option><option value="UNDEFINED">Cliente escolhe</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase text-muted-foreground">Vence em (dias, 1 a 30)</label>
          <Input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" />
        </div>
        <div className="sm:col-span-2 lg:col-span-5">
          <label className="text-[11px] uppercase text-muted-foreground">Descricao</label>
          <Input value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
        Confirmo que esta cobranca e REAL, em producao, e de valor de teste.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button className="btn-3d" disabled={!podeCriar} onClick={criar}>Criar cobranca de teste</Button>
        <Button variant="outline" className="btn-3d-soft" disabled={busy} onClick={sincronizar}>
          <RefreshCw className={`w-4 h-4 mr-2 ${busy ? "animate-spin" : ""}`} />Sincronizar com o Asaas
        </Button>
      </div>
      {msg && <p className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.texto}</p>}
      {itens.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {itens.map((i) => <CobrancaTesteCard key={i.id} i={i} enviando={enviando === i.id} onEnviarLink={enviarLink} />)}
        </div>
      )}
    </section>
  );
}
