import { useListStock, useUpdateStockItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Printer, MessageCircle, CloudUpload } from "lucide-react";
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

  function handlePrint() {
    window.print();
  }

  function handleWhatsApp() {
    const hoje = new Date().toLocaleDateString("pt-BR");
    const linhas: string[] = [
      `*📦 RELATÓRIO DE ESTOQUE — PADCON*`,
      `_${hoje}_`,
      ``,
      `*Situação geral:*`,
      ...TABS.map(t => {
        const c = countByTab[t.id];
        return `• ${t.label}: *${c}*`;
      }),
    ];
    const urgentes = (stockItems ?? []).filter(
      i => STATUS_CONFIG[i.status]?.tab === "expired" || STATUS_CONFIG[i.status]?.tab === "expiring_soon",
    );
    if (urgentes.length > 0) {
      linhas.push(``, `*⚠️ Atenção imediata:*`);
      urgentes.forEach(i => {
        const cfg = STATUS_CONFIG[i.status];
        linhas.push(`• ${i.substanceName} — ${i.quantity} ${i.unit} (${cfg?.label})`);
      });
    }
    const texto = encodeURIComponent(linhas.join("\n"));
    window.open(`https://wa.me/?text=${texto}`, "_blank");
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Estoque</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
            Controle de insumos e substâncias injetáveis.
          </p>
        </div>
        {/* Botões de ação — Imprimir / WhatsApp / Drive */}
        <div className="flex items-center gap-1.5 flex-shrink-0 pt-1">
          <button
            onClick={handlePrint}
            title="Imprimir relatório de estoque"
            className="btn-3d-soft w-8 h-8 flex items-center justify-center rounded-[6px]"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={handleWhatsApp}
            title="Enviar resumo via WhatsApp"
            className="btn-3d-soft w-8 h-8 flex items-center justify-center rounded-[6px] text-[#25D366]"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            disabled
            title="Salvar no Google Drive — pasta ESTOQUE (em breve)"
            className="btn-3d-soft w-8 h-8 flex items-center justify-center rounded-[6px] opacity-30 cursor-not-allowed"
          >
            <CloudUpload className="w-4 h-4" />
          </button>
        </div>
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
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="w-full flex items-center justify-between gap-3 py-1 cursor-pointer"
            >
              {/* Label — botão 3D saliente (bevel), uppercase, breve */}
              <div
                className={`flex-1 px-3 py-2 rounded-[6px] text-[11px] font-black uppercase tracking-widest transition-all select-none
                  ${active
                    ? "panel-3d-active"
                    : "panel-3d-sub opacity-60 hover:opacity-90"
                  }`}
                style={{ color: active ? tab.color : "hsl(var(--muted-foreground))" }}
              >
                {tab.label}
              </div>
              {/* Número — insert côncavo, maior, mais grosso, colorido */}
              <div className="concave-3d min-w-[3rem] h-9 flex items-center justify-center px-2 tabular-nums flex-shrink-0">
                <span
                  className="text-xl font-black leading-none"
                  style={{
                    color: count > 0 ? tab.color : "hsl(var(--muted-foreground) / 0.3)",
                    WebkitTextStroke: count > 0 ? "0.5px " + tab.color : undefined,
                  }}
                >
                  {count}
                </span>
              </div>
            </div>
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
                            {/* Quantidade côncava — número neutro, sem cor de status */}
                            <div className="concave-3d px-3 py-1.5 flex items-baseline gap-1">
                              <span className="text-xl font-black tabular-nums leading-none text-foreground">
                                {item.quantity}
                              </span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                                {item.unit}
                              </span>
                            </div>
                            {/* Rótulo de status — UPPERCASE colorido (único indicador de cor) */}
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
