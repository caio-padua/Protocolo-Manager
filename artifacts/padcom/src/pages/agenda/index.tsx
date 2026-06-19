import { useState } from "react";
import { useListSessions, useConfirmSubstanceApplication } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { formatStatus, getStatusColor } from "@/lib/status";
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Clock, Home, Building2, User,
  CheckCheck, Download, CalendarPlus, Send, MoreHorizontal, Calendar,
  KeyRound, ShieldCheck, Copy, Loader2, Mail, MailCheck, ClipboardList,
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

  const title = encodeURIComponent(`PADCOM: ${session.clientName} — Semana ${session.weekNumber}`);
  const dispNames = session.substanceApplications
    .filter(a => a.availability === "disp")
    .map(a => `${a.substanceName} ${a.sessionNumber}/${a.totalSessions}`)
    .join(", ");
  const details = encodeURIComponent(`Substâncias: ${dispNames}`);
  const location = encodeURIComponent(session.unit ?? "Clínica PADCOM");

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
    `Olá ${session.clientName.split(" ")[0]}! 👋\n\nLembramos que você tem uma sessão agendada:\n\n📅 *${dateFormatted}* às *${session.scheduledTime}*\n📍 ${session.unit ?? "Clínica PADCOM"}\n\nProtocolo: ${session.protocolTitle ?? "Injetáveis"}\n\nQualquer dúvida, estamos à disposição. ✨`
  );
  return `https://wa.me/55${phone}?text=${msg}`;
}

