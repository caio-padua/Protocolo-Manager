import { useState } from "react";
import { useUpdateSession } from "@workspace/api-client-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, eachDayOfInterval, isSameDay, isSameMonth,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Calendar, Clock, Building2,
  Home, ArrowRight, CheckCircle2, Send, Loader2,
} from "lucide-react";

// Horários disponíveis (07:00 – 20:00, de 30 em 30 min)
const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 20; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < 20) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

const DAY_LABELS = ["S", "T", "Q", "Q", "S", "S", "D"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: {
    id: number;
    clientName: string;
    clientPhone: string | null;
    scheduledDate: string;
    scheduledTime: string;
    protocolTitle: string | null;
    unit: string | null;
    serviceType?: string;
    substanceApplications: { procedureType?: string; availability: string }[];
  } | null;
  onSuccess?: () => void;
}

function getProcedureLabel(session: Props["session"]): string {
  if (!session) return "Aplicação";
  const apps = session.substanceApplications.filter(a => a.availability === "disp");
  const types = new Set(apps.map(a => a.procedureType ?? "iv"));
  if (types.has("implant")) return "Implante";
  if (types.has("im") && !types.has("iv")) return "Aplicação IM";
  return "Aplicação EV";
}

function getUnitLabel(session: Props["session"]): string {
  if (!session) return "—";
  if (session.serviceType === "homecare") return "Nurse Care Domiciliar";
  return session.unit ?? "—";
}

