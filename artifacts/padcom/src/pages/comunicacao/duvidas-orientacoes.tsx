import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  BookOpenCheck,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FilePlus2,
  Headset,
  MessageSquareText,
  PencilLine,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { BASE, BlockTitle, ConsoleShell } from "./_shared";

type StatusOrientacao = "rascunho" | "aprovada" | "inativa";
type Orientacao = {
  id: number;
  tema: string;
  perguntasExemplo: string;
  resposta: string;
  status: StatusOrientacao;
  aprovadoPor: number | null;
  aprovadoEm: string | null;
  atualizadoEm: string;
};
type Atendimento = {
  clienteId: number;
  nome: string;
  motivo: string;
  alteradoEm: string;
};
type EstadoAtendimento = {
  modoIA: "desligado" | "lista" | "ligado";
  queixaRevisada: boolean;
  emAtendimentoHumano: Atendimento[];
  pendencias?: {mensagemId:number;clienteId:number;estado:string;erro:string|null;
    etapas:Record<string,{estado:string}>;atualizadoEm:string}[];
};
type ListaResponse = { orientacoes: Orientacao[]; podeAprovar: boolean };
type FormValues = { tema: string; perguntasExemplo: string; resposta: string };

const EMPTY_FORM: FormValues = { tema: "", perguntasExemplo: "", resposta: "" };

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(collabAuthHeaders());
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${BASE}/api${path}`, { ...init, headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `Não foi possível concluir a solicitação (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function statusMeta(status: StatusOrientacao) {
  if (status === "aprovada") return { label: "Aprovada", led: "paxter-led-green", color: "text-emerald-700 dark:text-emerald-400" };
  if (status === "inativa") return { label: "Inativa", led: "paxter-led-amber", color: "text-amber-700 dark:text-amber-400" };
  return { label: "Rascunho", led: "paxter-led-amber", color: "text-amber-700 dark:text-amber-400" };
}

function SkeletonPanel() {
  return (
    <div aria-label="Carregando dados" data-testid="page-loading" className="panel-3d space-y-4 p-5">
      <div className="h-7 w-48 animate-pulse rounded bg-primary/10" />
      <div className="h-16 animate-pulse rounded bg-primary/5" />
      <div className="h-16 animate-pulse rounded bg-primary/5" />
    </div>
  );
}

export default function DuvidasOrientacoes() {
  const { toast } = useToast();
  const [orientacoes, setOrientacoes] = useState<Orientacao[] | null>(null);
  const [podeAprovar, setPodeAprovar] = useState(false);
  const [estado, setEstado] = useState<EstadoAtendimento | null>(null);
  const [listaLoading, setListaLoading] = useState(true);
  const [estadoLoading, setEstadoLoading] = useState(true);
  const [listaError, setListaError] = useState("");
  const [estadoError, setEstadoError] = useState("");
  const [filter, setFilter] = useState<"todas" | StatusOrientacao>("todas");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Orientacao | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [workingClient, setWorkingClient] = useState<number | null>(null);
  const [saveNotice, setSaveNotice] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionFailed, setActionFailed] = useState(false);

  const loadOrientations = useCallback(async (): Promise<boolean> => {
    setListaLoading(true);
    setListaError("");
    try {
      const data = await apiRequest<ListaResponse>("/duvidas-orientacoes");
      setOrientacoes(data.orientacoes);
      setPodeAprovar(data.podeAprovar);
      return true;
    } catch (error) {
      setListaError(error instanceof Error ? error.message : "Falha ao carregar orientações.");
      return false;
    } finally {
      setListaLoading(false);
    }
  }, []);

  const loadAttendance = useCallback(async (): Promise<boolean> => {
    setEstadoLoading(true);
    setEstadoError("");
    try {
      setEstado(await apiRequest<EstadoAtendimento>("/duvidas-orientacoes/atendimento/estado"));
      return true;
    } catch (error) {
      setEstadoError(error instanceof Error ? error.message : "Falha ao carregar o estado do atendimento.");
      return false;
    } finally {
      setEstadoLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrientations();
    void loadAttendance();
  }, [loadOrientations, loadAttendance]);

  useEffect(() => {
    const timer=window.setInterval(()=>{ if(document.visibilityState==="visible") void loadAttendance(); },30_000);
    return ()=>window.clearInterval(timer);
  },[loadAttendance]);

  const filteredOrientations = useMemo(() => {
    if (!orientacoes) return [];
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return orientacoes.filter((item) => {
      const statusMatch = filter === "todas" || item.status === filter;
      const searchMatch = !query || `${item.tema} ${item.perguntasExemplo} ${item.resposta}`.toLocaleLowerCase("pt-BR").includes(query);
      return statusMatch && searchMatch;
    });
  }, [orientacoes, filter, search]);

  const counts = useMemo(() => ({
    total: orientacoes?.length ?? 0,
    aprovadas: orientacoes?.filter((item) => item.status === "aprovada").length ?? 0,
    rascunhos: orientacoes?.filter((item) => item.status === "rascunho").length ?? 0,
  }), [orientacoes]);

  function startNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setSaveNotice("");
  }

  function startEdit(item: Orientacao) {
    setEditing(item);
    setForm({ tema: item.tema, perguntasExemplo: item.perguntasExemplo, resposta: item.resposta });
    setFormError("");
    setSaveNotice("");
  }

  function validateForm(): string {
    const tema = form.tema.trim();
    const perguntas = form.perguntasExemplo.trim();
    const resposta = form.resposta.trim();
    if (tema.length < 3 || tema.length > 120) return "O tema precisa ter entre 3 e 120 caracteres.";
    if (perguntas.length > 1000) return "As perguntas de exemplo podem ter no máximo 1.000 caracteres.";
    if (resposta.length < 10 || resposta.length > 1500) return "A resposta precisa ter entre 10 e 1.500 caracteres.";
    return "";
  }

  async function saveOrientation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateForm();
    if (validation) {
      setFormError(validation);
      return;
    }
    setSaving(true);
    setFormError("");
    setSaveNotice("");
    const payload = { tema: form.tema.trim(), perguntasExemplo: form.perguntasExemplo.trim(), resposta: form.resposta.trim() };
    try {
      if (editing) {
        const result = await apiRequest<{ ok: boolean; status: string }>(`/duvidas-orientacoes/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const refreshed = await loadOrientations();
        const description = refreshed
          ? `Estado atual: ${result.status}.`
          : `O servidor confirmou ${result.status}, mas a lista não atualizou. Recarregue a lista antes de continuar.`;
        setSaveNotice(`Alterações salvas. ${description}`);
        toast({ title: "Orientação atualizada", description });
      } else {
        const result = await apiRequest<{ id: number; status: "rascunho" }>("/duvidas-orientacoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const refreshed = await loadOrientations();
        const description = refreshed
          ? `Orientação ${result.id} salva como ${result.status}.`
          : `O servidor confirmou o rascunho ${result.id}, mas a lista não atualizou. Recarregue a lista.`;
        setSaveNotice(description);
        toast({ title: "Rascunho criado", description });
        setEditing(null);
        setForm(EMPTY_FORM);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar a orientação.";
      setFormError(message);
      toast({ title: "Não foi possível salvar", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function orientationAction(item: Orientacao, action: "aprovar" | "inativar") {
    setWorkingId(item.id);
    setActionNotice("");
    setActionFailed(false);
    try {
      await apiRequest<{ ok: true }>(`/duvidas-orientacoes/${item.id}/${action}`, { method: "POST" });
      const refreshed = await loadOrientations();
      const actionText = action === "aprovar"
        ? `“${item.tema}” aprovada pelo servidor.`
        : `“${item.tema}” inativada. O registro foi mantido e pode ser aprovado novamente.`;
      const notice = refreshed
        ? actionText
        : `${actionText} A lista não atualizou; recarregue antes de continuar.`;
      setActionNotice(notice);
      toast({ title: action === "aprovar" ? "Aprovação confirmada" : "Orientação inativada", description: notice });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar a orientação.";
      setActionNotice(message);
      setActionFailed(true);
      toast({ title: "Ação não concluída", description: message, variant: "destructive" });
    } finally {
      setWorkingId(null);
    }
  }

  async function attendanceAction(item: Atendimento, action: "assumir" | "devolver-ia") {
    setWorkingClient(item.clienteId);
    setActionNotice("");
    setActionFailed(false);
    try {
      await apiRequest<{ ok: true; modo: string }>(`/duvidas-orientacoes/atendimento/${item.clienteId}/${action}`, { method: "POST" });
      const actionText = action === "assumir"
        ? `Atendimento de ${item.nome} assumido pela equipe.`
        : `Atendimento de ${item.nome} devolvido à IA.`;
      const refreshed = await loadAttendance();
      const notice = refreshed
        ? actionText
        : `${actionText} A lista não atualizou; recarregue para conferir o estado atual.`;
      setActionNotice(notice);
      toast({ title: "Estado do atendimento atualizado", description: notice });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar o atendimento.";
      setActionNotice(message);
      setActionFailed(true);
      toast({ title: "Ação não concluída", description: message, variant: "destructive" });
    } finally {
      setWorkingClient(null);
    }
  }

  const setField = (key: keyof FormValues, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
    setSaveNotice("");
  };

  return (
    <ConsoleShell
      icon={MessageSquareText}
      title="Dúvidas e Orientações"
      subtitle="Biblioteca interna de textos aprovados e acompanhamento de conversas em atendimento humano"
    >
      <section className="panel-3d p-4" aria-label="Resumo operacional">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="concave-3d flex min-h-[76px] items-center gap-3 px-4 py-3" data-testid="summary-total">
            <BookOpenCheck className="h-5 w-5 shrink-0 text-primary" />
            <div><p className="lbl">Orientações cadastradas</p><p className="mt-0.5 text-xl font-bold leading-none">{listaLoading || listaError ? "—" : counts.total}</p></div>
          </div>
          <div className="concave-3d flex min-h-[76px] items-center gap-3 px-4 py-3" data-testid="summary-approved">
            <FileCheck2 className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <div><p className="lbl">Aprovadas</p><p className="mt-0.5 text-xl font-bold leading-none">{listaLoading ? "—" : counts.aprovadas}</p></div>
          </div>
          <div className="concave-3d flex min-h-[76px] items-center gap-3 px-4 py-3" data-testid="summary-drafts">
            <PencilLine className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
            <div><p className="lbl">Rascunhos</p><p className="mt-0.5 text-xl font-bold leading-none">{listaLoading ? "—" : counts.rascunhos}</p></div>
          </div>
        </div>
      </section>

      <section className="panel-3d p-4 sm:p-5" aria-label="Estado do atendimento">
        <BlockTitle icon={Headset}>Estado do atendimento</BlockTitle>
        {estadoLoading ? (
          <div className="grid gap-3 md:grid-cols-2" data-testid="attendance-loading">
            <div className="h-20 animate-pulse rounded bg-primary/5" /><div className="h-20 animate-pulse rounded bg-primary/5" />
          </div>
        ) : estadoError ? (
          <div className="concave-3d flex flex-wrap items-center justify-between gap-3 p-3" data-testid="attendance-error" role="alert">
            <span className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-400"><AlertCircle className="h-4 w-4" />{estadoError}</span>
            <button type="button" data-testid="retry-attendance" onClick={() => void loadAttendance()} className="btn-3d-soft inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide"><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</button>
          </div>
        ) : estado ? (
          <div className="grid gap-3 md:grid-cols-2" data-testid="attendance-state">
            <div className="panel-3d-sub p-4" data-testid="ai-mode">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><div className="bevel-3d grid h-9 w-9 place-items-center text-primary"><ShieldCheck className="h-4 w-4" /></div><div><p className="lbl">Modo atual da IA</p><p className="mt-1 text-base font-bold uppercase tracking-wide">{estado.modoIA}</p></div></div>
                <span className={`paxter-led paxter-led-breathe ${estado.modoIA === "ligado" ? "paxter-led-green" : "paxter-led-amber"}`} aria-hidden="true" />
              </div>
              <p className="mt-3 border-t border-border/70 pt-2 text-xs text-muted-foreground">Informativo. Esta tela não altera o modo de atendimento automático.</p>
            </div>
            <div className="panel-3d-sub p-4" data-testid="complaint-review-state">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><div className="bevel-3d grid h-9 w-9 place-items-center text-primary"><CheckCircle2 className="h-4 w-4" /></div><div><p className="lbl">Texto de queixa</p><p className={`mt-1 text-base font-bold uppercase tracking-wide ${estado.queixaRevisada ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{estado.queixaRevisada ? "Revisado" : "Pendente de revisão"}</p></div></div>
                <span className={`paxter-led ${estado.queixaRevisada ? "paxter-led-green" : "paxter-led-amber"}`} aria-hidden="true" />
              </div>
              <p className="mt-3 border-t border-border/70 pt-2 text-xs text-muted-foreground">Situação atual exibida para consulta; sem controles de configuração.</p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel-3d space-y-4 p-4 sm:p-5" aria-label="Pendências de entrega do atendimento">
        <BlockTitle icon={Headset}>Entregas do atendimento</BlockTitle>
        <p className="text-sm text-muted-foreground">Resultado incerto exige conferência humana e nunca é reenviado automaticamente.</p>
        {estadoLoading ? <p>Consultando entregas…</p> : estadoError ?
          <p role="alert">Entregas indisponíveis. Atualize o estado antes de concluir.</p> :
          estado?.pendencias ? (estado.pendencias.length ? estado.pendencias.map(p=>(
            <div key={p.mensagemId} className="concave-3d grid gap-3 p-3 sm:grid-cols-2" data-testid={`delivery-${p.mensagemId}`}>
              <p>Mensagem #{p.mensagemId} · Cliente #{p.clienteId}</p>
              <p>{({pendente:"Aguardando processamento",processando:"Em processamento",falhou:"Falhou; aguarda recuperação limitada",
                esgotado:"Entrega incompleta; exige conferência",incerto:"Resultado incerto; sem reenvio automático"} as Record<string,string>)[p.estado]??"Estado não reconhecido"}</p>
              <p>Alerta: {p.etapas.alerta?.estado??"Não iniciado"} · Resposta: {p.etapas.resposta?.estado??"Não iniciada"}</p>
              <p>Motivo técnico: {p.erro??"—"} · {dateLabel(p.atualizadoEm)}</p>
            </div>
          )) : <p>Nenhuma pendência de entrega registrada.</p>) :
          <p>Estado de entregas indisponível nesta versão do servidor.</p>}
      </section>

      <section className="panel-3d p-4 sm:p-5" aria-label="Conversas em atendimento humano">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <BlockTitle icon={UsersRound}>Em atendimento humano</BlockTitle>
          {!estadoLoading && !estadoError && estado && <span className="concave-3d px-3 py-1.5 text-xs font-semibold" data-testid="human-count">{estado.emAtendimentoHumano.length} conversa{estado.emAtendimentoHumano.length === 1 ? "" : "s"}</span>}
        </div>
        {estadoLoading ? (
          <div className="space-y-3" data-testid="human-list-loading"><div className="h-20 animate-pulse rounded bg-primary/5" /><div className="h-20 animate-pulse rounded bg-primary/5" /></div>
        ) : estadoError ? (
          <div className="concave-3d p-4 text-sm text-muted-foreground" data-testid="human-list-unavailable">A lista de conversas não está disponível até que o estado seja carregado.</div>
        ) : estado?.emAtendimentoHumano.length ? (
          <div className="space-y-3" data-testid="human-attendance-list">
            {estado.emAtendimentoHumano.map((item) => (
              <article key={item.clienteId} className="panel-3d-sub p-3 sm:p-4" data-testid={`human-row-${item.clienteId}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="concave-3d shrink-0 px-2 py-1 font-mono text-[11px] font-bold text-muted-foreground">#{item.clienteId}</span>
                      <UserRound className="h-4 w-4 shrink-0 text-primary" />
                      <h3 className="truncate text-sm font-bold uppercase tracking-wide" data-testid={`human-name-${item.clienteId}`}>{item.nome}</h3>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="concave-3d min-h-[54px] px-3 py-2" data-testid={`human-reason-${item.clienteId}`}><p className="lbl">Motivo</p><p className="mt-1 text-xs leading-relaxed text-foreground/85">{item.motivo || "—"}</p></div>
                      <div className="concave-3d min-h-[54px] px-3 py-2" data-testid={`human-updated-${item.clienteId}`}><p className="lbl">Alterado em</p><p className="mt-1 flex items-center gap-1.5 text-xs text-foreground/85"><Clock3 className="h-3.5 w-3.5 text-primary" />{dateLabel(item.alteradoEm)}</p></div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 md:pt-1">
                    <button type="button" data-testid={`assume-${item.clienteId}`} onClick={() => void attendanceAction(item, "assumir")} disabled={workingClient === item.clienteId} className="btn-3d-soft inline-flex min-h-10 items-center justify-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50">
                      {workingClient === item.clienteId ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Headset className="h-3.5 w-3.5" />}Assumir conversa
                    </button>
                    <button type="button" data-testid={`return-ai-${item.clienteId}`} onClick={() => void attendanceAction(item, "devolver-ia")} disabled={workingClient === item.clienteId} className="btn-3d inline-flex min-h-10 items-center justify-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50">
                      {workingClient === item.clienteId ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownToLine className="h-3.5 w-3.5" />}Devolver à IA
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : !estadoError ? (
          <div className="concave-3d px-5 py-8 text-center" data-testid="human-attendance-empty">
            <div className="bevel-3d mx-auto grid h-11 w-11 place-items-center text-primary"><UsersRound className="h-5 w-5" /></div>
            <p className="mt-3 text-sm font-semibold">Nenhuma conversa em atendimento humano</p>
            <p className="mt-1 text-xs text-muted-foreground">Quando houver uma conversa assumida pela equipe, ela aparecerá aqui.</p>
          </div>
        ) : null}
      </section>

      {actionNotice && <div role={actionFailed ? "alert" : "status"} aria-live="polite" data-testid="action-feedback" className="panel-3d-sub flex items-start gap-2 p-3 text-sm"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${actionFailed ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`} />{actionNotice}</div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <section className="panel-3d min-w-0 p-4 sm:p-5" aria-label="Biblioteca de orientações">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <BlockTitle icon={BookOpenCheck}>Biblioteca de orientações</BlockTitle>
            <button type="button" data-testid="new-orientation" onClick={startNew} className="btn-3d inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide"><FilePlus2 className="h-4 w-4" />Nova orientação</button>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <div>
              <label htmlFor="orientation-search" className="lbl mb-1 block">Buscar por tema ou texto</label>
              <input id="orientation-search" data-testid="orientation-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite uma palavra-chave" className="field-engraved h-10 w-full rounded-[4px] border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </div>
            <div>
              <label htmlFor="orientation-filter" className="lbl mb-1 block">Estado</label>
              <select id="orientation-filter" data-testid="orientation-filter" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="field-engraved h-10 w-full rounded-[4px] border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <option value="todas">Todos os estados</option><option value="rascunho">Rascunhos</option><option value="aprovada">Aprovadas</option><option value="inativa">Inativas</option>
              </select>
            </div>
          </div>
          {listaLoading ? <SkeletonPanel /> : listaError ? (
            <div className="concave-3d flex flex-col items-start gap-3 p-4" role="alert" data-testid="orientations-error">
              <p className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{listaError}</p>
              <button type="button" data-testid="retry-orientations" onClick={() => void loadOrientations()} className="btn-3d-soft inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide"><RefreshCw className="h-3.5 w-3.5" />Tentar novamente</button>
            </div>
          ) : filteredOrientations.length === 0 ? (
            <div className="concave-3d px-5 py-9 text-center" data-testid="orientations-empty">
              <BookOpenCheck className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold">{orientacoes?.length ? "Nenhuma orientação corresponde a esta busca" : "A biblioteca ainda não tem orientações"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{orientacoes?.length ? "Experimente outro termo ou estado." : "Crie um rascunho para registrar um texto que a equipe revisará."}</p>
              {!orientacoes?.length && <button type="button" data-testid="empty-create-orientation" onClick={startNew} className="btn-3d-soft mt-4 inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide"><FilePlus2 className="h-3.5 w-3.5" />Criar rascunho</button>}
            </div>
          ) : (
            <div className="space-y-3" data-testid="orientation-list">
              {filteredOrientations.map((item) => {
                const meta = statusMeta(item.status);
                return (
                  <article key={item.id} className="panel-3d-sub p-3 sm:p-4" data-testid={`orientation-${item.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="concave-3d shrink-0 px-2 py-1 font-mono text-[10px] font-bold text-muted-foreground">#{item.id}</span>
                          <h3 className="truncate text-sm font-bold uppercase tracking-wide" data-testid={`orientation-title-${item.id}`}>{item.tema}</h3>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.resposta}</p>
                      </div>
                      <span className={`concave-3d inline-flex shrink-0 items-center gap-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide ${meta.color}`} data-testid={`orientation-status-${item.id}`}><span className={`paxter-led ${meta.led}`} />{meta.label}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="concave-3d min-h-[48px] px-3 py-2" data-testid={`orientation-approval-${item.id}`}>
                        <p className="lbl">Aprovação</p>
                        <p className="mt-1 text-[11px] text-foreground/85">{item.status === "aprovada" ? `Profissional #${item.aprovadoPor ?? "—"} · ${dateLabel(item.aprovadoEm)}` : "Sem aprovação vigente"}</p>
                      </div>
                      <div className="concave-3d min-h-[48px] px-3 py-2" data-testid={`orientation-updated-${item.id}`}>
                        <p className="lbl">Última atualização</p><p className="mt-1 text-[11px] text-foreground/85">{dateLabel(item.atualizadoEm)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" data-testid={`edit-orientation-${item.id}`} onClick={() => startEdit(item)} className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide"><PencilLine className="h-3.5 w-3.5" />Editar texto</button>
                      {podeAprovar && item.status !== "aprovada" && <button type="button" data-testid={`approve-orientation-${item.id}`} onClick={() => void orientationAction(item, "aprovar")} disabled={workingId === item.id} className="btn-3d inline-flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide disabled:opacity-50">{workingId === item.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Aprovar</button>}
                      {item.status !== "inativa" && <button type="button" data-testid={`deactivate-orientation-${item.id}`} onClick={() => void orientationAction(item, "inativar")} disabled={workingId === item.id} className="btn-3d-soft inline-flex items-center gap-1.5 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide text-amber-800 disabled:opacity-50 dark:text-amber-300">{workingId === item.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Inativar</button>}
                    </div>
                    {!podeAprovar && item.status !== "aprovada" && <p className="mt-2 text-[10px] text-muted-foreground" data-testid={`approval-permission-${item.id}`}>A aprovação é restrita a profissionais médicos.</p>}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel-3d p-4 sm:p-5" aria-label="Editor de orientação">
          <div className="flex items-start justify-between gap-2">
            <BlockTitle icon={editing ? PencilLine : FilePlus2}>{editing ? "Editar orientação" : "Nova orientação"}</BlockTitle>
            {(editing || form.tema || form.perguntasExemplo || form.resposta) && <button type="button" data-testid="clear-form" onClick={startNew} aria-label="Limpar formulário e iniciar novo" className="btn-3d-soft grid h-9 w-9 shrink-0 place-items-center"><X className="h-4 w-4" /></button>}
          </div>
          {editing?.status === "aprovada" && <div className="concave-3d mb-3 flex items-start gap-2 p-3 text-xs text-amber-800 dark:text-amber-300" data-testid="edit-approved-warning"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />Ao editar, a aprovação anterior será invalidada pelo servidor e o texto voltará a rascunho.</div>}
          <form onSubmit={saveOrientation} className="space-y-3" data-testid="orientation-form">
            <div>
              <label htmlFor="orientation-topic" className="lbl mb-1 block">Tema <span className="normal-case tracking-normal text-muted-foreground">(3–120 caracteres)</span></label>
              <input id="orientation-topic" data-testid="field-topic" value={form.tema} onChange={(event) => setField("tema", event.target.value)} maxLength={120} required minLength={3} placeholder="Ex.: preparo para a primeira consulta" className="field-engraved h-10 w-full rounded-[4px] border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              <p className="mt-1 text-right text-[10px] text-muted-foreground" data-testid="topic-counter">{form.tema.length}/120</p>
            </div>
            <div>
              <label htmlFor="orientation-questions" className="lbl mb-1 block">Perguntas de exemplo <span className="normal-case tracking-normal text-muted-foreground">(opcional, até 1.000)</span></label>
              <textarea id="orientation-questions" data-testid="field-questions" value={form.perguntasExemplo} onChange={(event) => setField("perguntasExemplo", event.target.value)} maxLength={1000} rows={3} placeholder="Uma pergunta por linha, como a equipe costuma receber" className="field-engraved min-h-[84px] w-full resize-y rounded-[4px] border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              <p className="mt-1 text-right text-[10px] text-muted-foreground" data-testid="questions-counter">{form.perguntasExemplo.length}/1000</p>
            </div>
            <div>
              <label htmlFor="orientation-answer" className="lbl mb-1 block">Resposta aprovada / texto de referência <span className="normal-case tracking-normal text-muted-foreground">(10–1.500 caracteres)</span></label>
              <textarea id="orientation-answer" data-testid="field-answer" value={form.resposta} onChange={(event) => setField("resposta", event.target.value)} maxLength={1500} required minLength={10} rows={7} placeholder="Registre o texto elaborado e validado pela equipe clínica." className="field-engraved min-h-[168px] w-full resize-y rounded-[4px] border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
              <p className="mt-1 text-right text-[10px] text-muted-foreground" data-testid="answer-counter">{form.resposta.length}/1500</p>
            </div>
            {formError && <div role="alert" data-testid="form-error" className="concave-3d flex items-start gap-2 p-3 text-xs text-rose-700 dark:text-rose-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{formError}</div>}
            {saveNotice && <div role="status" aria-live="polite" data-testid="save-success" className="concave-3d flex items-start gap-2 p-3 text-xs text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{saveNotice}</div>}
            <div className="concave-3d flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] leading-relaxed text-muted-foreground">Salvar mantém a orientação como rascunho quando aplicável. Aprovação é uma ação separada.</p>
              <button type="submit" data-testid="save-orientation" disabled={saving} className="btn-3d inline-flex min-h-10 shrink-0 items-center justify-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide disabled:opacity-50">
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "Salvando…" : editing ? "Salvar alterações" : "Salvar rascunho"}
              </button>
            </div>
            {editing && <p className="text-[10px] text-muted-foreground" data-testid="editing-orientation-id">Editando orientação #{editing.id}</p>}
          </form>
        </section>
      </div>
    </ConsoleShell>
  );
}
