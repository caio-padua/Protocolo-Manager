/**
 * PROGRAMA CLÍNICO DE PRESCRIÇÃO
 * ════════════════════════════════════════════════════════════════════
 * Ferramenta-mãe que reúne, num único painel segmentado e numerado:
 *
 *  [0] CONFIGURAÇÃO DO PROGRAMA — cliente, frequência, mensalidade
 *  [1] PRESCRIÇÃO DE FÓRMULAS MAGISTRAIS — ferramenta original completa
 *  [2] SOLICITAÇÃO DE EXAMES           — ferramenta original completa
 *  [3] LINHA DO TEMPO                  — painel fino com nós editáveis
 *
 * Design: TDAH-friendly, grade imaginária vertical+horizontal,
 * separadores visuais fortes, alinhamento consistente em todos os blocos.
 * ════════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  FlaskConical, Microscope, Calendar, Save, Plus, Minus,
  ChevronLeft, ChevronRight, X, CreditCard, AlertCircle,
  CheckCircle2, Clock, Edit3, Loader2, Play, ChevronDown,
  ChevronUp, Banknote, Bell, Info, Pill, FileText, ExternalLink, Zap, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ClientPicker, type ClientPickerOption } from "@/components/ClientPicker";
import { cn } from "@/lib/utils";
import PrescricaoPage from "@/pages/prescricao";
import ExamesPage from "@/pages/exames";

// ─── helpers ──────────────────────────────────────────────────────────────────
const API = import.meta.env.BASE_URL.replace(/\/$/, "");
function authHeader(): HeadersInit {
  const t = localStorage.getItem("collab_token") || "";
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
           : { "Content-Type": "application/json" };
}
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeader(), ...(opts?.headers ?? {}) } });
  if (!r.ok) { const txt = await r.text(); throw new Error(`HTTP ${r.status}: ${txt.slice(0, 120)}`); }
  return r.json();
}
function hoje() { return new Date().toISOString().slice(0, 10); }
function addDias(base: string, dias: number): string {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function fmtData(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${d}/${meses[parseInt(m) - 1]}`;
}
function uid() { return Math.random().toString(36).slice(2, 9); }
function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── tipos ────────────────────────────────────────────────────────────────────
type ClienteLite = { id: number; name: string; cpf?: string | null; };
type NoFormula = { id: string; nome: string; dose?: string; posologia?: string; via?: string; };
type NoExame   = { id: string; nome: string; };
type No = {
  id: string;
  numero: number;
  dataLiberacao: string;
  nomeReceita: string;
  formulas: NoFormula[];
  exames: NoExame[];
  /** status de pagamento (se programa com mensalidade) */
  pagamentoStatus: "livre" | "pago" | "pendente" | "inadimplente";
};

type Agenda = {
  id: number; clientId: number; nome: string; frequenciaPadraoDias: number;
  ativo: boolean; criadoEm: string; slots?: Slot[];
};
type Slot = {
  id: number; nome: string; dataLiberacao: string; status: string;
  formulas: NoFormula[]; canais: string[] | null;
};

// ─── constante de catálogo rápido no timeline ─────────────────────────────────
const CATALOG_API = "/api/prescription-formulas";
const EXAMES_API  = "/api/catalogos/exames";
const VIAS_RAPIDAS = ["Oral", "Sublingual", "Tópica", "IV", "IM", "Outra"];

