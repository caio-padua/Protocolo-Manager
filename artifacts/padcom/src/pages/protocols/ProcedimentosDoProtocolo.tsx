import { useState } from "react";
import * as ApiClient from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { MarcadorVinculo } from "@/components/MarcadorVinculo";
import { Stethoscope } from "lucide-react";

type EquipeItem = { ordem: number; categoryId: number; categoryName: string; alternativeCategoryIds?: number[]; alternativeCategoryNames?: string[]; locationId: number | null; professionalIds: number[] };
type Participante = { categoria: string; alternativa: string };
type Ocorrencia = { id: number; numero: number; date: string; time: string; participantes: { ordem: number; resourceId: number; professionalId: number | null }[] };
type Item = {
  id: number; procedimentoId: number; nome: string; totalSessoes: number; intervaloDias: number; duracaoSegundos: number;
  equipeOrigem: "padrao_procedimento" | "prescritor"; equipe: EquipeItem[]; ocorrencias: Ocorrencia[];
};
type Horario = { time: string; participantes: { ordem: number; resourceId: number; agenda: string }[] };

const base = import.meta.env.BASE_URL;
async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${base}api${url}`, {
    ...init, headers: collabAuthHeaders({ "Content-Type": "application/json" }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((body as { error?: string }).error ?? "Não foi possível concluir.");
  return body as T;
}
const hoje = () => new Date().toISOString().slice(0, 10);

export function ProcedimentosDoProtocolo({ protocolId }: { protocolId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const chave = ["protocolo-procedimentos", protocolId];
  const lista = useQuery({ queryKey: chave, queryFn: () => chamar<{ itens: Item[] }>(`/protocols/${protocolId}/procedimentos`), retry: false });
  const procedimentos = ApiClient.useListProcedimentos({ request: { headers: collabAuthHeaders() } });
  const categorias = ApiClient.useListProfessionalAreas();
  const [procedimentoId, setProcedimentoId] = useState("");
  const [totalSessoes, setTotalSessoes] = useState(1);
  const [alterarEquipe, setAlterarEquipe] = useState(false);
  const [equipe, setEquipe] = useState<Participante[]>([{ categoria: "", alternativa: "" }]);
  const [busca, setBusca] = useState<Record<number, { from: string; to: string; horarios?: { date: string; horarios: Horario[] }[] }>>({});
  const [ocupado, setOcupado] = useState(false);

  const erro = (titulo: string) => (e: unknown) =>
    toast({ title: titulo, description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" });

  async function incluir() {
    if (!procedimentoId) return;
    setOcupado(true);
    try {
      await chamar(`/protocols/${protocolId}/procedimentos`, {
        method: "POST",
        body: JSON.stringify({
          procedimentoId: Number(procedimentoId), totalSessoes,
          ...(alterarEquipe ? { equipe: equipe.filter((p) => p.categoria).map((p) => ({
            categoryId: Number(p.categoria),
            ...(p.alternativa && p.alternativa !== p.categoria ? { alternativeCategoryIds: [Number(p.alternativa)] } : {}),
          })) } : {}),
        }),
      });
      toast({ title: "Procedimento incluído no protocolo" });
      setProcedimentoId("");
      setAlterarEquipe(false);
      await qc.invalidateQueries({ queryKey: chave });
    } catch (e) { erro("Procedimento não incluído")(e); } finally { setOcupado(false); }
  }
  async function buscar(item: Item) {
    const periodo = busca[item.id] ?? { from: hoje(), to: hoje() };
    setOcupado(true);
    try {
      const r = await chamar<{ dias: { date: string; horarios: Horario[] }[] }>(
        `/protocols/${protocolId}/procedimentos/${item.id}/horarios`,
        { method: "POST", body: JSON.stringify({ from: periodo.from, to: periodo.to }) });
      setBusca((b) => ({ ...b, [item.id]: { ...periodo, horarios: r.dias } }));
    } catch (e) { erro("Busca recusada")(e); } finally { setOcupado(false); }
  }
  async function reservar(item: Item, date: string, time: string) {
    const usados = new Set(item.ocorrencias.map((o) => o.numero));
    const numero = Array.from({ length: item.totalSessoes }, (_, i) => i + 1).find((n) => !usados.has(n));
    if (!numero) { toast({ title: "Todas as ocorrências já estão reservadas", variant: "destructive" }); return; }
    setOcupado(true);
    try {
      await chamar(`/protocols/${protocolId}/procedimentos/${item.id}/reservar`, { method: "POST", body: JSON.stringify({ numero, date, time }) });
      toast({ title: `Ocorrência ${numero} reservada`, description: "Todas as agendas da equipe foram reservadas. O envio ao Google Agenda ainda é pendente." });
      await qc.invalidateQueries({ queryKey: chave });
      await buscar(item);
    } catch (e) { erro("Reserva recusada")(e); await buscar(item); } finally { setOcupado(false); }
  }

  const ativos = (procedimentos.data?.procedimentos ?? []).filter((p) => p.ativo);
  const indisponivel = lista.isError;

  return (
    <Card className="panel-3d" data-testid="card-protocolo-procedimentos">
      <CardHeader>
        <CardTitle className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm font-bold uppercase tracking-wider">
          <Stethoscope className="h-4 w-4 text-primary" /> Procedimentos e equipe
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {indisponivel && (
          <p role="alert" className="text-sm text-amber-700">
            {lista.error instanceof Error ? lista.error.message : "Indisponível."}
          </p>
        )}
        {!indisponivel && (
          <>
            <div className="panel-3d-sub space-y-2 p-3">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Procedimento<MarcadorVinculo codigo="D1" />
              </Label>
              <select className="field-engraved min-h-10 w-full px-2" value={procedimentoId} onChange={(e) => setProcedimentoId(e.target.value)}>
                <option value="">Selecione um procedimento cadastrado</option>
                {ativos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">Consulta sem produto nem dose é válida. A equipe padrão vem do procedimento da clínica.</p>
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Ocorrências</Label>
              <Input type="number" min={1} max={365} className="field-engraved w-28" value={totalSessoes}
                onChange={(e) => setTotalSessoes(Math.max(1, Number(e.target.value) || 1))} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={alterarEquipe} onChange={(e) => setAlterarEquipe(e.target.checked)} />
                Alterar a equipe neste protocolo (até 3 participantes)
              </label>
              {alterarEquipe && (
                <div className="space-y-2">
                  {equipe.map((p, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <select className="field-engraved min-h-10 flex-1 px-2" value={p.categoria} aria-label={`Categoria do participante ${i + 1}`}
                        onChange={(e) => setEquipe((l) => l.map((v, j) => (j === i ? { ...v, categoria: e.target.value } : v)))}>
                        <option value="">Categoria profissional</option>
                        {(categorias.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <select className="field-engraved min-h-10 flex-1 px-2" value={p.alternativa} aria-label={`Ou também, participante ${i + 1}`}
                        onChange={(e) => setEquipe((l) => l.map((v, j) => (j === i ? { ...v, alternativa: e.target.value } : v)))}>
                        <option value="">Sem alternativa (só esta categoria)</option>
                        {(categorias.data ?? []).filter((a) => String(a.id) !== p.categoria).map((a) => <option key={a.id} value={a.id}>ou {a.name}</option>)}
                      </select>
                      <MarcadorVinculo codigo="C1" />
                      <MarcadorVinculo codigo="P1" pendente nota="aqui a equipe é por categoria; escolher profissional específico ainda não existe nesta tela" />
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">A alternativa é da MESMA pessoa necessária: atende uma ou outra categoria, nunca as duas ao mesmo tempo. Para duas pessoas, adicione outro participante.</p>
                  {equipe.length < 3 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setEquipe((l) => [...l, { categoria: "", alternativa: "" }])}>Adicionar participante</Button>
                  )}
                </div>
              )}
              <Button className="btn-3d" onClick={incluir} disabled={!procedimentoId || ocupado}>Incluir no protocolo</Button>
            </div>

            {(lista.data?.itens ?? []).map((item) => {
              const periodo = busca[item.id] ?? { from: hoje(), to: hoje() };
              return (
                <div key={item.id} className="panel-3d-sub space-y-2 p-3" data-testid={`procedimento-protocolo-${item.id}`}>
                  <div className="text-sm font-semibold">
                    {item.nome}<MarcadorVinculo codigo="D1" /> · {item.ocorrencias.length}/{item.totalSessoes} reservadas · {Math.round(item.duracaoSegundos / 60)} min
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Equipe ({item.equipeOrigem === "prescritor" ? "definida pelo prescritor" : "padrão do procedimento"}):{" "}
                    {item.equipe.map((e) => [e.categoryName, ...(e.alternativeCategoryNames ?? [])].join(" ou ")).join(" + ")}<MarcadorVinculo codigo="C1" />
                  </div>
                  {item.ocorrencias.map((o) => (
                    <div key={o.id} className="text-xs">Ocorrência {o.numero}: {o.date} às {o.time} · {o.participantes.length} agenda(s) reservada(s)<MarcadorVinculo codigo="A1" /></div>
                  ))}
                  <div className="flex flex-wrap items-end gap-2">
                    <Input type="date" className="field-engraved w-40" value={periodo.from}
                      onChange={(e) => setBusca((b) => ({ ...b, [item.id]: { ...periodo, from: e.target.value } }))} />
                    <Input type="date" className="field-engraved w-40" value={periodo.to}
                      onChange={(e) => setBusca((b) => ({ ...b, [item.id]: { ...periodo, to: e.target.value } }))} />
                    <Button size="sm" variant="outline" disabled={ocupado} onClick={() => buscar(item)}>Buscar horários da equipe</Button>
                  </div>
                  {periodo.horarios?.map((d) => (
                    <div key={d.date} className="text-xs">
                      <strong>{d.date}</strong>{" "}
                      {d.horarios.length === 0 ? "sem horário em que a equipe inteira esteja livre" : d.horarios.map((h) => (
                        <button key={h.time} type="button" disabled={ocupado} className="bevel-3d mx-0.5 px-2 py-0.5"
                          title={h.participantes.map((p) => p.agenda).join(" + ")} onClick={() => reservar(item, d.date, h.time)}>{h.time}</button>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
