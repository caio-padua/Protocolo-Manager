import { useEffect, useRef, useState } from "react";
import { Check, ClipboardEdit, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { AgendaProposedWindow } from "@workspace/api-client-react";
import { getListAgendaWindowsQueryKey, useListAgendaWindows } from "@workspace/api-client-react";
import {
  describeError,
  useAgendaChangeRequests,
  useAgendaIntegration,
  useCreateChangeRequest,
  useDecideChangeRequest,
} from "./agenda-integration-api";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const STATE_LABEL: Record<string, { label: string; led: string }> = {
  pendente: { label: "Pendente", led: "paxter-led-amber paxter-led-breathe" },
  aprovado: { label: "Aprovada", led: "paxter-led-green" },
  recusado: { label: "Recusada", led: "paxter-led-red" },
};

function WindowsSummary({ windows }: { windows: AgendaProposedWindow[] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
      {ORDER.map((wd) => {
        const list = windows.filter((w) => w.weekday === wd).sort((a, b) => a.startTime.localeCompare(b.startTime));
        return (
          <div key={wd} className="concave-3d px-2 py-1.5">
            <div className="lbl">{WEEK[wd]}</div>
            {list.length === 0 ? (
              <div className="text-[11px] text-muted-foreground">Fechado</div>
            ) : (
              list.map((w, i) => (
                <div key={i} className="text-[11px] font-semibold tabular-nums">
                  <div>{w.startTime}–{w.endTime}</div>
                  {w.repeatWeeks === 2 && (
                    <div className="text-muted-foreground">
                      A cada duas semanas, desde {w.anchorDate?.split("-").reverse().join("/") ?? "data não informada"}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function RequestForm() {
  const { toast } = useToast();
  const integration = useAgendaIntegration();
  const create = useCreateChangeRequest();
  const [resourceId, setResourceId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [windows, setWindows] = useState<AgendaProposedWindow[]>([]);
  const [expectedWindows, setExpectedWindows] = useState<AgendaProposedWindow[] | null>(null);
  const loadedResource = useRef("");
  const current = useListAgendaWindows(Number(resourceId) || 0, {
    query: { enabled: !!resourceId, queryKey: getListAgendaWindowsQueryKey(Number(resourceId) || 0) },
  });

  useEffect(() => {
    if (!resourceId || !current.data || loadedResource.current === resourceId) return;
    setExpectedWindows(current.data.map(w => ({
      weekday: w.weekday, startTime: w.startTime, endTime: w.endTime,
      repeatWeeks: w.repeatWeeks === 2 ? 2 : 1, anchorDate: w.anchorDate ?? null,
    })));
    loadedResource.current = resourceId;
  }, [resourceId, current.data]);

  function changeResource(v: string) {
    setResourceId(v);
    setReason("");
    setWindows([]);
    setExpectedWindows(null);
    loadedResource.current = "";
  }
  const setField = (idx: number, field: "startTime" | "endTime" | "anchorDate", value: string) =>
    setWindows((ws) => ws.map((w, i) => (i === idx ? { ...w, [field]: value } : w)));

  const invalid = windows.some((w) => {
    if (!HHMM.test(w.startTime) || !HHMM.test(w.endTime) || w.startTime >= w.endTime) return true;
    if (w.repeatWeeks !== 2) return false;
    const date = new Date(`${w.anchorDate ?? ""}T12:00:00Z`);
    return !w.anchorDate || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== w.anchorDate
      || date.getUTCDay() !== w.weekday;
  });
  const reasonOk = reason.trim().length >= 8 && reason.trim().length <= 500;

  function submit() {
    if (!resourceId || !reasonOk || invalid || !expectedWindows || loadedResource.current !== resourceId) return;
    create.mutate(
      { resourceId: Number(resourceId), reason: reason.trim(), windows, expectedWindows },
      {
        onSuccess: () => {
          toast({ title: "Solicitação enviada", description: "O expediente só muda depois da aprovação." });
          changeResource("");
        },
        onError: (err) =>
          toast({ title: "Solicitação recusada", description: describeError(err, "Falha ao enviar."), variant: "destructive" }),
      },
    );
  }

  const resources = integration.data?.resources ?? [];

  return (
    <div className="panel-3d-sub p-3 space-y-3">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nova solicitação</span>
      {integration.isError ? (
        <p role="alert" className="concave-3d p-3 text-sm">{describeError(integration.error, "Recursos indisponíveis.")}</p>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="req-resource" className="lbl">Recurso</Label>
          <Select value={resourceId} onValueChange={changeResource} disabled={integration.isPending}>
            <SelectTrigger id="req-resource" className="field-engraved h-11" data-testid="select-request-resource">
              <SelectValue placeholder={integration.isPending ? "Carregando…" : "Escolha o recurso"} />
            </SelectTrigger>
            <SelectContent>
              {resources.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {resourceId && (
        <>
          {current.isError && <p role="alert" className="text-sm text-red-600">Não foi possível consultar o expediente atual. Recarregue antes de solicitar.</p>}
          {expectedWindows && loadedResource.current === resourceId && (
            <div>
              <p className="mb-2 text-xs font-semibold">Expediente atual</p>
              <WindowsSummary windows={expectedWindows} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="req-reason" className="lbl">Justificativa (8 a 500 caracteres)</Label>
            <Textarea
              id="req-reason"
              className="field-engraved min-h-[72px]"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-request-reason"
            />
          </div>
          <p className="concave-3d px-3 py-2 text-xs text-muted-foreground">
            A proposta substitui o expediente inteiro do recurso. Dia sem faixa fica fechado. Enviar sem nenhuma faixa propõe fechar todos os dias.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ORDER.map((wd) => (
              <div key={wd} className="panel-3d-sub p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide">{WEEK[wd]}</span>
                  <button
                    type="button"
                    className="btn-3d-soft inline-flex h-9 w-9 items-center justify-center"
                    aria-label={`Adicionar faixa em ${WEEK[wd]}`}
                    onClick={() => setWindows((ws) => [...ws, { weekday: wd, startTime: "08:00", endTime: "12:00", repeatWeeks: 1, anchorDate: null }])}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {windows.every((w) => w.weekday !== wd) && <span className="block text-[11px] text-muted-foreground">Fechado</span>}
                {windows.map((w, idx) =>
                  w.weekday !== wd ? null : (
                    <div key={idx} className="flex flex-col gap-2">
                      <div className="flex items-center gap-1">
                      <Input
                        type="time"
                        aria-label={`Início ${WEEK[wd]}`}
                        className="field-engraved h-10 px-1 text-sm"
                        value={w.startTime}
                        onChange={(e) => setField(idx, "startTime", e.target.value)}
                      />
                      <span aria-hidden>–</span>
                      <Input
                        type="time"
                        aria-label={`Fim ${WEEK[wd]}`}
                        className="field-engraved h-10 px-1 text-sm"
                        value={w.endTime}
                        onChange={(e) => setField(idx, "endTime", e.target.value)}
                      />
                      <button
                        type="button"
                        className="inline-flex h-10 w-9 shrink-0 items-center justify-center text-destructive"
                        aria-label={`Remover faixa de ${WEEK[wd]}`}
                        onClick={() => setWindows((ws) => ws.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      </div>
                      <label className="text-[10px] font-semibold text-muted-foreground">
                        Repetição
                        <select className="field-engraved mt-1 h-10 w-full rounded px-2 text-sm" value={w.repeatWeeks ?? 1}
                          onChange={e => setWindows(ws => ws.map((item, i) => i === idx
                            ? { ...item, repeatWeeks: e.target.value === "2" ? 2 : 1, anchorDate: e.target.value === "2" ? item.anchorDate : null }
                            : item))}>
                          <option value="1">Toda semana</option>
                          <option value="2">A cada duas semanas</option>
                        </select>
                      </label>
                      {w.repeatWeeks === 2 && (
                        <label className="text-[10px] font-semibold text-muted-foreground">
                          Primeiro dia de atendimento
                          <Input type="date" className="field-engraved mt-1 h-10" value={w.anchorDate ?? ""}
                            onChange={e => setField(idx, "anchorDate", e.target.value)} />
                        </label>
                      )}
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
          {invalid && <p role="alert" className="text-xs text-red-600">Confira os horários e, para repetição quinzenal, a data inicial no dia correto.</p>}
          <Button
            className="btn-3d h-11 w-full"
            disabled={!reasonOk || invalid || !expectedWindows || loadedResource.current !== resourceId || create.isPending}
            onClick={submit}
            data-testid="button-submit-request"
          >
            {create.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            Enviar solicitação
          </Button>
        </>
      )}
    </div>
  );
}

export function AgendaChangeRequests() {
  const { toast } = useToast();
  const list = useAgendaChangeRequests();
  const decide = useDecideChangeRequest();

  return (
    <section className="panel-3d p-4 space-y-4" aria-label="Solicitações de mudança de expediente">
      <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
        <ClipboardEdit className="h-4 w-4" /> Mudança de expediente
      </span>
      <RequestForm />
      {list.isPending ? (
        <div className="concave-3d h-20 animate-pulse" role="status" aria-label="Carregando solicitações" />
      ) : list.isError ? (
        <div role="alert" className="concave-3d flex flex-wrap items-center gap-3 p-3 text-sm">
          <span className="flex-1">{describeError(list.error, "Não foi possível listar as solicitações.")}</span>
          <Button className="btn-3d-soft" onClick={() => void list.refetch()}>Tentar novamente</Button>
        </div>
      ) : list.data.requests.length === 0 ? (
        <p className="concave-3d p-4 text-sm text-muted-foreground">Nenhuma solicitação sua ou para você decidir.</p>
      ) : (
        <ul className="space-y-4">
          {list.data.requests.map((r) => {
            const st = STATE_LABEL[r.state] ?? { label: r.state, led: "paxter-led-off" };
            const pending = r.state === "pendente";
            return (
              <li key={r.id} className="panel-3d-sub p-3 space-y-2.5" data-testid={`row-request-${r.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{r.resource}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      #{r.id} · {new Date(r.createdAt).toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"})}
                    </div>
                  </div>
                  <span className="concave-3d inline-flex w-[104px] shrink-0 items-center gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
                    <span className={`paxter-led ${st.led}`} aria-hidden /> {st.label}
                  </span>
                </div>
                <p className="concave-3d px-3 py-2 text-xs">{r.reason}</p>
                <WindowsSummary windows={r.windows} />
                {pending && r.canDecide && (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      className="btn-3d h-10"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate(
                          { id: r.id, decision: "aprovar" },
                          {
                            onSuccess: () => toast({ title: "Expediente aprovado" }),
                            onError: (e) => toast({ title: "Decisão recusada", description: describeError(e, "Falha."), variant: "destructive" }),
                          },
                        )
                      }
                      data-testid={`button-approve-${r.id}`}
                    >
                      <Check className="mr-1 h-4 w-4" /> Aprovar
                    </Button>
                    <Button
                      className="btn-3d-soft h-10"
                      disabled={decide.isPending}
                      onClick={() =>
                        decide.mutate(
                          { id: r.id, decision: "recusar" },
                          {
                            onSuccess: () => toast({ title: "Solicitação recusada" }),
                            onError: (e) => toast({ title: "Decisão recusada", description: describeError(e, "Falha."), variant: "destructive" }),
                          },
                        )
                      }
                      data-testid={`button-reject-${r.id}`}
                    >
                      <X className="mr-1 h-4 w-4" /> Recusar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
