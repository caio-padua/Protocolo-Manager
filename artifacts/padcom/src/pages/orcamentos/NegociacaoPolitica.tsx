import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Handshake, Save } from "lucide-react";
import { BlockTitle } from "@/pages/comunicacao/_shared";
import { apiJson } from "@/lib/api-fetch";

type Politica = {
  descontoExcepcionalAvistaPct: number; descontoExcepcionalParceladoPct: number; entradaMinimaExcecaoPct: number;
  margemLiquidaMinimaPct: number; tributosPct: number; negociacaoCadenciada30minAtiva: boolean; nomeGerenteFinanceiro: string;
};
type Condicao = { forma: string; finalCents: number; entradaCents: number; parcelas: number; parcelaCents: number; ultimaParcelaCents: number; margemBps: number; descontoPct: number };
type Simulacao = { resultado: { decisao: "permitida"; caminho: string; condicoes: Condicao[] } | { decisao: "humano"; motivo: string } };
type Negociacao = { id: number; cliente_nome: string | null; budget_id: number; estado: string; caminho: string; motivo: string | null; criado_em: string; oferta: { condicoes: Condicao[] } };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MOTIVOS: Record<string, string> = {
  sem_custo_confiavel: "Sem custo confiável cadastrado: decisão humana.", margem_abaixo_do_minimo: "Margem abaixo do mínimo: decisão humana.",
  acima_do_teto: "Pedido acima do teto: decisão humana.", sem_receita_liquida: "Sem receita líquida: decisão humana.", orcamento_invalido: "Orçamento inválido.",
};

