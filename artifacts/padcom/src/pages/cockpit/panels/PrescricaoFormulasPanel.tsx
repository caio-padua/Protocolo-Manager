import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Plus,
  X,
  Trash2,
  FileText,
  Layers,
  Clock,
  Building2,
  ShieldAlert,
  Send,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Eye,
  FileSignature,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  CATEGORIES,
  FORMULAS,
  VIAS,
  PERIODOS,
  parseBody,
  tomadaToText,
  getPrecoMedio,
  formatBRL,
  type Tomada,
  type FormulaSeed,
  type SelectedFormula,
} from "../../prescricao/data";
import { useQuery } from "@tanstack/react-query";
import { useListPharmacies, usePreviewPrescription, useEmitPrescription } from "@workspace/api-client-react";
import type { PrescriptionItemInput, RecipePlan, EmitResult } from "@workspace/api-client-react";
import { ANVISA_CONTROLLED_CLASSES, recipeTypeForControlledClass } from "@/lib/anvisa";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../../comunicacao/_shared";

// ===========================================================================
// PAINEL: PRESCRICAO DE FORMULAS (client-scoped) — extraido de prescricao/index.tsx.
// Reaproveita os MESMOS hooks/motores da tela original:
//   GET  /api/clients/:id                (prefil do paciente)
//   GET  /api/prescription-formulas      (catalogo do banco)
//   useListPharmacies                    (farmacias)
//   usePreviewPrescription               (previa do desmembramento)
//   useEmitPrescription                  (emissao -> PDFs + sncrAlerts)
// NAO altera o motor de desmembramento nem os contratos de API.
// ===========================================================================

const GOLD = "#c2a05a";

const INTERNAL_COLORS: { value: string; label: string; hex: string }[] = [
  { value: "", label: "— sem cor —", hex: "" },
  { value: "Azul", label: "Azul", hex: "#2563eb" },
  { value: "Verde", label: "Verde", hex: "#16a34a" },
  { value: "Amarelo", label: "Amarelo", hex: "#ca8a04" },
  { value: "Vermelho", label: "Vermelho", hex: "#dc2626" },
  { value: "Laranja", label: "Laranja", hex: "#ea580c" },
  { value: "Roxo", label: "Roxo", hex: "#7c3aed" },
];

type RouteState = { pharmacyId: number | null; isControlled: boolean; anvisaType: string; internalColor: string };
const EMPTY_ROUTE: RouteState = { pharmacyId: null, isControlled: false, anvisaType: "", internalColor: "" };

interface ClientData {
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
}

