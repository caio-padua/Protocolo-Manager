import { useState, useMemo } from "react";
import { useListSessions, useConfirmSubstanceApplication } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatStatus, getStatusColor } from "@/lib/status";
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  addDays, subDays, isSameDay, isSameMonth, eachDayOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Clock, Home, Building2, User,
  CheckCircle2, Search, Download, CalendarPlus, Send, MoreHorizontal, Calendar,
  KeyRound, ShieldCheck, Copy, Loader2, Mail, MailCheck, ClipboardList,
  LayoutGrid, List, Columns3,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { NursingAssessmentForm } from "@/components/nursing-assessment-form";
import { RescheduleDrawer } from "@/components/RescheduleDrawer";

type ViewMode = "dia" | "semana" | "mes";

const STATUS_DOT_COLOR: Record<string, string> = {
  completed: "#22c55e",
  missed: "#ef4444",
  cancelled: "#94a3b8",
  scheduled: "#45B8CC",
};

function buildGoogleCalendarLink(session: {
  clientName: string;
  scheduledDate: string;
  scheduledTime: string;
  weekNumber: number;
  unit: string | null;
  substanceApplications: { substanceName: string; sessionNumber: number; totalSessions: number; availability: string }[];
}): string {
  const [h, m] = session.scheduledTime.split(":").map(Number);
  const dateStr = session.scheduledDate.replace(/-/g, "");
  const startDt = `${dateStr}T${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}00`;
  const endH = String(h + 1).padStart(2, "0");
  const endDt = `${dateStr}T${endH}${String(m).padStart(2, "0")}00`;
  const title = encodeURIComponent(`PAXTER: ${session.clientName} — Semana ${session.weekNumber}`);
  const dispNames = session.substanceApplications
    .filter(a => a.availability === "disp")
    .map(a => `${a.substanceName} ${a.sessionNumber}/${a.totalSessions}`)
    .join(", ");
  const details = encodeURIComponent(`Substâncias: ${dispNames}`);
  const location = encodeURIComponent(session.unit ?? "Padcon Conect");
  return `https://calendar.google.com/calendar/r/eventedit?text=${title}&dates=${startDt}/${endDt}&details=${details}&location=${location}`;
}

