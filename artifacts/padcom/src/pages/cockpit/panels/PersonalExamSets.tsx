import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BASE } from "../../comunicacao/_shared";
import { getCollabToken } from "@/lib/collab-auth";

export interface SetExam {
  id: number;
  nomeExame: string | null;
  codigoExame: string | null;
  grupoPrincipal: string | null;
  subgrupo: string | null;
  modalidade: string | null;
  materialOuSetor: string | null;
  preparo: string | null;
  ativo?: boolean | null;
}
interface ExamSet {
  id: number;
  name: string;
  archived: boolean;
  items: Array<{ id: number; name: string; code: string | null;
    status: "available" | "inactive" | "removed"; exam: SetExam | null }>;
}
const statusLabel = { available: "Disponível", inactive: "Desativado", removed: "Removido do catálogo" };

export default function PersonalExamSets({ clientId, professionalId, clinicId, exams, selectedIds, disabled, onApply }: {
  clientId: number; professionalId: number; clinicId: number;
  exams: SetExam[]; selectedIds: number[]; disabled: boolean;
  onApply: (exams: SetExam[]) => void;
}) {
  const path = `${BASE}/api/exam-sets/${clientId}`;
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ExamSet | "new" | null>(null);
  const [name, setName] = useState("");
  const [ids, setIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  async function api<T>(suffix = "", init?: RequestInit, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${path}${suffix}`, {
      ...init, signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getCollabToken() ?? ""}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível acessar os conjuntos.");
    return data;
  }
  const query = useQuery<ExamSet[]>({
    queryKey: ["personal-exam-sets", professionalId, clinicId, clientId],
    enabled: !disabled, staleTime: 0, gcTime: 0, retry: false,
    queryFn: ({ signal }) => api("", undefined, signal),
  });
  const locked = disabled || busy;
  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (err) {
      if (alive.current) setError((err as Error).message);
    } finally { if (alive.current) setBusy(false); }
  }
  function start(set: ExamSet | "new") {
    setEditing(set); setName(set === "new" ? "" : set.name);
    setIds(set === "new" ? selectedIds : set.items.map(item => item.id));
    setSearch(""); setError(""); setNotice("");
  }
  async function save() {
    if (!editing || locked) return;
    await perform(async () => {
      await api(editing === "new" ? "" : `/${editing.id}`, {
        method: editing === "new" ? "POST" : "PATCH",
        body: JSON.stringify({ name: name.trim(), examIds: ids }),
      });
      if (!alive.current) return;
      setEditing(null); setNotice("Conjunto salvo. Nenhum pedido foi emitido.");
      await query.refetch();
    });
  }
  async function apply(set: ExamSet) {
    if (locked) return;
    await perform(async () => {
      // Fresh catalogue resolution; never silently apply an archived/stale selection.
      const latest = (await api<ExamSet[]>()).find(item => item.id === set.id && !item.archived);
      if (!latest) throw new Error("Este conjunto não está mais disponível.");
      if (!alive.current) return;
      onApply(latest.items.flatMap(item => item.status === "available" && item.exam ? [item.exam] : []));
      const unavailable = latest.items.filter(item => item.status !== "available");
      setNotice(`Caixinhas preenchidas para conferência. Nenhum pedido emitido ou enviado.${unavailable.length
        ? ` Não selecionados: ${unavailable.map(item => `${item.name} (${statusLabel[item.status]})`).join("; ")}.` : ""}`);
      await query.refetch();
    });
  }
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const available = exams.filter(exam => exam.ativo !== false && !!exam.nomeExame);
  const candidates = available.filter(exam => ids.includes(exam.id) ||
    normalize(`${exam.nomeExame} ${exam.codigoExame}`).includes(normalize(search))).slice(0, search ? 80 : 40);
  // Selected items remain reachable even when outside the search result limit.
  const editorExams = [...new Map([...available.filter(exam => ids.includes(exam.id)), ...candidates]
    .map(exam => [exam.id, exam])).values()];
  const unavailable = editing && editing !== "new"
    ? editing.items.filter(item => !available.some(exam => exam.id === item.id)) : [];
  const toggle = (id: number) => setIds(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);

  return <section className="panel-3d-sub min-w-0 space-y-3 break-words p-3" aria-label="Meus conjuntos de exames">
    <h3 className="text-sm font-semibold">Meus conjuntos de exames</h3>
    <p className="text-xs text-muted-foreground">Pessoais deste médico nesta clínica. Aplicar apenas marca caixinhas para conferência.</p>
    {query.isPending && <p className="text-xs">Carregando conjuntos…</p>}
    {query.isError && <div role="alert" className="text-xs text-red-400">
      {(query.error as Error).message} <button type="button" className="btn-3d-soft px-2 py-1"
        onClick={() => void query.refetch()} disabled={locked}>Tentar novamente</button>
    </div>}
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    {notice && <p role="status" className="concave-3d p-2 text-xs">{notice}</p>}
    <button type="button" className="btn-3d-soft px-3 py-2 text-xs" disabled={locked || !selectedIds.length}
      onClick={() => start("new")}>Salvar seleção como conjunto</button>
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />
      Mostrar arquivados
    </label>
    {query.data?.filter(set => showArchived || !set.archived).map(set => <div key={set.id} className="concave-3d space-y-2 p-3">
      <p className="text-sm font-semibold">{set.name}{set.archived ? " — Arquivado" : ""}</p>
      <ul className="max-h-32 overflow-auto text-xs">
        {set.items.map(item => <li key={item.id}>
          {item.name} {item.code ? `(${item.code})` : ""} — {statusLabel[item.status]}
        </li>)}
      </ul>
      {!set.archived && <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-3d-soft px-2 py-1 text-xs" disabled={locked}
          onClick={() => void apply(set)}>Aplicar às caixinhas</button>
        <button type="button" className="btn-3d-soft px-2 py-1 text-xs" disabled={locked}
          onClick={() => start(set)}>Editar / renomear</button>
        <button type="button" className="btn-3d-soft px-2 py-1 text-xs" disabled={locked}
          onClick={() => {
            if (!window.confirm(`Arquivar "${set.name}"? Os pedidos anteriores não serão alterados.`)) return;
            void perform(async () => {
              await api(`/${set.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
              if (!alive.current) return;
              setEditing(null); setNotice("Conjunto arquivado. Pedidos anteriores preservados.");
              await query.refetch();
            });
          }}>Arquivar</button>
      </div>}
    </div>)}
    {query.data?.length === 0 && <p className="text-xs text-muted-foreground">Nenhum conjunto salvo nesta clínica.</p>}
    {editing && <form className="concave-3d space-y-2 p-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      <h4 className="text-xs font-semibold">{editing === "new" ? "Novo conjunto" : "Editar conjunto"}</h4>
      <label className="block text-xs">Nome do conjunto
        <input className="concave-3d mt-1 w-full p-2" value={name} maxLength={120} required disabled={locked}
          onChange={event => setName(event.target.value)} />
      </label>
      <input aria-label="Buscar exame no conjunto" placeholder="Buscar exame no catálogo…" className="concave-3d w-full p-2 text-xs"
        value={search} onChange={event => setSearch(event.target.value)} disabled={locked} />
      <div className="max-h-52 space-y-1 overflow-auto">
        {editorExams.map(exam => <label key={exam.id} className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={ids.includes(exam.id)} disabled={locked} onChange={() => toggle(exam.id)} />
          {exam.nomeExame}
        </label>)}
        {unavailable.map(item => <label key={item.id} className="flex items-start gap-2 text-xs text-amber-500">
          <input type="checkbox" checked={ids.includes(item.id)} disabled={locked} onChange={() => toggle(item.id)} />
          {item.name} — {statusLabel[item.status === "available" ? "inactive" : item.status]} (não será aplicado)
        </label>)}
      </div>
      <p className="text-xs">{ids.length} exames no conjunto. Nenhuma emissão automática.</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-3d-soft px-3 py-2 text-xs" disabled={locked || !name.trim() || !ids.length || ids.length > 100}>Salvar conjunto</button>
        <button type="button" className="btn-3d-soft px-3 py-2 text-xs" disabled={locked} onClick={() => setEditing(null)}>Cancelar</button>
      </div>
    </form>}
  </section>;
}
