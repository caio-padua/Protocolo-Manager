import { useListStock, useUpdateStockItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Package, TrendingDown } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

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
    if (item.quantity === 0) return { label: "Sem Estoque", color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" };
    if (item.quantity <= item.minimumStock) return { label: "Estoque Baixo", color: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" };
    return { label: "Normal", color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" };
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Estoque</h1>
        <p className="text-muted-foreground">Controle de insumos e substâncias injetáveis.</p>
      </div>

      {(critical.length > 0 || low.length > 0) && (
        <div className="flex flex-col gap-2">
          {critical.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span className="text-sm font-medium text-red-800 dark:text-red-400">
                <span style={{ color: item.substanceColor, fontWeight: "bold" }}>{item.substanceName}</span> — Sem estoque! Reposição urgente necessária.
              </span>
            </div>
          ))}
          {low.map(item => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
              <TrendingDown className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-400">
                <span style={{ color: item.substanceColor, fontWeight: "bold" }}>{item.substanceName}</span> — Estoque baixo: {item.quantity} unid. (mínimo: {item.minimumStock})
              </span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Itens em Estoque
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stockItems?.map(item => {
                const status = getStockStatus(item);
                const isEditing = editId === item.id;
                return (
                  <div key={item.id} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/40 transition-colors">
                    <div className="flex-shrink-0 w-3 h-3 rounded-full" style={{ backgroundColor: item.substanceColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.substanceName}</span>
                        <Badge className={`text-xs border ${status.color}`}>{status.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Mínimo: {item.minimumStock} unid.
                        {item.lot && ` · Lote: ${item.lot}`}
                        {item.expiresAt && ` · Validade: ${new Date(item.expiresAt).toLocaleDateString("pt-BR")}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={editQty}
                            onChange={e => setEditQty(e.target.value)}
                            className="w-20 h-8 text-sm"
                            min={0}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: item.id, data: { quantity: parseInt(editQty) } as any })}
                          >
                            Salvar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xl font-bold w-12 text-right">{item.quantity}</span>
                          <span className="text-sm text-muted-foreground">unid.</span>
                          <Button
                            size="sm"
                            variant="outline"
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