export default function Agenda() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const { toast } = useToast();

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

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });

  const dateFrom = format(weekStart, "yyyy-MM-dd");
  const dateTo = format(weekEnd, "yyyy-MM-dd");

  const { data: sessions, isLoading, refetch } = useListSessions({ dateFrom, dateTo });

  const confirmMutation = useConfirmSubstanceApplication({
    mutation: {
      onSuccess: () => {
        toast({ title: "Substância confirmada!" });
        refetch();
      },
      onError: () => {
        toast({ title: "Erro ao confirmar", variant: "destructive" });
      }
    }
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  function downloadWeekICS() {
    const url = `/api/sessions/ics?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `padcom_${dateFrom}_a_${dateTo}.ics`;
    a.click();
    toast({ title: "ICS da semana baixado!", description: "Importe no Google Agenda ou Apple Calendar." });
  }

  function downloadSessionICS(sessionId: number, clientName: string) {
    const url = `/api/sessions/${sessionId}/ics`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `padcom_sessao_${sessionId}.ics`;
    a.click();
    toast({ title: "ICS baixado!", description: `Sessão de ${clientName}.` });
  }

  async function generateValidationCode(session: any) {
    setCodeModalSession(session);
    setCodeModalOpen(true);
    setGeneratedCode(null);
    setCodeLoading(true);
    try {
      const res = await fetch("/api/validation-codes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedCode(data.code);
        setCodeExpiry(data.expiresAt);
      } else {
        toast({ title: "Erro ao gerar código", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setCodeLoading(false);
    }
  }

  async function verifyCode() {
    if (!verifySession || !verifyInput) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/validation-codes/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: verifySession.id, code: verifyInput }),
      });
      const data = await res.json();
      if (data.valid) {
        setVerifyResult("success");
        toast({ title: "Cliente validado!", description: `${verifySession.clientName} confirmou presença.` });
        refetch();
      } else {
        setVerifyResult("error");
      }
    } catch {
      setVerifyResult("error");
    } finally {
      setVerifyLoading(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    toast({ title: "Código copiado!" });
  }

  const [assessmentModalOpen, setAssessmentModalOpen] = useState(false);
  const [assessmentSession, setAssessmentSession] = useState<any>(null);

  const [emailSending, setEmailSending] = useState<number | null>(null);
  const [calSyncing, setCalSyncing] = useState<number | null>(null);

  async function syncToGoogleCalendar(session: any) {
    setCalSyncing(session.id);
    try {
      const res = await fetch(`/api/google-calendar/sync-session/${session.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "Sincronizado!", description: `Sessão de ${session.clientName} adicionada ao Google Agenda.` });
      } else {
        toast({ title: "Erro ao sincronizar", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setCalSyncing(null);
    }
  }

  async function syncWeekToGoogleCalendar() {
    setCalSyncing(-1);
    try {
      const res = await fetch("/api/google-calendar/sync-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Semana sincronizada!", description: `${data.synced} sessões adicionadas ao Google Agenda.` });
      } else {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setCalSyncing(null);
    }
  }

  async function sendPreSessionEmail(session: any) {
    setEmailSending(session.id);
    try {
      const res = await fetch(`/api/email/send-pre-session/${session.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "E-mail enviado!", description: `Pré-aplicação enviado para ${session.clientName}. Código: ${data.code}` });
      } else {
        toast({ title: "Erro ao enviar e-mail", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setEmailSending(null);
    }
  }

  async function sendPostSessionEmail(session: any) {
    setEmailSending(session.id);
    try {
      const res = await fetch(`/api/email/send-post-session/${session.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "E-mail enviado!", description: `RAS pós-aplicação enviado para ${session.clientName}.` });
      } else {
        toast({ title: "Erro ao enviar e-mail", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro de conexão", variant: "destructive" });
    } finally {
      setEmailSending(null);
    }
  }

  function getProcedureLabel(session: any): string {
    const apps = session.substanceApplications?.filter((a: any) => a.availability === "disp") ?? [];
    if (apps.length === 0) return "Aplicação";
    const types = new Set(apps.map((a: any) => a.procedureType ?? "iv"));
    if (types.has("implant")) return "Implante";
    if (types.has("im") && !types.has("iv")) return "Aplicação Intramuscular";
    if (types.has("iv")) return "Aplicação Endovenosa";
    return "Aplicação";
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda Semanal</h1>
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-wide">Uma visita consolidada por semana por cliente.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 p-1.5 concave-3d">
            <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))} className="h-8 w-8 p-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="bevel-3d px-4 py-1.5 text-xs font-bold uppercase tracking-widest min-w-[220px] text-center">
              {format(weekStart, "dd 'de' MMM", { locale: ptBR })} — {format(weekEnd, "dd 'de' MMM yyyy", { locale: ptBR })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))} className="h-8 w-8 p-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())} className="btn-3d-soft h-9 px-4 uppercase tracking-widest text-[11px] font-bold">Hoje</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadWeekICS}
            className="btn-3d-soft gap-2 h-9 px-4 uppercase tracking-widest text-[11px] font-bold"
            disabled={!sessions?.length}
          >
            <Download className="h-3.5 w-3.5" />
            ICS
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={syncWeekToGoogleCalendar}
            className="btn-3d gap-2 h-9 px-4 uppercase tracking-widest text-[11px] font-bold"
            disabled={!sessions?.length || calSyncing === -1}
          >
            {calSyncing === -1 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CalendarPlus className="h-3.5 w-3.5" />
            )}
            Sync Google
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-[6px]" />)}
        </div>
      ) : !sessions?.length ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="concave-3d p-6 rounded-full mb-4">
              <Calendar className="h-12 w-12 text-muted-foreground opacity-30" />
            </div>
            <p className="text-lg font-black uppercase tracking-tight text-primary">Nenhuma sessão esta semana</p>
            <p className="text-muted-foreground text-sm font-medium mt-1">Valide um protocolo para gerar sessões automaticamente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map(day => {
            const daySessions = sessions.filter(s => {
              const d = new Date(s.scheduledDate + "T12:00:00");
              return d.toDateString() === day.toDateString();
            });
            const isToday = day.toDateString() === new Date().toDateString();
            const isPast = day < new Date() && !isToday;

            return (
              <div key={day.toISOString()} className="space-y-3">
                <div className={`flex items-center gap-4 py-1 px-1 ${isToday ? "text-primary" : isPast ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                  <div className={`bevel-3d h-10 w-14 flex flex-col items-center justify-center ${isToday ? "paxter-underglow ring-2 ring-cyan-400" : ""}`}>
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                      {format(day, "EEE", { locale: ptBR })}
                    </span>
                    <span className="text-xl font-black leading-none mt-0.5">
                      {format(day, "dd")}
                    </span>
                  </div>
                  {daySessions.length > 0 && (
                    <div className="concave-3d px-3 py-1 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                      <span className={`paxter-led paxter-led-on ${isToday ? "paxter-led-amber" : "paxter-led-cyan"}`} />
                      {daySessions.length} {daySessions.length === 1 ? "sessão" : "sessões"}
                    </div>
                  )}
                  <div className="flex-1 border-b border-dashed border-muted/50" />
                </div>

                <div className="ml-16 space-y-3">
                  {daySessions.map(session => {
                    const googleLink = buildGoogleCalendarLink(session as any);
                    const whatsappLink = buildWhatsAppLink(session as any);
                    const dispApps = session.substanceApplications.filter(a => a.availability === "disp");
                    const allConfirmed = dispApps.length > 0 && dispApps.every(a => a.appliedAt);
                    const someConfirmed = dispApps.some(a => a.appliedAt) && !allConfirmed;

                    const statusBaseColor = 
                      session.status === "completed" ? "green" :
                      session.status === "missed" ? "red" :
                      session.status === "cancelled" ? "slate" :
                      someConfirmed ? "amber" :
                      isToday ? "cyan" : "slate";

                    return (
                      <Card
                        key={session.id}
                        className={`panel-3d-sub overflow-hidden transition-all neon-hover ${isToday ? "panel-3d-active" : ""}`}
                      >
                        <div className="flex h-full">
                          <div className={`w-1.5 shrink-0 bg-${statusBaseColor}-500/80`} />
                          <CardContent className="p-4 flex-1">
                            <div className="flex items-start gap-4">
                              <div className="screen-3d shrink-0 w-20 py-2 flex flex-col items-center justify-center">
                                <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">HORÁRIO</div>
                                <div className="text-lg font-black text-primary leading-none flex items-center gap-1">
                                  <Clock className="h-4 w-4 text-cyan-500" />
                                  {session.scheduledTime}
                                </div>
                              </div>

                              <div className="flex-1 min-w-0 space-y-3">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-base font-black uppercase tracking-tight text-foreground">{session.clientName}</span>
                                  <span className="concave-3d px-2 py-0.5 text-[10px] font-bold text-muted-foreground tabular-nums">{session.clientCpf}</span>
                                  <div className={`concave-3d px-3 py-1 text-[10px] font-black uppercase tracking-widest ${getStatusColor(session.status)}`}>
                                    {formatStatus(session.status)}
                                  </div>
                                  {session.serviceType === "homecare" ? (
                                    <div className="bevel-3d px-2 py-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-600">
                                      <Home className="h-3 w-3" /> Nurse Care
                                    </div>
                                  ) : (
                                    <div className="bevel-3d px-2 py-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      <Building2 className="h-3 w-3" /> {session.unit ?? "Clínica"}
                                    </div>
                                  )}
                                  {allConfirmed && <div className="paxter-led paxter-led-green paxter-led-on" title="Todos confirmados" />}
                                </div>

                                <div className="flex items-center gap-3 flex-wrap text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
                                  <span className="concave-3d px-2 py-0.5">{(session as any).protocolTitle ?? `Protocolo #${session.protocolId}`}</span>
                                  <span>•</span>
                                  <span className="concave-3d px-2 py-0.5">Semana {session.weekNumber}</span>
                                  <span>•</span>
                                  <span className="bevel-3d px-2 py-0.5 text-primary">{getProcedureLabel(session)}</span>
                                  {session.professionalName && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-1">
                                        <User className="h-3 w-3" /> {session.professionalName}
                                      </span>
                                    </>
                                  )}
                                </div>

                                <div className="flex gap-3 flex-wrap items-center pt-1">
                                  {session.substanceApplications.map(app => (
                                    <div key={app.id} className="flex items-center gap-2">
                                      <div
                                        className={`concave-3d flex items-center gap-2 px-3 py-1.5 font-black text-[10px] uppercase tracking-wider transition-all shadow-sm ${
                                          app.appliedAt ? "ring-2 ring-cyan-400" : ""
                                        }`}
                                      >
                                        <span className={`paxter-led ${
                                          app.appliedAt ? "paxter-led-green paxter-led-on" :
                                          app.status === "missed" ? "paxter-led-red paxter-led-on" :
                                          app.availability === "disp" ? "paxter-led-amber paxter-led-on" :
                                          "paxter-led-off"
                                        }`} />
                                        <span className="text-foreground">{app.substanceName}</span>
                                        {app.sessionNumber > 0 && (
                                          <span className="text-[9px] opacity-60 ml-0.5">{app.sessionNumber}/{app.totalSessions}</span>
                                        )}
                                        {!app.appliedAt && (
                                          <span className={`text-[8px] px-1 rounded-[2px] ${
                                            app.availability === "disp" ? "bg-amber-500/20 text-amber-700" : "bg-slate-500/10 text-slate-500"
                                          }`}>
                                            {app.availability === "disp" ? "DISP" : "PROX"}
                                          </span>
                                        )}
                                        {app.appliedAt && <CheckCheck className="h-3 w-3 text-cyan-500" />}
                                      </div>
                                      {app.availability === "disp" && !app.appliedAt && session.status !== "completed" && (
                                        <button
                                          className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline transition-colors"
                                          onClick={() => confirmMutation.mutate({
                                            id: session.id,
                                            data: { substanceId: app.substanceId, confirmed: true }
                                          })}
                                          disabled={confirmMutation.isPending}
                                        >
                                          {confirmMutation.isPending ? "..." : "Confirmar"}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 shrink-0">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="btn-3d-soft h-9 w-9 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56 panel-3d">
                                    <DropdownMenuItem
                                      onClick={() => { setAssessmentSession(session); setAssessmentModalOpen(true); }}
                                      className="gap-2 font-bold uppercase tracking-widest text-[10px]"
                                    >
                                      <ClipboardList className="h-4 w-4 text-teal-600" />
                                      Avaliação de Enfermagem
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => generateValidationCode(session)}
                                      className="gap-2 font-bold uppercase tracking-widest text-[10px]"
                                    >
                                      <KeyRound className="h-4 w-4 text-amber-500" />
                                      Gerar Código
                                    </DropdownMenuItem>
 ...[Truncated]                              <DropdownMenuItem
                                onClick={() => { setVerifySession(session); setVerifyInput(""); setVerifyResult(null); setVerifyModalOpen(true); }}
                                className="gap-2"
                              >
                                <ShieldCheck className="h-4 w-4 text-green-500" />
                                Verificar Código do Cliente
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => sendPreSessionEmail(session)}
                                disabled={emailSending === session.id}
                                className="gap-2"
                              >
                                {emailSending === session.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Mail className="h-4 w-4 text-blue-500" />
                                )}
                                Enviar E-mail Pré-Aplicação
                              </DropdownMenuItem>
                              {session.status === "completed" && (
                                <DropdownMenuItem
                                  onClick={() => sendPostSessionEmail(session)}
                                  disabled={emailSending === session.id}
                                  className="gap-2"
                                >
                                  {emailSending === session.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MailCheck className="h-4 w-4 text-green-500" />
                                  )}
                                  Enviar E-mail Pós-Aplicação (RAS)
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => syncToGoogleCalendar(session)}
                                disabled={calSyncing === session.id}
                                className="gap-2"
                              >
                                {calSyncing === session.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CalendarPlus className="h-4 w-4 text-blue-500" />
                                )}
                                Sincronizar Google Agenda
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => downloadSessionICS(session.id, session.clientName)}
                                className="gap-2"
                              >
                                <Download className="h-4 w-4 text-muted-foreground" />
                                Baixar ICS desta sessão
                              </DropdownMenuItem>
                              {whatsappLink && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => window.open(whatsappLink, "_blank")}
                                    className="gap-2"
                                  >
                                    <Send className="h-4 w-4 text-green-500" />
                                    Enviar lembrete (WhatsApp)
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                        </div>
                            </div>
                          </CardContent>
                        </div>
                    </Card>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      )}

      <Dialog open={codeModalOpen} onOpenChange={setCodeModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-500" />
              Código de Validação
            </DialogTitle>
            <DialogDescription>
              Código de 6 dígitos para validação de presença do cliente.
            </DialogDescription>
          </DialogHeader>
          {codeLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
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
                    const msg = encodeURIComponent(
                      `Clínica Pádua | ${proc} | ${generatedCode}\n\nOlá ${codeModalSession?.clientName?.split(" ")[0]}!\n\nSeu código de validação para a sessão de ${dateStr} é:\n\n🔑 *${generatedCode}*\n\nApresente este código à enfermeira no momento da aplicação.\n\nClínica Pádua — Protocolos Injetáveis`
                    );
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

      <Dialog open={verifyModalOpen} onOpenChange={setVerifyModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              Verificar Código
            </DialogTitle>
            <DialogDescription>
              Digite o código de 6 dígitos informado pelo cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {verifySession && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p><span className="font-medium">Cliente:</span> {verifySession.clientName}</p>
                <p><span className="font-medium">Sessão:</span> {verifySession.scheduledDate && format(new Date(verifySession.scheduledDate + "T12:00:00"), "dd/MM/yyyy")} às {verifySession.scheduledTime}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={verifyInput}
                onChange={e => setVerifyInput(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="EX: A7K3M2"
                className="text-center text-2xl font-mono tracking-[0.3em] h-14"
                maxLength={6}
                onKeyDown={e => e.key === "Enter" && verifyCode()}
              />
            </div>
            {verifyResult === "success" && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Cliente validado com sucesso!
              </div>
            )}
            {verifyResult === "error" && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm font-medium">
                Código inválido ou expirado. Peça ao cliente para verificar.
              </div>
            )}
            <Button
              className="w-full gap-2"
              onClick={verifyCode}
              disabled={verifyLoading || verifyInput.length < 6}
            >
              {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Verificar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
