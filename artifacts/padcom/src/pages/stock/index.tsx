import { useListStock, useUpdateStockItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Package, TrendingDown } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

function MetaField({ label, value }: { label: string; value: string | null }) {
  const empty = value == null || value === "";
  return (
    <div className="concave-3d px-2.5 py-1.5 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1">{label}</div>
      <div className={`text-[11px] font-bold uppercase tracking-tight leading-none truncate ${empty ? "text-muted-foreground/40" : "text-foreground"}`}>
        {empty ? "—" : value}
      </div>
    </div>
  );
}

export default function Stock() {
  const { data: stockItems, isLoading, refetch } = useListStock();
  const { toast } = useToast();
  const [editId, setEditId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");

  const updateMutation = useUpdateStockItem({
    mutation: {
      onSuccess: () => {
        toast({ title: "Estoque atualizado!" });
        setEditId(null);
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao atualizar estoque", variant: "destructive" });
      }
    }
  });

  const critical = stockItems?.filter(s => s.quantity === 0) ?? [];
  const low = stockItems?.filter(s => s.quantity > 0 && s.quantity <= s.minimumStock) ?? [];

  const getStockStatus = (item: { quantity: number; minimumStock: number }) => {
    if (item.quantity === 0) return { label: "SEM ESTOQUE", color: "text-red-700" };
    if (item.quantity <= item.minimumStock) return { label: "BAIXO", color: "text-amber-700" };
    return { label: "NORMAL", color: "text-green-700" };
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Estoque</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
          Controle de insumos e substâncias injetáveis.
        </p>
      </div>

      {(critical.length > 0 || low.length > 0) && (
        <div className="flex flex-col gap-2">
          {critical.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3 panel-3d-sub border-l-4 border-red-500">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-red-800">
                <span style={{ color: item.substanceColor, fontWeight: "900" }}>{item.substanceName}</span>
                {" "}— Sem estoque. Reposição urgente.
              </span>
            </div>
          ))}
          {low.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3 panel-3d-sub border-l-4 border-amber-500">
              <TrendingDown className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                <span style={{ color: item.substanceColor, fontWeight: "900" }}>{item.substanceName}</span>
                {" "}— Estoque baixo: {item.quantity} unid. (mínimo: {item.minimumStock})
              </span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-32 panel-3d-sub" />)}
        </div>
      ) : (
        <Card className="panel-3d">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <Package className="h-4 w-4 text-primary" />
              Itens em Estoque
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stockItems?.map(item => {
                const status = getStockStatus(item);
                const isEditing = editId === item.id;
                const validade = item.expirationDate
                  ? new Date(item.expirationDate).toLocaleDateString("pt-BR")
                  : null;
                return (
                  <div key={item.id} className="flex items-start gap-3 p-3 panel-3d-sub neon-hover transition-all">
                    <div
                      className="flex-shrink-0 w-3 self-stretch min-h-[3rem] rounded-[3px]"
                      style={{ backgroundColor: item.substanceColor }}
                    />

                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-foreground uppercase tracking-tight text-base leading-snug break-words">
                        {item.substanceName}
                      </h3>
                      <div className="grid grid-cols-1 gap-1.5 mt-2">
                        <MetaField label="Denominação" value={status.label} />
                        <MetaField label="Mínimo" value={`${item.minimumStock} unid.`} />
                        <MetaField label="Lote" value={item.lot ?? null} />
                        <MetaField label="Validade" value={validade} />
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex items-start gap-2">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={editQty}
                            onChange={e => setEditQty(e.target.value)}
                            className="w-20 h-9 text-sm field-engraved"
                            min={0}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            className="btn-3d"
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: item.id, data: { quantity: parseInt(editQty) } as any })}
                          >
                            Salvar
                          </Button>
                          <Button size="sm" className="btn-3d-soft" onClick={() => setEditId(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <>
                          <div className="concave-3d px-2 py-1.5 w-14 text-center">
                            <div className={`text-lg font-black tabular-nums leading-none ${status.color}`}>
                              {item.quantity}
                            </div>
                            <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/70 mt-1">
                              {item.unit ?? "unid."}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="btn-3d-soft"
                            onClick={() => { setEditId(item.id); setEditQty(String(item.quantity)); }}
                          >
                            Ajustar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
