import {
  useListSncrRanges,
  useCreateSncrRange,
  useGetSncrQuota,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Hash, Plus, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ANVISA_CONTROLLED_CLASSES, recipeTypeForControlledClass } from "@/lib/anvisa";

const inputCls =
  "px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-accent/40 focus:border-accent outline-none bg-card text-foreground w-full";

const UF_LIST = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

interface FormState {
  uf: string;
  controlledType: string;
  professionalName: string;
  startNumber: string;
  endNumber: string;
}

const EMPTY: FormState = { uf: "SP", controlledType: "B1", professionalName: "", startNumber: "", endNumber: "" };

export default function Sncr() {
  const { data: ranges, isLoading, refetch } = useListSncrRanges();
  const { data: quota, refetch: refetchQuota } = useGetSncrQuota();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const createMutation = useCreateSncrRange({
    mutation: {
      onSuccess: () => {
        toast({ title: "Talão SNCR cadastrado!" });
        setOpen(false);
        setForm(EMPTY);
        refetch();
        refetchQuota();
      },
      onError: () => toast({ title: "Erro ao cadastrar talão", variant: "destructive" }),
    },
  });

  function handleSubmit() {
    const start = parseInt(form.startNumber, 10);
    const end = parseInt(form.endNumber, 10);
    if (!form.uf || !form.controlledType) {
      toast({ title: "UF e tipo controlado são obrigatórios", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      toast({ title: "Numeração inválida (início/fim)", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        uf: form.uf,
        controlledType: form.controlledType,
        professionalName: form.professionalName || null,
        startNumber: start,
        endNumber: end,
      },
    });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Numeração SNCR</h1>
          <p className="text-muted-foreground">
            Talões do Sistema Nacional de Gerenciamento de Produtos Controlados. O sistema apenas
            <span className="font-semibold"> alerta</span> quando a numeração está acabando — nunca bloqueia a emissão.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Talão</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Talão SNCR</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>UF</Label>
                  <select className={inputCls} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
                    {UF_LIST.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo controlado</Label>
                  <select className={inputCls} value={form.controlledType} onChange={(e) => setForm({ ...form, controlledType: e.target.value })}>
                    {ANVISA_CONTROLLED_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Profissional (opcional)</Label>
                <Input value={form.professionalName} onChange={(e) => setForm({ ...form, professionalName: e.target.value })} placeholder="Dr. Caio Henrique Pádua" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Número inicial</Label>
                  <Input type="number" value={form.startNumber} onChange={(e) => setForm({ ...form, startNumber: e.target.value })} placeholder="1000" />
                </div>
                <div className="space-y-2">
                  <Label>Número final</Label>
                  <Input type="number" value={form.endNumber} onChange={(e) => setForm({ ...form, endNumber: e.target.value })} placeholder="1999" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Cadastrando..." : "Cadastrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* QUOTA SUMMARY */}
      {quota && quota.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quota.map((q) => {
            const state = q.exhausted ? "exhausted" : q.low ? "low" : "ok";
            const styles =
              state === "exhausted"
                ? "border-l-destructive bg-destructive/5"
                : state === "low"
                ? "border-l-amber-500 bg-amber-50"
                : "border-l-emerald-500 bg-emerald-50/50";
            return (
              <Card key={q.rangeId} className={`border-l-4 ${styles}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-sm">{q.controlledType} · {q.uf}</span>
                    {state === "exhausted" ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-destructive"><XCircle className="h-3.5 w-3.5" />Esgotado</span>
                    ) : state === "low" ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Acabando</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>
                    )}
                  </div>
                  <p className="text-2xl font-bold mt-2">{q.remaining}</p>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">números restantes</p>
                  {q.professionalName && <p className="text-xs text-muted-foreground mt-1 truncate">{q.professionalName}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* RANGES TABLE */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}</div>
      ) : !ranges?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Hash className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum talão cadastrado</p>
            <p className="text-sm text-muted-foreground">Cadastre os intervalos de numeração SNCR por tipo e UF.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary/10 text-left">
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wide text-primary">Tipo</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wide text-primary">UF</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wide text-primary">Receituário</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wide text-primary">Profissional</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wide text-primary text-right">Intervalo</th>
                  <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wide text-primary text-right">Próximo</th>
                </tr>
              </thead>
              <tbody>
                {ranges.map((r) => {
                  const recipe = recipeTypeForControlledClass(r.controlledType);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono font-bold">{r.controlledType}</td>
                      <td className="px-4 py-3">{r.uf}</td>
                      <td className="px-4 py-3">{recipe ? recipe.colorName : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.professionalName || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono">{r.startNumber} – {r.endNumber}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold">{r.nextNumber}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
