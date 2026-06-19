import { useListStock, useUpdateStockItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Package } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

type TabId = "expired" | "expiring_soon" | "low" | "normal" | "overflow";

const STATUS_CONFIG: Record<string, { color: string; label: string; tab: TabId }> = {
  critical:      { color: "#DC2626", label: "SEM ESTOQUE",   tab: "low" },
  low:           { color: "#D97706", label: "BAIXO",          tab: "low" },
  normal:        { color: "#16A34A", label: "NORMAL",         tab: "normal" },
  overflow:      { color: "#7C3AED", label: "ACIMA DO MÁX",  tab: "overflow" },
  expired:       { color: "#DC2626", label: "VENCIDA",        tab: "expired" },
  expiring_soon: { color: "#EA580C", label: "A VENCER",       tab: "expiring_soon" },
};

const TABS: { id: TabId; label: string; color: string }[] = [
  { id: "expired",       label: "VENCIDAS",           color: "#DC2626" },
  { id: "expiring_soon", label: "A VENCER < 2 MESES", color: "#EA580C" },
  { id: "low",           label: "ABAIXO DO MÍN",      color: "#D97706" },
  { id: "normal",        label: "DENTRO DO PADRÃO",   color: "#16A34A" },
  { id: "overflow",      label: "ACIMA DO MÁX",       color: "#7C3AED" },
];

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
  const [activeTab, setActiveTab] = useState<TabId>("expired");

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

  const countByTab = useMemo(() => {
    const counts: Record<TabId, number> = {
      expired: 0, expiring_soon: 0, low: 0, normal: 0, overflow: 0,
    };
    for (const item of stockItems ?? []) {
      const tab = STATUS_CONFIG[item.status]?.tab;
      if (tab) counts[tab]++;
    }
    return counts;
  }, [stockItems]);

  const visibleItems = useMemo(
    () => (stockItems ?? []).filter(i => STATUS_CONFIG[i.status]?.tab === activeTab),
    [stockItems, activeTab],
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-black tracking-tight uppercase">Estoque</h1>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
          Controle de insumos e substâncias injetáveis.
        </p>
      </div>

      {/* Painel — 5 faixas empilhadas; label uppercase + número em concave-3d */}
      <div className="panel-3d p-4 space-y-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3">
          Painel de situação — selecione a faixa
        </p>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const count = countByTab[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-[6px] transition-all text-left ${
                active ? "bg-muted/30" : "hover:bg-muted/20"
              }`}
            >
              {/* Label da faixa — uppercase */}
              <span
                className="text-[11px] font-black uppercase tracking-widest"
                style={{ color: active ? tab.color : "hsl(var(--muted-foreground))" }}
              >
                {tab.label}
              </span>
              {/* Número côncavo — insert bevel */}
              <div
                className="concave-3d min-w-[2.5rem] h-7 flex items-center justify-center px-2 tabular-nums"
              >
                <span
                  className="text-sm font-black leading-none"
                  style={{ color: count > 0 ? tab.color : "hsl(var(--muted-foreground)/0.4)" }}
                >
                  {count}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-52 panel-3d-sub" />)}
        </div>
      ) : (
        <Card className="panel-3d">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <Package className="h-4 w-4 text-primary" />
              {TABS.find(t => t.id === activeTab)?.label} — {visibleItems.length}{" "}
              {visibleItems.length === 1 ? "item" : "itens"}
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
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div key={item.id} className="flex items-start gap-3 p-3 panel-3d-sub neon-hover transition-all">
                      {/* Coluna principal — tudo empilhado */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">

                        {/* Linha do nome: quadradinho colorido + nome */}
                        <div className="flex items-start gap-2">
                          <div
                            className="flex-shrink-0 w-4 h-4 rounded-[3px] mt-[2px]"
                            style={{ backgroundColor: item.substanceColor }}
                          />
                          <h3 className="font-black text-foreground uppercase tracking-tight text-base leading-snug break-words flex-1">
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

                        {/* Última linha: quantidade + rótulo colorido + Ajustar */}
                        {isEditing ? (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                            <Button
                              size="sm"
                              className="btn-3d-soft"
                              onClick={() => setEditId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            {/* Quantidade côncava */}
                            <div className="concave-3d px-3 py-1.5 flex items-baseline gap-1">
                              <span
                                className="text-xl font-black tabular-nums leading-none"
                                style={{ color: cfg.color }}
                              >
                                {item.quantity}
                              </span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                                {item.unit}
                              </span>
                            </div>
                            {/* Rótulo de status — UPPERCASE colorido */}
                            <span
                              className="text-[10px] font-black uppercase tracking-widest"
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
