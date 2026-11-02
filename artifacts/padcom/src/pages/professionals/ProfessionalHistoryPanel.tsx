import { useState } from "react";
import { History, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getCollabToken } from "@/lib/collab-auth";

interface HistoryChange {
  field: string;
  before: string;
  after: string;
}

interface HistoryEvent {
  id: number;
  label: string;
  createdAt: string;
  actorName: string | null;
  subjectName: string | null;
  empresaId: number | null;
  companyName: string | null;
  changes: HistoryChange[];
}

interface ProfessionalHistoryPanelProps {
  professionalId: number;
  isOwnRecord: boolean;
  canViewOtherRecords: boolean;
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function ProfessionalHistoryPanel({
  professionalId,
  isOwnRecord,
  canViewOtherRecords,
}: ProfessionalHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);

  async function loadHistory() {
    if (!isOwnRecord && !canViewOtherRecords) {
      setError("Você não tem autorização para consultar este histórico.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = getCollabToken();
      const path = isOwnRecord
        ? "/api/collaborator/me/history"
        : `/api/professionals/${professionalId}/history`;
      const response = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({})) as {
        events?: HistoryEvent[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível carregar o histórico.");
      }
      setEvents(Array.isArray(result.events) ? result.events : []);
      setLoaded(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar o histórico.");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(checked: boolean) {
    setOpen(checked);
    if (!checked) {
      setEvents([]);
      setLoaded(false);
      setError(null);
      return;
    }
    if (!loaded) void loadHistory();
  }

  return (
    <section className="concave-3d space-y-4 p-4" aria-labelledby="professional-history-title">
      <div className="flex items-center gap-3">
        <History className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Label
            htmlFor="professional-history-toggle"
            id="professional-history-title"
            className="text-sm font-semibold"
          >
            Exibir histórico de alterações
          </Label>
          <p className="text-xs text-muted-foreground">
            O histórico é permanente. Senhas, códigos e tokens nunca são exibidos.
          </p>
        </div>
        <Switch
          id="professional-history-toggle"
          checked={open}
          onCheckedChange={handleToggle}
          aria-label="Mostrar ou ocultar o histórico de alterações"
        />
      </div>

      {open ? (
        <div className="space-y-3 border-t border-border/50 pt-3">
          {loading ? (
            <p className="text-sm text-muted-foreground" role="status">Carregando histórico…</p>
          ) : null}
          {error ? (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              <Button type="button" variant="outline" className="btn-3d-soft"
                onClick={() => void loadHistory()} disabled={loading}>
                <RotateCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                Tentar novamente
              </Button>
            </div>
          ) : null}
          {loaded && events.length === 0 ? (
            <div className="concave-3d p-3 text-sm text-muted-foreground">
              Nenhuma alteração foi registrada ainda.
            </div>
          ) : null}
          {events.length > 0 ? (
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="panel-3d-sub space-y-3 p-3">
                  <div className="grid gap-1 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{event.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Cadastro: {event.subjectName ?? "Nome não registrado"}
                        {event.companyName ? ` · ${event.companyName}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Alterado por: {event.actorName ?? "Responsável não identificado"}
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground">{formatHistoryDate(event.createdAt)}</time>
                  </div>
                  {event.changes.length ? (
                    <div className="space-y-2">
                      {event.changes.map((change) => (
                        <div key={`${event.id}-${change.field}`}
                          className="grid gap-2 border-t border-border/40 pt-2 sm:grid-cols-[minmax(8rem,0.35fr)_1fr_1fr]">
                          <span className="text-xs font-semibold text-muted-foreground">{change.field}</span>
                          <span className="min-w-0 break-words text-xs">Anterior: {change.before}</span>
                          <span className="min-w-0 break-words text-xs">Atual: {change.after}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ação registrada sem expor credenciais.</p>
                  )}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
