import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Check, Clock, Lock, Repeat, Search, X } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { describeError, useCollabIdentity } from "./agenda-integration-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { GoogleAgendaCommitments, GoogleAgendaCommitment } from "@workspace/api-client-react";

/* ── Modelo de seleção (puro, testável) ─────────────────────────────────────
   "todas" e um MODO, nao uma lista: agendas novas que o servidor devolver
   entram automaticamente. "ids" guarda so identidades numericas (agendaId),
   nunca nomes (nomes podem colidir). Vive apenas em memoria (useState):
   nada vai para localStorage/sessionStorage/URL. */
export type AgendaSelection = { mode: "todas" } | { mode: "ids"; ids: ReadonlySet<number> };

export const SELECAO_TODAS: AgendaSelection = { mode: "todas" };
export const SELECAO_NENHUMA: AgendaSelection = { mode: "ids", ids: new Set() };

export function isAgendaSelected(sel: AgendaSelection, id: number): boolean {
  return sel.mode === "todas" || sel.ids.has(id);
}

export function toggleAgenda(sel: AgendaSelection, id: number, allIds: readonly number[]): AgendaSelection {
  const ids = new Set(sel.mode === "todas" ? allIds : sel.ids);
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  return { mode: "ids", ids };
}

export function onlyAgenda(id: number): AgendaSelection {
  return { mode: "ids", ids: new Set([id]) };
}

export function countSelected(sel: AgendaSelection, allIds: readonly number[]): number {
  return sel.mode === "todas" ? allIds.length : allIds.filter((id) => sel.ids.has(id)).length;
}

export function filterCommitments(
  eventos: readonly GoogleAgendaCommitment[], sel: AgendaSelection, search: string,
): GoogleAgendaCommitment[] {
  const term = search.trim().toLocaleLowerCase("pt-BR");
  return eventos.filter((e) => isAgendaSelected(sel, e.agendaId)
    && (!term || `${e.titulo} ${e.agenda}`.toLocaleLowerCase("pt-BR").includes(term)));
}

export type ViewState = "carregando" | "erro" | "sem-cadastro" | "nenhum-selecionado" | "sem-resultado" | "lista";

