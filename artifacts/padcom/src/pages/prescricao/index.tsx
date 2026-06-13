import { useMemo, useState } from "react";
import {
  Search, Plus, X, Trash2, Copy, Printer, FileText, User, Stethoscope,
  CheckCircle2, ArrowUp, ArrowDown, Layers, Clock, FolderPlus,
} from "lucide-react";
import {
  HEADER_BOILERPLATE, SEPARATOR, PERIODOS, VIAS, CATEGORIES, FORMULAS, PROTOCOLOS_SEED,
  parseBody, parseAtivosLines, tomadaToText, buildFormulaText,
  type Tomada, type FormulaSeed, type Protocolo, type SelectedFormula,
} from "./data";

const PETROLEO = "#3D7A7A";
const CIANO = "#45B8CC";

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

  const allProtocolos = [...PROTOCOLOS_SEED, ...customProtocolos];

  const filtered = useMemo(
    () =>
      FORMULAS.filter((f) => {
        const mc = activeCategory === "all" || f.cat === activeCategory;
        const ms =
          !search ||
          f.name.toLowerCase().includes(search.toLowerCase()) ||
          f.body.toLowerCase().includes(search.toLowerCase());
        return mc && ms;
      }),
    [activeCategory, search],
  );

  const addFormula = (f: FormulaSeed) => {
    setSelected((prev) => {
      if (prev.find((s) => s.id === f.id)) return prev;
      const { ativos, tomadas } = parseBody(f.body);
      return [...prev, { id: f.id, cat: f.cat, name: f.name, ativos, tomadas }];
    });
  };

  const addProtocolo = (p: Protocolo) =>
    p.formulaIds.forEach((id) => {
      const f = FORMULAS.find((x) => x.id === id);
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
    const s: Record<string, number> = { all: FORMULAS.length };
    FORMULAS.forEach((f) => {
      s[f.cat] = (s[f.cat] || 0) + 1;
    });
    return s;
  }, []);

  const inputCls =
    "px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-accent/40 focus:border-accent outline-none bg-card text-foreground";

  return (
    <div className="max-w-[1700px] mx-auto">
      <style>{`
        @media print { .no-print{display:none!important;} .print-only{display:block!important;} body{background:white!important;} }
        .print-only{display:none;}
        .rx-scroll::-webkit-scrollbar{width:8px;}
        .rx-scroll::-webkit-scrollbar-thumb{background:#9bbcbc;border-radius:4px;}
        .ativo-grid{display:grid;grid-template-columns:max-content 1fr;column-gap:1.25rem;row-gap:0.15rem;}
      `}</style>

      {/* PAGE HEADER */}
      <div className="no-print mb-5 flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 flex items-center justify-center bg-primary text-primary-foreground rounded-md">
            <Stethoscope className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Prescrição de Fórmulas</h1>
            <p className="text-[11px] tracking-[0.22em] uppercase text-primary font-semibold">
              Montador de Receitas Manipuladas
            </p>
          </div>
        </div>
        <span className="text-sm text-muted-foreground hidden md:block">Dr. Caio Henrique Pádua</span>
      </div>

      {/* PATIENT */}
      <div className="no-print bg-card border border-border rounded-md p-5 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-primary" />
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Dados do Cliente</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <input className={`col-span-2 ${inputCls}`} placeholder="Nome completo" value={patient.nome} onChange={(e) => setPatient({ ...patient, nome: e.target.value })} />
          <input className={inputCls} placeholder="CPF" value={patient.cpf} onChange={(e) => setPatient({ ...patient, cpf: e.target.value })} />
          <input className={inputCls} placeholder="Telefone" value={patient.telefone} onChange={(e) => setPatient({ ...patient, telefone: e.target.value })} />
          <input className={inputCls} placeholder="E-mail" value={patient.email} onChange={(e) => setPatient({ ...patient, email: e.target.value })} />
          <input type="date" className={inputCls} value={patient.dataNascimento} onChange={(e) => setPatient({ ...patient, dataNascimento: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">Duração:</label>
            <input type="number" className={`w-24 ${inputCls}`} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
            <span className="text-xs text-muted-foreground">dias</span>
          </div>
          <input className={`col-span-3 ${inputCls}`} placeholder="CID (ex: N484 + E291 + F90)" value={cid} onChange={(e) => setCid(e.target.value)} />
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="no-print grid grid-cols-12 gap-4">
        {/* LEFT: CATEGORIES / PROTOCOLS */}
        <aside className="col-span-12 lg:col-span-3 bg-card border border-border rounded-md p-3">
          <div className="grid grid-cols-2 gap-1 mb-3 bg-muted rounded-md p-1">
            <button onClick={() => setLeftTab("cat")} className={`py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition ${leftTab === "cat" ? "bg-card shadow text-primary" : "text-muted-foreground"}`}>
              <FileText className="w-4 h-4" />Categorias
            </button>
            <button onClick={() => setLeftTab("proto")} className={`py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition ${leftTab === "proto" ? "bg-card shadow text-primary" : "text-muted-foreground"}`}>
              <Layers className="w-4 h-4" />Protocolos
            </button>
          </div>

          {leftTab === "cat" ? (
            <>
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input className={`w-full pl-9 ${inputCls}`} placeholder="Buscar fórmula..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="max-h-[560px] overflow-y-auto rx-scroll space-y-1">
                <button onClick={() => setActiveCategory("all")} className={`w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between transition border ${activeCategory === "all" ? "bg-primary text-primary-foreground font-semibold border-primary" : "hover:bg-muted text-foreground border-transparent"}`}>
                  <span className="flex items-center gap-2"><FileText className="w-4 h-4" />Todas</span>
                  <span className={`font-mono text-xs ${activeCategory === "all" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{stats.all}</span>
                </button>
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const n = stats[c.id] || 0;
                  if (!n) return null;
                  const active = activeCategory === c.id;
                  return (
                    <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between transition border ${active ? "bg-primary text-primary-foreground font-semibold border-primary" : "hover:bg-muted text-foreground border-transparent"}`}>
                      <span className="flex items-center gap-2 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-primary-foreground" : "text-primary/70"}`} />
                        <span className="truncate">{c.label}</span>
                      </span>
                      <span className={`font-mono text-xs shrink-0 ml-1 ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="max-h-[620px] overflow-y-auto rx-scroll space-y-2">
              <p className="text-xs text-muted-foreground px-1 mb-1">Clique para adicionar o conjunto inteiro à receita.</p>
              {allProtocolos.map((p) => (
                <div key={p.id} className="border border-border rounded-md p-3 hover:border-accent transition">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-foreground text-sm flex items-center gap-1.5"><Layers className="w-4 h-4 text-accent" />{p.nome}</h3>
                    <button onClick={() => addProtocolo(p)} className="shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Adicionar</button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">{p.formulaIds.map((id) => FORMULAS.find((f) => f.id === id)?.name).filter(Boolean).join(" • ")}</p>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* CENTER: CATALOG */}
        <section className="col-span-12 lg:col-span-4 bg-card border border-border rounded-md p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Catálogo de Fórmulas</h2>
            <span className="font-mono text-xs text-muted-foreground">{filtered.length} disponíveis</span>
          </div>
          <div className="space-y-2 max-h-[680px] overflow-y-auto rx-scroll pr-1">
            {filtered.map((f) => {
              const cat = CATEGORIES.find((c) => c.id === f.cat);
              const isSel = !!selected.find((s) => s.id === f.id);
              return (
                <div key={f.id} className={`border rounded-md p-3 transition ${isSel ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {cat && <span className="text-[10px] px-2 py-0.5 rounded-sm bg-primary/10 text-primary font-semibold uppercase tracking-wide">{cat.label}</span>}
                      <h3 className="font-semibold text-foreground text-sm mt-1">{f.name}</h3>
                      <p className="font-mono text-[11px] text-muted-foreground mt-1 line-clamp-2">{f.body.split("\n").slice(0, 2).join(" • ")}</p>
                    </div>
                    <button onClick={() => (isSel ? removeFormula(f.id) : addFormula(f))} className={`shrink-0 px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-1 transition ${isSel ? "bg-accent text-accent-foreground hover:bg-accent/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
                      {isSel ? (<><CheckCircle2 className="w-4 h-4" />Incluída</>) : (<><Plus className="w-4 h-4" />Adicionar</>)}
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma fórmula encontrada</div>}
          </div>
        </section>

        {/* RIGHT: BLOCO 1 — SELECTION / EDIT */}
        <section className="col-span-12 lg:col-span-5 bg-card border border-accent/40 rounded-md p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-sm font-mono tracking-wide">BLOCO 1</span>
              Seleção / Edição ({selected.length})
            </h2>
            <div className="flex gap-2">
              {selected.length > 0 && <button onClick={saveAsProtocolo} className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-semibold"><FolderPlus className="w-4 h-4" />Salvar protocolo</button>}
              {selected.length > 0 && <button onClick={handleClear} className="text-xs text-destructive hover:opacity-80 flex items-center gap-1 font-semibold"><Trash2 className="w-3.5 h-3.5" />Limpar</button>}
            </div>
          </div>

          {selected.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground py-12">
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
                  <div key={f.id} className="border border-border rounded-md overflow-hidden">
                    <div className="px-3 py-2 bg-muted flex items-center justify-between gap-2 border-b border-border">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-mono text-xs font-bold text-muted-foreground">#{idx + 1}</span>
                        {cat && <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary font-semibold uppercase">{cat.label.split(" ")[0]}</span>}
                        <span className="text-sm font-semibold text-foreground truncate">{f.name}</span>
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
                        <textarea value={f.ativos} onChange={(e) => updateAtivos(f.id, e.target.value)} className="font-mono w-full mt-1 px-3 py-2 text-xs border border-border rounded-md resize-y focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 bg-card text-foreground" rows={Math.min(f.ativos.split("\n").length + 1, 14)} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Tomadas</label>
                          <button onClick={() => addTomada(f.id)} className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Tomada</button>
                        </div>
                        <div className="space-y-2">
                          {f.tomadas.map((t, ti) => (
                            <div key={ti} className="grid grid-cols-12 gap-1.5 items-center bg-muted rounded-md p-2 border border-border">
                              <select value={t.doses} onChange={(e) => updateTomada(f.id, ti, "doses", e.target.value)} className="font-mono col-span-2 px-1 py-2 border border-border rounded-sm text-xs text-center bg-card text-foreground">
                                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                              <select value={t.via || "VO"} onChange={(e) => updateTomada(f.id, ti, "via", e.target.value)} className="col-span-2 px-1 py-2 border border-border rounded-sm text-xs bg-card text-foreground">
                                {VIAS.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <input list="periodos-list" value={t.periodo} onChange={(e) => updateTomada(f.id, ti, "periodo", e.target.value)} placeholder="Período…" className="col-span-5 px-2 py-2 border border-border rounded-sm text-xs bg-card text-foreground" />
                              <input value={t.hora} onChange={(e) => updateTomada(f.id, ti, "hora", e.target.value)} placeholder="14h" className="font-mono col-span-2 px-1 py-2 border border-border rounded-sm text-xs text-center bg-card text-foreground" />
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

          <div className="border-t border-border pt-3 mt-3 grid grid-cols-2 gap-2">
            <button onClick={handleCopy} disabled={!selected.length} className="bg-secondary hover:bg-muted text-secondary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-40 border border-border">
              {copied ? <CheckCircle2 className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado!" : "Copiar texto"}
            </button>
            <button onClick={handlePrint} disabled={!selected.length} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2.5 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-40">
              <Printer className="w-4 h-4" />Imprimir / PDF
            </button>
          </div>
        </section>
      </div>

      {/* BLOCO 2 — PDF VISUAL MODEL */}
      {selected.length > 0 && (
        <div className="no-print mt-4">
          <div className="bg-card border border-accent/40 rounded-md p-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <span className="bg-accent text-accent-foreground text-[10px] px-2 py-0.5 rounded-sm font-mono tracking-wide">BLOCO 2</span>
              Modelo Visual do PDF
            </h2>
            <div className="bg-white border border-border rounded-md p-6 max-h-[720px] overflow-y-auto rx-scroll shadow-inner max-w-3xl mx-auto">
              <PdfModel patient={patient} idade={idade} today={today} duracao={duracao} cid={cid} selected={selected} />
            </div>
          </div>
        </div>
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
