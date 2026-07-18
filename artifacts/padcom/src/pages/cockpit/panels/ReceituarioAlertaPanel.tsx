/**
 * PAINEL: ALERTA DO RECEITUÁRIO AUTOMÁTICO
 * Exibe no Cockpit da Consulta os slots com liberação nos próximos 7 dias
 * e os slots atrasados (vencidos sem liberar).
 */
import { useEffect, useState } from "react";
import { Calendar, AlertTriangle, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
function authHeader(): HeadersInit {
  const t = localStorage.getItem("collab_token") || "";
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
           : { "Content-Type": "application/json" };
}
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeader(), ...(opts?.headers ?? {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

type AlertaSlot = {
  id: number;
  nome: string;
  dataLiberacao: string;
  dataFormatada: string;
  status: string;
  clientName: string;
  formulas: { nome: string }[];
};

interface Props {
  clientId?: number;
}

export function ReceituarioAlertaPanel({ clientId }: Props) {
  const { toast } = useToast();
  const [slots, setSlots]       = useState<AlertaSlot[]>([]);
  const [atrasados, setAtrasados] = useState<AlertaSlot[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [liberando, setLiberando] = useState<number | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const d = await apiFetch("/api/receituario/alertas?dias=7");
      let proximos = (d.slots ?? []) as AlertaSlot[];
      let atras    = (d.atrasados ?? []) as AlertaSlot[];
      if (clientId) {
        proximos = proximos.filter((s) => s.clientId === clientId);
        atras    = atras.filter((s) => s.clientId === clientId);
      }
      setSlots(proximos);
      setAtrasados(atras);
    } catch { /* silencioso */ }
    finally { setCarregando(false); }
  };

  useEffect(() => { void carregar(); }, [clientId]);

  const liberar = async (slotId: number, nome: string) => {
    setLiberando(slotId);
    try {
      await apiFetch(`/api/receituario/slots/${slotId}/liberar`, { method: "POST" });
      toast({ title: `"${nome}" liberada com sucesso` });
      await carregar();
    } catch {
      toast({ title: "Erro na liberação", variant: "destructive" });
    } finally { setLiberando(null); }
  };

  const total = slots.length + atrasados.length;

  if (carregando) {
    return (
      <div className="panel-3d-sub p-4 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Verificando receituário automático…
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="panel-3d-sub p-3 flex items-center gap-2 text-muted-foreground text-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        Nenhuma receita a liberar nos próximos 7 dias
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest inline-flex items-center gap-1">
        <Calendar className="w-3.5 h-3.5" />
        Receituário Automático
        <span className="concave-3d px-1.5 py-0 text-[10px] font-bold ml-1">{total}</span>
      </div>

      {/* Atrasados — prioridade máxima */}
      {atrasados.map((s) => (
        <div key={s.id} className="panel-3d-sub flex overflow-hidden">
          <div className="w-1 bg-rose-500 shrink-0" />
          <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{s.nome}</div>
              <div className="text-[11px] text-rose-600">Vencida em {s.dataFormatada} — {s.clientName}</div>
              {s.formulas?.length > 0 && (
                <div className="text-[10px] text-muted-foreground">{s.formulas.map((f) => f.nome).join(", ")}</div>
              )}
            </div>
            <Button
              className="btn-3d h-7 text-xs gap-1 shrink-0"
              onClick={() => liberar(s.id, s.nome)}
              disabled={liberando === s.id}
            >
              {liberando === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Liberar
            </Button>
          </div>
        </div>
      ))}

      {/* Próximos 7 dias */}
      {slots.map((s) => (
        <div key={s.id} className="panel-3d-sub flex overflow-hidden">
          <div className="w-1 bg-amber-400 shrink-0" />
          <div className="flex-1 flex items-center gap-3 px-3 py-2.5 min-w-0">
            <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{s.nome}</div>
              <div className="text-[11px] text-muted-foreground">{s.dataFormatada} — {s.clientName}</div>
              {s.formulas?.length > 0 && (
                <div className="text-[10px] text-muted-foreground">{s.formulas.map((f) => f.nome).join(", ")}</div>
              )}
            </div>
            <Button
              className="btn-3d-soft h-7 text-xs gap-1 shrink-0"
              onClick={() => liberar(s.id, s.nome)}
              disabled={liberando === s.id}
            >
              {liberando === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Antecipar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
