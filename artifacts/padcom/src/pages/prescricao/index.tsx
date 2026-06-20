import { useMemo, useState, type ElementType } from "react";
import {
  Search, Plus, X, Trash2, Copy, Printer, FileText, User, Stethoscope,
  CheckCircle2, ArrowUp, ArrowDown, Layers, Clock, FolderPlus,
  Building2, ShieldAlert, Send, ExternalLink, MessageSquare, AlertTriangle, Eye, FileSignature,
} from "lucide-react";
import {
  HEADER_BOILERPLATE, SEPARATOR, PERIODOS, VIAS, CATEGORIES, FORMULAS, PROTOCOLOS_SEED,
  parseBody, parseAtivosLines, tomadaToText, buildFormulaText, getPrecoMedio, formatBRL,
  type Tomada, type FormulaSeed, type Protocolo, type SelectedFormula,
} from "./data";
import { useQuery } from "@tanstack/react-query";
import { useListPharmacies, usePreviewPrescription, useEmitPrescription } from "@workspace/api-client-react";
import type { PrescriptionItemInput, RecipePlan, EmitResult } from "@workspace/api-client-react";
import { ANVISA_CONTROLLED_CLASSES, recipeTypeForControlledClass } from "@/lib/anvisa";
import { useToast } from "@/hooks/use-toast";

const PETROLEO = "#16294a";
const CIANO = "#b8924d";

// Cor interna = organização clínica do desmembramento. A manipulação é separada
// em uma receita por cor interna (campo enviado ao motor de desmembramento).
const INTERNAL_COLORS: { value: string; label: string; hex: string }[] = [
  { value: "", label: "— sem cor —", hex: "" },
  { value: "Azul", label: "Azul", hex: "#2563eb" },
  { value: "Verde", label: "Verde", hex: "#16a34a" },
  { value: "Amarelo", label: "Amarelo", hex: "#ca8a04" },
  { value: "Vermelho", label: "Vermelho", hex: "#dc2626" },
  { value: "Laranja", label: "Laranja", hex: "#ea580c" },
  { value: "Roxo", label: "Roxo", hex: "#7c3aed" },
];

interface PatientData {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  dataNascimento: string;
}