function buildWhatsAppLink(session: {
  clientName: string;
  clientPhone: string | null;
  scheduledDate: string;
  scheduledTime: string;
  unit: string | null;
  protocolTitle: string | null;
}): string | null {
  if (!session.clientPhone) return null;
  const phone = session.clientPhone.replace(/\D/g, "");
  const dateFormatted = format(new Date(session.scheduledDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
  const msg = encodeURIComponent(
    `Olá ${session.clientName.split(" ")[0]}! 👋\n\nLembramos que você tem uma sessão agendada:\n\n📅 *${dateFormatted}* às *${session.scheduledTime}*\n📍 ${session.unit ?? "Padcon Conect"}\n\nProtocolo: ${session.protocolTitle ?? "Injetáveis"}\n\nQualquer dúvida, estamos à disposição. ✨`
  );
  return `https://wa.me/55${phone}?text=${msg}`;
}

function MetaField({ label, value, icon: Icon, accent }: { label: string; value: string | null; icon?: any; accent?: boolean }) {
  const empty = value == null || value === "";
  return (
    <div className={`concave-3d px-2.5 py-1.5 min-w-0 ${accent && !empty ? "ring-1 ring-accent/30" : ""}`}>
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1">{label}</div>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-tight leading-none min-w-0">
        {Icon && !empty && <Icon className={`h-3 w-3 shrink-0 ${accent ? "text-accent" : "text-muted-foreground"}`} />}
        <span className={`truncate ${empty ? "text-muted-foreground/40" : accent ? "text-accent font-black" : "text-foreground"}`}>
          {empty ? "—" : value}
        </span>
      </div>
    </div>
  );
}

function getProcedureLabel(session: any): string {
  const apps = session.substanceApplications?.filter((a: any) => a.availability === "disp") ?? [];
  if (apps.length === 0) return "Aplicação";
  const types = new Set(apps.map((a: any) => a.procedureType ?? "iv"));
  if (types.has("implant")) return "Implante";
  if (types.has("im") && !types.has("iv")) return "Aplicação IM";
  if (types.has("iv")) return "Aplicação EV";
  return "Aplicação";
}

function getUnitLabel(session: any): string {
  if (session.serviceType === "homecare") return "Nurse Care Domiciliar";
  return session.unit ?? "—";
}

// ── CARD DE SESSÃO (reutilizado nas 3 visões) ─────────────────────────────────
function SessionCard({
  session,
  isToday,
  canConfirm,
  confirmMutation,
  emailSending,
  calSyncing,
  onGenerateCode,
  onVerifyCode,
  onAssessment,
  onSyncCal,
  onDownloadICS,
  onSendPreEmail,
  onSendPostEmail,
  onReschedule,
}: {
  session: any;
  isToday: boolean;
  canConfirm: boolean;
  confirmMutation: any;
  emailSending: number | null;
  calSyncing: number | null;
  onGenerateCode: (s: any) => void;
  onVerifyCode: (s: any) => void;
  onAssessment: (s: any) => void;
  onSyncCal: (s: any) => void;
  onDownloadICS: (id: number, name: string) => void;
  onSendPreEmail: (s: any) => void;
  onSendPostEmail: (s: any) => void;
  onReschedule: (s: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const whatsappLink = buildWhatsAppLink(session);
  const dispApps = session.substanceApplications.filter((a: any) => a.availability === "disp");
  const allConfirmed = dispApps.length > 0 && dispApps.every((a: any) => a.appliedAt);
  const someConfirmed = dispApps.some((a: any) => a.appliedAt) && !allConfirmed;
  const proxCount = session.substanceApplications.filter((a: any) => a.availability === "prox").length;
  const confirmableCount = dispApps.filter((a: any) => !a.appliedAt).length;
  const visibleApps = expanded ? session.substanceApplications : dispApps;

  const statusBarColor =
    session.status === "completed" ? "bg-green-500/80" :
    session.status === "missed" ? "bg-red-500/80" :
    session.status === "cancelled" ? "bg-slate-400/80" :
    someConfirmed ? "bg-amber-500/80" :
    isToday ? "bg-accent/80" : "bg-slate-300/60";

  return (
    <Card className={`panel-3d-sub overflow-hidden transition-all ${isToday ? "ring-1 ring-accent/30" : ""}`}>
      <div className="flex h-full">
        <div className={`w-1.5 shrink-0 ${statusBarColor}`} />
        <CardContent className="p-0 flex-1 min-w-0">

          {/* TOP BAR */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-muted/20 bg-muted/8">
            <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-black text-primary tabular-nums">{session.scheduledTime}</span>
            <span className="text-muted-foreground/30 text-xs select-none">·</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Sem. {session.weekNumber}</span>

            {/* Procedimento em destaque no top bar */}
            <span className="ml-2 concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-accent">
              {getProcedureLabel(session)}
            </span>

            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="btn-3d-soft h-7 w-7 p-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 panel-3d">
                  <DropdownMenuItem onClick={() => onReschedule(session)} className="gap-2 font-bold uppercase tracking-widest text-[10px] text-accent">
                    <Calendar className="h-4 w-4 text-accent" /> Reagendar Sessão
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onAssessment(session)} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                    <ClipboardList className="h-4 w-4 text-primary" /> Avaliação de Enfermagem
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onGenerateCode(session)} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                    <KeyRound className="h-4 w-4 text-amber-500" /> Gerar Código de Validação
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onVerifyCode(session)} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                    <ShieldCheck className="h-4 w-4 text-green-500" /> Verificar Código do Cliente
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onSendPreEmail(session)} disabled={emailSending === session.id} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                    {emailSending === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-blue-500" />}
                    E-mail Pré-Aplicação
                  </DropdownMenuItem>
                  {session.status === "completed" && (
                    <DropdownMenuItem onClick={() => onSendPostEmail(session)} disabled={emailSending === session.id} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                      {emailSending === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4 text-green-500" />}
                      E-mail Pós-Aplicação (RAS)
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onSyncCal(session)} disabled={calSyncing === session.id} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                    {calSyncing === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4 text-blue-500" />}
                    Sincronizar Google Agenda
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDownloadICS(session.id, session.clientName)} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                    <Download className="h-4 w-4 text-muted-foreground" /> Baixar ICS desta sessão
                  </DropdownMenuItem>
                  {whatsappLink && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => window.open(whatsappLink, "_blank")} className="gap-2 font-bold uppercase tracking-widest text-[10px]">
                        <Send className="h-4 w-4 text-green-500" /> Lembrete via WhatsApp
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* CORPO */}
          <div className="p-3 space-y-2.5">
            <div>
              <div className="text-base font-black uppercase tracking-tight text-foreground leading-snug">
                {session.clientName}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <div className="concave-3d px-2 py-0.5 text-[11px] font-bold text-muted-foreground tabular-nums">
                  {session.clientCpf || "—"}
                </div>
                <div className={`concave-3d px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${getStatusColor(session.status)}`}>
                  {formatStatus(session.status)}
                </div>
              </div>
            </div>

            {/* Meta grid 2×2 — Unidade e Procedimento em destaque */}
            <div className="grid grid-cols-2 gap-1.5">
              <MetaField
                label="Unidade"
                value={getUnitLabel(session)}
                icon={session.serviceType === "homecare" ? Home : Building2}
                accent
              />
              <MetaField
                label="Procedimento"
                value={getProcedureLabel(session)}
                accent
              />
              <MetaField label="Protocolo" value={(session as any).protocolTitle ?? `Protocolo #${session.protocolId}`} />
              <MetaField label="Profissional" value={session.professionalName} icon={User} />
            </div>

            {/* Substâncias */}
            <div className="concave-3d p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2 px-1 min-h-[1.5rem]">
                <div className="flex items-center gap-2">
                  {canConfirm && confirmableCount > 0 ? (
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <Checkbox
                        checked={false}
                        disabled={confirmMutation.isPending}
                        onCheckedChange={() => {
                          dispApps.filter((a: any) => !a.appliedAt).forEach((a: any) =>
                            confirmMutation.mutate({ id: session.id, data: { substanceId: a.substanceId, confirmed: true } })
                          );
                        }}
                        aria-label="Marcar todas como aplicadas"
                      />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Marcar todas</span>
                    </label>
                  ) : allConfirmed ? (
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Concluídas
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">Substâncias</span>
                  )}
                </div>
                {proxCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    className="btn-3d-soft flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-primary"
                  >
                    <Search className="h-3 w-3" />
                    {expanded ? "Só do dia" : `Ver todas (${session.substanceApplications.length})`}
                  </button>
                )}
              </div>

              {visibleApps.length === 0 ? (
                <div className="px-2 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Nenhuma substância para hoje
                </div>
              ) : (
                visibleApps.map((app: any) => {
                  const isDisp = app.availability === "disp";
                  return (
                    <div
                      key={app.id}
                      className="bevel-3d grid grid-cols-[14px_minmax(0,1fr)_0.75rem_3rem_4.5rem_2rem] items-center gap-x-2 px-2.5 py-2"
                    >
                      <span
                        className="h-3.5 w-3.5 rounded-[3px] ring-1 ring-black/15 shadow-inner shrink-0"
                        style={{ backgroundColor: app.substanceColor || "#94a3b8" }}
                      />
                      <span className="min-w-0 truncate text-xs font-bold uppercase tracking-tight text-foreground">
                        {app.substanceName}
                      </span>
                      <span className="justify-self-center h-7 w-px bg-foreground/15" />
                      <span className="text-[11px] font-bold tabular-nums text-right text-muted-foreground/80">
                        {app.sessionNumber > 0 ? `${app.sessionNumber}/${app.totalSessions}` : "—"}
                      </span>
                      {app.appliedAt ? (
                        <span className="text-[9px] font-black uppercase tracking-wider text-center text-green-600">Aplicada</span>
                      ) : isDisp ? (
                        <span className="text-[9px] font-black uppercase tracking-wider text-center text-amber-600">A aplicar</span>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-wider text-center text-slate-400">Próxima</span>
                      )}
                      {app.appliedAt ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 justify-self-center" />
                      ) : isDisp && canConfirm ? (
                        <Checkbox
                          className="justify-self-center"
                          checked={false}
                          disabled={confirmMutation.isPending}
                          aria-label={`Confirmar ${app.substanceName}`}
                          onCheckedChange={() => confirmMutation.mutate({
                            id: session.id,
                            data: { substanceId: app.substanceId, confirmed: true },
                          })}
                        />
                      ) : (
                        <span className="justify-self-center" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

// ── LISTA DE SESSÕES DE UM DIA (reutilizada no modo Dia e no painel do Mês) ───
function DaySessionList({
  day,
  sessions,
  isToday,
  confirmMutation,
  emailSending,
  calSyncing,
  onGenerateCode,
  onVerifyCode,
  onAssessment,
  onSyncCal,
  onDownloadICS,
  onSendPreEmail,
  onSendPostEmail,
  onReschedule,
}: {
  day: Date;
  sessions: any[];
  isToday: boolean;
  confirmMutation: any;
  emailSending: number | null;
  calSyncing: number | null;
  onGenerateCode: (s: any) => void;
  onVerifyCode: (s: any) => void;
  onAssessment: (s: any) => void;
  onSyncCal: (s: any) => void;
  onDownloadICS: (id: number, name: string) => void;
  onSendPreEmail: (s: any) => void;
  onSendPostEmail: (s: any) => void;
  onReschedule: (s: any) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="concave-3d flex flex-col items-center justify-center py-12 rounded-[6px]">
        <Calendar className="h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">
          Nenhum atendimento em {format(day, "dd/MM/yyyy")}
        </p>
      </div>
    );
  }

  const sorted = [...sessions].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  return (
    <div className="space-y-2">
      {sorted.map(session => {
        const canConfirm = session.status !== "completed" && session.status !== "cancelled" && session.status !== "missed";
        return (
          <SessionCard
            key={session.id}
            session={session}
            isToday={isToday}
            canConfirm={canConfirm}
            confirmMutation={confirmMutation}
            emailSending={emailSending}
            calSyncing={calSyncing}
            onGenerateCode={onGenerateCode}
            onVerifyCode={onVerifyCode}
            onAssessment={onAssessment}
            onSyncCal={onSyncCal}
            onDownloadICS={onDownloadICS}
            onSendPreEmail={onSendPreEmail}
            onSendPostEmail={onSendPostEmail}
            onReschedule={onReschedule}
          />
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Agenda() {
  const { toast } = useToast();
  const today = useMemo(() => new Date(), []);

  // ── ESTADO DE NAVEGAÇÃO ───────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("semana");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // ── MODAIS ────────────────────────────────────────────────────────────────
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [codeModalSession, setCodeModalSession] = useState<any>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState<string | null>(null);

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifySession, setVerifySession] = useState<any>(null);
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<"success" | "error" | null>(null);

  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [assessmentSession, setAssessmentSession] = useState<any>(null);
  const [emailSending, setEmailSending] = useState<number | null>(null);
  const [calSyncing, setCalSyncing] = useState<number | null>(null);

  // ── REAGENDADOR ───────────────────────────────────────────────────────────
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSession, setRescheduleSession] = useState<any>(null);

  // ── RANGE DE DATAS POR MODO ───────────────────────────────────────────────
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  const dateFrom =
    viewMode === "dia" ? format(currentDate, "yyyy-MM-dd") :
    viewMode === "semana" ? format(weekStart, "yyyy-MM-dd") :
    format(monthStart, "yyyy-MM-dd");

  const dateTo =
    viewMode === "dia" ? format(currentDate, "yyyy-MM-dd") :
    viewMode === "semana" ? format(weekEnd, "yyyy-MM-dd") :
    format(monthEnd, "yyyy-MM-dd");

  const { data: sessions, isLoading, refetch } = useListSessions({ dateFrom, dateTo });

  // Mapa date-string → sessões (usado no modo Mês — sempre calculado, hooks não podem ser condicionais)
  const sessionsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const s of sessions ?? []) {
      const k = s.scheduledDate;
      if (!map[k]) map[k] = [];
      map[k].push(s);
    }
    return map;
  }, [sessions]);

  const confirmMutation = useConfirmSubstanceApplication({
    mutation: {
      onSuccess: () => { toast({ title: "Substância confirmada!" }); refetch(); },
      onError: () => { toast({ title: "Erro ao confirmar", variant: "destructive" }); },
    },
  });

  // ── NAVEGAÇÃO ─────────────────────────────────────────────────────────────
  function navPrev() {
    if (viewMode === "dia") setCurrentDate(d => subDays(d, 1));
    else if (viewMode === "semana") setCurrentDate(d => subWeeks(d, 1));
    else setCurrentDate(d => subMonths(d, 1));
    setSelectedDay(null);
  }
  function navNext() {
    if (viewMode === "dia") setCurrentDate(d => addDays(d, 1));
    else if (viewMode === "semana") setCurrentDate(d => addWeeks(d, 1));
    else setCurrentDate(d => addMonths(d, 1));
    setSelectedDay(null);
  }
  function goToday() {
    setCurrentDate(new Date());
    setSelectedDay(null);
  }

  // ── LABEL DO PERÍODO ──────────────────────────────────────────────────────
  const periodLabel =
    viewMode === "dia"
      ? format(currentDate, "EEEE, dd 'de' MMM yyyy", { locale: ptBR })
      : viewMode === "semana"
      ? `${format(weekStart, "dd 'de' MMM", { locale: ptBR })} — ${format(weekEnd, "dd 'de' MMM yyyy", { locale: ptBR })}`
      : format(currentDate, "MMMM yyyy", { locale: ptBR });

  // ── AÇÕES ICS / EMAIL / CAL ───────────────────────────────────────────────
  function downloadWeekICS() {
    const url = `/api/sessions/ics?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const a = document.createElement("a");
    a.href = url; a.download = `paxter_${dateFrom}_a_${dateTo}.ics`; a.click();
    toast({ title: "ICS baixado!", description: "Importe no Google Agenda ou Apple Calendar." });
  }

  function downloadSessionICS(sessionId: number, clientName: string) {
    const url = `/api/sessions/${sessionId}/ics`;
    const a = document.createElement("a");
    a.href = url; a.download = `paxter_sessao_${sessionId}.ics`; a.click();
    toast({ title: "ICS baixado!", description: `Sessão de ${clientName}.` });
  }

  async function generateValidationCode(session: any) {
    setCodeModalSession(session); setCodeModalOpen(true);
    setGeneratedCode(null); setCodeLoading(true);
    try {
      const res = await fetch("/api/validation-codes/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (res.ok) { setGeneratedCode(data.code); setCodeExpiry(data.expiresAt); }
      else toast({ title: "Erro ao gerar código", variant: "destructive" });
    } catch { toast({ title: "Erro de conexão", variant: "destructive" }); }
    finally { setCodeLoading(false); }
  }

  async function verifyCode() {
    if (!verifySession || !verifyInput) return;
    setVerifyLoading(true); setVerifyResult(null);
    try {
      const res = await fetch("/api/validation-codes/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: verifySession.id, code: verifyInput }),
      });
      const data = await res.json();
      if (data.valid) {
        setVerifyResult("success");
        toast({ title: "Cliente validado!", description: `${verifySession.clientName} confirmou presença.` });
        refetch();
      } else { setVerifyResult("error"); }
    } catch { setVerifyResult("error"); }
    finally { setVerifyLoading(false); }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast({ title: "Código copiado!" });
  }

  async function syncToGoogleCalendar(session: any) {
    setCalSyncing(session.id);
    try {
      const res = await fetch(`/api/google-calendar/sync-session/${session.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) toast({ title: "Sincronizado!", description: `Sessão de ${session.clientName} adicionada ao Google Agenda.` });
      else toast({ title: "Erro ao sincronizar", description: data.error, variant: "destructive" });
    } catch { toast({ title: "Erro de conexão", variant: "destructive" }); }
    finally { setCalSyncing(null); }
  }

  async function syncPeriodToGoogleCalendar() {
    setCalSyncing(-1);
    try {
      const res = await fetch("/api/google-calendar/sync-week", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await res.json();
      if (res.ok) toast({ title: "Período sincronizado!", description: `${data.synced} sessões adicionadas ao Google Agenda.` });
      else toast({ title: "Erro", description: data.error, variant: "destructive" });
    } catch { toast({ title: "Erro de conexão", variant: "destructive" }); }
    finally { setCalSyncing(null); }
  }

  async function sendPreSessionEmail(session: any) {
    setEmailSending(session.id);
    try {
      const res = await fetch(`/api/email/send-pre-session/${session.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) toast({ title: "E-mail enviado!", description: `Pré-aplicação enviado para ${session.clientName}. Código: ${data.code}` });
      else toast({ title: "Erro ao enviar e-mail", description: data.error, variant: "destructive" });
    } catch { toast({ title: "Erro de conexão", variant: "destructive" }); }
    finally { setEmailSending(null); }
  }

  async function sendPostSessionEmail(session: any) {
    setEmailSending(session.id);
    try {
      const res = await fetch(`/api/email/send-post-session/${session.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) toast({ title: "E-mail enviado!", description: `RAS pós-aplicação enviado para ${session.clientName}.` });
      else toast({ title: "Erro ao enviar e-mail", description: data.error, variant: "destructive" });
    } catch { toast({ title: "Erro de conexão", variant: "destructive" }); }
    finally { setEmailSending(null); }
  }

  const sharedCardProps = {
    confirmMutation,
    emailSending,
    calSyncing,
    onGenerateCode: generateValidationCode,
    onVerifyCode: (s: any) => { setVerifySession(s); setVerifyInput(""); setVerifyResult(null); setVerifyModalOpen(true); },
    onAssessment: (s: any) => { setAssessmentSession(s); setAssessmentModalOpen(true); },
    onSyncCal: syncToGoogleCalendar,
    onDownloadICS: downloadSessionICS,
    onSendPreEmail: sendPreSessionEmail,
    onSendPostEmail: sendPostSessionEmail,
    onReschedule: (s: any) => { setRescheduleSession(s); setRescheduleOpen(true); },
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── CABEÇALHO ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Agenda</h1>
          <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-1">
            {viewMode === "dia" ? "Visão diária" : viewMode === "semana" ? "Uma visita consolidada por semana" : "Visão mensal — clique num dia para ver detalhes"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Dia / Semana / Mês */}
          <div className="concave-3d flex items-center p-0.5 gap-0.5">
            {([
              { id: "dia", label: "Dia", Icon: List },
              { id: "semana", label: "Semana", Icon: Columns3 },
              { id: "mes", label: "Mês", Icon: LayoutGrid },
            ] as { id: ViewMode; label: string; Icon: any }[]).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => { setViewMode(id); setSelectedDay(null); }}
                className={`${viewMode === id ? "bevel-3d text-primary" : "btn-3d-soft text-muted-foreground"} flex items-center gap-1.5 rounded-[4px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Navegação prev / período / next */}
          <div className="flex items-center gap-1 p-1 concave-3d">
            <Button variant="ghost" size="sm" onClick={navPrev} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="bevel-3d px-3 py-1.5 text-[11px] font-black uppercase tracking-widest min-w-[200px] text-center capitalize">
              {periodLabel}
            </div>
            <Button variant="ghost" size="sm" onClick={navNext} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={goToday} className="btn-3d-soft h-9 px-3 uppercase tracking-widest text-[11px] font-bold">Hoje</Button>
          <Button variant="outline" size="sm" onClick={downloadWeekICS} className="btn-3d-soft gap-2 h-9 px-3 uppercase tracking-widest text-[11px] font-bold" disabled={!sessions?.length}>
            <Download className="h-3.5 w-3.5" /> ICS
          </Button>
          <Button variant="outline" size="sm" onClick={syncPeriodToGoogleCalendar} className="btn-3d gap-2 h-9 px-3 uppercase tracking-widest text-[11px] font-bold" disabled={!sessions?.length || calSyncing === -1}>
            {calSyncing === -1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
            Sync
          </Button>
        </div>
      </div>

      {/* ── CORPO ── */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-[6px]" />)}</div>
      ) : (
        <>
          {/* ═══ MODO DIA ═══ */}
          {viewMode === "dia" && (
            <DaySessionList
              day={currentDate}
              sessions={sessions ?? []}
              isToday={isSameDay(currentDate, today)}
              {...sharedCardProps}
            />
          )}

          {/* ═══ MODO SEMANA ═══ */}
          {viewMode === "semana" && (() => {
            const days = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + i);
              return d;
            });
            return (
              <div className="space-y-2">
                {days.map(day => {
                  const daySessions = (sessions ?? []).filter(s => {
                    const d = new Date(s.scheduledDate + "T12:00:00");
                    return d.toDateString() === day.toDateString();
                  });
                  const isDayToday = isSameDay(day, today);
                  const isPast = day < today && !isDayToday;
                  const hasSessions = daySessions.length > 0;

                  return (
                    <div key={day.toISOString()} className={`space-y-2 ${!hasSessions && !isDayToday ? "opacity-25" : ""}`}>
                      <div className="flex items-center gap-3 pt-3">
                        <div className={`panel-3d-active flex items-center gap-3 px-4 py-2 rounded-[6px] ${isDayToday ? "ring-2 ring-accent/70" : isPast ? "opacity-60" : ""}`}>
                          <div className="flex flex-col items-center min-w-[2.25rem]">
                            <span className={`text-[9px] font-black uppercase tracking-widest leading-none ${isDayToday ? "text-primary" : "text-muted-foreground"}`}>
                              {format(day, "EEE", { locale: ptBR })}
                            </span>
                            <span className={`text-2xl font-black leading-none mt-0.5 tabular-nums ${isDayToday ? "text-primary" : "text-foreground"}`}>
                              {format(day, "dd")}
                            </span>
                          </div>
                          {hasSessions && (
                            <div className="concave-3d px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                              {daySessions.length} {daySessions.length === 1 ? "atendimento" : "atendimentos"}
                            </div>
                          )}
                        </div>
                        <div className={`flex-1 h-0.5 ${isDayToday ? "bg-accent/30" : "bg-foreground/8"}`} />
                      </div>

                      <div className="ml-2 sm:ml-4 space-y-2">
                        {daySessions
                          .slice()
                          .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
                          .map(session => {
                            const canConfirm = session.status !== "completed" && session.status !== "cancelled" && session.status !== "missed";
                            return (
                              <SessionCard
                                key={session.id}
                                session={session}
                                isToday={isDayToday}
                                canConfirm={canConfirm}
                                {...sharedCardProps}
                              />
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ═══ MODO MÊS ═══ */}
          {viewMode === "mes" && (() => {
            // Gera grade: começa na segunda-feira da semana do 1º dia do mês
            const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
            const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
            const allDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

            const activeDay = selectedDay ?? (isSameMonth(today, currentDate) ? today : null);
            const activeDayStr = activeDay ? format(activeDay, "yyyy-MM-dd") : null;
            const activeDaySessions = activeDayStr ? (sessionsByDate[activeDayStr] ?? []) : [];

            const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

            return (
              <div className="space-y-4">
                {/* Grade do calendário */}
                <div className="panel-3d rounded-[6px] overflow-hidden">
                  {/* Cabeçalho de dias */}
                  <div className="grid grid-cols-7 border-b border-muted/20">
                    {DAY_NAMES.map(d => (
                      <div key={d} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Células do mês */}
                  <div className="grid grid-cols-7">
                    {allDays.map((day, idx) => {
                      const dayStr = format(day, "yyyy-MM-dd");
                      const daySessions = sessionsByDate[dayStr] ?? [];
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      const isDayToday = isSameDay(day, today);
                      const isSelected = activeDay ? isSameDay(day, activeDay) : false;
                      const hasSessions = daySessions.length > 0;

                      // dots por status (máx 4 visíveis)
                      const dots = daySessions.slice(0, 4);

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedDay(isSameDay(day, activeDay ?? new Date(0)) ? null : day)}
                          className={[
                            "relative flex flex-col items-center py-2 px-1 min-h-[68px] transition-all border-b border-r border-muted/10 last:border-r-0",
                            !isCurrentMonth ? "opacity-30" : "",
                            isSelected ? "concave-3d" : hasSessions ? "hover:bg-accent/5 cursor-pointer" : "cursor-default",
                            isDayToday ? "ring-inset ring-1 ring-accent/60" : "",
                          ].join(" ")}
                        >
                          {/* Número do dia */}
                          <span className={[
                            "text-[13px] font-black tabular-nums leading-none mb-1",
                            isDayToday ? "text-accent" : isSelected ? "text-primary" : isCurrentMonth ? "text-foreground" : "text-muted-foreground",
                          ].join(" ")}>
                            {format(day, "d")}
                          </span>

                          {/* Dots de sessão */}
                          {hasSessions && (
                            <div className="flex flex-wrap justify-center gap-[3px] mt-0.5">
                              {dots.map((s, i) => (
                                <span
                                  key={i}
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: STATUS_DOT_COLOR[s.status] ?? "#45B8CC" }}
                                />
                              ))}
                              {daySessions.length > 4 && (
                                <span className="text-[8px] font-black text-muted-foreground leading-none mt-px">
                                  +{daySessions.length - 4}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Contagem total */}
                          {hasSessions && (
                            <span className="absolute bottom-1 right-1.5 text-[9px] font-black tabular-nums text-muted-foreground/50">
                              {daySessions.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Legenda de cores */}
                <div className="flex items-center gap-4 flex-wrap px-1">
                  {Object.entries(STATUS_DOT_COLOR).map(([status, color]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                        {status === "completed" ? "Concluído" : status === "missed" ? "Faltou" : status === "cancelled" ? "Cancelado" : "Agendado"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Detalhe do dia selecionado */}
                {activeDay && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="panel-3d-active flex items-center gap-3 px-4 py-2 rounded-[6px]">
                        <div className="flex flex-col items-center min-w-[2.25rem]">
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary leading-none">
                            {format(activeDay, "EEE", { locale: ptBR })}
                          </span>
                          <span className="text-2xl font-black text-primary tabular-nums leading-none mt-0.5">
                            {format(activeDay, "dd")}
                          </span>
                        </div>
                        <div className="concave-3d px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          {format(activeDay, "MMMM yyyy", { locale: ptBR })}
                        </div>
                        {activeDaySessions.length > 0 && (
                          <div className="concave-3d px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-accent">
                            {activeDaySessions.length} {activeDaySessions.length === 1 ? "atendimento" : "atendimentos"}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 h-0.5 bg-accent/30" />
                    </div>

                    <DaySessionList
                      day={activeDay}
                      sessions={activeDaySessions}
                      isToday={isSameDay(activeDay, today)}
                      {...sharedCardProps}
                    />
                  </div>
                )}

                {!activeDay && !sessions?.length && (
                  <div className="concave-3d flex flex-col items-center justify-center py-12 rounded-[6px]">
                    <Calendar className="h-10 w-10 text-muted-foreground/20 mb-3" />
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/50">
                      Nenhum atendimento em {format(currentDate, "MMMM yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}

                {!activeDay && !!sessions?.length && (
                  <p className="text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                    Clique em um dia para ver os atendimentos
                  </p>
                )}
              </div>
            );
          })()}

          {/* Vazio geral (semana/dia) */}
          {viewMode !== "mes" && !sessions?.length && !isLoading && (
            <Card className="panel-3d">
              <CardContent className="flex flex-col items-center justify-center py-20">
                <div className="concave-3d p-6 rounded-[6px] mb-4">
                  <Calendar className="h-12 w-12 text-muted-foreground opacity-30" />
                </div>
                <p className="text-lg font-black uppercase tracking-tight text-primary">Nenhuma sessão neste período</p>
                <p className="text-muted-foreground text-sm font-medium mt-1">Valide um protocolo para gerar sessões automaticamente.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── MODAL: CÓDIGO DE VALIDAÇÃO ── */}
      <Dialog open={codeModalOpen} onOpenChange={setCodeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" /> Código de Validação
            </DialogTitle>
            <DialogDescription>Código de 6 dígitos para validação de presença do cliente.</DialogDescription>
          </DialogHeader>
          {codeLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : generatedCode ? (
            <div className="space-y-4">
              <div className="bg-slate-900 rounded-xl p-6 text-center">
                <p className="text-xs text-slate-400 mb-2 uppercase tracking-wider">Código do Cliente</p>
                <p className="text-4xl font-mono font-bold text-white tracking-[0.5em]">{generatedCode}</p>
                <p className="text-xs text-slate-400 mt-3">
                  Válido até {codeExpiry ? format(new Date(codeExpiry), "HH:mm", { locale: ptBR }) : "—"}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <p><span className="font-medium">Cliente:</span> {codeModalSession?.clientName}</p>
                <p><span className="font-medium">Sessão:</span> {codeModalSession?.scheduledDate && format(new Date(codeModalSession.scheduledDate + "T12:00:00"), "dd/MM/yyyy")} às {codeModalSession?.scheduledTime}</p>
                <p><span className="font-medium">Procedimento:</span> {getProcedureLabel(codeModalSession)}</p>
                <p><span className="font-medium">Unidade:</span> {getUnitLabel(codeModalSession)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => copyCode(generatedCode)}>
                  <Copy className="h-4 w-4" /> Copiar Código
                </Button>
                <Button variant="outline" className="flex-1 gap-2"
                  onClick={() => {
                    const phone = codeModalSession?.clientPhone?.replace(/\D/g, "");
                    if (!phone) { toast({ title: "Cliente sem telefone", variant: "destructive" }); return; }
                    const dateStr = codeModalSession?.scheduledDate ? format(new Date(codeModalSession.scheduledDate + "T12:00:00"), "dd/MM/yyyy") : "";
                    const proc = getProcedureLabel(codeModalSession);
                    const msg = encodeURIComponent(`PAXTER | ${proc} | ${generatedCode}\n\nOlá ${codeModalSession?.clientName?.split(" ")[0]}!\n\nSeu código de validação para a sessão de ${dateStr} é:\n\n🔑 *${generatedCode}*\n\nApresente este código à enfermeira no momento da aplicação.`);
                    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
                  }}
                >
                  <Send className="h-4 w-4 text-green-500" /> WhatsApp
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <NursingAssessmentForm
        open={assessmentModalOpen}
        onOpenChange={setAssessmentModalOpen}
        session={assessmentSession}
        onSuccess={() => refetch()}
      />

      {/* ── MODAL: VERIFICAR CÓDIGO ── */}
      <Dialog open={verifyModalOpen} onOpenChange={setVerifyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" /> Verificar Código
            </DialogTitle>
            <DialogDescription>Digite o código de 6 dígitos informado pelo cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {verifySession && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p><span className="font-medium">Cliente:</span> {verifySession.clientName}</p>
                <p><span className="font-medium">Sessão:</span> {verifySession.scheduledDate && format(new Date(verifySession.scheduledDate + "T12:00:00"), "dd/MM/yyyy")} às {verifySession.scheduledTime}</p>
              </div>
            )}
            <Input
              value={verifyInput}
              onChange={e => setVerifyInput(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="EX: A7K3M2"
              className="text-center text-2xl font-mono tracking-[0.3em] h-14"
              maxLength={6}
              onKeyDown={e => e.key === "Enter" && verifyCode()}
            />
            {verifyResult === "success" && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" /> Cliente validado com sucesso!
              </div>
            )}
            {verifyResult === "error" && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm font-medium">
                Código inválido ou expirado. Peça ao cliente para verificar.
              </div>
            )}
            <Button className="w-full gap-2" onClick={verifyCode} disabled={verifyLoading || verifyInput.length < 6}>
              {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Verificar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── REAGENDADOR (painel deslizante) ── */}
      <RescheduleDrawer
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        session={rescheduleSession}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
