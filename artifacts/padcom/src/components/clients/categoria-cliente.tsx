import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateClient, getGetClientQueryKey, getListClientsQueryKey } from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Save } from "lucide-react";
import { NIVEIS_CLIENTE, NIVEL_ENTRADA, PALETA_NIVEL, ehNivelCliente, fundoNivel, nivelLegado } from "@/lib/nivel-cliente";

const CLASSES = [
  { v: "A", d: "Paga em dia e fecha protocolos sempre" },
  { v: "B", d: "Fecha protocolos com frequência" },
  { v: "C", d: "Fecha protocolos de vez em quando" },
  { v: "D", d: "Sem histórico (padrão de quem chega)" },
] as const;

export default function CategoriaCliente({ client }: { client: Client }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const update = useUpdateClient();
  const [classe, setClasse] = useState<string>(client.classificacao ?? "D");
  // Nivel pendente (valor antigo sem equivalente seguro): nada vem marcado; a equipe escolhe.
  const anterior = nivelLegado(client.plano);
  const [plano, setPlano] = useState<string>(
    ehNivelCliente(client.plano) ? client.plano : anterior !== null ? "" : NIVEL_ENTRADA,
  );
  const planoValido = ehNivelCliente(plano);
  const mudou = classe !== client.classificacao || (planoValido && plano !== client.plano);

  const salvar = () =>
    update.mutate(
      // O servidor aceita atualização parcial: só estes dois campos mudam.
      { id: client.id, data: { classificacao: classe, ...(planoValido ? { plano } : {}) } as unknown as Parameters<typeof update.mutate>[0]["data"] },
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
          {anterior !== null && (
            <p role="status" className="text-xs mb-2 font-semibold">
              Nível anterior preservado: <strong>{anterior}</strong>. Não há equivalente seguro no modelo novo; escolha o nível e salve.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {NIVEIS_CLIENTE.map((v) => (
              <button key={v} type="button" aria-pressed={plano === v} className={`${opcao(plano === v)} inline-flex items-center gap-2`} onClick={() => setPlano(v)}>
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[2px] border border-black/20" style={{ background: fundoNivel(v) }} />
                {PALETA_NIVEL[v].nome}
              </button>
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
