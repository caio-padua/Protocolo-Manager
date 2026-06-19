import { useListStock, useUpdateStockItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type TabId = "low" | "normal" | "overflow";

const STATUS_CONFIG: Record<string, { color: string; label: string; tab: TabId }> = {
  critical: { color: "#DC2626", label: "SEM ESTOQUE", tab: "low" },
  low:      { color: "#F59E0B", label: "BAIXO",        tab: "low" },
  normal:   { color: "#16A34A", label: "NORMAL",       tab: "normal" },
  overflow: { color: "#7C3AED", label: "ACIMA DO MÁX", tab: "overflow" },
  expired:  { color: "#6B7280", label: "VENCIDO",      tab: "low" },
};

function MetaField({ label, value }: { label: string; value: string | null }) {
  const empty = value == null || value === "";
  return (
    <div className="concave-3d px-2.5 py-1.5 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1">
        {label}
      </div>
      <div className={`text-[11px] font-bold uppercase tracking-tight leading-none ${empty ? "text-muted-foreground/40" : "text-foreground"}`}>
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
  const [activeTab, setActiveTab] = useState<TabId>("low");

  const updateMutation = useUpdateStockItem({
    mutation: {
      onSuccess: () => {
        toast({ title: "Estoque atualizado!" });
        setEditId(null);
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao atualizar estoque", variant: "destructive" });
      },
    },
  });

  const lowItems      = stockItems?.filter(i => STATUS_CONFIG[i.status]?.tab === "low")      ?? [];
  const normalItems   = stockItems?.filter(i => STATUS_CONFIG[i.status]?.tab === "normal")   ?? [];
  const overflowItems = stockItems?.filter(i => STATUS_CONFIG[i.status]?.tab === "overflow") ?? [];

  const tabsConfig: { id: TabId; label: string; count: number; color: string }[] = [
    { id: "low",      label: "ABAIXO DO MÍN", count: lowItems.length,      color: "#DC2626" },
    { id: "normal",   label: "DENTRO DO PADRÃO", count: normalItems.length, color: "#16A34A" },
    { id: "overflow", label: "ACIMA DO MÁX",  count: overflowItems.length, color: "#7C3AED" },
  ];

  const visibleItems =
    activeTab === "low" ? lowItems :
    activeTab === "overflow" ? overflowItems :
    normalItems;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Estoque</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
          Controle de insumos e substâncias injetáveis.
        </p>
      </div>

      {/* Mini-dashboard — seletor de faixas */}
      <div className="panel-3d p-4 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
          Painel de situação — selecione a faixa
        </p>
        <div className="flex flex-wrap gap-2">
          {tabsConfig.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-[10px] font-black uppercase tracking-widest border transition-all ${
                  active ? "text-white shadow-md" : "bg-background/60 text-muted-foreground border-border/40 hover:border-border"
                }`}
                style={active ? { backgroundColor: tab.color, borderColor: tab.color } : {}}
              >
                {tab.label}
                <span
                  className="min-w-[20px] h-5 rounded-full text-[10px] font-black flex items-center justify-center px-1.5"
                  style={{
                    backgroundColor: active ? "rgba(255,255,255,0.25)" : tab.color + "22",
                    color: active ? "white" : tab.color,
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 panel-3d-sub" />)}
        </div>
      ) : (
        <Card className="panel-3d">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <Package className="h-4 w-4 text-primary" />
              {tabsConfig.find(t => t.id === activeTab)?.label} — {visibleItems.length} {visibleItems.length === 1 ? "item" : "itens"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visibleItems.length === 0 ? (
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50 text-center py-8">
                Nenhum item nesta faixa.
              </p>
            ) : (
              <div className="space-y-2">
                {visibleItems.map(item => {
                  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.normal;
                  const isEditing = editId === item.id;
                  const validade = item.expirationDate
                    ? new Date(item.expirationDate).toLocaleDateString("pt-BR")
                    : null;
                  const fullName = [
                    item.substanceName,
                    item.substanceMg ?? null,
                    item.substanceVolume ?? null,
                  ].filter(Boolean).join(" ");

                  return (
                    <div key={item.id} className="flex items-stretch gap-3 p-3 panel-3d-sub neon-hover transition-all">
                      {/* Barra de status — cor da faixa */}
                      <div
                        className="flex-shrink-0 w-1.5 self-stretch rounded-[2px]"
                        style={{ backgroundColor: cfg.color }}
                      />

                      {/* Coluna principal — tudo empilhado */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        {/* Nome: dot cor da substância + nome completo */}
                        <div className="flex items-start gap-1.5">
                          <span
                            className="flex-shrink-0 text-base leading-none mt-[1px]"
                            style={{ color: item.substanceColor }}
                          >
                            ●
                          </span>
                          <h3 className="font-black text-foreground uppercase tracking-tight text-base leading-snug break-words">
                            {fullName}
                          </h3>
                        </div>

                        <MetaField label="Mínimo" value={`${item.minimumStock} ${item.unit}`} />
                        <MetaField
                          label="Máximo"
                          value={item.maximumStock != null ? `${item.maximumStock} ${item.unit}` : null}
                        />
                        <MetaField label="Lote" value={item.lot ?? null} />
                        <MetaField label="Validade" value={validade} />

                        {/* Última linha: quantidade + status + Ajustar */}
                        {isEditing ? (
                          <div className="flex items-center gap-2 mt-1">
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
                              onClick={() =>
                                updateMutation.mutate({
                                  id: item.id,
                                  data: { quantity: parseFloat(editQty) } as any,
                                })
                              }
                            >
                              Salvar
                            </Button>
                            <Button size="sm" className="btn-3d-soft" onClick={() => setEditId(null)}>
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="concave-3d px-3 py-1.5 flex items-baseline gap-1.5">
                              <span
                                className="text-xl font-black tabular-nums leading-none"
                                style={{ color: cfg.color }}
                              >
                                {item.quantity}
                              </span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
                                {item.unit}
                              </span>
                            </div>
                            <span
                              className="text-[9px] font-black uppercase tracking-widest"
                              style={{ color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                            <Button
                              size="sm"
                              className="btn-3d-soft ml-auto"
                              onClick={() => {
                                setEditId(item.id);
                                setEditQty(String(item.quantity));
                              }}
                            >
                              Ajustar
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