export default function PrescricaoPage() {
  const [patient, setPatient] = useState<PatientData>({ nome: "", cpf: "", telefone: "", email: "", dataNascimento: "" });
  const [duracao, setDuracao] = useState("30");
  const [cid, setCid] = useState("");
  const [selected, setSelected] = useState<SelectedFormula[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [leftTab, setLeftTab] = useState<"cat" | "proto">("cat");
  const [customProtocolos, setCustomProtocolos] = useState<Protocolo[]>([]);
  const [copied, setCopied] = useState(false);

  // Roteamento p/ farmácias + emissão
  const { toast } = useToast();
  const { data: pharmacies } = useListPharmacies();
  const [defaultPharmacyId, setDefaultPharmacyId] = useState<number | null>(null);
  const [routing, setRouting] = useState<Record<string, { pharmacyId: number | null; isControlled: boolean; anvisaType: string; internalColor: string }>>({});
  const [previewPlans, setPreviewPlans] = useState<RecipePlan[] | null>(null);
  const [emitResult, setEmitResult] = useState<EmitResult | null>(null);

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

  const getRoute = (id: string) => routing[id] || { pharmacyId: null, isControlled: false, anvisaType: "", internalColor: "" };
  const setRoute = (id: string, patch: Partial<{ pharmacyId: number | null; isControlled: boolean; anvisaType: string; internalColor: string }>) => {
    setRouting((prev) => ({ ...prev, [id]: { ...(prev[id] || { pharmacyId: null, isControlled: false, anvisaType: "", internalColor: "" }), ...patch } }));
    // Roteamento mudou: prévia/emissão anteriores ficam obsoletas.
    setPreviewPlans(null);
    setEmitResult(null);
  };
  const changeDefaultPharmacy = (id: number | null) => {
    setDefaultPharmacyId(id);
    setPreviewPlans(null);
    setEmitResult(null);
  };

  // Farmácias compatíveis com um tipo controlado (atendem aquele tipo Anvisa).
  const pharmaciesForType = (anvisaType: string) =>
    (pharmacies ?? []).filter((p) => !anvisaType || (p.controlledTypes ?? []).includes(anvisaType));

  // Após emitir: mapa tipo Anvisa -> status SNCR (low/exhausted/no_range) para
  // emoldurar visualmente a matéria-prima controlada cuja numeração apertou.
  const sncrFlags = useMemo(() => {
    const m = new Map<string, string>();
    (emitResult?.sncrAlerts ?? []).forEach((a) => m.set(a.controlledType, a.status));
    return m;
  }, [emitResult]);

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

  // Valida regras de roteamento. Retorna mensagem de erro ou null se OK.
  const validateRouting = (requirePharmacy: boolean): string | null => {
    for (const f of selected) {
      const r = getRoute(f.id);
      if (r.isControlled && !r.anvisaType) {
        return `Selecione o tipo Anvisa do controlado em "${f.name}".`;
      }
      const pid = r.pharmacyId ?? defaultPharmacyId ?? null;
      if (requirePharmacy && !pid) {
        return "Selecione a farmácia de cada fórmula (ou defina a farmácia padrão).";
      }
      if (r.isControlled && r.anvisaType && pid) {
        const ph = (pharmacies ?? []).find((p) => p.id === pid);
        if (ph && !(ph.controlledTypes ?? []).includes(r.anvisaType)) {
          return `A farmácia "${ph.name}" não atende o controlado ${r.anvisaType} (fórmula "${f.name}").`;
        }
      }
    }
    return null;
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
    if (!patient.nome.trim()) {
      toast({ title: "Informe o nome do cliente para emitir", variant: "destructive" });
      return;
    }
    const err = validateRouting(true);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    emitMutation.mutate({
      data: {
        clientName: patient.nome.trim(),
        clientCpf: patient.cpf || null,
        clientPhone: patient.telefone || null,
        clientEmail: patient.email || null,
        professionalName: "Dr. Caio Henrique Pádua",
        professionalCrm: "125475",
        professionalUf: "SP",
        durationDays: duracao || null,
        cid: cid || null,
        items: buildItems(),
      },
    });
  };

  const allProtocolos = [...PROTOCOLOS_SEED, ...customProtocolos];

  // Formulas vindas do banco (catalogo transmutado do IHE), juntadas com as
  // formulas curadas estaticas. Dedup por id: nenhuma formula existente e perdida.
  const { data: dbFormulas } = useQuery<FormulaSeed[]>({
    queryKey: ["prescription-formulas"],
    queryFn: async () => {
      const r = await fetch("/api/prescription-formulas");
      if (!r.ok) throw new Error("Falha ao carregar formulas do banco");
      return r.json();
    },
  });

  const allFormulas = useMemo(() => {
    const ids = new Set(FORMULAS.map((f) => f.id));
    const extras = (dbFormulas ?? []).filter((f) => !ids.has(f.id));
    return [...FORMULAS, ...extras];
  }, [dbFormulas]);

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
  };

  const addProtocolo = (p: Protocolo) =>
    p.formulaIds.forEach((id) => {
      const f = allFormulas.find((x) => x.id === id);
      if (f) addFormula(f);
    });

  const removeFormula = (id: string) => setSelected((prev) => prev.filter((s) => s.id !== id));

  const moveFormula = (idx: number, dir: number) =>
    setSelected((prev) => {
      const a = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= a.length) return prev;
      [a[idx], a[t]] = [a[t], a[idx]];
      return a;
    });

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

  const saveAsProtocolo = () => {
    if (selected.length === 0) return;
    const nome = window.prompt("Nome do protocolo:");
    if (!nome) return;
    setCustomProtocolos((prev) => [...prev, { id: "c-" + Date.now(), nome, formulaIds: selected.map((s) => s.id) }]);
  };

  const handleClear = () => {
    if (window.confirm("Limpar receita inteira?")) setSelected([]);
  };

  const idade = patient.dataNascimento
    ? Math.floor((Date.now() - new Date(patient.dataNascimento).getTime()) / 31557600000)
    : 0;
  const today = new Date().toLocaleDateString("pt-BR");

  const totalInterno = useMemo(() => selected.reduce((sum, s) => sum + (s.preco || 0), 0), [selected]);

  const buildFullText = () => {
    let txt = "";
    if (patient.nome) {
      txt += `CLIENTE: ${patient.nome}\n`;
      if (patient.cpf) txt += `CPF: ${patient.cpf}\n`;
      if (patient.telefone) txt += `Contato: ${patient.telefone}\n`;
      if (patient.email) txt += `E-mail: ${patient.email}\n`;
      if (idade) txt += `Idade: ${idade} anos\n`;
      txt += `Data: ${today}\n\n`;
    }
    txt += HEADER_BOILERPLATE + "\n\n";
    txt += `Duração do Tratamento: ${duracao} dias\n`;
    if (cid) txt += `CID: ${cid}\n`;
    selected.forEach((f) => {
      txt += SEPARATOR + buildFormulaText(f);
    });
    return txt;
  };

  const handleCopy = async () => {
    const text = buildFullText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        window.alert("Não foi possível copiar automaticamente. Use Imprimir / PDF.");
      }
    }
  };
  const handlePrint = () => window.print();

  const stats = useMemo(() => {
    const s: Record<string, number> = { all: allFormulas.length };
    allFormulas.forEach((f) => {
      s[f.cat] = (s[f.cat] || 0) + 1;
    });
    return s;
  }, [allFormulas]);

  const inputCls =
    "field-engraved border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      <style>{`
        @media print { .no-print{display:none!important;} .print-only{display:block!important;} body{background:white!important;} }
        .print-only{display:none;}
        .rx-scroll::-webkit-scrollbar{width:8px;}
        .rx-scroll::-webkit-scrollbar-thumb{background:#9bbcbc;border-radius:4px;}
        .ativo-grid{display:grid;grid-template-columns:max-content 1fr;column-gap:1.25rem;row-gap:0.15rem;}
      `}</style>

      {/* PAGE HEADER */}
      <div className="no-print screen-3d flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="bevel-3d inline-flex w-11 h-11 items-center justify-center text-primary">
            <Stethoscope className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Prescrição de Fórmulas</h1>
            <p className="text-[11px] tracking-[0.22em] uppercase text-primary font-semibold">
              Montador de Receitas Manipuladas
            </p>
          </div>
        </div>
        <span className="text-sm text-muted-foreground hidden md:block">Dr. Caio Henrique Pádua</span>
      </div>

      {/* BLOCO — DADOS DO CLIENTE */}
      <section className="no-print panel-3d p-5">
        <BlockTitle icon={User} color="text-primary">Dados do Cliente</BlockTitle>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mt-4">
          <input className={`md:col-span-2 ${inputCls}`} placeholder="Nome completo" value={patient.nome} onChange={(e) => setPatient({ ...patient, nome: e.target.value })} />
          <input className={inputCls} placeholder="CPF" value={patient.cpf} onChange={(e) => setPatient({ ...patient, cpf: e.target.value })} />
          <input className={inputCls} placeholder="Telefone" value={patient.telefone} onChange={(e) => setPatient({ ...patient, telefone: e.target.value })} />
          <input className={inputCls} placeholder="E-mail" value={patient.email} onChange={(e) => setPatient({ ...patient, email: e.target.value })} />
          <input type="date" className={inputCls} value={patient.dataNascimento} onChange={(e) => setPatient({ ...patient, dataNascimento: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          <div className="concave-3d flex items-center gap-2 px-3 py-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Duração:</label>
            <input type="number" className={`w-20 ${inputCls}`} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
            <span className="text-xs text-muted-foreground">dias</span>
          </div>
          <input className={`md:col-span-3 ${inputCls}`} placeholder="CID (ex: N484 + E291 + F90)" value={cid} onChange={(e) => setCid(e.target.value)} />
        </div>
      </section>

      {/* BLOCO — CATÁLOGO E PROTOCOLOS */}
      <section className="no-print panel-3d p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <BlockTitle icon={FileText} color="text-primary">Catálogo e Protocolos</BlockTitle>
          <span className="font-mono text-xs text-muted-foreground shrink-0">
            {leftTab === "cat" ? `${filtered.length} disponíveis` : `${allProtocolos.length} protocolos`}
          </span>
        </div>

        <div className="concave-3d grid grid-cols-2 gap-1 p-1 mb-4 max-w-md">
          <button onClick={() => setLeftTab("cat")} className={`py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition ${leftTab === "cat" ? "btn-3d-soft" : "text-muted-foreground"}`}>
            <FileText className="w-4 h-4" />Categorias
          </button>
          <button onClick={() => setLeftTab("proto")} className={`py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition ${leftTab === "proto" ? "btn-3d-soft" : "text-muted-foreground"}`}>
            <Layers className="w-4 h-4" />Protocolos
          </button>
        </div>

        {leftTab === "cat" ? (
          <>
            <div className="relative mb-3 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
              <input className={`w-full pl-9 ${inputCls}`} placeholder="Buscar fórmula..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setActiveCategory("all")} className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${activeCategory === "all" ? "btn-3d" : "btn-3d-soft"}`}>
                <FileText className="w-3.5 h-3.5" />Todas
                <span className="font-mono opacity-70">{stats.all}</span>
              </button>
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const n = stats[c.id] || 0;
                if (!n) return null;
                const active = activeCategory === c.id;
                return (
                  <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${active ? "btn-3d" : "btn-3d-soft"}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate max-w-[150px]">{c.label}</span>
                    <span className="font-mono opacity-70">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[560px] overflow-y-auto rx-scroll pr-1">
              {filtered.map((f) => {
                const cat = CATEGORIES.find((c) => c.id === f.cat);
                const isSel = !!selected.find((s) => s.id === f.id);
                return (
                  <div key={f.id} className={`panel-3d-sub p-3 flex flex-col ${isSel ? "panel-3d-active" : ""}`}>
                    <div className="flex-1 min-w-0">
                      {cat && <span className="text-[10px] px-2 py-0.5 rounded-sm bg-primary/10 text-primary font-semibold uppercase tracking-wide">{cat.label}</span>}
                      <h3 className="font-semibold text-foreground text-sm mt-1">{f.name}</h3>
                      <p className="font-mono text-[11px] text-muted-foreground mt-1 line-clamp-2">{f.body.split("\n").slice(0, 2).join(" • ")}</p>
                      <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm" title="Valor médio de mercado — uso interno, não aparece para o cliente">≈ {formatBRL(getPrecoMedio(f))} <span className="font-sans tracking-wide">INTERNO</span></span>
                    </div>
                    <button onClick={() => (isSel ? removeFormula(f.id) : addFormula(f))} className={`mt-2.5 w-full px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-center gap-1 ${isSel ? "btn-3d-soft" : "btn-3d"}`}>
                      {isSel ? (<><CheckCircle2 className="w-4 h-4" />Incluída</>) : (<><Plus className="w-4 h-4" />Adicionar</>)}
                    </button>
                  </div>
                );
              })}
              {filtered.length === 0 && <div className="col-span-full text-center py-12 text-muted-foreground text-sm">Nenhuma fórmula encontrada</div>}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <p className="col-span-full text-xs text-muted-foreground px-1">Clique para adicionar o conjunto inteiro à receita.</p>
            {allProtocolos.map((p) => (
              <div key={p.id} className="panel-3d-sub p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5"><Layers className="w-4 h-4 text-primary" />{p.nome}</h3>
                  <button onClick={() => addProtocolo(p)} className="btn-3d shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Adicionar</button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">{p.formulaIds.map((id) => allFormulas.find((f) => f.id === id)?.name).filter(Boolean).join(" • ")}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* BLOCO 1 — RECEITA SELECIONADA / EDIÇÃO */}
      <section className="no-print panel-3d p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <BlockTitle icon={FileSignature} color="text-primary">Receita Selecionada ({selected.length})</BlockTitle>
          <div className="flex gap-3">
            {selected.length > 0 && <button onClick={saveAsProtocolo} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-semibold"><FolderPlus className="w-4 h-4" />Salvar protocolo</button>}
            {selected.length > 0 && <button onClick={handleClear} className="text-xs text-destructive hover:opacity-80 flex items-center gap-1 font-semibold"><Trash2 className="w-3.5 h-3.5" />Limpar</button>}
          </div>
        </div>

        {selected.length === 0 ? (
          <div className="concave-3d flex items-center justify-center text-center text-muted-foreground py-14">
            <div>
              <FileText className="w-12 h-12 mx-auto mb-2 text-border" />
              <p className="text-sm">Receita vazia</p>
              <p className="text-xs mt-1">Adicione fórmulas avulsas ou um protocolo</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-[640px] overflow-y-auto rx-scroll pr-1">
            {selected.map((f, idx) => {
              const cat = CATEGORIES.find((c) => c.id === f.cat);
              return (
                <div key={f.id} className="panel-3d-sub overflow-hidden">
                  <div className="px-3 py-2 concave-3d flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-mono text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                      {cat && <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-semibold uppercase">{cat.label.split(" ")[0]}</span>}
                      <span className="text-sm font-semibold text-foreground truncate">{f.name}</span>
                      <span className="ml-auto mr-1 shrink-0 text-[10px] font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-sm" title="Valor médio — uso interno">{formatBRL(f.preco)}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => moveFormula(idx, -1)} disabled={idx === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => moveFormula(idx, 1)} disabled={idx === selected.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                      <button onClick={() => removeFormula(f.id)} className="p-1 text-destructive hover:opacity-80"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Ativos (edite mg / adicione / retire)</label>
                      <textarea value={f.ativos} onChange={(e) => updateAtivos(f.id, e.target.value)} className={`font-mono w-full mt-1 resize-y text-xs ${inputCls}`} rows={Math.min(f.ativos.split("\n").length + 1, 14)} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Tomadas</label>
                        <button onClick={() => addTomada(f.id)} className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Tomada</button>
                      </div>
                      <div className="space-y-2">
                        {f.tomadas.map((t, ti) => (
                          <div key={ti} className="grid grid-cols-12 gap-1.5 items-center concave-3d p-2">
                            <select value={t.doses} onChange={(e) => updateTomada(f.id, ti, "doses", e.target.value)} className={`font-mono col-span-2 text-center !px-1 !py-2 ${inputCls}`}>
                              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <select value={t.via || "VO"} onChange={(e) => updateTomada(f.id, ti, "via", e.target.value)} className={`col-span-2 !px-1 !py-2 ${inputCls}`}>
                              {VIAS.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                            <input list="periodos-list" value={t.periodo} onChange={(e) => updateTomada(f.id, ti, "periodo", e.target.value)} placeholder="Período…" className={`col-span-5 !px-2 !py-2 ${inputCls}`} />
                            <input value={t.hora} onChange={(e) => updateTomada(f.id, ti, "hora", e.target.value)} placeholder="14h" className={`font-mono col-span-2 text-center !px-1 !py-2 ${inputCls}`} />
                            <button onClick={() => removeTomada(f.id, ti)} className="col-span-1 flex justify-center text-destructive hover:opacity-80"><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <datalist id="periodos-list">{PERIODOS.map((p) => <option key={p} value={p} />)}</datalist>

        {selected.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Total estimado — uso interno</span>
              <span className="text-[10px] text-amber-600/90">Valor médio de mercado. Não aparece no texto nem no PDF do cliente.</span>
            </div>
            <span className="font-mono text-lg font-bold text-amber-800 shrink-0">{formatBRL(totalInterno)}</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={handleCopy} disabled={!selected.length} className="btn-3d-soft font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            {copied ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copiado!" : "Copiar texto"}
          </button>
          <button onClick={handlePrint} disabled={!selected.length} className="btn-3d font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            <Printer className="w-4 h-4" />Imprimir / PDF
          </button>
        </div>
      </section>

      {/* BLOCO 2 — PDF VISUAL MODEL */}
      {selected.length > 0 && (
        <section className="no-print panel-3d p-5">
          <BlockTitle icon={Eye} color="text-primary">Modelo Visual do PDF</BlockTitle>
          <div className="bg-white border border-border rounded-md p-6 max-h-[720px] overflow-y-auto rx-scroll shadow-inner max-w-3xl mx-auto mt-4">
            <PdfModel patient={patient} idade={idade} today={today} duracao={duracao} cid={cid} selected={selected} />
          </div>
        </section>
      )}

      {/* BLOCO 3 — ROTEAMENTO PARA FARMÁCIAS + EMISSÃO */}
      {selected.length > 0 && (
        <section className="no-print panel-3d p-5">
          <BlockTitle icon={Building2} color="text-primary">Roteamento para Farmácias e Emissão</BlockTitle>
          <div className="mt-4">

            {!pharmacies?.length ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Nenhuma farmácia cadastrada. Cadastre em <span className="font-semibold">Farmácias</span> antes de emitir.
              </div>
            ) : (
              <>
                {/* Farmácia padrão */}
                <div className="flex flex-wrap items-center gap-2 mb-3 concave-3d px-3 py-2">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />Farmácia padrão:
                  </label>
                  <select
                    className="field-engraved border rounded-md px-3 py-1.5 text-sm text-foreground"
                    value={defaultPharmacyId ?? ""}
                    onChange={(e) => changeDefaultPharmacy(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— selecione —</option>
                    {pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <span className="text-[11px] text-muted-foreground">Aplica a todas as fórmulas sem farmácia específica.</span>
                </div>

                {/* Roteamento por fórmula */}
                <div className="space-y-2 mb-3">
                  {selected.map((f, idx) => {
                    const r = getRoute(f.id);
                    const recipe = r.isControlled ? recipeTypeForControlledClass(r.anvisaType) : null;
                    const sncrFlag = r.isControlled && r.anvisaType ? sncrFlags.get(r.anvisaType) : undefined;
                    const frameClass = sncrFlag === "low"
                      ? "border-2 border-amber-400 bg-amber-50"
                      : sncrFlag
                        ? "border-2 border-destructive bg-destructive/5"
                        : "panel-3d-sub";
                    return (
                      <div key={f.id} className={`${frameClass} rounded-md p-3`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                          <span className="text-sm font-semibold text-foreground truncate">{f.name}</span>
                          {sncrFlag && (
                            <span className={`ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-sm border flex items-center gap-1 ${sncrFlag === "low" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                              <AlertTriangle className="w-3 h-3" />
                              {sncrFlag === "low" ? "SNCR ACABANDO" : sncrFlag === "exhausted" ? "SNCR ESGOTADO" : "SEM INTERVALO SNCR"}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                          <div className="md:col-span-5">
                            <select
                              className="field-engraved border rounded-md w-full px-2 py-2 text-xs text-foreground"
                              value={r.pharmacyId ?? ""}
                              onChange={(e) => setRoute(f.id, { pharmacyId: e.target.value ? Number(e.target.value) : null })}
                            >
                              <option value="">Usar farmácia padrão</option>
                              {(r.isControlled && r.anvisaType ? pharmaciesForType(r.anvisaType) : pharmacies).map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            {r.isControlled && r.anvisaType && pharmaciesForType(r.anvisaType).length === 0 && (
                              <p className="text-[10px] text-destructive mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />Nenhuma farmácia atende {r.anvisaType}. Ajuste o cadastro em Farmácias.
                              </p>
                            )}
                          </div>
                          <label className="md:col-span-3 flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={r.isControlled}
                              onChange={(e) => setRoute(f.id, { isControlled: e.target.checked })}
                              className="accent-amber-600 w-4 h-4"
                            />
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />Controlado
                          </label>
                          {r.isControlled && (
                            <div className="md:col-span-4 flex items-center gap-2">
                              <select
                                className="w-full px-2 py-2 border border-amber-300 rounded-md text-xs bg-amber-50 text-foreground"
                                value={r.anvisaType}
                                onChange={(e) => setRoute(f.id, { anvisaType: e.target.value })}
                              >
                                <option value="">Tipo Anvisa…</option>
                                {ANVISA_CONTROLLED_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                              {recipe && (
                                <span className="shrink-0 text-[10px] font-bold px-1.5 py-1 rounded-sm border" style={{ background: recipe.color, color: recipe.colorName === "Branca" ? "#0f172a" : "#0f172a", borderColor: "#cbd5e1" }}>
                                  {recipe.colorName}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-dashed border-border">
                          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                            <Layers className="w-3 h-3" />Cor interna
                          </label>
                          <select
                            className="field-engraved border rounded-md px-2 py-1.5 text-xs text-foreground"
                            value={r.internalColor}
                            onChange={(e) => setRoute(f.id, { internalColor: e.target.value })}
                          >
                            {INTERNAL_COLORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                          {r.internalColor && (
                            <span className="w-3.5 h-3.5 rounded-[2px] border border-border shrink-0" style={{ background: INTERNAL_COLORS.find((c) => c.value === r.internalColor)?.hex }} />
                          )}
                          <span className="text-[10px] text-muted-foreground">A manipulação é desmembrada em uma receita por cor interna.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ações */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handlePreview}
                    disabled={previewMutation.isPending}
                    className="btn-3d-soft font-semibold py-2.5 px-4 rounded-md text-sm flex items-center gap-2 disabled:opacity-40"
                  >
                    <Eye className="w-4 h-4" />
                    {previewMutation.isPending ? "Gerando…" : "Prévia do desmembramento"}
                  </button>
                  <button
                    onClick={handleEmit}
                    disabled={emitMutation.isPending}
                    className="btn-3d font-semibold py-2.5 px-4 rounded-md text-sm flex items-center gap-2 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                    {emitMutation.isPending ? "Emitindo…" : "Emitir receitas"}
                  </button>
                </div>

                {/* Prévia */}
                {previewPlans && !emitResult && (
                  <div className="mt-4 space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary">Prévia — {previewPlans.length} receita(s) será(ão) gerada(s)</h3>
                    {previewPlans.map((plan, i) => (
                      <div key={i} className="panel-3d-sub p-3 flex items-start gap-3">
                        {plan.anvisaColor ? (
                          <span className="mt-0.5 w-3 h-3 rounded-[2px] border border-border shrink-0" style={{ background: plan.anvisaColor }} />
                        ) : (
                          <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{plan.title}</p>
                          <p className="text-xs text-muted-foreground">
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
                  <div className="mt-4 space-y-3">
                    {emitResult.sncrAlerts.length > 0 && (
                      <div className="space-y-1">
                        {emitResult.sncrAlerts.map((a, i) => (
                          <div key={i} className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 border ${a.status === "exhausted" ? "bg-destructive/10 border-destructive/30 text-destructive" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                            <AlertTriangle className="w-4 h-4 shrink-0" />{a.message}
                          </div>
                        ))}
                      </div>
                    )}

                    <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary flex items-center gap-1">
                      <FileSignature className="w-3.5 h-3.5" />Receitas emitidas ({emitResult.recipes.length})
                    </h3>
                    {emitResult.recipes.map((rec) => (
                      <div key={rec.id} className="panel-3d-sub p-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{rec.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {rec.anvisaColorName ? `Receituário ${rec.anvisaColorName}` : "Manipulação"}
                            {rec.sncrNumber ? ` · SNCR nº ${rec.sncrNumber}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={`${import.meta.env.BASE_URL}${rec.pdfUrl.replace(/^\//, "")}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />Abrir PDF
                          </a>
                          {rec.driveWebViewLink && (
                            <a href={rec.driveWebViewLink} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="w-3.5 h-3.5" />Drive
                            </a>
                          )}
                        </div>
                      </div>
                    ))}

                    {emitResult.pharmacyDispatches.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />WhatsApp às farmácias
                        </h3>
                        {emitResult.pharmacyDispatches.map((d) => (
                          <div key={d.pharmacyId} className="panel-3d-sub p-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">{d.pharmacyName}</p>
                              <p className="text-xs text-muted-foreground">
                                {d.recipeCount} receita(s) · {d.sent ? "enviado automaticamente" : "envio manual"}
                              </p>
                            </div>
                            {d.whatsappLink && (
                              <a
                                href={d.whatsappLink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-md text-sm shrink-0"
                              >
                                <MessageSquare className="w-4 h-4" />Abrir WhatsApp
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
        </section>
      )}

      {/* PRINT */}
      <div className="print-only">
        <div style={{ padding: "36px", fontFamily: "Georgia, serif" }}>
          <PdfModel patient={patient} idade={idade} today={today} duracao={duracao} cid={cid} selected={selected} print />
        </div>
      </div>
    </div>
  );
}

// Placa Saliente (Bevel) do titulo de cada bloco — padrao Paxter (Padrao 3).
function BlockTitle({ icon: Icon, color, children }: { icon: ElementType; color: string; children: React.ReactNode }) {
  return (
    <span className={`bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-base font-semibold uppercase tracking-wide ${color}`}>
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}

interface PdfModelProps {
  patient: PatientData;
  idade: number;
  today: string;
  duracao: string;
  cid: string;
  selected: SelectedFormula[];
  print?: boolean;
}

function PdfModel({ patient, idade, today, duracao, cid, selected, print }: PdfModelProps) {
  return (
    <div style={{ fontSize: print ? "11pt" : "12px", color: "#0f172a" }}>
      <div style={{ textAlign: "center", borderBottom: `3px solid ${PETROLEO}`, paddingBottom: "8px", marginBottom: "14px" }}>
        <div style={{ fontSize: print ? "20pt" : "20px", fontWeight: 700, color: PETROLEO, letterSpacing: "0.04em" }}>CLÍNICA PADUA</div>
        <div style={{ fontSize: print ? "8pt" : "9px", color: CIANO, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>Padcon Conect</div>
        <div style={{ fontSize: print ? "10pt" : "11px", color: "#475569", marginTop: "2px" }}>Dr. Caio Henrique Pádua — CRM-SP 125475</div>
      </div>
      {patient.nome && (
        <div style={{ fontSize: print ? "10pt" : "11px", marginBottom: "12px", lineHeight: 1.5 }}>
          <strong>CLIENTE:</strong> {patient.nome}{patient.cpf ? ` — CPF: ${patient.cpf}` : ""}{idade ? ` — ${idade} anos` : ""}<br />
          {patient.telefone && <>Contato: {patient.telefone} </>}{patient.email && <>· {patient.email}</>}<br />
          Data: {today} · Duração: {duracao} dias{cid ? ` · CID: ${cid}` : ""}
        </div>
      )}
      <div style={{ fontSize: print ? "8.5pt" : "10px", color: "#475569", lineHeight: 1.45, background: "#f1f6f6", padding: "10px", borderLeft: `3px solid ${PETROLEO}`, marginBottom: "16px", whiteSpace: "pre-wrap" }}>{HEADER_BOILERPLATE}</div>

      {selected.map((f, i) => {
        const { parsed } = parseAtivosLines(f.ativos);
        return (
          <div key={f.id} style={{ marginBottom: "20px", breakInside: "avoid" }}>
            <div style={{ fontWeight: 700, fontSize: print ? "11pt" : "13px", color: PETROLEO, borderBottom: "1px solid #cbd5e1", paddingBottom: "3px", marginBottom: "8px" }}>{i + 1}. {f.name}</div>
            <div className="ativo-grid" style={{ fontSize: print ? "9.5pt" : "11px", fontFamily: "monospace" }}>
              {parsed.map((p, j) =>
                "empty" in p ? null : "dose" in p ? (
                  <div key={j} style={{ display: "contents" }}>
                    <div style={{ color: "#0f172a" }}>{p.nome}</div>
                    <div style={{ color: PETROLEO, fontWeight: 700 }}>{p.dose}</div>
                  </div>
                ) : (
                  <div key={j} style={{ gridColumn: "1 / -1", color: "#64748b", fontStyle: "italic" }}>{p.raw}</div>
                ),
              )}
            </div>
            <div style={{ marginTop: "6px", paddingTop: "5px", borderTop: "1px dashed #e2e8f0" }}>
              {f.tomadas.map((t, k) => (
                <div key={k} style={{ fontSize: print ? "9.5pt" : "11px", color: "#0a7a6e", fontWeight: 600, fontFamily: "monospace" }}>▸ {tomadaToText(t)}</div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: "48px", textAlign: "center" }}>
        <div style={{ borderTop: "1px solid #000", width: "320px", margin: "0 auto", paddingTop: "4px", fontSize: print ? "10pt" : "11px" }}>Dr. Caio Henrique Pádua — CRM-SP 125475</div>
      </div>
    </div>
  );
}
