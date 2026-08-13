// DietaTreinoPanel — visão consolidada dos planos nutricionais emitidos (Órgão
// Dieta) e das fichas de treino prescritas (Órgão Treino) para o cliente do
// Cockpit. Painel somente-leitura: emissão/edição continua nas telas-fonte
// (/dieta e /treino) — aqui o médico só CONSULTA o que já foi entregue.
// Design: skill-layout-paxter · panel-3d-sub/concave-3d · navy/ouro.

import { useQuery } from "@tanstack/react-query";
import { Utensils, Dumbbell, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const NAVY = "#16294a";
const GOLD = "#9a7b32";

interface Props {
  clientId: number;
}

interface DietaPrescricao {
  id: number;
  objetivo: string | null;
  estiloAlimentar: string | null;
  caloriasAlvo: number | null;
  status: string;
  createdAt: string;
}

interface DietaPlano {
  id: number;
  nomePaciente: string;
  objetivo: string | null;
  estrategia: string | null;
  caloriasAlvo: number | null;
  emailDestino: string | null;
  emailEnviado: boolean;
  temPdf: boolean;
  emitidoEm: string;
}

interface TreinoPrescricao {
  id: number;
  objetivo: string | null;
  divisao: string | null;
  frequenciaSemanal: number | null;
  status: string;
  createdAt: string;
}

// Vocabulário comum às duas prescrições (Dieta e Treino): rascunho/ativa/encerrada.
const STATUS_PRESCRICAO: Record<string, { label: string; cls: string }> = {
  rascunho: { label: "RASCUNHO", cls: "bg-muted text-muted-foreground" },
  ativa: { label: "ATIVA", cls: "bg-emerald-100 text-emerald-800" },
  encerrada: { label: "ENCERRADA", cls: "bg-red-100 text-red-700" },
};

function fmtDate(v: string): string {
  try {
    return format(parseISO(v), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return v;
  }
}

function fmtDateTime(v: string): string {
  try {
    return format(parseISO(v), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return v;
  }
}

export default function DietaTreinoPanel({ clientId }: Props) {
  const { toast } = useToast();

  const { data: dietaPrescricoes, isLoading: loadingPrescricoes } = useQuery<DietaPrescricao[]>({
    queryKey: ["dieta-prescricoes", clientId],
    queryFn: async () => {
      const token = getCollabToken();
      const r = await fetch(`/api/dieta/prescricoes?clientId=${clientId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Falha ao carregar prescrições de dieta");
      return r.json();
    },
    enabled: !!clientId,
  });

  const { data: dietaPlanos, isLoading: loadingDieta } = useQuery<DietaPlano[]>({
    queryKey: ["dieta-planos-emitidos", clientId],
    queryFn: async () => {
      const token = getCollabToken();
      const r = await fetch(`/api/dieta/planos-emitidos?clienteId=${clientId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Falha ao carregar planos de dieta");
      return r.json();
    },
    enabled: !!clientId,
  });

  const { data: treinoPrescricoes, isLoading: loadingTreino } = useQuery<TreinoPrescricao[]>({
    queryKey: ["treino-prescricoes", clientId],
    queryFn: async () => {
      const token = getCollabToken();
      const r = await fetch(`/api/treino/prescricoes?clientId=${clientId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error("Falha ao carregar fichas de treino");
      return r.json();
    },
    enabled: !!clientId,
  });

  async function handleDownload(plano: DietaPlano) {
    const token = getCollabToken();
    try {
      const r = await fetch(`/api/dieta/planos-emitidos/${plano.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "Falha ao baixar PDF");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PlanoNutricional_${plano.nomePaciente.replace(/\s+/g, "_")}_${plano.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast({ title: "Erro ao baixar PDF", description: (e as Error).message, variant: "destructive" });
    }
  }

  const prescricoes = dietaPrescricoes ?? [];
  const planos = dietaPlanos ?? [];
  const treinos = treinoPrescricoes ?? [];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="panel-3d-sub p-4 text-center border-none">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Prescrições de Dieta
          </div>
          <div
            className="text-3xl font-black tabular-nums"
            style={{ color: NAVY, fontFamily: "PaxmedNum, 'Cormorant Garamond', serif" }}
          >
            {prescricoes.length}
          </div>
        </div>
        <div className="panel-3d-sub p-4 text-center border-none">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Planos em PDF
          </div>
          <div
            className="text-3xl font-black tabular-nums"
            style={{ color: NAVY, fontFamily: "PaxmedNum, 'Cormorant Garamond', serif" }}
          >
            {planos.length}
          </div>
        </div>
        <div className="panel-3d-sub p-4 text-center border-none">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            Fichas de Treino
          </div>
          <div
            className="text-3xl font-black tabular-nums"
            style={{ color: NAVY, fontFamily: "PaxmedNum, 'Cormorant Garamond', serif" }}
          >
            {treinos.length}
          </div>
        </div>
      </div>

      {/* Prescrições de dieta (motor manual/determinístico) */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
          <Utensils className="h-3.5 w-3.5" /> Prescrições de Dieta
        </h3>
        {loadingPrescricoes ? (
          <Skeleton className="h-20 rounded-lg panel-3d-sub" />
        ) : prescricoes.length === 0 ? (
          <div className="panel-3d-sub p-6 text-center border-none">
            <p className="text-muted-foreground uppercase font-bold text-xs tracking-widest">
              Nenhuma prescrição de dieta cadastrada.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {prescricoes.map((d) => {
              const s = STATUS_PRESCRICAO[d.status] ?? { label: d.status.toUpperCase(), cls: "bg-muted text-muted-foreground" };
              return (
                <div key={d.id} className="panel-3d-sub p-4 flex items-center justify-between gap-3 border-none">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="concave-3d flex items-center justify-center w-9 h-9 shrink-0 border-none">
                      <Utensils className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase tracking-tight text-foreground truncate">
                        {d.objetivo || "Prescrição de dieta"}
                        {d.estiloAlimentar ? ` · ${d.estiloAlimentar}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {d.caloriasAlvo != null && <span>{Math.round(d.caloriasAlvo)} kcal/dia</span>}
                        <span>{fmtDateTime(d.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-block text-[9px] font-black tracking-widest px-2 py-1 rounded-[4px] ${s.cls}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Planos nutricionais emitidos em PDF */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
          <Utensils className="h-3.5 w-3.5" /> Planos Nutricionais
        </h3>
        {loadingDieta ? (
          <Skeleton className="h-20 rounded-lg panel-3d-sub" />
        ) : planos.length === 0 ? (
          <div className="panel-3d-sub p-6 text-center border-none">
            <p className="text-muted-foreground uppercase font-bold text-xs tracking-widest">
              Nenhum plano nutricional emitido.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {planos.map((p) => (
              <div key={p.id} className="panel-3d-sub p-4 flex items-center justify-between gap-3 border-none">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="concave-3d flex items-center justify-center w-9 h-9 shrink-0 border-none">
                    <Utensils className="h-4 w-4" style={{ color: GOLD }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black uppercase tracking-tight text-foreground truncate">
                      {p.objetivo || "Plano nutricional"}
                      {p.estrategia ? ` · ${p.estrategia}` : ""}
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {p.caloriasAlvo != null && <span>{Math.round(p.caloriasAlvo)} kcal/dia</span>}
                      <span>{fmtDateTime(p.emitidoEm)}</span>
                      {p.emailEnviado && (
                        <span className="flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> E-mail enviado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {p.temPdf ? (
                  <Button
                    className="btn-3d-soft h-7 text-[9px] font-black px-2 shrink-0"
                    onClick={() => handleDownload(p)}
                  >
                    <Download className="w-3 h-3 mr-1" /> PDF
                  </Button>
                ) : (
                  <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest shrink-0">
                    Sem PDF
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fichas de treino prescritas */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
          <Dumbbell className="h-3.5 w-3.5" /> Fichas de Treino
        </h3>
        {loadingTreino ? (
          <Skeleton className="h-20 rounded-lg panel-3d-sub" />
        ) : treinos.length === 0 ? (
          <div className="panel-3d-sub p-6 text-center border-none">
            <p className="text-muted-foreground uppercase font-bold text-xs tracking-widest">
              Nenhuma ficha de treino prescrita.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {treinos.map((t) => {
              const s = STATUS_PRESCRICAO[t.status] ?? { label: t.status.toUpperCase(), cls: "bg-muted text-muted-foreground" };
              return (
                <div key={t.id} className="panel-3d-sub p-4 flex items-center justify-between gap-3 border-none">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="concave-3d flex items-center justify-center w-9 h-9 shrink-0 border-none">
                      <Dumbbell className="h-4 w-4" style={{ color: GOLD }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black uppercase tracking-tight text-foreground truncate">
                        {t.objetivo || "Ficha de treino"}
                        {t.divisao ? ` · ${t.divisao}` : ""}
                      </div>
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {t.frequenciaSemanal != null && <span>{t.frequenciaSemanal}x/semana</span>}
                        <span>{fmtDate(t.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 inline-block text-[9px] font-black tracking-widest px-2 py-1 rounded-[4px] ${s.cls}`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