export function RescheduleDrawer({ open, onOpenChange, session, onSuccess }: Props) {
  const { toast } = useToast();

  const originalDate = session ? parseISO(session.scheduledDate) : new Date();
  const originalTime = session?.scheduledTime ?? "09:00";

  const [calMonth, setCalMonth] = useState(() => startOfMonth(originalDate));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [notifyWa, setNotifyWa] = useState(true);
  const [done, setDone] = useState(false);

  const newDate = selectedDate ?? null;
  const newTime = selectedTime ?? null;
  const isReady = newDate !== null && newTime !== null;

  const updateMutation = useUpdateSession({
    mutation: {
      onSuccess: (updatedSession) => {
        setDone(true);
        toast({
          title: "Sessão reagendada!",
          description: `${session?.clientName} → ${format(newDate!, "dd/MM/yyyy", { locale: ptBR })} às ${newTime}`,
        });
        if (notifyWa && session?.clientPhone) {
          const phone = session.clientPhone.replace(/\D/g, "");
          const dateStr = format(newDate!, "dd/MM/yyyy", { locale: ptBR });
          const msg = encodeURIComponent(
            `PAXTER | Reagendamento\n\nOlá ${session.clientName.split(" ")[0]}! 👋\n\nSua sessão foi reagendada:\n\n📅 *${dateStr}* às *${newTime}*\n📍 ${getUnitLabel(session)}\n\nAté lá! 💉`
          );
          window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
        }
        setTimeout(() => {
          onSuccess?.();
          onOpenChange(false);
          setDone(false);
          setSelectedDate(null);
          setSelectedTime(null);
        }, 1800);
      },
      onError: () => {
        toast({ title: "Erro ao reagendar", variant: "destructive" });
      },
    },
  });

  function confirm() {
    if (!session || !newDate || !newTime) return;
    updateMutation.mutate({
      id: session.id,
      data: {
        scheduledDate: format(newDate, "yyyy-MM-dd"),
        scheduledTime: newTime,
        status: "rescheduled",
      },
    });
  }

  // Grade do mini calendário
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = eachDayOfInterval({ start: gridStart, end: monthEnd });
  // Completar até domingo da última semana
  const lastDay = gridEnd[gridEnd.length - 1];
  const dayOfWeek = lastDay.getDay();
  const extraDays = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const allDays = eachDayOfInterval({
    start: gridStart,
    end: new Date(lastDay.getTime() + extraDays * 86400000),
  });

  const today = new Date();
  const isPast = (d: Date) => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return d < t;
  };

  if (!session) return null;

  const procedureLabel = getProcedureLabel(session);
  const unitLabel = getUnitLabel(session);

  return (
    <Sheet open={open} onOpenChange={(v) => {
      if (!v) {
        setSelectedDate(null);
        setSelectedTime(null);
        setDone(false);
      }
      onOpenChange(v);
    }}>
      <SheetContent
        side="right"
        className="w-full sm:w-[440px] p-0 overflow-y-auto flex flex-col"
        style={{ background: "hsl(var(--background))" }}
      >
        {/* ── CABEÇALHO ── */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-muted/20 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
            <Calendar className="h-4 w-4 text-primary" />
            Reagendar Sessão
          </SheetTitle>

          {/* Card resumo da sessão */}
          <div className="panel-3d-sub rounded-[6px] p-3 mt-2 space-y-2">
            <div className="text-base font-black uppercase tracking-tight text-foreground">
              {session.clientName}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="concave-3d px-2.5 py-1.5">
                <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Procedimento</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-accent">{procedureLabel}</div>
              </div>
              <div className="concave-3d px-2.5 py-1.5">
                <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 mb-0.5">Unidade</div>
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-accent">
                  {session.serviceType === "homecare"
                    ? <Home className="h-3 w-3 shrink-0" />
                    : <Building2 className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{unitLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* ── CORPO ── */}
        <div className="flex-1 px-5 py-4 space-y-5">

          {/* Prévia DE → PARA */}
          <div className="flex items-center gap-2">
            {/* DE */}
            <div className="flex-1 concave-3d rounded-[6px] px-3 py-2 text-center">
              <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50 mb-1">De</div>
              <div className="text-[11px] font-black tabular-nums text-muted-foreground">
                {format(originalDate, "EEE dd/MM", { locale: ptBR })}
              </div>
              <div className="text-base font-black tabular-nums text-foreground">{originalTime}</div>
            </div>

            <ArrowRight className="h-5 w-5 text-accent shrink-0" />

            {/* PARA */}
            <div className={`flex-1 rounded-[6px] px-3 py-2 text-center transition-all ${isReady ? "bevel-3d ring-1 ring-accent/40" : "concave-3d opacity-40"}`}>
              <div className={`text-[8px] font-black uppercase tracking-widest mb-1 ${isReady ? "text-accent" : "text-muted-foreground/50"}`}>Para</div>
              <div className={`text-[11px] font-black tabular-nums ${isReady ? "text-primary" : "text-muted-foreground"}`}>
                {newDate ? format(newDate, "EEE dd/MM", { locale: ptBR }) : "—"}
              </div>
              <div className={`text-base font-black tabular-nums ${isReady ? "text-primary" : "text-muted-foreground"}`}>
                {newTime ?? "—:——"}
              </div>
            </div>
          </div>

          {/* ── CALENDÁRIO ── */}
          <div className="space-y-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 px-0.5">
              Escolha o novo dia
            </div>
            <div className="panel-3d rounded-[6px] p-3">
              {/* Navegação do mês */}
              <div className="flex items-center justify-between mb-3">
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCalMonth(m => subMonths(m, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-[11px] font-black uppercase tracking-widest capitalize">
                  {format(calMonth, "MMMM yyyy", { locale: ptBR })}
                </span>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCalMonth(m => addMonths(m, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Labels dias da semana */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_LABELS.map((l, i) => (
                  <div key={i} className="text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 py-1">
                    {l}
                  </div>
                ))}
              </div>

              {/* Células */}
              <div className="grid grid-cols-7 gap-0.5">
                {allDays.map((day, idx) => {
                  const isCurrentMonth = isSameMonth(day, calMonth);
                  const isOriginal = isSameDay(day, originalDate);
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                  const isToday = isSameDay(day, today);
                  const past = isPast(day);

                  let cellClass = "h-9 w-full flex items-center justify-center rounded-[4px] text-[12px] font-black tabular-nums transition-all ";

                  if (!isCurrentMonth) {
                    cellClass += "opacity-20 cursor-default text-muted-foreground ";
                  } else if (past) {
                    cellClass += "opacity-30 cursor-not-allowed text-muted-foreground ";
                  } else if (isSelected) {
                    cellClass += "bevel-3d text-primary ring-2 ring-accent/60 cursor-pointer ";
                  } else if (isOriginal) {
                    cellClass += "concave-3d text-amber-600 ring-1 ring-amber-400/40 cursor-pointer ";
                  } else if (isToday) {
                    cellClass += "concave-3d text-accent cursor-pointer hover:bg-accent/10 ";
                  } else {
                    cellClass += "hover:bg-accent/8 cursor-pointer text-foreground hover:text-primary ";
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={!isCurrentMonth || past}
                      onClick={() => { if (isCurrentMonth && !past) setSelectedDate(day); }}
                      className={cellClass}
                      title={isOriginal ? "Data atual" : isToday ? "Hoje" : ""}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              {/* Legenda */}
              <div className="flex items-center gap-4 mt-3 px-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] ring-1 ring-amber-400/60 bg-amber-50" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">Atual</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] ring-2 ring-accent/60 bg-background" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">Selecionado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-accent/20" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">Hoje</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── HORÁRIOS ── */}
          <div className="space-y-2">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 px-0.5">
              Escolha o novo horário
            </div>
            <div className="concave-3d rounded-[6px] p-3">
              <div className="grid grid-cols-5 gap-1.5">
                {TIME_SLOTS.map(slot => {
                  const isCurrentTime = slot === originalTime;
                  const isSelected = slot === selectedTime;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTime(slot)}
                      className={[
                        "py-2 rounded-[4px] text-[11px] font-black tabular-nums tracking-tight transition-all",
                        isSelected
                          ? "bevel-3d text-primary ring-2 ring-accent/60"
                          : isCurrentTime
                          ? "concave-3d text-amber-600 ring-1 ring-amber-400/40"
                          : "bevel-3d text-muted-foreground hover:text-primary hover:ring-1 hover:ring-accent/30",
                      ].join(" ")}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── NOTIFICAR POR WHATSAPP ── */}
          {session.clientPhone && (
            <button
              type="button"
              onClick={() => setNotifyWa(v => !v)}
              className={`w-full flex items-center gap-3 rounded-[6px] px-4 py-3 transition-all ${notifyWa ? "bevel-3d ring-1 ring-green-500/30" : "concave-3d opacity-50"}`}
            >
              <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-all ${notifyWa ? "bg-green-500 text-white" : "bg-muted"}`}>
                <Send className="h-3 w-3" />
              </div>
              <div className="text-left">
                <div className="text-[10px] font-black uppercase tracking-widest text-foreground">
                  Avisar cliente por WhatsApp
                </div>
                <div className="text-[9px] text-muted-foreground/60 font-medium">
                  {notifyWa ? "Mensagem automática será enviada" : "Clique para ativar"}
                </div>
              </div>
            </button>
          )}

        </div>

        {/* ── RODAPÉ: BOTÃO CONFIRMAR ── */}
        <div className="px-5 pb-6 pt-3 border-t border-muted/20 shrink-0">
          {done ? (
            <div className="bevel-3d-ok flex items-center justify-center gap-2 py-4 rounded-[6px]">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-[11px] font-black uppercase tracking-widest text-green-700">Reagendado com sucesso!</span>
            </div>
          ) : (
            <Button
              className="w-full h-12 btn-3d gap-2 text-[11px] font-black uppercase tracking-widest"
              disabled={!isReady || updateMutation.isPending}
              onClick={confirm}
            >
              {updateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</>
              ) : (
                <>
                  <Clock className="h-4 w-4" />
                  Confirmar Reagendamento
                </>
              )}
            </Button>
          )}

          {!isReady && !done && (
            <p className="text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 mt-2">
              {!selectedDate && !selectedTime ? "Selecione o dia e o horário" :
               !selectedDate ? "Selecione o dia" : "Selecione o horário"}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
