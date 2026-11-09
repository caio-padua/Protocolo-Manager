import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarSync, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCollabToken } from "@/lib/collab-auth";

/**
 * Envio das visitas reservadas ao Google Agenda (etapa 5 de 7).
 * Um evento por visita, com todas as substâncias na descrição, sem convite ao cliente.
 * O servidor decide o que enviar; falha aqui nunca desfaz a reserva no sistema.
 */

type VisitStatus = "sincronizado" | "ja_sincronizado" | "falhou" | "incerto" | "nao_processada";
interface VisitResult { sessionId: number; date: string; time: string; status: VisitStatus; code?: string; error?: string }
interface SyncResult { visits: VisitResult[]; synced: number; alreadySynced: number; failed: number; remaining: number }
interface Refusal { code?: string; error: string }

const brDate = (iso: string) => iso.split("-").reverse().join("/");
const STATUS_TEXT: Record<VisitStatus, string> = {
  sincronizado: "Enviada ao Google Agenda",
  ja_sincronizado: "Já estava no Google Agenda",
  falhou: "Não enviada",
  incerto: "Resultado incerto no Google",
  nao_processada: "Ainda não enviada",
};

export function ProtocolGoogleSyncDialog({ protocolId, open, onOpenChange }: {
  protocolId: number; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const requestId = useRef(0);

  // A primeira chamada de cada abertura também atualiza o que já está no Google (visita remarcada, por exemplo):
  // o servidor reaproveita o MESMO evento. Reenvios depois de um resultado só tratam o que ficou pendente.
  const run = useCallback(async (refresh: boolean) => {
    const mine = ++requestId.current;
    setRunning(true); setResult(null); setRefusal(null);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/protocols/${protocolId}/scheduling/google-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getCollabToken() ?? ""}` },
        body: JSON.stringify(refresh ? { refresh: true } : {}),
      });
      const data = await response.json().catch(() => ({}));
      if (mine !== requestId.current) return;
      if (response.ok) setResult(data as SyncResult);
      else setRefusal({ code: data?.code, error: data?.error ?? "Não foi possível enviar ao Google Agenda. As visitas continuam reservadas no sistema." });
    } catch {
      if (mine === requestId.current) {
        setRefusal({ error: "Sem conexão com o servidor. As visitas continuam reservadas no sistema; confira antes de tentar de novo." });
      }
    } finally {
      if (mine === requestId.current) setRunning(false);
    }
  }, [protocolId]);

  useEffect(() => {
    if (open) void run(true);
    else requestId.current++;
  }, [open, run]);

  const pending = result ? result.failed + result.remaining : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!running) onOpenChange(next); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar visitas ao Google Agenda</DialogTitle>
          <DialogDescription>
            Um evento por visita, com todas as substâncias na descrição. Visitas que já estão no Google são atualizadas no mesmo evento. Nenhum convite ou e-mail é enviado ao cliente.
          </DialogDescription>
        </DialogHeader>

        {running && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando as visitas ao Google Agenda. Pode levar alguns segundos.
          </div>
        )}

        {refusal && (
          <div className="panel-3d-sub p-4 space-y-2" role="alert">
            <p className="flex items-center gap-2 font-bold text-sm"><AlertTriangle className="h-4 w-4 text-amber-500" /> Nada foi enviado</p>
            <p className="text-sm">{refusal.error}</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" className="btn-3d-soft" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button className="btn-3d-soft" onClick={() => void run(true)}>Tentar de novo</Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Enviadas agora</p><p className="font-bold tabular-nums">{result.synced}</p></div>
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Já estavam</p><p className="font-bold tabular-nums">{result.alreadySynced}</p></div>
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Com problema</p><p className="font-bold tabular-nums">{result.failed}</p></div>
              <div className="concave-3d p-2"><p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Faltam</p><p className="font-bold tabular-nums">{result.remaining}</p></div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="p-2">Data</th><th className="p-2">Horário</th><th className="p-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {result.visits.map(visit => {
                    const ok = visit.status === "sincronizado" || visit.status === "ja_sincronizado";
                    return (
                      <tr key={visit.sessionId} className="border-t align-top">
                        <td className="p-2 whitespace-nowrap font-bold tabular-nums">{brDate(visit.date)}</td>
                        <td className="p-2 tabular-nums font-bold">{visit.time}</td>
                        <td className="p-2">
                          <span className="inline-flex items-center gap-1 font-bold">
                            {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                            {STATUS_TEXT[visit.status]}
                          </span>
                          {visit.error && <p className="text-xs text-muted-foreground">{visit.error}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              <li>As visitas continuam reservadas no sistema, mesmo quando o Google falha.</li>
              {pending > 0 && <li>Quem ficou com problema ou faltando pode ser reenviado: o mesmo evento é reaproveitado, sem duplicar.</li>}
            </ul>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" className="btn-3d-soft" onClick={() => onOpenChange(false)}>Fechar</Button>
              {pending > 0 && (
                <Button className="btn-3d" onClick={() => void run(false)}>
                  <CalendarSync className="h-4 w-4 mr-1" /> Enviar de novo ({pending})
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
