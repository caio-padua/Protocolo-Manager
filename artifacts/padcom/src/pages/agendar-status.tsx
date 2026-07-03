import { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import {
  Loader2, AlertCircle, CheckCircle, Clock, XCircle, CalendarDays, RefreshCw,
} from "lucide-react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { PAXTER_SITE_URL } from "@/lib/brand";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Status honesto vindo do backend (nunca diz "confirmado" antes da baixa real).
type ArrivalStatus = {
  status: "pago" | "aguardando" | "expirado" | "cancelado" | "gerar";
  chosenDate: string | null;
  chosenTime: string | null;
  patientName: string | null;
  finalized: boolean;
};

function brDate(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

// Cada status vira uma faixa visual honesta (cor + rotulo + explicacao).
const STATUS_MAP: Record<
  ArrivalStatus["status"],
  { label: string; hint: string; icon: typeof Clock; tone: string; ring: string }
> = {
  pago: {
    label: "PAGAMENTO CONFIRMADO",
    hint: "Recebemos seu pagamento. Seu horário está garantido.",
    icon: CheckCircle,
    tone: "text-emerald-700",
    ring: "border-emerald-300 bg-emerald-50",
  },
  aguardando: {
    label: "AGUARDANDO PAGAMENTO",
    hint: "Assim que o pagamento for compensado, seu horário fica garantido.",
    icon: Clock,
    tone: "text-amber-700",
    ring: "border-amber-300 bg-amber-50",
  },
  gerar: {
    label: "AGUARDANDO PAGAMENTO",
    hint: "Assim que o pagamento for compensado, seu horário fica garantido.",
    icon: Clock,
    tone: "text-amber-700",
    ring: "border-amber-300 bg-amber-50",
  },
  expirado: {
    label: "PAGAMENTO VENCIDO",
    hint: "O prazo do pagamento venceu. Entre em contato para renovar.",
    icon: XCircle,
    tone: "text-red-700",
    ring: "border-red-300 bg-red-50",
  },
  cancelado: {
    label: "AGENDAMENTO CANCELADO",
    hint: "Este agendamento foi cancelado. Entre em contato conosco.",
    icon: XCircle,
    tone: "text-red-700",
    ring: "border-red-300 bg-red-50",
  },
};

export default function AgendarStatus() {
  const [, params] = useRoute("/agendar/status/:id");
  const id = params?.id ?? "";
  const [data, setData] = useState<ArrivalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const token =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("t") ?? ""
      : "";

  const load = useCallback(async () => {
    if (!id || !token) {
      setError("Link inválido ou expirado.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/scheduling/${encodeURIComponent(id)}/arrival-status?t=${encodeURIComponent(token)}`,
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Link inválido ou expirado.");
        return;
      }
      setData(body);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Status fora do mapa (ex.: "nao_aplicavel") cai num cartao neutro honesto,
  // nunca em branco.
  const FALLBACK = {
    label: "AGENDAMENTO EM ANÁLISE",
    hint: "Estamos processando seu agendamento. Atualize em instantes.",
    icon: Clock,
    tone: "text-slate-700",
    ring: "border-slate-300 bg-slate-50",
  };
  const view = data ? (STATUS_MAP[data.status] ?? FALLBACK) : null;
  const StatusIcon = view?.icon ?? Clock;

  return (
    <div className="area-elite min-h-screen bg-slate-50 flex flex-col">
      <header className="panel-3d px-4 py-5 flex items-center justify-center border-b border-border/60">
        <div className="flex items-center gap-3">
          <a
            href={PAXTER_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="PAXTER — site institucional"
            className="rounded-xl flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70"
          >
            <PaxterSymbolGlass size={32} tone="dark" />
          </a>
          <div>
            <h1 className="text-primary font-black text-xl tracking-[0.16em] uppercase leading-none">
              PAXTER
            </h1>
            <p className="text-accent text-[10px] uppercase tracking-widest mt-0.5">
              STATUS DO AGENDAMENTO
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          {loading ? (
            <div className="panel-3d rounded-xl p-8 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <p className="text-muted-foreground text-sm uppercase tracking-widest">
                Consultando…
              </p>
            </div>
          ) : error ? (
            <div className="panel-3d rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm font-bold">{error}</p>
              </div>
              <p className="text-muted-foreground text-xs">
                Confira o link recebido no e-mail ou entre em contato conosco.
              </p>
            </div>
          ) : data && view ? (
            <>
              <div className="panel-3d rounded-xl overflow-hidden">
                <div className="bg-primary px-5 py-4">
                  <h2 className="text-white font-black text-sm uppercase tracking-widest">
                    {data.patientName ? data.patientName.toUpperCase() : "SEU AGENDAMENTO"}
                  </h2>
                  <p className="text-primary-foreground/80 text-xs mt-1">
                    Acompanhe aqui a situação do seu horário.
                  </p>
                </div>

                <div className="p-5 space-y-4">
                  {/* Faixa de status honesto */}
                  <div className={`rounded-lg border px-4 py-4 flex items-start gap-3 ${view.ring}`}>
                    <StatusIcon className={`w-6 h-6 flex-shrink-0 ${view.tone}`} />
                    <div>
                      <p className={`text-sm font-black uppercase tracking-widest ${view.tone}`}>
                        {view.label}
                      </p>
                      <p className="text-slate-600 text-xs mt-1">{view.hint}</p>
                    </div>
                  </div>

                  {/* Tabela do horario escolhido */}
                  <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                    <tbody>
                      <tr className="bg-slate-100">
                        <td className="px-3 py-2 font-black text-primary uppercase text-xs tracking-widest w-1/2">
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5" /> Data
                          </span>
                        </td>
                        <td className="px-3 py-2 text-primary font-mono">{brDate(data.chosenDate)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-black text-primary uppercase text-xs tracking-widest">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" /> Horário
                          </span>
                        </td>
                        <td className="px-3 py-2 text-primary font-mono">{data.chosenTime ?? "—"}</td>
                      </tr>
                    </tbody>
                  </table>

                  <button
                    onClick={load}
                    className="btn-3d-soft w-full h-11 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest"
                  >
                    <RefreshCw className="w-4 h-4" /> ATUALIZAR STATUS
                  </button>
                </div>
              </div>

              <div className="text-center">
                <a
                  href={`${API_BASE}/area`}
                  className="inline-flex items-center gap-1.5 text-accent text-xs uppercase tracking-wider hover:text-primary"
                >
                  Acessar minha área do paciente
                </a>
              </div>
            </>
          ) : null}

          <p className="text-center text-muted-foreground text-[10px] uppercase tracking-widest">
            Instituto Pádua · Paxter — desenvolvido pela Padcon
          </p>
        </div>
      </main>
    </div>
  );
}
