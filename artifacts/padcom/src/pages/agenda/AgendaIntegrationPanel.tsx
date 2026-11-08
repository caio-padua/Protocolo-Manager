import { CloudDownload, Loader2, RefreshCw, ShieldAlert, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { AgendaIntegrationCalendar } from "@workspace/api-client-react";
import {
  describeError,
  errorStatus,
  useGoogleRefreshCycle,
  useUpdatePersonalOwner,
  useUpdateReadSettings,
} from "./agenda-integration-api";

type Estado = "desligada" | "erro" | "aguardando" | "atualizada";

const ESTADO: Record<Estado, { led: string; label: string; tone: string }> = {
  desligada: { led: "paxter-led-off", label: "Leitura desligada", tone: "text-muted-foreground" },
  erro: { led: "paxter-led-red paxter-led-on", label: "Erro na leitura", tone: "text-red-600" },
  aguardando: { led: "paxter-led-amber paxter-led-breathe", label: "Aguardando", tone: "text-amber-700" },
  atualizada: { led: "paxter-led-green", label: "Atualizada", tone: "text-emerald-700" },
};

function estadoDe(a: AgendaIntegrationCalendar, pending: boolean): Estado {
  if (a.enabled === false) return "desligada";
  if (pending) return "aguardando";
  if (a.error) return "erro";
  if (!a.lastSuccess) return "aguardando";
  if (Date.now() - Date.parse(a.lastSuccess) > 5 * 60_000) return "aguardando";
  return "atualizada";
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const NO_OWNER = "__sem_titular__";

function AgendaRow({
  agenda,
  pending,
  professionals,
}: {
  agenda: AgendaIntegrationCalendar;
  pending: boolean;
  professionals: { id: number; name: string }[];
}) {
  const { toast } = useToast();
  const read = useUpdateReadSettings();
  const owner = useUpdatePersonalOwner();
  const estado = estadoDe(agenda, pending);
  const e = ESTADO[estado];
  const ownerKnown = agenda.personalOwnerId == null || professionals.some((p) => p.id === agenda.personalOwnerId);

  return (
    <li className="panel-3d-sub p-3 space-y-3" data-testid={`row-agenda-${agenda.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-6 w-1.5 shrink-0 rounded-[2px]" style={{ backgroundColor: agenda.color }} aria-hidden />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{agenda.name}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {agenda.role === "pessoal" ? "Agenda pessoal (bloqueios)" : agenda.role ?? "Expediente"}
            </div>
          </div>
        </div>
        <span
          className={`concave-3d inline-flex w-[148px] shrink-0 items-center gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${e.tone}`}
          role="status"
          data-testid={`status-agenda-${agenda.id}`}
        >
          <span className={`paxter-led ${e.led}`} aria-hidden />
          {e.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="concave-3d px-2 py-1.5">
          <div className="lbl">Última atualização</div>
          <div className="font-semibold tabular-nums">{fmt(agenda.lastSuccess)}</div>
        </div>
        <div className="concave-3d px-2 py-1.5">
          <div className="lbl">Última tentativa</div>
          <div className="font-semibold tabular-nums">{fmt(agenda.lastAttempt)}</div>
        </div>
      </div>

      {agenda.error && (
        <p role="alert" className="paxter-alert paxter-alert-red px-3 py-2 text-xs text-red-700">
          {agenda.error}
        </p>
      )}
      {agenda.enabled === false && (
        <p className="concave-3d px-3 py-2 text-xs text-muted-foreground">
          Com a leitura desligada, marcações neste local ficam bloqueadas até os dados serem atualizados de novo.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
          <Switch
            id={`read-${agenda.id}`}
            checked={agenda.enabled !== false}
            disabled={!agenda.canManage || read.isPending}
            onCheckedChange={(v) =>
              read.mutate(
                { locationId: agenda.id, enabled: v },
                {
                  onSuccess: () => toast({ title: v ? "Leitura ligada" : "Leitura desligada" }),
                  onError: (err) =>
                    toast({ title: "Alteração recusada", description: describeError(err, "Falha ao salvar."), variant: "destructive" }),
                },
              )
            }
            data-testid={`toggle-read-${agenda.id}`}
          />
          <Label htmlFor={`read-${agenda.id}`} className="text-xs">
            Ler do Google
          </Label>
        </div>
        <div className="space-y-1">
          <Label className="lbl" htmlFor={`owner-${agenda.id}`}>Titular pessoal</Label>
          <Select
            value={agenda.personalOwnerId == null ? NO_OWNER : String(agenda.personalOwnerId)}
            disabled={!agenda.canManage || owner.isPending}
            onValueChange={(v) =>
              owner.mutate(
                { locationId: agenda.id, professionalId: v === NO_OWNER ? null : Number(v) },
                {
                  onSuccess: () => toast({ title: v === NO_OWNER ? "Titular desvinculado" : "Titular vinculado" }),
                  onError: (err) =>
                    toast({ title: "Alteração recusada", description: describeError(err, "Falha ao salvar."), variant: "destructive" }),
                },
              )
            }
          >
            <SelectTrigger id={`owner-${agenda.id}`} className="field-engraved h-10" data-testid={`select-owner-${agenda.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_OWNER}>Sem titular (desvincular)</SelectItem>
              {!ownerKnown && (
                <SelectItem value={String(agenda.personalOwnerId)} disabled>
                  Profissional #{agenda.personalOwnerId} (fora da lista)
                </SelectItem>
              )}
              {professionals.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!agenda.canManage && (
        <p className="text-[11px] text-muted-foreground">
          Somente leitura: você não administra este local. Leitura e titular são alterados por quem administra.
        </p>
      )}
    </li>
  );
}

export function AgendaIntegrationPanel() {
  const { toast } = useToast();
  const cycle = useGoogleRefreshCycle();
  const q = cycle.integration;
  const unauthorized = q.isError && (errorStatus(q.error) === 401 || errorStatus(q.error) === 403);

  return (
    <section className="panel-3d p-4 space-y-4" aria-label="Estado das agendas do Google">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
          <CloudDownload className="h-4 w-4" /> Agendas do Google
        </span>
        <Button
          className="btn-3d h-10"
          disabled={cycle.running || unauthorized}
          onClick={() => cycle.start((msg) => toast({ title: "Atualização recusada", description: msg, variant: "destructive" }))}
          data-testid="button-refresh-google-motor"
        >
          {cycle.running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          {cycle.running ? "Atualizando…" : "Atualizar do Google"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Somente leitura: nada é gravado no Google. Endereços continuam no cadastro físico de locais.
      </p>

      {q.isPending ? (
        <div className="space-y-2" role="status" aria-label="Carregando agendas">
          {[0, 1].map((i) => <div key={i} className="concave-3d h-24 animate-pulse" />)}
        </div>
      ) : q.isError ? (
        <div role="alert" className="concave-3d flex flex-wrap items-center gap-3 p-3 text-sm">
          {unauthorized ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <Unplug className="h-4 w-4 text-red-600" />}
          <span className="flex-1">{describeError(q.error, "Não foi possível consultar o estado das agendas.")}</span>
          <Button className="btn-3d-soft" onClick={() => void q.refetch()}>Tentar novamente</Button>
        </div>
      ) : q.data.agendas.length === 0 ? (
        <p className="concave-3d p-4 text-sm text-muted-foreground">
          Nenhuma agenda do Google vinculada aos seus locais. O vínculo é feito em Cadastros, Agendas Google.
        </p>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {q.data.agendas.map((a) => (
            <AgendaRow
              key={a.id}
              agenda={a}
              pending={cycle.pendingIds.includes(a.id)}
              professionals={q.data.professionals}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
