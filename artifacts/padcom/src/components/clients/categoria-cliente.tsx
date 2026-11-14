import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateClient, getGetClientQueryKey, getListClientsQueryKey } from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Save } from "lucide-react";

const CLASSES = [
  { v: "A", d: "Paga em dia e fecha protocolos sempre" },
  { v: "B", d: "Fecha protocolos com frequência" },
  { v: "C", d: "Fecha protocolos de vez em quando" },
  { v: "D", d: "Sem histórico (padrão de quem chega)" },
] as const;
const PLANOS = [
  { v: "bronze", n: "Bronze" },
  { v: "prata", n: "Prata" },
  { v: "ouro", n: "Ouro" },
  { v: "platina", n: "Platina" },
] as const;

export default function CategoriaCliente({ client }: { client: Client }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const update = useUpdateClient();
  const [classe, setClasse] = useState<string>(client.classificacao ?? "D");
  const [plano, setPlano] = useState<string>(client.plano ?? "bronze");
  const mudou = classe !== client.classificacao || plano !== client.plano;

  const salvar = () =>
    update.mutate(
      // O servidor aceita atualização parcial: só estes dois campos mudam.
      { id: client.id, data: { classificacao: classe, plano } as unknown as Parameters<typeof update.mutate>[0]["data"] },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetClientQueryKey(client.id) });
          qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
          toast({ title: "Categoria salva" });
        },
        onError: (e: unknown) =>
          toast({ title: "Não foi possível salvar", description: e instanceof Error ? e.message : undefined, variant: "destructive" }),
      },
    );

  const opcao = (ativo: boolean) =>
    `px-3 py-2 text-xs font-extrabold uppercase tracking-wider rounded-[4px] border ${ativo ? "bevel-3d text-primary border-primary" : "btn-3d-soft"}`;

  return (
    <Card className="panel-3d border-none relative overflow-visible">
      <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 absolute -top-3 left-4">
        <Crown className="h-3 w-3 text-primary" /> Categoria
      </div>
      <CardContent className="pt-8 space-y-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Classificação</p>
          <div className="flex flex-wrap gap-2">
            {CLASSES.map((c) => (
              <button key={c.v} type="button" title={c.d} aria-pressed={classe === c.v} className={opcao(classe === c.v)} onClick={() => setClasse(c.v)}>{c.v}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{CLASSES.find((c) => c.v === classe)?.d}</p>
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-2">Plano</p>
          <div className="flex flex-wrap gap-2">
            {PLANOS.map((p) => (
              <button key={p.v} type="button" aria-pressed={plano === p.v} className={opcao(plano === p.v)} onClick={() => setPlano(p.v)}>{p.n}</button>
            ))}
          </div>
        </div>
        <Button className="btn-3d-soft" onClick={salvar} disabled={!mudou || update.isPending}>
          {update.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          SALVAR CATEGORIA
        </Button>
      </CardContent>
    </Card>
  );
}
