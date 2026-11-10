import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";

/**
 * Agendamento de protocolo com prévia (etapa 4 de 7); o envio ao Google fica no ProtocolGoogleSyncDialog (etapa 5).
 * O navegador só pede a prévia e devolve a "impressão digital" dela ao confirmar:
 * quem calcula e grava o plano é sempre o servidor.
 */

interface PreviewApplication {
  substanceId: number; substanceName: string; dose: string; sessionNumber: number;
  totalSessions: number; nominalDate: string; shiftDays: number;
}
interface PreviewVisit {
  date: string; time: string; weekday: number; nursingPeriods: number; reservedMinutes: number;
  applications: PreviewApplication[];
}
interface Preview {
  protocolId: number; nursingResourceName: string; nursingLocationName: string; visits: PreviewVisit[]; visitCount: number;
  firstDate: string; lastDate: string; requiresRoutineConfirmation: boolean; searchWasPruned: boolean;
  matchesClientPreference: boolean; fingerprint: string;
}
interface Diagnostics {
  nursingDatesWithoutSchedule: string[]; nursingDatesWithException: string[];
  integrationPendingDates: string[]; nursingDatesWithoutOpenSlot: string[];
}
interface Refusal { code?: string; error: string; diagnostics?: Diagnostics }
interface NursingAgendaOption { id: number; name: string; locationName: string }
interface AgendaOptionsResponse {
  nursingAgendaId: number;
  nursingAgendas: NursingAgendaOption[];
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const brDate = (iso: string) => iso.split("-").reverse().join("/");
const dateList = (dates: string[]) =>
  dates.length > 8 ? `${dates.slice(0, 8).map(brDate).join(", ")} e mais ${dates.length - 8}` : dates.map(brDate).join(", ");
const shiftText = (days: number) => {
  if (days === 0) return "na data prevista";
  const abs = Math.abs(days);
  return `${abs} dia${abs > 1 ? "s" : ""} ${days > 0 ? "depois" : "antes"} da data prevista`;
};

async function call(protocolId: number, action: "preview" | "confirm", body: object) {
  const response = await fetch(`${import.meta.env.BASE_URL}api/protocols/${protocolId}/scheduling/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getCollabToken() ?? ""}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

export function ProtocolSchedulingDialog({ protocolId, clientId, open, onOpenChange, onScheduled }: {
  protocolId: number; clientId: number; open: boolean; onOpenChange: (open: boolean) => void; onScheduled: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [changed, setChanged] = useState(false);
  const [googleWarning, setGoogleWarning] = useState<{ code: string; message: string } | null>(null);
  const [agendaOptionsLoading, setAgendaOptionsLoading] = useState(false);
  const [nursingAgendas, setNursingAgendas] = useState<NursingAgendaOption[]>([]);
  const [nursingResourceId, setNursingResourceId] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) {
      requestId.current++;
      return;
    }
    const controller = new AbortController();
    setAgendaOptionsLoading(true);
    setNursingAgendas([]);
    setNursingResourceId("");
    setPreview(null);
    setRefusal(null);
    fetch(`${import.meta.env.BASE_URL}api/clients/${clientId}/protocol-agenda-options`, {
      headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` },
      signal: controller.signal,
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível carregar as agendas permitidas.");
      return data as AgendaOptionsResponse;
    }).then(data => {
      if (controller.signal.aborted) return;
      setNursingAgendas(data.nursingAgendas);
      setNursingResourceId(String(data.nursingAgendaId));
    }).catch(error => {
      if (!controller.signal.aborted) {
        setRefusal({ error: error instanceof Error ? error.message : "Não foi possível carregar as agendas permitidas." });
      }
    }).finally(() => {
      if (!controller.signal.aborted) setAgendaOptionsLoading(false);
    });
    return () => controller.abort();
  }, [open, clientId]);

  const loadPreview = useCallback(async (resourceId: string) => {
    if (!resourceId) return;
    const mine = ++requestId.current;
    setLoading(true); setPreview(null); setRefusal(null); setChanged(false); setGoogleWarning(null);
    try {
      const result = await call(protocolId, "preview", { nursingResourceId: Number(resourceId) });
      if (mine !== requestId.current) return;
      if (result.ok) { setPreview(result.data.preview as Preview); setGoogleWarning(result.data.googleWarning ?? null); }
      else setRefusal({ code: result.data?.code, error: result.data?.error ?? "Não foi possível calcular a prévia.", diagnostics: result.data?.diagnostics });
    } catch {
      if (mine === requestId.current) setRefusal({ error: "Sem conexão com o servidor. Nada foi agendado." });
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [protocolId]);

  useEffect(() => {
    if (open && !agendaOptionsLoading && nursingResourceId) void loadPreview(nursingResourceId);
  }, [open, agendaOptionsLoading, nursingResourceId, loadPreview]);

  async function confirm() {
    if (!preview || confirming) return;
    setConfirming(true);
    try {
      const result = await call(protocolId, "confirm", {
        nursingResourceId: Number(nursingResourceId),
        fingerprint: preview.fingerprint,
      });
      if (result.ok) {
        toast({
          title: "Protocolo agendado",
          description: `${result.data.reserved?.length ?? preview.visitCount} visita(s) reservada(s) na agenda de enfermagem. Em seguida os eventos são enviados ao Google Agenda; nenhum e-mail ou convite vai ao cliente.`,
          duration: 10000,
        });
        onScheduled();
        onOpenChange(false);
        return;
      }
      if (result.data?.code === "plano_mudou" && result.data.preview) {
        setPreview(result.data.preview as Preview); setChanged(true); setRefusal(null); setGoogleWarning(result.data.googleWarning ?? null);
        return;
      }
      setPreview(null);
      setRefusal({ code: result.data?.code, error: result.data?.error ?? "Não foi possível agendar. Nada foi agendado.", diagnostics: result.data?.diagnostics });
    } catch {
      toast({ title: "Sem conexão com o servidor", description: "Confira se o protocolo foi agendado antes de tentar de novo.", variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!confirming) onOpenChange(next); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agendar protocolo na agenda de enfermagem</DialogTitle>
          <DialogDescription>
            Confira a prévia. Os horários só são reservados quando você confirmar.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculando os horários livres. Pode levar alguns segundos.
          </div>
        )}

        {agendaOptionsLoading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo as agendas vinculadas ao cliente…
          </div>
        )}

        {!agendaOptionsLoading && nursingAgendas.length > 1 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Agenda de enfermagem permitida</p>
            <Select
              value={nursingResourceId}
              onValueChange={value => {
                setPreview(null);
                setNursingResourceId(value);
              }}
            >
              <SelectTrigger className="field-engraved"><SelectValue placeholder="Selecione a agenda vinculada" /></SelectTrigger>
              <SelectContent>
                {nursingAgendas.map(agenda => (
                  <SelectItem key={agenda.id} value={String(agenda.id)}>
                    {agenda.name} — {agenda.locationName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {refusal && (
          <div className="panel-3d-sub p-4 space-y-2" role="alert">
            <p className="flex items-center gap-2 font-bold text-sm"><AlertTriangle className="h-4 w-4 text-amber-500" /> Não foi possível agendar</p>
            <p className="text-sm">{refusal.error}</p>
            {refusal.code === "agenda_enfermagem_indefinida" && (
              <p className="text-xs text-muted-foreground">Defina a agenda de enfermagem padrão no cadastro do cliente (tela de edição do cliente).</p>
            )}
            {refusal.diagnostics && (
              <ul className="text-xs space-y-1 list-disc pl-5">
                {refusal.diagnostics.nursingDatesWithException.length > 0 && (
                  <li>Dias com exceção cadastrada (feriado ou fechamento): {dateList(refusal.diagnostics.nursingDatesWithException)}</li>
                )}
                {refusal.diagnostics.nursingDatesWithoutSchedule.length > 0 && (
                  <li>{refusal.diagnostics.nursingDatesWithoutSchedule.length} dia(s) sem expediente da enfermagem</li>
                )}
                {refusal.diagnostics.integrationPendingDates.length > 0 && (
                  <li>Dias com a agenda do Google desatualizada (não são tratados como ocupados): {dateList(refusal.diagnostics.integrationPendingDates)}</li>
                )}
                {refusal.diagnostics.nursingDatesWithoutOpenSlot.length > 0 && (
                  <li>{refusal.diagnostics.nursingDatesWithoutOpenSlot.length} dia(s) com expediente, mas sem horário livre suficiente</li>
                )}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Nada foi agendado. A validação antiga não reserva horários; corrija o vínculo do cliente ou tente novamente.</p>
            <Button className="btn-3d-soft" onClick={() => nursingResourceId && void loadPreview(nursingResourceId)}>Calcular de novo</Button>
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            {changed && (
              <div className="panel-3d-sub p-3 text-sm" role="alert">
                <AlertTriangle className="inline h-4 w-4 mr-1 text-amber-500" />
                A agenda mudou desde a prévia anterior. Esta é a prévia atualizada; nada foi agendado ainda.
              </div>
            )}
            {googleWarning && (
              <div className="panel-3d-sub p-3 text-sm" role="alert">
                <AlertTriangle className="inline h-4 w-4 mr-1 text-amber-500" />
                {googleWarning.message}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Agenda</p><p className="font-bold">{preview.nursingResourceName}</p></div>
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Local</p><p className="font-bold">{preview.nursingLocationName}</p></div>
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Visitas</p><p className="font-bold tabular-nums">{preview.visitCount}</p></div>
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Primeira</p><p className="font-bold tabular-nums">{brDate(preview.firstDate)}</p></div>
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Última</p><p className="font-bold tabular-nums">{brDate(preview.lastDate)}</p></div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="p-2">Data</th><th className="p-2">Horário</th><th className="p-2">Substâncias</th><th className="p-2">Tempo reservado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.visits.map(visit => (
                    <tr key={visit.date} className="border-t align-top">
                      <td className="p-2 whitespace-nowrap"><span className="font-bold tabular-nums">{brDate(visit.date)}</span><br /><span className="text-xs text-muted-foreground">{WEEKDAYS[visit.weekday]}</span></td>
                      <td className="p-2 tabular-nums font-bold">{visit.time}</td>
                      <td className="p-2 space-y-1">
                        {visit.applications.map(app => (
                          <div key={app.substanceId}>
                            <span className="font-bold">{app.substanceName}</span> — {app.dose}
                            <span className="text-xs text-muted-foreground"> · sessão {app.sessionNumber} de {app.totalSessions} · {shiftText(app.shiftDays)}</span>
                          </div>
                        ))}
                      </td>
                      <td className="p-2 whitespace-nowrap tabular-nums">{visit.reservedMinutes} min ({visit.nursingPeriods} período{visit.nursingPeriods > 1 ? "s" : ""})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              {preview.requiresRoutineConfirmation && <li><strong>Mais de uma visita na mesma semana.</strong> Confirme só se isso fizer sentido para a rotina do cliente.</li>}
              {preview.searchWasPruned && <li>A busca foi limitada pelo tamanho do protocolo: pode existir uma combinação ainda melhor.</li>}
              <li>{preview.matchesClientPreference ? "Há horário que coincide com a preferência cadastrada do cliente." : "Nenhum horário coincide com a preferência cadastrada do cliente (a preferência só ordena, não impede)."}</li>
              <li>Ao confirmar, os horários são reservados no sistema e um evento por visita é enviado ao Google Agenda. Se o Google falhar, a reserva continua valendo e o envio pode ser repetido. Nenhum e-mail ou convite vai ao cliente.</li>
            </ul>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" className="btn-3d-soft" onClick={() => onOpenChange(false)} disabled={confirming}>Cancelar</Button>
              <Button className="btn-3d" onClick={() => void confirm()} disabled={confirming}>
                {confirming ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CalendarCheck className="h-4 w-4 mr-1" />}
                {confirming ? "Reservando..." : "Confirmar agendamento"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
