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
  KeyRound, ShieldCheck, Copy, Loader2, Mail, MailCheck,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

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
          <p className="text-muted-foreground text-sm">Uma visita consolidada por semana por cliente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 min-w-[200px] text-center">
            {format(weekStart, "dd 'de' MMM", { locale: ptBR })} — {format(weekEnd, "dd 'de' MMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())}>Hoje</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadWeekICS}
            className="gap-1.5 ml-2"
            disabled={!sessions?.length}
          >
            <Download className="h-3.5 w-3.5" />
            ICS da Semana
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={syncWeekToGoogleCalendar}
            className="gap-1.5"
            disabled={!sessions?.length || calSyncing === -1}
          >
            {calSyncing === -1 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CalendarPlus className="h-3.5 w-3.5" />
            )}
            Sync Google Agenda
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : !sessions?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma sessão esta semana</p>
            <p className="text-muted-foreground text-sm">Valide um protocolo para gerar sessões automaticamente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-0">
          {days.map(day => {
            const daySessions = sessions.filter(s => {
              const d = new Date(s.scheduledDate + "T12:00:00");
              return d.toDateString() === day.toDateString();
            });
            const isToday = day.toDateString() === new Date().toDateString();
            const isPast = day < new Date() && !isToday;

            return (
              <div key={day.toISOString()}>
                <div className={`flex items-center gap-3 py-2 px-1 ${isToday ? "text-primary" : isPast ? "text-muted-foreground/60" : "text-muted-foreground"}`}>
                  <span className="text-xs font-bold uppercase tracking-widest w-10">
                    {format(day, "EEE", { locale: ptBR })}
                  </span>
                  <span className={`text-xl font-bold leading-none w-8 h-8 flex items-center justify-center rounded-full ${
                    isToday ? "bg-primary text-primary-foreground text-base" : ""
                  }`}>
                    {format(day, "dd")}
                  </span>
                  {daySessions.length > 0 && (
                    <Badge variant="secondary" className="text-xs h-5">
                      {daySessions.length} {daySessions.length === 1 ? "sessão" : "sessões"}
                    </Badge>
                  )}
                  {daySessions.length === 0 && (
                    <div className="flex-1 border-b border-dashed border-muted" />
                  )}
                </div>

                {daySessions.map(session => {
                  const googleLink = buildGoogleCalendarLink(session as any);
                  const whatsappLink = buildWhatsAppLink(session as any);
                  const dispApps = session.substanceApplications.filter(a => a.availability === "disp");
                  const allConfirmed = dispApps.length > 0 && dispApps.every(a => a.appliedAt);
                  const someConfirmed = dispApps.some(a => a.appliedAt) && !allConfirmed;

                  const cardStyle = session.status === "completed"
                    ? "border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20"
                    : session.status === "missed"
                    ? "border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20 opacity-70"
                    : session.status === "cancelled"
                    ? "border-l-4 border-l-gray-400 bg-gray-50/50 dark:bg-gray-900/20 opacity-50"
                    : someConfirmed
                    ? "border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10"
                    : isToday
                    ? "border-l-4 border-l-blue-500 border-blue-200 shadow-md bg-blue-50/30 dark:bg-blue-950/10"
                    : "border-l-4 border-l-slate-300";

                  return (
                    <Card
                      key={session.id}
                      className={`mb-2 ml-20 transition-all ${cardStyle}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">

                          <div className="flex-shrink-0 w-14 text-right">
                            <div className={`flex items-center gap-1 text-sm font-medium ${
                              session.status === "completed" ? "text-green-700 dark:text-green-400" : ""
                            }`}>
                              <Clock className={`h-3.5 w-3.5 ${
                                session.status === "completed" ? "text-green-500" : "text-muted-foreground"
                              }`} />
                              {session.scheduledTime}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="font-semibold">{session.clientName}</span>
                              <span className="text-xs text-muted-foreground">{session.clientCpf}</span>
                              <Badge className={`text-xs border ${getStatusColor(session.status)}`}>
                                {formatStatus(session.status)}
                              </Badge>
                              {session.serviceType === "homecare" ? (
                                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                  <Home className="h-3 w-3" />Nurse Care
                                </span>
                              ) : (
                                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                  <Building2 className="h-3 w-3" />{session.unit ?? "Clínica"}
                                </span>
                              )}
                              {allConfirmed && <ShieldCheck className="h-4 w-4 text-green-500" />}
                            </div>

                            <p className="text-xs text-muted-foreground mb-2">
                              {(session as any).protocolTitle ?? `Protocolo #${session.protocolId}`} · Semana {session.weekNumber}
                              {" · "}
                              <span className="font-medium text-primary/80">{getProcedureLabel(session)}</span>
                              {session.professionalName && (
                                <span className="ml-2">
                                  <User className="h-3 w-3 inline mr-0.5" />{session.professionalName}
                                </span>
                              )}
                            </p>

                            <div className="flex gap-2 flex-wrap items-center">
                              {session.substanceApplications.map(app => (
                                <div key={app.id} className="flex items-center gap-1">
                                  <span
                                    className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                                      app.appliedAt
                                        ? "text-white ring-2 ring-green-400 ring-offset-1"
                                        : app.availability === "prox"
                                        ? "bg-muted text-muted-foreground"
                                        : app.status === "missed"
                                        ? "text-white bg-red-400/80"
                                        : "text-white"
                                    }`}
                                    style={
                                      app.appliedAt
                                        ? { backgroundColor: app.substanceColor }
                                        : app.availability === "disp" && app.status !== "missed"
                                        ? { backgroundColor: app.substanceColor + "CC" }
                                        : {}
                                    }
                                  >
                                    <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/40 ${
                                      app.appliedAt
                                        ? "bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]"
                                        : app.status === "missed"
                                        ? "bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]"
                                        : app.availability === "disp"
                                        ? "bg-yellow-400 shadow-[0_0_4px_rgba(250,204,21,0.5)]"
                                        : "bg-amber-700 shadow-[0_0_4px_rgba(180,83,9,0.5)]"
                                    }`} />
                                    {app.appliedAt && <CheckCheck className="h-3 w-3 text-green-200" />}
                                    {app.substanceName}
                                    {app.sessionNumber > 0
                                      ? ` ${app.sessionNumber}/${app.totalSessions}`
                                      : ""}
                                    {!app.appliedAt && (
                                      <span className="opacity-80 text-[10px] font-semibold">
                                        {app.availability === "disp" ? "DISP" : "PROX"}
                                      </span>
                                    )}
                                  </span>
                                  {app.availability === "disp" && !app.appliedAt && session.status !== "completed" && (
                                    <button
                                      className="text-xs text-primary underline hover:text-primary/80 transition-colors"
                                      onClick={() => confirmMutation.mutate({
                                        id: session.id,
                                        data: { substanceId: app.substanceId, confirmed: true }
                                      })}
                                      disabled={confirmMutation.isPending}
                                    >
                                      confirmar
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onClick={() => generateValidationCode(session)}
                                className="gap-2"
                              >
                                <KeyRound className="h-4 w-4 text-amber-500" />
                                Gerar Código de Validação
                              </DropdownMenuItem>
                              <DropdownMenuItem
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
                      </CardContent>
                    </Card>
                  );
                })}
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