export function resolveViewState(args: {
  pending: boolean; error: boolean; agendas: number; selected: number; results: number;
}): ViewState {
  if (args.pending) return "carregando";
  if (args.error) return "erro";
  if (args.agendas === 0) return "sem-cadastro";
  if (args.selected === 0) return "nenhum-selecionado";
  if (args.results === 0) return "sem-resultado";
  return "lista";
}

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");
const safeColor = (c: string) => (/^#[0-9a-fA-F]{3,8}$/.test(c) ? c : "#94a3b8");

function StateBox({ title, text, children, role = "status" }: {
  title: string; text: string; children?: React.ReactNode; role?: "status" | "alert";
}) {
  return (
    <div role={role} className="concave-3d px-4 py-8 text-center rounded-[6px] space-y-2">
      <Calendar className="h-8 w-8 mx-auto text-muted-foreground/30" aria-hidden />
      <p className="text-[11px] font-black uppercase tracking-widest text-foreground/80">{title}</p>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">{text}</p>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3">
      <span className="bevel-3d px-2 py-1 text-[9px] font-black uppercase tracking-widest text-center">{label}</span>
      <span className="concave-3d px-3 py-1.5 text-xs font-semibold min-w-0 break-words">{value}</span>
    </div>
  );
}

export function GoogleCommitments({ de, ate }: { de: string; ate: string }) {
  const identity = useCollabIdentity();
  return <GoogleCommitmentsPanel key={identity} identity={identity} de={de} ate={ate} />;
}

function GoogleCommitmentsPanel({ identity, de, ate }: { identity: string; de: string; ate: string }) {
  const [search, setSearch] = useState("");
  // Seleção independente de de/ate: trocar periodo nao reseta.
  const [selection, setSelection] = useState<AgendaSelection>(SELECAO_TODAS);
  const [detail, setDetail] = useState<GoogleAgendaCommitment | null>(null);
  useEffect(() => setDetail(null), [de, ate]);
  const query = useQuery({
    queryKey: ["google-compromissos", identity, de, ate],
    queryFn: async ({ signal }) => {
      const base = import.meta.env.VITE_API_URL || "/api";
      const params = new URLSearchParams({ de, ate });
      const response = await fetch(`${base}/agenda/google-compromissos?${params}`, {
        headers: collabAuthHeaders(), signal,
      });
      if (!response.ok) throw Object.assign(new Error("Não foi possível carregar a agenda importada."), { status: response.status });
      return response.json() as Promise<GoogleAgendaCommitments>;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const agendas = useMemo(() => query.data?.agendas ?? [], [query.data]);
  const allIds = useMemo(() => agendas.map((a) => a.id), [agendas]);
  const countByAgenda = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of filterCommitments(query.data?.eventos ?? [], SELECAO_TODAS, search)) m.set(e.agendaId, (m.get(e.agendaId) ?? 0) + 1);
    return m;
  }, [query.data, search]);
  const events = useMemo(
    () => filterCommitments(query.data?.eventos ?? [], selection, search),
    [query.data, selection, search],
  );
  useEffect(() => {
    if (!detail) return;
    const current = query.isError ? undefined : events.find((event) => event.id === detail.id);
    if (!current) setDetail(null);
    else if (current !== detail) setDetail(current);
  }, [detail, events, query.isError]);
  const selectedCount = countSelected(selection, allIds);
  const view = resolveViewState({
    pending: query.isPending, error: query.isError,
    agendas: agendas.length, selected: selectedCount, results: events.length,
  });
  const desde = query.data?.desde ? fmtDate(query.data.desde.slice(0, 10)) : null;
  const all = selection.mode === "todas";
  const none = selection.mode === "ids" && selection.ids.size === 0;

  const modeBtn = (active: boolean) =>
    `bevel-3d px-3 h-9 text-[10px] font-black uppercase tracking-widest transition-transform active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48b6cc] ${active ? "empresa-aba" : ""}`;

  return (
    <section className="panel-3d p-4 sm:p-5 space-y-4" aria-label="Compromissos importados do Google">
      <div className="flex items-start justify-between gap-3">
        <h2 className="bevel-3d inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest">
          <Calendar className="h-4 w-4" aria-hidden /> Compromissos do Google
        </h2>
        <span className="concave-3d shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden /> Somente leitura
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {desde ? `Importação desde ${desde}` : "Importação do Google"} · período conforme a navegação acima · sem alterar o Google.
      </p>

      {/* Seletor de agendas */}
      <fieldset className="panel-3d-sub p-3 sm:p-4 space-y-3" disabled={view === "carregando" || view === "erro"}>
        <legend className="sr-only">Agendas Google exibidas</legend>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="min-w-0">
            <p className="lbl">Filtro de agendas importadas</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Alcança apenas compromissos do Google. Sessões clínicas do PAXTER não são filtradas aqui.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 shrink-0" role="group" aria-label="Seleção rápida">
            <button type="button" aria-pressed={all} className={modeBtn(all)} onClick={() => setSelection(SELECAO_TODAS)}>
              Todas
            </button>
            <button type="button" aria-pressed={none} className={modeBtn(none)} onClick={() => setSelection(SELECAO_NENHUMA)}>
              Nenhuma
            </button>
          </div>
        </div>

        <div className="concave-3d px-3 py-1.5 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-widest" aria-live="polite">
          <span className="text-muted-foreground">Selecionadas</span>
          <span className="tabular-nums text-primary">
            {view === "erro" ? "Consulta indisponível" : view === "carregando" ? "Carregando" : all ? `Todas (${allIds.length}) · inclui novas` : `${selectedCount} de ${allIds.length}`}
          </span>
        </div>

        {view === "carregando" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-[6px]" />)}
          </div>
        ) : agendas.length > 0 && (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agendas.map((a) => {
              const on = isAgendaSelected(selection, a.id);
              const n = countByAgenda.get(a.id) ?? 0;
              return (
                <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <button type="button" role="checkbox" aria-checked={on}
                    onClick={() => setSelection((s) => toggleAgenda(s, a.id, allIds))}
                    className={`${on ? "panel-3d-sub panel-3d-active" : "concave-3d opacity-75"} h-12 px-3 grid grid-cols-[18px_12px_minmax(0,1fr)_auto_2.5rem] items-center gap-2 text-left rounded-[6px] transition-[transform,opacity] duration-150 hover:-translate-y-px active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48b6cc]`}>
                    <span className={`h-[18px] w-[18px] rounded-[3px] border flex items-center justify-center ${on ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background"}`} aria-hidden>
                      {on && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="h-3 w-3 rounded-[3px] ring-1 ring-black/15" style={{ backgroundColor: safeColor(a.cor) }} aria-hidden />
                    <span className="truncate text-xs font-bold uppercase tracking-tight">{a.nome}</span>
                    <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">Código {a.id}</span>
                    <span className="text-[11px] font-bold tabular-nums text-right text-muted-foreground" aria-label={`${n} compromissos encontrados`}>{n}</span>
                  </button>
                  <button type="button" onClick={() => setSelection(onlyAgenda(a.id))}
                    aria-label={`Mostrar somente ${a.nome}, código ${a.id}`} title="Somente esta"
                    className="btn-3d-soft bevel-3d h-12 px-2 text-[9px] font-black uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-[#48b6cc]">
                    Só
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input aria-label="Buscar nos compromissos do Google" placeholder="Buscar compromisso ou agenda…"
          className="field-engraved pl-9 pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-[3px] hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {view === "carregando" ? (
        <div role="status" aria-label="Carregando compromissos" className="space-y-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 rounded-[6px]" />)}
        </div>
      ) : view === "erro" ? (
        <StateBox role="alert" title="Falha na consulta" text={describeError(query.error, "Não foi possível consultar a agenda.")}>
          <Button type="button" className="btn-3d-soft mt-2" onClick={() => void query.refetch()}>Tentar novamente</Button>
        </StateBox>
      ) : view === "sem-cadastro" ? (
        <StateBox title="Nenhuma agenda importada" text="Não há agendas Google cadastradas para leitura neste acesso." />
      ) : view === "nenhum-selecionado" ? (
        <StateBox title="Nenhuma agenda selecionada" text="Marque uma ou mais agendas acima, ou use Todas.">
          <Button type="button" className="btn-3d-soft mt-2" onClick={() => setSelection(SELECAO_TODAS)}>Selecionar todas</Button>
        </StateBox>
      ) : view === "sem-resultado" ? (
        <StateBox title="Sem resultados" text={search.trim()
          ? "Nenhum compromisso das agendas selecionadas corresponde à busca neste período."
          : "Nenhum compromisso das agendas selecionadas neste período."}>
          {search.trim() && <Button type="button" className="btn-3d-soft mt-2" onClick={() => setSearch("")}>Limpar busca</Button>}
        </StateBox>
      ) : (
        <div className="space-y-2">
          <p className="lbl" aria-live="polite">{events.length} compromisso{events.length === 1 ? "" : "s"}</p>
          <ul className="concave-3d scroll-gold overflow-auto max-h-[520px] rounded-[6px] p-2 space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setDetail(e)}
                  aria-label={`Ver detalhes: ${e.titulo}, ${fmtDate(e.data)}, ${e.diaInteiro ? "dia inteiro" : e.horario}`}
                  className="panel-3d-sub w-full text-left grid grid-cols-[4px_76px_minmax(0,1fr)] sm:grid-cols-[4px_88px_96px_minmax(0,1fr)_minmax(0,180px)] items-center gap-x-3 gap-y-1 pr-3 py-2 overflow-hidden transition-transform duration-150 hover:-translate-y-px active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#48b6cc]">
                  <span className="self-stretch row-span-2 sm:row-span-1" style={{ backgroundColor: safeColor(e.cor) }} aria-hidden />
                  <span className="text-xs font-bold tabular-nums">{fmtDate(e.data)}</span>
                  <span className="hidden sm:block text-xs tabular-nums text-muted-foreground">{e.diaInteiro ? "Dia inteiro" : e.horario}</span>
                  <span className="min-w-0 truncate text-xs font-semibold flex items-center gap-1.5">
                    {e.recorrente && <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
                    <span className="truncate">{e.titulo}</span>
                  </span>
                  <span className="col-start-2 sm:hidden text-[11px] tabular-nums text-muted-foreground">{e.diaInteiro ? "Dia inteiro" : e.horario}</span>
                  <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{e.agenda}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="panel-3d max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  <span className="h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-black/15" style={{ backgroundColor: safeColor(detail.cor) }} aria-hidden />
                  <span className="break-words">{detail.titulo}</span>
                </DialogTitle>
                <DialogDescription className="flex items-center gap-1.5 text-[11px]">
                  <Lock className="h-3 w-3" aria-hidden /> Compromisso importado do Google, somente leitura. Nenhum vínculo clínico foi confirmado nesta consulta.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <DetailRow label="Data" value={<span className="tabular-nums">{fmtDate(detail.data)}</span>} />
                <DetailRow label="Horário" value={<span className="inline-flex items-center gap-1.5 tabular-nums"><Clock className="h-3 w-3" aria-hidden />{detail.diaInteiro ? "Dia inteiro" : detail.horario}</span>} />
                <DetailRow label="Agenda" value={detail.agenda} />
                <DetailRow label="Repetição" value={detail.recorrente ? "Recorrente" : "Única"} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