// ══════════════════════════════════════════════════════════════════════════════
// ── Sub-componente: divisor de bloco numerado ─────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function DivisorBloco({
  numero, titulo, subtitulo, cor, icon: Icon,
}: {
  numero: number;
  titulo: string;
  subtitulo?: string;
  cor: "emerald" | "amber" | "sky" | "primary";
  icon: React.ElementType;
}) {
  const cores: Record<string, string> = {
    emerald: "bg-emerald-700 text-white",
    amber:   "bg-amber-600 text-white",
    sky:     "bg-sky-700 text-white",
    primary: "bg-primary text-primary-foreground",
  };
  return (
    <div className="relative flex items-center gap-0 my-2 select-none">
      {/* linha esquerda */}
      <div className="flex-1 h-px bg-border/70" />
      {/* cápsula central */}
      <div className="flex items-center gap-3 bevel-3d px-5 py-2.5 mx-4">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-base font-black shrink-0", cores[cor])}>
          {numero}
        </div>
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-black leading-none">{titulo}</div>
          {subtitulo && <div className="text-[10px] text-muted-foreground mt-0.5 tracking-wide">{subtitulo}</div>}
        </div>
      </div>
      {/* linha direita */}
      <div className="flex-1 h-px bg-border/70" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Sub-componente: nó de timeline + editor inline ───────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
function NoTimeline({
  no, ativo, onClick, catalogoFormulas, catalogoExames,
  onUpdateFormula, onAddFormula, onRemoveFormula,
  onUpdateExame, onAddExame, onRemoveExame,
  onUpdateNo, temPagamento,
}: {
  no: No;
  ativo: boolean;
  onClick: () => void;
  catalogoFormulas: Array<{ id: string; nome: string; posologia?: string; via?: string }>;
  catalogoExames: string[];
  onUpdateFormula: (nId: string, fId: string, patch: Partial<NoFormula>) => void;
  onAddFormula: (nId: string, nome: string, catalogId?: string) => void;
  onRemoveFormula: (nId: string, fId: string) => void;
  onUpdateExame: (nId: string, xId: string, patch: Partial<NoExame>) => void;
  onAddExame: (nId: string, nome: string) => void;
  onRemoveExame: (nId: string, xId: string) => void;
  onUpdateNo: (nId: string, patch: Partial<No>) => void;
  temPagamento: boolean;
}) {
  const [bF, setBF] = useState("");
  const [bX, setBX] = useState("");
  const temF = no.formulas.length > 0;
  const temX = no.exames.length > 0;
  const catF = catalogoFormulas.filter(c => c.nome.toLowerCase().includes(bF.toLowerCase())).slice(0, 8);
  const catX = catalogoExames.filter(n => n.toLowerCase().includes(bX.toLowerCase())).slice(0, 6);

  const pagBadge: Record<string, string> = {
    livre:        "bg-slate-100 text-slate-600 border-slate-300",
    pago:         "bg-emerald-50 text-emerald-700 border-emerald-300",
    pendente:     "bg-amber-50 text-amber-700 border-amber-300",
    inadimplente: "bg-rose-50 text-rose-700 border-rose-300",
  };

  return (
    <div className="flex flex-col items-center" style={{ minWidth: 160 }}>
      {/* círculo do nó */}
      <button
        type="button"
        onClick={onClick}
        title={`Entrega ${no.numero} — ${fmtData(no.dataLiberacao)}`}
        className={cn(
          "relative w-11 h-11 rounded-full border-2 flex items-center justify-center font-black text-sm transition-all duration-200 z-10",
          ativo
            ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110"
            : (temF && temX)
              ? "bg-background border-primary/60 text-primary hover:scale-105"
              : temF
                ? "bg-background border-emerald-500 text-emerald-700 hover:scale-105"
                : temX
                  ? "bg-background border-amber-500 text-amber-700 hover:scale-105"
                  : "bg-muted border-border/60 text-muted-foreground hover:border-primary/50 hover:scale-105",
        )}
      >
        {no.numero}
        {/* indicador de conteúdo */}
        {(temF || temX) && !ativo && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background" />
        )}
      </button>

      {/* data */}
      <div className="text-xs font-bold mt-1.5">{fmtData(no.dataLiberacao)}</div>
      <div className="text-[10px] text-muted-foreground">E{no.numero}</div>

      {/* badges de conteúdo */}
      <div className="flex gap-1 mt-1 flex-wrap justify-center">
        {temF && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            {no.formulas.length}F
          </span>
        )}
        {temX && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            {no.exames.length}E
          </span>
        )}
        {temPagamento && (
          <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold border", pagBadge[no.pagamentoStatus])}>
            {no.pagamentoStatus === "pago" ? "✓" : no.pagamentoStatus === "inadimplente" ? "!" : "?"}
          </span>
        )}
      </div>

      {/* editor inline — expande abaixo do nó quando ativo */}
      {ativo && (
        <div className="mt-3 w-[320px] panel-3d-sub p-4 space-y-4 text-left z-20 shadow-xl">
          {/* cabeçalho do editor */}
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div>
              <div className="font-black text-sm">Entrega {no.numero}</div>
              <div className="text-[11px] text-muted-foreground">{fmtData(no.dataLiberacao)}</div>
            </div>
            {temPagamento && (
              <select
                className="field-engraved text-[10px] px-1.5 py-1"
                value={no.pagamentoStatus}
                onChange={(e) => onUpdateNo(no.id, { pagamentoStatus: e.target.value as No["pagamentoStatus"] })}
              >
                <option value="livre">Livre</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="inadimplente">Inadimplente</option>
              </select>
            )}
          </div>

          {/* Fórmulas */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest font-black text-emerald-700 flex items-center gap-1">
              <FlaskConical className="w-3 h-3" /> Fórmulas Magistrais
            </div>
            {no.formulas.map((f) => (
              <div key={f.id} className="flex items-center gap-2 bg-emerald-50/60 border border-emerald-200 rounded px-2 py-1.5">
                <input
                  className="flex-1 bg-transparent text-xs font-medium outline-none"
                  value={f.nome}
                  onChange={(e) => onUpdateFormula(no.id, f.id, { nome: e.target.value })}
                  placeholder="Nome…"
                />
                <button onClick={() => onRemoveFormula(no.id, f.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {/* busca rápida catálogo */}
            <input
              className="field-engraved w-full text-xs"
              placeholder="Buscar fórmula…"
              value={bF}
              onChange={(e) => setBF(e.target.value)}
            />
            {bF && catF.map((c) => (
              <button key={c.id} type="button"
                onClick={() => { onAddFormula(no.id, c.nome, c.id); setBF(""); }}
                className="w-full text-left text-xs px-2 py-1 hover:bg-primary/10 rounded transition-colors">
                {c.nome}
              </button>
            ))}
            {!bF && (
              <button type="button"
                onClick={() => onAddFormula(no.id, "")}
                className="w-full text-xs text-muted-foreground border border-dashed border-border/60 rounded py-1 hover:border-primary/40 transition-colors">
                + fórmula em branco
              </button>
            )}
          </div>

          {/* Exames */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest font-black text-amber-700 flex items-center gap-1">
              <Microscope className="w-3 h-3" /> Exames
            </div>
            {no.exames.map((x) => (
              <div key={x.id} className="flex items-center gap-2 bg-amber-50/60 border border-amber-200 rounded px-2 py-1.5">
                <span className="flex-1 text-xs font-medium truncate">{x.nome}</span>
                <button onClick={() => onRemoveExame(no.id, x.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <input
              className="field-engraved w-full text-xs"
              placeholder="Buscar ou digitar exame…"
              value={bX}
              onChange={(e) => setBX(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && bX.trim()) { onAddExame(no.id, bX); setBX(""); } }}
            />
            {bX && catX.map((n) => (
              <button key={n} type="button"
                onClick={() => { onAddExame(no.id, n); setBX(""); }}
                className="w-full text-left text-xs px-2 py-1 hover:bg-primary/10 rounded transition-colors">
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function ReceituarioAutomatico() {
  const { toast } = useToast();

  // ── Config geral ─────────────────────────────────────────────────────────
  const [clientes, setClientes]         = useState<ClienteLite[]>([]);
  const [clienteSelId, setClienteSelId] = useState<number | null>(null);
  const clienteSel = useMemo(() => clientes.find(c => c.id === clienteSelId) ?? null, [clientes, clienteSelId]);

  // ── Programa ──────────────────────────────────────────────────────────────
  const [nomePrograma, setNomePrograma] = useState("");
  const [nNos, setNNos]               = useState(3);
  const [frequencia, setFrequencia]   = useState(30);
  const [dataInicio, setDataInicio]   = useState(hoje());

  // ── Mensalidade ───────────────────────────────────────────────────────────
  const [temMensalidade, setTemMensalidade] = useState(false);
  const [valorMes, setValorMes]             = useState(100);
  const [diaVencimento, setDiaVencimento]   = useState(10);
  const [bloquearSemPagto, setBloquearSemPagto] = useState(false);

  // ── Nós da timeline ───────────────────────────────────────────────────────
  const [nos, setNos]               = useState<No[]>([]);
  const [noAtivo, setNoAtivo]       = useState<string | null>(null);
  const [catalogoF, setCatalogoF]   = useState<Array<{ id: string; nome: string; posologia?: string; via?: string }>>([]);
  const [catalogoX, setCatalogoX]   = useState<string[]>([]);
  const timelineRef                  = useRef<HTMLDivElement>(null);

  // ── Agendas salvas ────────────────────────────────────────────────────────
  const [agendas, setAgendas]       = useState<Agenda[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando]     = useState(false);
  const [agendasOpen, setAgendasOpen] = useState(false);
  const [expandidas, setExpandidas]   = useState<Set<number>>(new Set());

  // ── Emissão rápida ICP-Brasil (Carlucia + Dr. Caio) ───────────────────────
  const [emitirAberto,    setEmitirAberto]    = useState(false);
  const [emitirLoading,   setEmitirLoading]   = useState(false);
  const [emitirResultado, setEmitirResultado] = useState<{ ok: boolean; driveUrl?: string; emailSent?: boolean; error?: string } | null>(null);
  // ── Gerar PDF Visual (Puppeteer server-side — fiel ao template HTML) ─────
  const [gerarLoading, setGerarLoading] = useState(false);

  async function gerarPdfVisual() {
    if (!clienteSelId) return;
    setGerarLoading(true);
    try {
      const r = await fetch(`${API}/api/receituario/emitir-cliente`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({
          clientId: clienteSelId,
          formulas: [{
            nome:      emitirFormula.nome || "Bupropiona 180mg + Topiramato 20mg",
            posologia: emitirFormula.posologia || undefined,
            via:       emitirFormula.via || "oral",
          }],
          tipoReceita: "especial",
        }),
      });
      const data = await r.json() as { ok?: boolean; driveUrl?: string; emailSent?: boolean };
      if (data.ok) {
        toast({ title: "PDF Visual gerado", description: data.driveUrl ? "Salvo no Drive" : "Gerado com sucesso" });
      } else {
        toast({ title: "Erro ao gerar PDF Visual", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro de conexão", description: String(e), variant: "destructive" });
    } finally {
      setGerarLoading(false);
    }
  }

  const [emitirFormula,   setEmitirFormula]   = useState({
    nome:      "Bupropiona 180mg + Topiramato 20mg",
    dose:      "Cápsula XR — 30 unidades",
    posologia: "1 dose VO – 2h Antes do Almoço (Sugestão: 10h)\n1 dose VO – 2h Antes do Jantar (Sugestão: 18h)",
    via:       "oral",
  });

  async function emitirReceita() {
    if (!emitirFormula.nome.trim()) return;
    setEmitirLoading(true);
    setEmitirResultado(null);
    try {
      const r = await apiFetch("/api/receituario/emitir-prescricao", {
        method: "POST",
        body: JSON.stringify({
          patient: {
            nome:           "CARLUCIA SANTOS FERNANDES",
            cpf:            "024.862.801-11",
            dataNascimento: "1988-01-30",
            telefone:       "(62) 98269-6656",
            endereco:       "Rua Guaxupé, 327, Vila Formosa, São Paulo - SP",
          },
          formulas: [{
            nome:      emitirFormula.nome,
            dose:      emitirFormula.dose      || undefined,
            posologia: emitirFormula.posologia || undefined,
            via:       emitirFormula.via       || "oral",
          }],
          tipoReceita: "especial",
        }),
      });
      setEmitirResultado({ ok: true, driveUrl: r.driveUrl, emailSent: r.emailSent });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEmitirResultado({ ok: false, error: msg });
    } finally {
      setEmitirLoading(false);
    }
  }

  // ── Carga inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/clients?limit=500")
      .then(d => setClientes(Array.isArray(d) ? d : (d.clients ?? [])))
      .catch(() => {});
    apiFetch(CATALOG_API)
      .then(d => {
        const arr = Array.isArray(d) ? d : (d.formulas ?? []);
        setCatalogoF(arr.map((f: Record<string, unknown>) => ({
          id: String(f.id ?? f.code ?? f.nome),
          nome: String(f.nome ?? f.name ?? ""),
          posologia: f.posologia as string,
          via: f.via as string,
        })));
      }).catch(() => {});
    apiFetch(EXAMES_API)
      .then(d => {
        const arr = Array.isArray(d) ? d : (d.exames ?? []);
        setCatalogoX(arr.map((e: Record<string, unknown>) => String(e.nome ?? e.name ?? e)));
      }).catch(() => {});
  }, []);

  // ── Carga por cliente ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!clienteSelId) { setAgendas([]); return; }
    setCarregando(true);
    apiFetch(`/api/receituario/agendas?clientId=${clienteSelId}`)
      .then(d => setAgendas(d.agendas ?? []))
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [clienteSelId]);

  // ── Gerar nós ao mudar config ──────────────────────────────────────────────
  useEffect(() => {
    setNos(prev => {
      const next: No[] = [];
      for (let i = 0; i < nNos; i++) {
        const existing = prev[i];
        next.push({
          id:             existing?.id ?? uid(),
          numero:         i + 1,
          dataLiberacao:  addDias(dataInicio, i * frequencia),
          nomeReceita:    existing?.nomeReceita ?? `Entrega ${i + 1}`,
          formulas:       existing?.formulas ?? [],
          exames:         existing?.exames ?? [],
          pagamentoStatus: existing?.pagamentoStatus ?? "livre",
        });
      }
      return next;
    });
  }, [nNos, frequencia, dataInicio]);

  // ── Handlers de nó ────────────────────────────────────────────────────────
  const updateNo = (id: string, patch: Partial<No>) =>
    setNos(p => p.map(n => n.id === id ? { ...n, ...patch } : n));

  const addFormula = (nId: string, nome: string, catalogId?: string) =>
    setNos(p => p.map(n => n.id === nId
      ? { ...n, formulas: [...n.formulas, { id: uid(), nome, dose: "", posologia: "", via: "Oral" }] }
      : n));
  const updateFormula = (nId: string, fId: string, patch: Partial<NoFormula>) =>
    setNos(p => p.map(n => n.id === nId
      ? { ...n, formulas: n.formulas.map(f => f.id === fId ? { ...f, ...patch } : f) }
      : n));
  const removeFormula = (nId: string, fId: string) =>
    setNos(p => p.map(n => n.id === nId
      ? { ...n, formulas: n.formulas.filter(f => f.id !== fId) }
      : n));

  const addExame = (nId: string, nome: string) => {
    if (!nome.trim()) return;
    setNos(p => p.map(n => n.id === nId
      ? { ...n, exames: [...n.exames, { id: uid(), nome: nome.trim() }] }
      : n));
  };
  const updateExame = (nId: string, xId: string, patch: Partial<NoExame>) =>
    setNos(p => p.map(n => n.id === nId
      ? { ...n, exames: n.exames.map(x => x.id === xId ? { ...x, ...patch } : x) }
      : n));
  const removeExame = (nId: string, xId: string) =>
    setNos(p => p.map(n => n.id === nId
      ? { ...n, exames: n.exames.filter(x => x.id !== xId) }
      : n));

  // ── Salvar programa ────────────────────────────────────────────────────────
  const salvar = async () => {
    if (!clienteSelId) { toast({ title: "Selecione um cliente", variant: "destructive" }); return; }
    if (!nomePrograma.trim()) { toast({ title: "Dê um nome ao programa", variant: "destructive" }); return; }
    setSalvando(true);
    try {
      const ag = await apiFetch("/api/receituario/agendas", {
        method: "POST",
        body: JSON.stringify({
          clientId: clienteSelId,
          nome: nomePrograma,
          descricao: temMensalidade
            ? `Programa com mensalidade · R$${valorMes}/mês · venc. dia ${diaVencimento}`
            : `${nNos} entregas a cada ${frequencia} dias`,
          frequenciaPadraoDias: frequencia,
          diasAntecedencia: 5,
          canaisPadrao: ["email", "whatsapp", "portal"],
          incluirLembretePosologia: true,
        }),
      });
      const agendaId = ag.id ?? ag.agenda?.id;
      for (const n of nos) {
        if (n.formulas.length === 0 && n.exames.length === 0) continue;
        await apiFetch(`/api/receituario/agendas/${agendaId}/slots`, {
          method: "POST",
          body: JSON.stringify({
            nome: n.nomeReceita,
            dataLiberacao: n.dataLiberacao,
            proximaEmDias: frequencia,
            formulas: n.formulas.map(f => ({ nome: f.nome, dose: f.dose, posologia: f.posologia, via: f.via })),
            canais: null,
          }),
        });
      }
      toast({ title: `Programa "${nomePrograma}" salvo com sucesso!` });
      setNomePrograma("");
      const d = await apiFetch(`/api/receituario/agendas?clientId=${clienteSelId}`);
      setAgendas(d.agendas ?? []);
      setAgendasOpen(true);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: String(err), variant: "destructive" });
    } finally { setSalvando(false); }
  };

  const clientesOpts: ClientPickerOption[] = clientes.map(c => ({ id: c.id, name: c.name, cpf: c.cpf ?? undefined }));

  // KPIs globais da linha do tempo
  const kpis = useMemo(() => {
    let totalF = 0, totalX = 0, preenchidos = 0;
    for (const n of nos) {
      totalF += n.formulas.length;
      totalX += n.exames.length;
      if (n.formulas.length > 0 || n.exames.length > 0) preenchidos++;
    }
    return { totalF, totalX, preenchidos };
  }, [nos]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0 pb-20">

      {/* ══════════════════════════════════════════════════════════════════
          BLOCO 0 — CONFIGURAÇÃO DO PROGRAMA
      ══════════════════════════════════════════════════════════════════ */}
      <div className="panel-3d overflow-hidden">
        {/* Mastro */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="bevel-3d p-2.5">
              <Pill className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">Padcon Conect · Prescrição Clínica</div>
              <h1 className="text-xl font-black uppercase tracking-tight leading-none mt-0.5">
                Programa de Acompanhamento e Prescrição
              </h1>
            </div>
          </div>

          {/* KPIs */}
          {clienteSel && (
            <div className="hidden md:flex gap-2">
              {[
                { label: "Entregas",  valor: nNos,               cor: "text-primary" },
                { label: "Fórmulas", valor: kpis.totalF,         cor: "text-emerald-700" },
                { label: "Exames",   valor: kpis.totalX,         cor: "text-amber-700" },
                { label: "Nós preench.", valor: `${kpis.preenchidos}/${nNos}`, cor: "text-sky-700" },
              ].map(k => (
                <div key={k.label} className="screen-3d px-3 py-2 text-center min-w-[72px]">
                  <div className={`text-xl font-black ${k.cor}`}>{k.valor}</div>
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Linha 1: cliente + nome do programa */}
        <div className="px-6 pt-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-end border-b border-border/30">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Cliente *</label>
            <ClientPicker clientes={clientesOpts} value={clienteSelId} onChange={v => { setClienteSelId(v); setNoAtivo(null); }} placeholder="Selecione o cliente…" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Nome do Programa *</label>
            <input
              className="field-engraved w-full"
              placeholder="Ex: Protocolo Longevidade · 2026"
              value={nomePrograma}
              onChange={e => setNomePrograma(e.target.value)}
            />
          </div>
        </div>

        {/* Linha 2: parâmetros de frequência */}
        <div className="px-6 py-3 grid grid-cols-2 md:grid-cols-4 gap-4 items-end border-b border-border/30">
          {/* N entregas — Kaizen: botões h-9 w-9 alinhados com o campo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Número de Entregas</label>
            <div className="flex items-center gap-1">
              <button type="button"
                className="btn-3d-soft h-9 w-9 flex items-center justify-center shrink-0"
                onClick={() => setNNos(n => Math.max(1, n - 1))}>
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input type="number" min={1} max={24} value={nNos}
                onChange={e => setNNos(Math.max(1, Math.min(24, parseInt(e.target.value) || 1)))}
                className="field-engraved text-center w-16 text-sm font-black" />
              <button type="button"
                className="btn-3d-soft h-9 w-9 flex items-center justify-center shrink-0"
                onClick={() => setNNos(n => Math.min(24, n + 1))}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Frequência — mesma correção */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Frequência (dias)</label>
            <div className="flex items-center gap-1">
              <button type="button"
                className="btn-3d-soft h-9 w-9 flex items-center justify-center shrink-0"
                onClick={() => setFrequencia(n => Math.max(1, n - 5))}>
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input type="number" min={1} max={365} value={frequencia}
                onChange={e => setFrequencia(Math.max(1, parseInt(e.target.value) || 30))}
                className="field-engraved text-center w-16 text-sm font-black" />
              <button type="button"
                className="btn-3d-soft h-9 w-9 flex items-center justify-center shrink-0"
                onClick={() => setFrequencia(n => n + 5)}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Data início */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Primeira Entrega</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              className="field-engraved w-full" />
          </div>

          {/* Salvar */}
          <div className="space-y-1">
            {/* Spacer invisível para alinhar o botão na mesma baseline que os campos com label */}
            <div className="text-[10px] opacity-0 select-none" aria-hidden>·</div>
            <Button
              className="btn-3d w-full gap-2"
              onClick={salvar}
              disabled={salvando || !clienteSelId || !nomePrograma.trim()}
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Programa
            </Button>
          </div>
        </div>

        {/* Linha 3: mensalidade toggle — Padrão 5 (Switch em sulco concave-3d) */}
        <div className="px-6 py-4">
          <div className="flex items-start gap-4 flex-wrap">

            {/* Toggle mensalidade — ToggleWell */}
            <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
              <Switch
                id="sw-mensalidade"
                checked={temMensalidade}
                onCheckedChange={setTemMensalidade}
              />
              <label
                htmlFor="sw-mensalidade"
                className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-black cursor-pointer select-none"
              >
                <Banknote className="w-4 h-4 text-muted-foreground" />
                Programa com Mensalidade
              </label>
            </div>

            {/* Campos de mensalidade — Kaizen: items-end + labels iguais + R$ embutido */}
            {temMensalidade && (
              <div className="flex items-end gap-3 flex-wrap animate-in fade-in slide-in-from-left-4 duration-300">

                {/* Valor R$/mês — prefixo "R$" absoluto dentro do field */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Valor R$/mês</label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold select-none pointer-events-none">R$</span>
                    <input type="number" min={0} value={valorMes}
                      onChange={e => setValorMes(parseFloat(e.target.value) || 0)}
                      className="field-engraved w-28 pl-7 text-sm font-bold" />
                  </div>
                </div>

                {/* Vencimento */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Vencimento (dia)</label>
                  <input type="number" min={1} max={28} value={diaVencimento}
                    onChange={e => setDiaVencimento(parseInt(e.target.value) || 10)}
                    className="field-engraved w-16 text-sm font-bold text-center" />
                </div>

                {/* Toggle bloquear — ToggleWell com spacer de label */}
                <div className="space-y-1">
                  <div className="text-[10px] opacity-0 select-none" aria-hidden>·</div>
                  <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
                    <Switch
                      id="sw-bloquear"
                      checked={bloquearSemPagto}
                      onCheckedChange={setBloquearSemPagto}
                    />
                    <label
                      htmlFor="sw-bloquear"
                      className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-black cursor-pointer select-none"
                    >
                      <AlertCircle className={cn("w-3.5 h-3.5", bloquearSemPagto ? "text-rose-600" : "text-muted-foreground")} />
                      {bloquearSemPagto ? "Bloqueada sem pagamento" : "Liberar sem checar pagamento"}
                    </label>
                  </div>
                </div>

                {/* Resumo do plano */}
                <div className="space-y-1">
                  <div className="text-[10px] opacity-0 select-none" aria-hidden>·</div>
                  <div className="screen-3d px-3 py-2 text-sm whitespace-nowrap">
                    <span className="font-black text-primary">{fmtBRL(valorMes)}</span>
                    <span className="text-muted-foreground text-xs">/mês · dia {diaVencimento}</span>
                    {bloquearSemPagto && (
                      <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                        ⚠ Retida até pagamento
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Aviso de plano */}
          {temMensalidade && bloquearSemPagto && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex gap-2 items-start">
              <Bell className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <strong>Comunicação automática ao cliente:</strong>{" "}
                Quando inadimplente, o sistema enviará aviso via e-mail e WhatsApp informando que a liberação da fórmula
                estará retida até a quitação da mensalidade em atraso ({fmtBRL(valorMes)}).
                O cliente poderá pagar pelo Portal do Paciente.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DIVISOR [1] — PRESCRIÇÃO DE FÓRMULAS
      ══════════════════════════════════════════════════════════════════ */}
      <DivisorBloco
        numero={1}
        titulo="Prescrição de Fórmulas Magistrais"
        subtitulo="Ferramenta completa — catálogo, farmácias, classes ANVISA, desmembramento"
        cor="emerald"
        icon={FlaskConical}
      />

      {/* ── Barra de emissão rápida ICP-Brasil ───────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="w-4 h-4 text-emerald-700 shrink-0" />
          <div>
            <div className="text-[11px] uppercase tracking-widest font-black text-emerald-800 leading-none">
              Emissão Rápida ICP-Brasil
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Dr. Caio — CRM SP 125.475 · Certificado digital ativo · Carlucia Santos Fernandes
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            className="btn-3d gap-2 text-sm"
            onClick={() => { setEmitirResultado(null); setEmitirFormula({ nome: "", dose: "", posologia: "", via: "oral" }); setEmitirAberto(true); }}
            title="Motor único — lê o modelo ativo do banco"
          >
            <FileText className="w-4 h-4" />
            Emitir Receituário
          </Button>
          <Button
            className="btn-3d-soft gap-2 text-sm"
            disabled={gerarLoading}
            onClick={() => { void gerarPdfVisual(); }}
            title="Puppeteer server-side — fiel ao template HTML"
          >
            {gerarLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            PDF Visual
          </Button>
        </div>
      </div>

      {/* ── Modal: emissão rápida ─────────────────────────────────────── */}
      {emitirAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="panel-3d w-full max-w-lg space-y-4 p-6">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-widest font-black text-muted-foreground">Receituário de Controle Especial</div>
                <div className="text-base font-black mt-0.5">Assinatura ICP-Brasil</div>
              </div>
              <button type="button" className="btn-3d-soft p-1.5" onClick={() => setEmitirAberto(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Paciente — fixo */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Paciente</div>
              <div className="screen-3d px-3 py-2 text-sm">
                <span className="font-bold">CARLUCIA SANTOS FERNANDES</span>
                <span className="text-muted-foreground ml-2 text-xs">CPF 024.862.801-11</span>
              </div>
            </div>

            {/* Médico — fixo */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Médico Responsável</div>
              <div className="screen-3d px-3 py-2 text-sm">
                <span className="font-bold">Dr. Caio Henrique Fernandes Pádua</span>
                <span className="text-muted-foreground ml-2 text-xs">CRM SP 125.475</span>
              </div>
            </div>

            {/* Fórmula */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">
                Fórmula / Medicamento <span className="text-rose-500">*</span>
              </label>
              <input
                className="field-engraved w-full text-sm"
                placeholder="Nome da fórmula magistral ou medicamento"
                value={emitirFormula.nome}
                onChange={e => setEmitirFormula(f => ({ ...f, nome: e.target.value }))}
                autoFocus
              />
            </div>

            {/* Dose + Posologia */}
            <div className="flex gap-3">
              <div className="space-y-1 flex-1">
                <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Dose</label>
                <input
                  className="field-engraved w-full text-sm"
                  placeholder="ex: 500mg"
                  value={emitirFormula.dose}
                  onChange={e => setEmitirFormula(f => ({ ...f, dose: e.target.value }))}
                />
              </div>
              <div className="space-y-1 flex-1">
                <label className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">Posologia</label>
                <input
                  className="field-engraved w-full text-sm"
                  placeholder="ex: 1 comprimido ao dia"
                  value={emitirFormula.posologia}
                  onChange={e => setEmitirFormula(f => ({ ...f, posologia: e.target.value }))}
                />
              </div>
            </div>

            {/* Resultado */}
            {emitirResultado && (
              <div className={cn(
                "p-3 rounded text-sm flex items-start gap-2 border",
                emitirResultado.ok
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-rose-50 text-rose-800 border-rose-200",
              )}>
                {emitirResultado.ok
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                  : <AlertCircle  className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />}
                <div>
                  {emitirResultado.ok ? (
                    <>
                      <div className="font-bold">PDF gerado e assinado com sucesso!</div>
                      {emitirResultado.driveUrl && (
                        <a
                          href={emitirResultado.driveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline flex items-center gap-1 mt-1 text-emerald-700 font-semibold"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Abrir no Google Drive
                        </a>
                      )}
                      {emitirResultado.emailSent && (
                        <div className="text-xs mt-1 text-emerald-600">E-mail enviado ao Dr. Caio</div>
                      )}
                    </>
                  ) : (
                    <div>{emitirResultado.error}</div>
                  )}
                </div>
              </div>
            )}

            {/* Ações */}
            <div className="flex justify-end gap-2 pt-1 border-t border-border/30">
              <button
                type="button"
                className="btn-3d-soft px-4 py-2 text-sm"
                onClick={() => { setEmitirAberto(false); setEmitirResultado(null); }}
              >
                Fechar
              </button>
              <Button
                className="btn-3d gap-2 text-sm"
                disabled={emitirLoading || !emitirFormula.nome.trim()}
                onClick={emitirReceita}
              >
                {emitirLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <FileText className="w-4 h-4" />}
                {emitirLoading ? "Gerando PDF..." : "Gerar e Assinar PDF"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bloco 1: Prescrição (ferramenta original completa) ────────── */}
      <div className="panel-3d overflow-hidden border-l-4 border-l-emerald-600">
        {!clienteSelId ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <FlaskConical className="w-8 h-8 opacity-30" />
            <p className="text-sm font-semibold">Selecione um cliente no painel de configuração acima para habilitar a prescrição.</p>
          </div>
        ) : (
          <div className="p-4">
            <PrescricaoPage clientId={clienteSelId} embedded={true} />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DIVISOR [2] — SOLICITAÇÃO DE EXAMES
      ══════════════════════════════════════════════════════════════════ */}
      <DivisorBloco
        numero={2}
        titulo="Solicitação de Exames"
        subtitulo="Ferramenta completa — catálogo, blocos, PDF por tipo, e-mail, WhatsApp"
        cor="amber"
        icon={Microscope}
      />

      {/* ── Bloco 2: Exames (ferramenta original completa) ───────────── */}
      <div className="panel-3d overflow-hidden border-l-4 border-l-amber-600">
        {!clienteSelId ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Microscope className="w-8 h-8 opacity-30" />
            <p className="text-sm font-semibold">Selecione um cliente no painel de configuração acima para habilitar os exames.</p>
          </div>
        ) : (
          <div className="p-4">
            <ExamesPage clientId={clienteSelId} embedded={true} initialViewMode="lista" />
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DIVISOR [3] — LINHA DO TEMPO
      ══════════════════════════════════════════════════════════════════ */}
      <DivisorBloco
        numero={3}
        titulo="Linha do Tempo de Entregas"
        subtitulo="Clique num nó para atribuir fórmulas e exames — independentes por entrega"
        cor="sky"
        icon={Calendar}
      />

      {/* ── Bloco 3: Linha do tempo ──────────────────────────────────── */}
      <div className="panel-3d overflow-hidden border-l-4 border-l-sky-600">
        {/* Trilha de navegação */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-black flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            {nNos} entregas · a cada {frequencia} dias
            {temMensalidade && (
              <span className="ml-2 px-2 py-0.5 rounded border border-primary/40 text-primary text-[10px]">
                {fmtBRL(valorMes)}/mês
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            <button type="button" className="btn-3d-soft p-1.5"
              onClick={() => timelineRef.current && (timelineRef.current.scrollLeft -= 240)}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" className="btn-3d-soft p-1.5"
              onClick={() => timelineRef.current && (timelineRef.current.scrollLeft += 240)}>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button type="button" className="btn-3d-soft p-1.5 ml-1"
              onClick={() => setNNos(n => Math.min(24, n + 1))}
              title="Adicionar entrega">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Painel fino da trilha */}
        <div
          ref={timelineRef}
          className="overflow-x-auto"
          style={{ scrollBehavior: "smooth" }}
        >
          <div style={{ minWidth: Math.max(800, nos.length * 180), padding: "0 48px" }}>
            {/* Trilha central com nós */}
            <div className="relative pt-8 pb-6">
              {/* Linha horizontal do trilho */}
              <div
                className="absolute bg-border/70"
                style={{
                  height: 3, top: "51px",
                  left: 48, right: 48,
                }}
              />

              {/* Nós */}
              <div className="flex items-start justify-between relative">
                {nos.map(n => (
                  <NoTimeline
                    key={n.id}
                    no={n}
                    ativo={noAtivo === n.id}
                    onClick={() => setNoAtivo(noAtivo === n.id ? null : n.id)}
                    catalogoFormulas={catalogoF}
                    catalogoExames={catalogoX}
                    onAddFormula={addFormula}
                    onUpdateFormula={updateFormula}
                    onRemoveFormula={removeFormula}
                    onAddExame={addExame}
                    onUpdateExame={updateExame}
                    onRemoveExame={removeExame}
                    onUpdateNo={updateNo}
                    temPagamento={temMensalidade}
                  />
                ))}
              </div>
            </div>

            {/* Cards de conteúdo abaixo da trilha */}
            <div className="flex gap-3 pb-6 border-t border-border/30 pt-4 px-0">
              {nos.map(n => {
                const temF = n.formulas.length > 0;
                const temX = n.exames.length > 0;
                if (!temF && !temX) return (
                  <div key={n.id} style={{ minWidth: 160 }}
                    className="shrink-0 rounded border border-dashed border-border/40 px-3 py-2 text-center text-[10px] text-muted-foreground/50">
                    E{n.numero} — vazio
                  </div>
                );
                return (
                  <div
                    key={n.id}
                    style={{ minWidth: 160 }}
                    className={cn(
                      "shrink-0 rounded border px-3 py-2 space-y-1.5 cursor-pointer transition-colors",
                      noAtivo === n.id
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40 hover:bg-muted/30",
                    )}
                    onClick={() => setNoAtivo(noAtivo === n.id ? null : n.id)}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                      E{n.numero} · {fmtData(n.dataLiberacao)}
                    </div>
                    {temF && (
                      <div className="space-y-0.5">
                        <div className="text-[9px] text-emerald-700 font-black uppercase tracking-wider">Fórmulas</div>
                        {n.formulas.map(f => (
                          <div key={f.id} className="text-xs truncate flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                            {f.nome || <em className="text-muted-foreground">sem nome</em>}
                          </div>
                        ))}
                      </div>
                    )}
                    {temX && (
                      <div className="space-y-0.5">
                        <div className="text-[9px] text-amber-700 font-black uppercase tracking-wider">Exames</div>
                        {n.exames.map(x => (
                          <div key={x.id} className="text-xs truncate flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                            {x.nome}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Rodapé com legenda de cores */}
        <div className="px-5 py-3 border-t border-border/30 flex items-center gap-5 text-[10px] text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-emerald-500" /> Só fórmulas</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-amber-500" /> Só exames</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-primary" /> Fórmulas + exames</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-border/60" /> Vazio (sem conteúdo)</div>
          {temMensalidade && (
            <>
              <div className="w-px h-3 bg-border/40" />
              <div className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> Pago</div>
              <div className="flex items-center gap-1.5 text-amber-700"><Clock className="w-3 h-3" /> Pendente</div>
              <div className="flex items-center gap-1.5 text-rose-700"><AlertCircle className="w-3 h-3" /> Inadimplente</div>
            </>
          )}
          <div className="ml-auto text-[10px] italic">Clique em qualquer nó ou card para editar</div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DIVISOR [4] — PROGRAMAS SALVOS
      ══════════════════════════════════════════════════════════════════ */}
      <DivisorBloco
        numero={4}
        titulo="Programas Salvos"
        subtitulo="Agendas ativas do cliente selecionado · worker processa automaticamente"
        cor="primary"
        icon={Save}
      />

      {/* ── Bloco 4: Agendas salvas ──────────────────────────────────── */}
      <div className="panel-3d overflow-hidden border-l-4 border-l-primary/60">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
          <div
            role="button" tabIndex={0}
            onClick={() => setAgendasOpen(v => !v)}
            onKeyDown={e => e.key === "Enter" && setAgendasOpen(v => !v)}
            className="flex items-center gap-2 cursor-pointer select-none flex-1"
          >
            <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">
              {agendas.length} programa(s) {clienteSel ? `de ${clienteSel.name}` : ""}
            </span>
            {agendasOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                         : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
          <Button
            className="btn-3d-soft gap-1 text-xs px-3 py-1.5 h-auto"
            onClick={() => apiFetch("/api/receituario/processar", { method: "POST" })
              .then(() => toast({ title: "Worker executado" }))
              .catch(() => toast({ title: "Erro", variant: "destructive" }))}
          >
            <Play className="w-3.5 h-3.5" /> Processar Hoje
          </Button>
        </div>

        {agendasOpen && (
          <div className="px-5 py-4 space-y-3">
            {!clienteSel && <p className="text-sm text-muted-foreground italic text-center py-6">Selecione um cliente para ver os programas salvos.</p>}
            {clienteSel && carregando && (
              <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            )}
            {clienteSel && !carregando && agendas.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-6">
                Nenhum programa salvo. Configure e salve acima.
              </p>
            )}
            {agendas.map(ag => (
              <div key={ag.id} className="panel-3d-sub overflow-hidden">
                <div
                  role="button" tabIndex={0}
                  onClick={() => setExpandidas(p => { const s = new Set(p); s.has(ag.id) ? s.delete(ag.id) : s.add(ag.id); return s; })}
                  onKeyDown={e => e.key === "Enter" && setExpandidas(p => { const s = new Set(p); s.has(ag.id) ? s.delete(ag.id) : s.add(ag.id); return s; })}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-muted/10 transition-colors"
                >
                  <div className={cn("w-2 h-8 rounded-full shrink-0", ag.ativo ? "bg-emerald-500" : "bg-slate-300")} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{ag.nome}</div>
                    <div className="text-[11px] text-muted-foreground">A cada {ag.frequenciaPadraoDias}d · {(ag.slots ?? []).length} slot(s)</div>
                  </div>
                  {expandidas.has(ag.id) ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                                          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>
                {expandidas.has(ag.id) && (
                  <div className="border-t border-border/30 px-4 py-3 space-y-1.5">
                    {(ag.slots ?? []).length === 0 && <p className="text-xs text-muted-foreground italic">Sem slots.</p>}
                    {(ag.slots ?? []).map(s => (
                      <div key={s.id} className={cn(
                        "flex items-center gap-3 px-3 py-1.5 rounded border text-sm",
                        s.status === "ENTREGUE" ? "border-emerald-200 text-emerald-700"
                          : s.status === "LIBERADA" ? "border-sky-200 text-sky-700"
                          : s.status === "ERRO" ? "border-rose-200 text-rose-700"
                          : "border-border/50 text-muted-foreground",
                      )}>
                        <span className="font-mono text-xs border px-1.5 py-0.5 rounded shrink-0">{s.status}</span>
                        <span className="font-medium flex-1 truncate">{s.nome}</span>
                        <span className="text-xs shrink-0">{s.dataLiberacao}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