export default function PrescricaoFormulasPanel({ clientId }: { clientId: number }) {
  const { toast } = useToast();

  const [duracao, setDuracao] = useState("30");
  const [cid, setCid] = useState("");
  const [selected, setSelected] = useState<SelectedFormula[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");

  const [defaultPharmacyId, setDefaultPharmacyId] = useState<number | null>(null);
  const [routing, setRouting] = useState<Record<string, RouteState>>({});
  const [previewPlans, setPreviewPlans] = useState<RecipePlan[] | null>(null);
  const [emitResult, setEmitResult] = useState<EmitResult | null>(null);
  // ── Motor Único (emite PDF com o modelo ativo do banco) ───────────────────
  const [emitirMotorUnicoLoading, setEmitirMotorUnicoLoading] = useState(false);
  // ── PDF Visual (Puppeteer server-side — fiel ao template HTML) ────────────
  const [gerarPdfVisualLoading, setGerarPdfVisualLoading] = useState(false);

  const { data: pharmacies } = useListPharmacies();

  // Prefil do paciente pelo cliente do topo.
  const {
    data: client,
    isLoading: clientLoading,
    isError: clientError,
    refetch: refetchClient,
  } = useQuery<ClientData>({
    queryKey: ["cockpit-prescricao-client", clientId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/clients/${clientId}`);
      if (!r.ok) throw new Error("Falha ao carregar cliente");
      return r.json();
    },
  });

  const {
    data: dbFormulas,
    isLoading: formulasLoading,
    isError: formulasError,
    refetch: refetchFormulas,
  } = useQuery<FormulaSeed[]>({
    queryKey: ["prescription-formulas"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/prescription-formulas`);
      if (!r.ok) throw new Error("Falha ao carregar formulas do banco");
      return r.json();
    },
  });

  // Trocar de cliente limpa a receita e o resultado anterior.
  useEffect(() => {
    setSelected([]);
    setRouting({});
    setDefaultPharmacyId(null);
    setPreviewPlans(null);
    setEmitResult(null);
  }, [clientId]);

  const previewMutation = usePreviewPrescription({
    mutation: {
      onSuccess: (res) => setPreviewPlans(res),
      onError: () => toast({ title: "Erro ao gerar prévia do desmembramento", variant: "destructive" }),
    },
  });
  const emitMutation = useEmitPrescription({
    mutation: {
      onSuccess: (res) => {
        setEmitResult(res);
        toast({ title: `Receitas emitidas! (${res.recipes.length})`, description: "PDFs gerados e enviados à farmácia." });
      },
      onError: () => toast({ title: "Erro ao emitir receitas", variant: "destructive" }),
    },
  });

  const getRoute = (id: string): RouteState => routing[id] || EMPTY_ROUTE;
  const setRoute = (id: string, patch: Partial<RouteState>) => {
    setRouting((prev) => ({ ...prev, [id]: { ...(prev[id] || EMPTY_ROUTE), ...patch } }));
    setPreviewPlans(null);
    setEmitResult(null);
  };
  const changeDefaultPharmacy = (id: number | null) => {
    setDefaultPharmacyId(id);
    setPreviewPlans(null);
    setEmitResult(null);
  };

  const pharmaciesForType = (anvisaType: string) =>
    (pharmacies ?? []).filter((p) => !anvisaType || (p.controlledTypes ?? []).includes(anvisaType));

  const sncrFlags = useMemo(() => {
    const m = new Map<string, string>();
    (emitResult?.sncrAlerts ?? []).forEach((a) => m.set(a.controlledType, a.status));
    return m;
  }, [emitResult]);

  const allFormulas = useMemo(() => {
    const ids = new Set(FORMULAS.map((f) => f.id));
    const extras = (dbFormulas ?? []).filter((f) => !ids.has(f.id));
    return [...FORMULAS, ...extras];
  }, [dbFormulas]);

  const stats = useMemo(() => {
    const s: Record<string, number> = { all: allFormulas.length };
    allFormulas.forEach((f) => {
      s[f.cat] = (s[f.cat] || 0) + 1;
    });
    return s;
  }, [allFormulas]);

  const filtered = useMemo(
    () =>
      allFormulas.filter((f) => {
        const mc = activeCategory === "all" || f.cat === activeCategory;
        const ms =
          !search ||
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.body.toLowerCase().includes(search.toLowerCase());
        return mc && ms;
      }),
    [activeCategory, search, allFormulas],
  );

  const addFormula = (f: FormulaSeed) => {
    setSelected((prev) => {
      if (prev.find((s) => s.id === f.id)) return prev;
      const { ativos, tomadas } = parseBody(f.body);
      return [...prev, { id: f.id, cat: f.cat, name: f.name, ativos, tomadas, preco: getPrecoMedio(f) }];
    });
    setPreviewPlans(null);
    setEmitResult(null);
  };
  const removeFormula = (id: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== id));
    setPreviewPlans(null);
    setEmitResult(null);
  };
  const updateAtivos = (id: string, val: string) =>
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, ativos: val } : s)));
  const updateTomada = (id: string, ti: number, field: keyof Tomada, val: string) =>
    setSelected((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const tomadas = s.tomadas.map((t, i) =>
          i === ti ? { ...t, [field]: field === "doses" ? Number(val) : val, raw: undefined } : t,
        );
        return { ...s, tomadas };
      }),
    );
  const addTomada = (id: string) =>
    setSelected((prev) =>
      prev.map((s) => (s.id === id ? { ...s, tomadas: [...s.tomadas, { doses: 1, via: "VO", periodo: "", hora: "" }] } : s)),
    );
  const removeTomada = (id: string, ti: number) =>
    setSelected((prev) => prev.map((s) => (s.id === id ? { ...s, tomadas: s.tomadas.filter((_, i) => i !== ti) } : s)));

  const buildItems = (): PrescriptionItemInput[] =>
    selected.map((f) => {
      const r = getRoute(f.id);
      const vias = [...new Set(f.tomadas.map((t) => t.via).filter(Boolean))].join(", ");
      const periodos = f.tomadas.map((t) => t.periodo).filter(Boolean).join("; ");
      const doses = f.tomadas
        .map((t) => `${t.doses}${t.hora ? ` (${t.hora})` : ""}`)
        .filter(Boolean)
        .join("; ");
      return {
        name: f.name,
        ativos: f.ativos,
        posologia: f.tomadas.map(tomadaToText).join("; "),
        dose: doses || null,
        via: vias || null,
        periodo: periodos || null,
        category: f.cat,
        internalColor: r.internalColor || null,
        isControlled: r.isControlled,
        anvisaType: r.isControlled ? r.anvisaType || null : null,
        pharmacyId: r.pharmacyId ?? defaultPharmacyId ?? null,
      };
    });

  const validateRouting = (requirePharmacy: boolean): string | null => {
    for (const f of selected) {
      const r = getRoute(f.id);
      if (r.isControlled && !r.anvisaType) return `Selecione o tipo Anvisa do controlado em "${f.name}".`;
      const pid = r.pharmacyId ?? defaultPharmacyId ?? null;
      if (requirePharmacy && !pid)
        return "Selecione a farmácia de cada fórmula (ou defina a farmácia padrão).";
      if (r.isControlled && r.anvisaType && pid) {
        const ph = (pharmacies ?? []).find((p) => p.id === pid);
        if (ph && !(ph.controlledTypes ?? []).includes(r.anvisaType))
          return `A farmácia "${ph.name}" não atende o controlado ${r.anvisaType} (fórmula "${f.name}").`;
      }
    }
    return null;
  };

  const handleEmitirMotorUnico = async () => {
    setEmitirMotorUnicoLoading(true);
    try {
      const r = await fetch(`${BASE}/api/receituario/emitir-prescricao`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("collab_token") ?? ""}` },
        body: JSON.stringify({
          clientId,
          formulas: selected.map(f => ({
            nome: f.formula,
            posologia: f.posologia || undefined,
            via: "oral",
          })),
          tipoReceita: "especial",
        }),
      });
      const d = await r.json() as { ok?: boolean; driveUrl?: string };
      if (d.ok) {
        alert(`Receituário emitido com sucesso!${d.driveUrl ? " Salvo no Drive." : ""}`);
      } else {
        alert("Erro ao emitir receituário. Verifique os logs.");
      }
    } catch (e) {
      alert(`Erro de conexão: ${String(e)}`);
    } finally {
      setEmitirMotorUnicoLoading(false);
    }
  };

  const handleGerarPdfVisual = async () => {
    setGerarPdfVisualLoading(true);
    try {
      const r = await fetch(`${BASE}/api/receituario/emitir-cliente`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("collab_token") ?? ""}` },
        body: JSON.stringify({
          clientId,
          formulas: selected.map(f => ({
            nome: f.formula,
            posologia: f.posologia || undefined,
            via: "oral",
          })),
          tipoReceita: "especial",
        }),
      });
      const d = await r.json() as { ok?: boolean; driveUrl?: string };
      if (d.ok) {
        alert(`PDF Visual gerado!${d.driveUrl ? " Salvo no Drive." : ""}`);
      } else {
        alert("Erro ao gerar PDF Visual. Verifique os logs.");
      }
    } catch (e) {
      alert(`Erro de conexão: ${String(e)}`);
    } finally {
      setGerarPdfVisualLoading(false);
    }
  };

  const handlePreview = () => {
    setEmitResult(null);
    const err = validateRouting(false);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    previewMutation.mutate({ data: { items: buildItems() } });
  };

  const handleEmit = () => {
    if (!client?.name?.trim()) {
      toast({ title: "Cliente sem nome — não é possível emitir", variant: "destructive" });
      return;
    }
    const err = validateRouting(true);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    emitMutation.mutate({
      data: {
        clientName: client.name.trim(),
        clientCpf: client.cpf || null,
        clientPhone: client.phone || null,
        clientEmail: client.email || null,
        professionalName: "Dr. Caio Henrique Pádua",
        professionalCrm: "125475",
        professionalUf: "SP",
        durationDays: duracao || null,
        cid: cid || null,
        items: buildItems(),
      },
    });
  };

  const idade = client?.birthDate
    ? Math.floor((Date.now() - new Date(client.birthDate).getTime()) / 31557600000)
    : 0;
  const totalInterno = useMemo(() => selected.reduce((sum, s) => sum + (s.preco || 0), 0), [selected]);

  const inputCls =
    "concave-3d rounded-md bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-[#c2a05a]/40";

  // ---- Estados de carregamento / erro do cliente + catálogo ----
  if (clientLoading || formulasLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando prescrição…
      </div>
    );
  }
  if (clientError) {
    return (
      <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-red-400">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar o cliente.
        </span>
        <button
          type="button"
          onClick={() => void refetchClient()}
          className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase"
        >
          Tentar novamente
        </button>
      </div>
    );
  }
  if (formulasError) {
    return (
      <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-red-400">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar o catálogo de fórmulas.
        </span>
        <button
          type="button"
          onClick={() => void refetchFormulas()}
          className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho do paciente (prefil) + duração/CID */}
      <div className="screen-3d rounded-md p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Paciente</p>
        <div className="mt-1 text-lg font-semibold text-slate-100">{client?.name}</div>
        <div className="text-xs text-slate-400">
          {[client?.cpf ? `CPF ${client.cpf}` : null, idade ? `${idade} anos` : null, client?.phone, client?.email]
            .filter(Boolean)
            .join(" · ") || "sem dados de contato"}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="concave-3d flex items-center gap-2 rounded-md px-3 py-1.5">
            <label className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Duração:
            </label>
            <input
              type="number"
              className={`w-20 ${inputCls}`}
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
            />
            <span className="text-xs text-slate-400">dias</span>
          </div>
          <input
            className={`min-w-[220px] flex-1 ${inputCls}`}
            placeholder="CID (ex: N484 + E291 + F90)"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        {/* Catálogo */}
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
            <FileText className="h-4 w-4" /> Catálogo ({filtered.length})
          </h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className={`w-full pl-9 ${inputCls}`}
              placeholder="Buscar fórmula…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveCategory("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${activeCategory === "all" ? "btn-3d-soft" : "text-slate-400 hover:text-slate-200"}`}
            >
              Todas <span className="opacity-70">{stats.all}</span>
            </button>
            {CATEGORIES.map((c) => {
              const n = stats[c.id] || 0;
              if (!n) return null;
              const active = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${active ? "btn-3d-soft" : "text-slate-400 hover:text-slate-200"}`}
                >
                  <span className="max-w-[140px] truncate">{c.label}</span> <span className="opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((f) => {
              const cat = CATEGORIES.find((c) => c.id === f.cat);
              const isSel = !!selected.find((s) => s.id === f.id);
              return (
                <div key={f.id} className="panel-3d-sub rounded-md p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {cat && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: GOLD }}>
                          {cat.label}
                        </span>
                      )}
                      <h4 className="text-sm font-semibold text-slate-100">{f.name}</h4>
                      <p className="mt-0.5 line-clamp-2 font-mono text-[11px] text-slate-400">
                        {f.body.split("\n").slice(0, 2).join(" • ")}
                      </p>
                    </div>
                    <button
                      onClick={() => (isSel ? removeFormula(f.id) : addFormula(f))}
                      className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold ${isSel ? "btn-3d-soft" : "btn-3d-soft"}`}
                      style={isSel ? { color: "#34d399" } : { color: GOLD }}
                    >
                      {isSel ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Incluída
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">Nenhuma fórmula encontrada.</p>
            )}
          </div>
        </div>

        {/* Receita selecionada + roteamento + emissão */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
              <FileSignature className="h-4 w-4" /> Receita ({selected.length})
            </h3>
            {selected.length > 0 && (
              <button
                onClick={() => {
                  setSelected([]);
                  setPreviewPlans(null);
                  setEmitResult(null);
                }}
                className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:opacity-80"
              >
                <Trash2 className="h-3.5 w-3.5" /> Limpar
              </button>
            )}
          </div>

          {selected.length === 0 ? (
            <div className="concave-3d flex items-center justify-center rounded-md py-10 text-center text-sm text-slate-500">
              Adicione fórmulas do catálogo ao lado.
            </div>
          ) : (
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {selected.map((f, idx) => (
                <div key={f.id} className="panel-3d-sub overflow-hidden rounded-md">
                  <div className="concave-3d flex items-center justify-between gap-2 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">#{idx + 1}</span>
                      <span className="truncate text-sm font-semibold text-slate-100">{f.name}</span>
                    </div>
                    <button onClick={() => removeFormula(f.id)} className="text-red-400 hover:opacity-80">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3 p-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Ativos (edite mg / adicione / retire)
                      </label>
                      <textarea
                        value={f.ativos}
                        onChange={(e) => updateAtivos(f.id, e.target.value)}
                        className={`mt-1 w-full resize-y font-mono text-xs ${inputCls}`}
                        rows={Math.min(f.ativos.split("\n").length + 1, 12)}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          Tomadas
                        </label>
                        <button
                          onClick={() => addTomada(f.id)}
                          className="flex items-center gap-1 text-xs font-semibold"
                          style={{ color: GOLD }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Tomada
                        </button>
                      </div>
                      <div className="space-y-2">
                        {f.tomadas.map((t, ti) => (
                          <div key={ti} className="concave-3d grid grid-cols-12 items-center gap-1.5 rounded-md p-2">
                            <select
                              value={t.doses}
                              onChange={(e) => updateTomada(f.id, ti, "doses", e.target.value)}
                              className={`col-span-2 text-center font-mono !px-1 !py-2 ${inputCls}`}
                            >
                              {[1, 2, 3, 4, 5, 6].map((n) => (
                                <option key={n} value={n} className="bg-[#16284a]">
                                  {n}
                                </option>
                              ))}
                            </select>
                            <select
                              value={t.via || "VO"}
                              onChange={(e) => updateTomada(f.id, ti, "via", e.target.value)}
                              className={`col-span-2 !px-1 !py-2 ${inputCls}`}
                            >
                              {VIAS.map((v) => (
                                <option key={v} value={v} className="bg-[#16284a]">
                                  {v}
                                </option>
                              ))}
                            </select>
                            <input
                              list="cockpit-periodos-list"
                              value={t.periodo}
                              onChange={(e) => updateTomada(f.id, ti, "periodo", e.target.value)}
                              placeholder="Período…"
                              className={`col-span-5 !px-2 !py-2 ${inputCls}`}
                            />
                            <input
                              value={t.hora}
                              onChange={(e) => updateTomada(f.id, ti, "hora", e.target.value)}
                              placeholder="14h"
                              className={`col-span-2 text-center font-mono !px-1 !py-2 ${inputCls}`}
                            />
                            <button
                              onClick={() => removeTomada(f.id, ti)}
                              className="col-span-1 flex justify-center text-red-400 hover:opacity-80"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <datalist id="cockpit-periodos-list">
            {PERIODOS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>

          {selected.length > 0 && (
            <div className="concave-3d flex items-center justify-between gap-2 rounded-md px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Total estimado — uso interno
              </span>
              <span className="font-mono text-base font-bold" style={{ color: GOLD }}>
                {formatBRL(totalInterno)}
              </span>
            </div>
          )}

          {/* Roteamento para farmácias + emissão */}
          {selected.length > 0 && (
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest" style={{ color: GOLD }}>
                <Building2 className="h-4 w-4" /> Roteamento e Emissão
              </h3>

              {!pharmacies?.length ? (
                <div className="bevel-3d flex items-center gap-2 rounded-md px-3 py-2 text-xs text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Nenhuma farmácia cadastrada. Cadastre em Farmácias antes de emitir.
                </div>
              ) : (
                <>
                  <div className="concave-3d flex flex-wrap items-center gap-2 rounded-md px-3 py-2">
                    <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      <Building2 className="h-3.5 w-3.5" />
                      Farmácia padrão:
                    </label>
                    <select
                      className="concave-3d rounded-md bg-transparent px-3 py-1.5 text-sm text-slate-100"
                      value={defaultPharmacyId ?? ""}
                      onChange={(e) => changeDefaultPharmacy(e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="" className="bg-[#16284a]">
                        — selecione —
                      </option>
                      {pharmacies.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#16284a]">
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    {selected.map((f, idx) => {
                      const r = getRoute(f.id);
                      const recipe = r.isControlled ? recipeTypeForControlledClass(r.anvisaType) : null;
                      const sncrFlag = r.isControlled && r.anvisaType ? sncrFlags.get(r.anvisaType) : undefined;
                      return (
                        <div key={f.id} className="panel-3d-sub rounded-md p-3">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-400">#{idx + 1}</span>
                            <span className="truncate text-sm font-semibold text-slate-100">{f.name}</span>
                            {sncrFlag && (
                              <span className="ml-auto flex shrink-0 items-center gap-1 rounded-sm border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                <AlertTriangle className="h-3 w-3" />
                                {sncrFlag === "low" ? "SNCR ACABANDO" : sncrFlag === "exhausted" ? "SNCR ESGOTADO" : "SEM INTERVALO SNCR"}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-12">
                            <div className="md:col-span-5">
                              <select
                                className="concave-3d w-full rounded-md bg-transparent px-2 py-2 text-xs text-slate-100"
                                value={r.pharmacyId ?? ""}
                                onChange={(e) => setRoute(f.id, { pharmacyId: e.target.value ? Number(e.target.value) : null })}
                              >
                                <option value="" className="bg-[#16284a]">
                                  Usar farmácia padrão
                                </option>
                                {(r.isControlled && r.anvisaType ? pharmaciesForType(r.anvisaType) : pharmacies).map((p) => (
                                  <option key={p.id} value={p.id} className="bg-[#16284a]">
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-200 md:col-span-3">
                              <input
                                type="checkbox"
                                checked={r.isControlled}
                                onChange={(e) => setRoute(f.id, { isControlled: e.target.checked })}
                                className="h-4 w-4 accent-amber-500"
                              />
                              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                              Controlado
                            </label>
                            {r.isControlled && (
                              <div className="flex items-center gap-2 md:col-span-4">
                                <select
                                  className="w-full rounded-md border border-amber-400/40 bg-transparent px-2 py-2 text-xs text-slate-100"
                                  value={r.anvisaType}
                                  onChange={(e) => setRoute(f.id, { anvisaType: e.target.value })}
                                >
                                  <option value="" className="bg-[#16284a]">
                                    Tipo Anvisa…
                                  </option>
                                  {ANVISA_CONTROLLED_CLASSES.map((c) => (
                                    <option key={c.value} value={c.value} className="bg-[#16284a]">
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                                {recipe && (
                                  <span
                                    className="shrink-0 rounded-sm border px-1.5 py-1 text-[10px] font-bold"
                                    style={{ background: recipe.color, color: "#0f172a", borderColor: "#cbd5e1" }}
                                  >
                                    {recipe.colorName}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-white/10 pt-2">
                            <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              <Layers className="h-3 w-3" />
                              Cor interna
                            </label>
                            <select
                              className="concave-3d rounded-md bg-transparent px-2 py-1.5 text-xs text-slate-100"
                              value={r.internalColor}
                              onChange={(e) => setRoute(f.id, { internalColor: e.target.value })}
                            >
                              {INTERNAL_COLORS.map((c) => (
                                <option key={c.value} value={c.value} className="bg-[#16284a]">
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            {r.internalColor && (
                              <span
                                className="h-3.5 w-3.5 shrink-0 rounded-[2px] border border-white/20"
                                style={{ background: INTERNAL_COLORS.find((c) => c.value === r.internalColor)?.hex }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handlePreview}
                      disabled={previewMutation.isPending}
                      className="btn-3d-soft flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                      style={{ color: GOLD }}
                    >
                      {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      {previewMutation.isPending ? "Gerando…" : "Prévia do desmembramento"}
                    </button>
                    <button
                      onClick={handleEmit}
                      disabled={emitMutation.isPending}
                      className="btn-3d-soft flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                      style={{ color: GOLD }}
                    >
                      {emitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {emitMutation.isPending ? "Emitindo…" : "Emitir receitas"}
                    </button>
                    {/* ── Motor Único (lê modelo ativo do banco) ── */}
                    <button
                      onClick={() => { void handleEmitirMotorUnico(); }}
                      disabled={emitirMotorUnicoLoading}
                      className="btn-3d flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                    >
                      {emitirMotorUnicoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Emitir Receituário
                    </button>
                    {/* ── PDF Visual (Puppeteer server-side) ── */}
                    <button
                      onClick={() => { void handleGerarPdfVisual(); }}
                      disabled={gerarPdfVisualLoading}
                      className="btn-3d-soft flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                    >
                      {gerarPdfVisualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Gerar PDF Visual
                    </button>
                  </div>

                  {/* Prévia */}
                  {previewPlans && !emitResult && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                        Prévia — {previewPlans.length} receita(s) será(ão) gerada(s)
                      </h4>
                      {previewPlans.map((plan, i) => (
                        <div key={i} className="panel-3d-sub flex items-start gap-3 rounded-md p-3">
                          {plan.anvisaColor ? (
                            <span
                              className="mt-0.5 h-3 w-3 shrink-0 rounded-[2px] border border-white/20"
                              style={{ background: plan.anvisaColor }}
                            />
                          ) : (
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100">{plan.title}</p>
                            <p className="text-xs text-slate-400">
                              {plan.items.length} fórmula(s)
                              {plan.anvisaColorName ? ` · Receituário ${plan.anvisaColorName}` : ""}
                              {plan.needsSncr ? " · exige nº SNCR" : ""}
                              {plan.pharmacyId ? ` · ${pharmacies.find((p) => p.id === plan.pharmacyId)?.name ?? "Farmácia"}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Resultado da emissão */}
                  {emitResult && (
                    <div className="space-y-3">
                      {emitResult.sncrAlerts.length > 0 && (
                        <div className="space-y-1">
                          {emitResult.sncrAlerts.map((a, i) => (
                            <div
                              key={i}
                              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${a.status === "exhausted" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-amber-400/40 bg-amber-500/10 text-amber-300"}`}
                            >
                              <AlertTriangle className="h-4 w-4 shrink-0" />
                              {a.message}
                            </div>
                          ))}
                        </div>
                      )}

                      <h4 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                        <FileSignature className="h-3.5 w-3.5" />
                        Receitas emitidas ({emitResult.recipes.length})
                      </h4>
                      {emitResult.recipes.map((rec) => (
                        <div key={rec.id} className="panel-3d-sub flex flex-wrap items-center justify-between gap-2 rounded-md p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-100">{rec.title}</p>
                            <p className="text-xs text-slate-400">
                              {rec.anvisaColorName ? `Receituário ${rec.anvisaColorName}` : "Manipulação"}
                              {rec.sncrNumber ? ` · SNCR nº ${rec.sncrNumber}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <a
                              href={`${BASE}${rec.pdfUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs font-semibold hover:underline"
                              style={{ color: GOLD }}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Abrir PDF
                            </a>
                            {rec.driveWebViewLink && (
                              <a
                                href={rec.driveWebViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs font-semibold hover:underline"
                                style={{ color: GOLD }}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Drive
                              </a>
                            )}
                          </div>
                        </div>
                      ))}

                      {emitResult.pharmacyDispatches.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                            <MessageSquare className="h-3.5 w-3.5" />
                            WhatsApp às farmácias
                          </h4>
                          {emitResult.pharmacyDispatches.map((d) => (
                            <div key={d.pharmacyId} className="panel-3d-sub flex flex-wrap items-center justify-between gap-2 rounded-md p-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-100">{d.pharmacyName}</p>
                                <p className="text-xs text-slate-400">
                                  {d.recipeCount} receita(s) · {d.sent ? "enviado automaticamente" : "envio manual"}
                                </p>
                              </div>
                              {d.whatsappLink && (
                                <a
                                  href={d.whatsappLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                  Abrir WhatsApp
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