export function NegociacaoPolitica() {
  const [p, setP] = useState<Politica | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lista, setLista] = useState<Negociacao[]>([]);
  const [sim, setSim] = useState({ total: "10000,00", custo: "3000,00", desconto: "", forma: "" });
  const [simRes, setSimRes] = useState<Simulacao | null>(null);

  const carregar = useCallback(async () => {
    try { setP(await apiJson<Politica>("/budget-politica")); setLista(await apiJson<Negociacao[]>("/negociacoes")); }
    catch (e) { setMsg((e as Error).message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const num = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));
  const cents = (v: string) => Math.round(num(v) * 100);
  const campo = (k: keyof Politica, rotulo: string) => (
    <div key={k}><Label>{rotulo}</Label>
      <Input type="number" step="0.01" value={String(p?.[k] ?? "")} onChange={(e) => p && setP({ ...p, [k]: Number(e.target.value) })} /></div>
  );
  async function salvar() {
    if (!p) return;
    try { setP(await apiJson<Politica>("/budget-politica", { method: "PUT", body: JSON.stringify(p) })); setMsg("Parâmetros salvos."); }
    catch (e) { setMsg((e as Error).message); }
  }
  // Simulador: apenas visualização. O servidor calcula e NÃO grava nada.
  async function simular() {
    try {
      setSimRes(await apiJson<Simulacao>("/budget-politica/simular", { method: "POST", body: JSON.stringify({
        totalCents: cents(sim.total), custoTotalCents: cents(sim.custo),
        descontoPedidoPct: sim.desconto ? num(sim.desconto) : null, forma: sim.forma || null }) }));
      setMsg(null);
    } catch (e) { setMsg((e as Error).message); setSimRes(null); }
  }
  async function decidir(n: Negociacao, aprovar: boolean) {
    try {
      const corpo: Record<string, unknown> = { aprovar };
      if (aprovar && !(n.oferta?.condicoes?.length)) {
        const pct = Number(window.prompt("Desconto aprovado (%)") ?? ""); if (!pct) return;
        corpo.forma = window.prompt("Forma: avista ou parcelado") === "parcelado" ? "parcelado" : "avista"; corpo.descontoPct = pct;
      }
      const r = await apiJson<{ mensagemEnviada: boolean }>(`/negociacoes/${n.id}/decidir`, { method: "POST", body: JSON.stringify(corpo) });
      setMsg(aprovar ? (r.mensagemEnviada ? "Aprovada e mensagem enviada." : "Aprovada; mensagem NÃO enviada (guardas de homologação).") : "Recusada.");
      await carregar();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <Card className="panel-3d" data-testid="negociacao-politica">
      <CardHeader><CardTitle><BlockTitle icon={Handshake}>Negociação Extraordinária (por clínica)</BlockTitle></CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {msg && <p role="status" className="text-sm">{msg}</p>}
        {p && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {campo("descontoExcepcionalAvistaPct", "Desconto excepcional à vista (%)")}
              {campo("descontoExcepcionalParceladoPct", "Desconto excepcional parcelado (%)")}
              {campo("entradaMinimaExcecaoPct", "Entrada mínima na exceção (%)")}
              {campo("margemLiquidaMinimaPct", "Margem líquida mínima (%)")}
              {campo("tributosPct", "Tributos sobre a receita (%)")}
              <div><Label>Nome do gerente financeiro</Label>
                <Input value={p.nomeGerenteFinanceiro} onChange={(e) => setP({ ...p, nomeGerenteFinanceiro: e.target.value })} /></div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={p.negociacaoCadenciada30minAtiva} onCheckedChange={(v) => setP({ ...p, negociacaoCadenciada30minAtiva: v })} />
              <Label>Negociação cadenciada de 30 minutos (envios automáticos nos minutos 0, 10, 20 e 30)</Label>
            </div>
            <p className="text-xs text-muted-foreground">Sem custo cadastrado no catálogo, ou margem abaixo do mínimo, nada é concedido automaticamente: vai para decisão humana.</p>
            <Button className="btn-3d" onClick={salvar}><Save className="h-4 w-4 mr-2" />Salvar parâmetros</Button>
          </>
        )}

        <div className="panel-3d-sub p-4 space-y-3" data-testid="simulador-negociacao">
          <h3 className="font-semibold">Simulador (somente visualização, nada é gravado)</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <div><Label>Valor do orçamento (R$)</Label><Input value={sim.total} onChange={(e) => setSim({ ...sim, total: e.target.value })} /></div>
            <div><Label>Custo total (R$)</Label><Input value={sim.custo} onChange={(e) => setSim({ ...sim, custo: e.target.value })} /></div>
            <div><Label>Desconto pedido (%)</Label><Input value={sim.desconto} onChange={(e) => setSim({ ...sim, desconto: e.target.value })} /></div>
            <div><Label>Forma</Label>
              <select className="h-9 w-full rounded-md border bg-background px-2" value={sim.forma} onChange={(e) => setSim({ ...sim, forma: e.target.value })}>
                <option value="">Avaliar as duas</option><option value="avista">À vista</option><option value="parcelado">Parcelado</option>
              </select></div>
          </div>
          <Button variant="outline" className="btn-3d-soft" onClick={simular}>Simular</Button>
          {simRes && (simRes.resultado.decisao === "humano"
            ? <p className="text-sm font-medium">{MOTIVOS[simRes.resultado.motivo] ?? simRes.resultado.motivo}</p>
            : <div className="text-sm space-y-1">
                <p className="font-medium">{simRes.resultado.caminho === "A_automatico" ? "Pode seguir automático (cadência ligada)." : "Permitido, mas exige aprovação humana (cadência desligada)."}</p>
                {simRes.resultado.condicoes.map((c) => (
                  <p key={c.forma}>{c.forma === "avista" ? "À vista" : "Parcelado"}: total {brl(c.finalCents)} ({c.descontoPct}%)
                    {c.forma === "parcelado" && `, entrada ${brl(c.entradaCents)}, ${c.parcelas}x de ${brl(c.parcelaCents)} (última ${brl(c.ultimaParcelaCents)})`}; margem {(c.margemBps / 100).toLocaleString("pt-BR")}%</p>
                ))}
              </div>)}
        </div>

        <div data-testid="fila-negociacoes">
          <h3 className="font-semibold mb-2">Negociações</h3>
          {lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma negociação registrada.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/60 text-left"><th className="p-2">Cliente</th><th className="p-2">Orçamento</th><th className="p-2">Caminho</th><th className="p-2">Estado</th><th className="p-2">Ação</th></tr></thead>
              <tbody>{lista.map((n) => (
                <tr key={n.id} className="border-t">
                  <td className="p-2">{n.cliente_nome ?? "—"}</td><td className="p-2">#{n.budget_id}</td>
                  <td className="p-2">{n.caminho === "A_automatico" ? "Automático" : "Humano"}</td><td className="p-2">{n.estado}</td>
                  <td className="p-2 space-x-2">{n.estado === "aguardando_gerente" && <>
                    <Button size="sm" onClick={() => decidir(n, true)}>Aprovar</Button>
                    <Button size="sm" variant="outline" onClick={() => decidir(n, false)}>Recusar</Button></>}</td>
                </tr>))}</tbody>
            </table>)}
        </div>
      </CardContent>
    </Card>
  );
}
