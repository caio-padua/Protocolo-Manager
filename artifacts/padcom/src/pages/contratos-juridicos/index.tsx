import { useState, useEffect, useCallback } from "react";
import {
  FileSignature, RefreshCw, Sparkles, Edit3, Eye,
  Save, Send, Copy, CheckCircle2, Clock, X,
  ShieldCheck, BookOpen, FlaskConical, Syringe,
  Lock, DollarSign, Camera, FileText, ChevronDown, ChevronRight,
  User, Plus, Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeader(): HeadersInit {
  const token = localStorage.getItem("collab_token") || "";
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...authHeader(), ...(opts?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

type Placeholder = { key: string; label: string; exemplo: string };
type Caderno = {
  id: number | null;
  codigo: string;
  titulo: string;
  tipoDoc: string;
  corpoHtml: string;
  semeado: boolean;
  ativo: boolean;
  placeholders?: Placeholder[];
  atualizadoEm?: string;
};
type ClienteLite = {
  id: number;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
};

// ─── CATEGORIAS ────────────────────────────────────────────────────────────────
type Categoria = {
  id: string;
  label: string;
  descricao: string;
  icon: typeof FileSignature;
  cor: string;
  corBg: string;
  codigos: string[];
};

const CATEGORIAS: Categoria[] = [
  {
    id: "fundamentos",
    label: "Fundamentos do Protocolo",
    descricao: "Documentos‑base obrigatórios para qualquer protocolo terapêutico",
    icon: BookOpen,
    cor: "text-blue-700",
    corBg: "bg-blue-500/10 border-blue-400/30",
    codigos: ["CGLO", "TCLE", "CTCLE_G"],
  },
  {
    id: "vias",
    label: "Consentimentos por Via de Administração",
    descricao: "Termos específicos para cada via: IV, IM, Implante e Fórmulas Magistrais",
    icon: Syringe,
    cor: "text-teal-700",
    corBg: "bg-teal-500/10 border-teal-400/30",
    codigos: ["CEND", "CIMU", "CIMP", "CFOR"],
  },
  {
    id: "substancias",
    label: "Substâncias Especiais",
    descricao: "Peptídeos, GLP‑1/incretinas, secretagogos de GH e agentes lipolíticos",
    icon: FlaskConical,
    cor: "text-purple-700",
    corBg: "bg-purple-500/10 border-purple-400/30",
    codigos: ["CSUB", "CINC", "CPEP", "CLIP"],
  },
  {
    id: "estetica",
    label: "Procedimentos Estéticos",
    descricao: "Consentimentos para estética invasiva e por tecnologia",
    icon: Zap,
    cor: "text-rose-700",
    corBg: "bg-rose-500/10 border-rose-400/30",
    codigos: ["CEIN", "CETE"],
  },
  {
    id: "dados",
    label: "Proteção de Dados e Privacidade",
    descricao: "LGPD, sigilo médico, política de privacidade e assinatura eletrônica",
    icon: Lock,
    cor: "text-emerald-700",
    corBg: "bg-emerald-500/10 border-emerald-400/30",
    codigos: ["CLGPD", "CPRIV", "CDIG"],
  },
  {
    id: "comercial",
    label: "Contratos Comerciais e Garantias",
    descricao: "Ciência financeira, obrigação de meio e limites de resultado",
    icon: DollarSign,
    cor: "text-amber-700",
    corBg: "bg-amber-500/10 border-amber-400/30",
    codigos: ["CFIN", "CGAR"],
  },
  {
    id: "autorizacoes",
    label: "Autorizações e Registros",
    descricao: "Uso de imagem e Registro de Assistência Sistêmica com valor jurídico",
    icon: Camera,
    cor: "text-slate-700",
    corBg: "bg-slate-500/10 border-slate-400/30",
    codigos: ["CIMG", "RAS-JUR"],
  },
];

const COR_BADGE: Record<string, string> = {
  CGLO:     "bg-blue-100 text-blue-800 border-blue-300",
  TCLE:     "bg-blue-100 text-blue-800 border-blue-300",
  CTCLE_G:  "bg-blue-100 text-blue-800 border-blue-300",
  CEND:     "bg-teal-100 text-teal-800 border-teal-300",
  CIMU:     "bg-teal-100 text-teal-800 border-teal-300",
  CIMP:     "bg-teal-100 text-teal-800 border-teal-300",
  CFOR:     "bg-teal-100 text-teal-800 border-teal-300",
  CSUB:     "bg-purple-100 text-purple-800 border-purple-300",
  CINC:     "bg-purple-100 text-purple-800 border-purple-300",
  CPEP:     "bg-purple-100 text-purple-800 border-purple-300",
  CLIP:     "bg-purple-100 text-purple-800 border-purple-300",
  CEIN:     "bg-rose-100 text-rose-800 border-rose-300",
  CETE:     "bg-rose-100 text-rose-800 border-rose-300",
  CLGPD:    "bg-emerald-100 text-emerald-800 border-emerald-300",
  CPRIV:    "bg-emerald-100 text-emerald-800 border-emerald-300",
  CDIG:     "bg-emerald-100 text-emerald-800 border-emerald-300",
  CFIN:     "bg-amber-100 text-amber-800 border-amber-300",
  CGAR:     "bg-amber-100 text-amber-800 border-amber-300",
  CIMG:     "bg-slate-100 text-slate-800 border-slate-300",
  "RAS-JUR":"bg-slate-100 text-slate-800 border-slate-300",
};

function fmtData(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function substituirVariaveis(html: string, dados: Record<string, string>): string {
  let out = html;
  for (const [k, v] of Object.entries(dados)) {
    out = out.replaceAll(`{{${k}}}`, v || `<span style="color:#c00;font-weight:bold">{{${k}}}</span>`);
  }
  return out;
}

function stripHtmlPreview(html: string, chars = 180): string {
  const txt = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return txt.length > chars ? txt.slice(0, chars) + "…" : txt;
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export default function ContratosJuridicos() {
  const { toast } = useToast();
  const [cadernos, setCadernos] = useState<Caderno[]>([]);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semeando, setSemeando] = useState(false);

  // Categorias expandidas (padrão: todas abertas)
  const [expandidas, setExpandidas] = useState<Set<string>>(
    new Set(CATEGORIAS.map((c) => c.id))
  );

  // Modal editor
  const [cadSelecionado, setCadSelecionado] = useState<Caderno | null>(null);
  const [modo, setModo] = useState<"editar" | "preview">("preview");
  const [htmlEditado, setHtmlEditado] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Modal emissão
  const [modalEmissao, setModalEmissao] = useState(false);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [busca, setBusca] = useState("");
  const [clienteSel, setClienteSel] = useState<ClienteLite | null>(null);
  const [emitindo, setEmitindo] = useState(false);
  const [canais, setCanais] = useState<string[]>(["WHATSAPP", "EMAIL"]);

  // Dados do preview (substituição de variáveis)
  const [dadosPreview] = useState<Record<string, string>>({
    "cliente.nome":           "Carlucia da Silva",
    "cliente.cpf":            "000.000.000-00",
    "cliente.dataNascimento": "01/01/1980",
    "cliente.email":          "carlucia@email.com",
    "cliente.telefone":       "(11) 99999-9999",
    "medico.nome":            "Dr. Caio Pádua",
    "medico.crm":             "123456",
    "medico.uf":              "SP",
    "protocolo.titulo":       "Protocolo Longevidade Plena",
    "protocolo.substancias":  "NAD+, Glutationa, Vitamina C IV, Ozônio IM, GLP-1 SC, Testosterona (Implante)",
    "protocolo.vias":         "IV, IM, SC, Implante",
    "protocolo.dataInicio":   "01/08/2026",
    "protocolo.totalSessoes": "12",
    "protocolo.sessoes":      "12",
    "protocolo.valorTotal":   "R$ 14.400,00",
    "protocolo.valor":        "R$ 14.400,00",
    "pagamento.metodo":       "PIX",
    "pagamento.parcelas":     "1",
    "clinica.nome":           "Clínica Tatuapé",
    "clinica.endereco":       "Rua Tuiuti, 1000 — Tatuapé, São Paulo — SP",
    "clinica.email":          "contato@clinicapadua.com.br",
    "data.hoje":              new Date().toLocaleDateString("pt-BR"),
  });

  // ─── CARREGAR ──────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const d = await apiFetch("/api/cadernos-juridicos");
      setCadernos(d.cadernos || []);
      setPlaceholders(d.placeholders || []);
    } catch {
      toast({ title: "Erro ao carregar cadernos", variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  // ─── SEMEAR ────────────────────────────────────────────────────────────────
  const semear = async () => {
    setSemeando(true);
    try {
      const d = await apiFetch("/api/cadernos-juridicos/seed", { method: "POST" });
      toast({ title: `${d.inseridos} cadernos semeados com sucesso` });
      await carregar();
    } catch {
      toast({ title: "Erro ao semear", variant: "destructive" });
    } finally {
      setSemeando(false);
    }
  };

  // ─── ABRIR EDITOR ──────────────────────────────────────────────────────────
  const abrirEditor = (c: Caderno) => {
    setCadSelecionado(c);
    setHtmlEditado(c.corpoHtml || "");
    setModo("preview");
  };

  // ─── SALVAR ────────────────────────────────────────────────────────────────
  const salvar = async () => {
    if (!cadSelecionado) return;
    setSalvando(true);
    try {
      const d = await apiFetch(`/api/cadernos-juridicos/${cadSelecionado.codigo}`, {
        method: "PUT",
        body: JSON.stringify({ corpoHtml: htmlEditado }),
      });
      toast({ title: "Caderno salvo" });
      setCadSelecionado(d.caderno);
      await carregar();
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  // ─── ABRIR MODAL EMISSÃO ────────────────────────────────────────────────────
  const abrirEmissao = async () => {
    setModalEmissao(true);
    try {
      const d = await apiFetch("/api/clients?limit=200");
      setClientes(Array.isArray(d) ? d : (d.clients || d.data || []));
    } catch { setClientes([]); }
  };

  // ─── EMITIR ────────────────────────────────────────────────────────────────
  const emitir = async () => {
    if (!clienteSel || !cadSelecionado) return;
    setEmitindo(true);
    try {
      await apiFetch("/api/assinaturas/enviar", {
        method: "POST",
        body: JSON.stringify({
          templateId: cadSelecionado.id,
          tipoDoc: cadSelecionado.tipoDoc,
          titulo: cadSelecionado.titulo,
          pacienteId: clienteSel.id,
          canaisDistribuir: canais,
          dadosHidratacao: {
            "cliente.nome":     clienteSel.name,
            "cliente.cpf":      clienteSel.cpf || "",
            "cliente.email":    clienteSel.email || "",
            "cliente.telefone": clienteSel.phone || "",
          },
        }),
      });
      toast({ title: `${cadSelecionado.titulo} enviado para ${clienteSel.name}` });
      setModalEmissao(false);
      setClienteSel(null);
    } catch (e) {
      toast({
        title: `Erro: ${e instanceof Error ? e.message : "desconhecido"}`,
        variant: "destructive",
      });
    } finally {
      setEmitindo(false);
    }
  };

  // ─── DERIVADOS ─────────────────────────────────────────────────────────────
  const mapa = new Map(cadernos.map((c) => [c.codigo, c]));
  const totalSemeados = cadernos.filter((c) => c.semeado).length;
  const totalCadernos = cadernos.length || 20;
  const todosSemeados = totalSemeados >= totalCadernos && totalCadernos > 0;
  const clientesFiltrados = clientes.filter(
    (c) => c.name.toLowerCase().includes(busca.toLowerCase()) || (c.cpf || "").includes(busca)
  );

  const toggleCategoria = (id: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-12">

      {/* ── CABEÇALHO ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="w-6 h-6 text-primary" />
            Cadernos Jurídicos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCadernos} contratos organizados em {CATEGORIAS.length} categorias — edite e emita para assinatura digital
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          {!todosSemeados && (
            <Button size="sm" onClick={semear} disabled={semeando}>
              <Sparkles className="w-4 h-4 mr-1.5" />
              {semeando ? "Semeando…" : `Semear ${totalCadernos - totalSemeados} cadernos`}
            </Button>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",    valor: totalCadernos,                                              cor: "text-foreground" },
          { label: "Semeados", valor: totalSemeados,                                              cor: "text-emerald-600" },
          { label: "Pendentes",valor: Math.max(0, totalCadernos - totalSemeados),                 cor: "text-amber-600" },
          { label: "Ativos",   valor: cadernos.filter((c) => c.semeado && c.ativo).length,        cor: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-md border bg-card p-3 text-center">
            <div className={`text-2xl font-bold ${s.cor}`}>{s.valor}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── CATEGORIAS ── */}
      {carregando ? (
        <div className="space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {CATEGORIAS.map((cat) => {
            const Icon = cat.icon;
            const aberta = expandidas.has(cat.id);
            const cadsDaCategoria = cat.codigos.map((cod) => mapa.get(cod)).filter(Boolean) as Caderno[];
            const semeadosNaCategoria = cadsDaCategoria.filter((c) => c.semeado).length;

            return (
              <div key={cat.id} className={`rounded-xl border ${cat.corBg} overflow-hidden`}>

                {/* Cabeçalho da categoria */}
                <button
                  onClick={() => toggleCategoria(cat.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-black/5 transition-colors text-left"
                >
                  <div className={`p-2 rounded-lg bg-white/70 ${cat.cor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className={`font-semibold text-base ${cat.cor}`}>{cat.label}</h2>
                      <span className="text-xs bg-white/60 border rounded px-1.5 py-0.5 text-muted-foreground">
                        {semeadosNaCategoria}/{cat.codigos.length}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{cat.descricao}</p>
                  </div>
                  {aberta
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Cards dos cadernos */}
                {aberta && (
                  <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {cat.codigos.map((cod) => {
                      const c = mapa.get(cod);
                      if (!c) return (
                        <div key={cod} className="rounded-lg border bg-white/40 p-4 text-center text-sm text-muted-foreground">
                          <Clock className="w-5 h-5 mx-auto mb-1 opacity-40" />
                          Caderno <strong>{cod}</strong> não encontrado
                        </div>
                      );

                      const preview = stripHtmlPreview(c.corpoHtml || "");
                      const badgeCls = COR_BADGE[c.codigo] || "bg-gray-100 text-gray-700 border-gray-300";

                      return (
                        <div
                          key={c.codigo}
                          className="rounded-lg border bg-white/70 hover:bg-white transition-all shadow-sm flex flex-col"
                        >
                          {/* Topo do card */}
                          <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 ${badgeCls}`}>
                                {c.codigo}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {c.tipoDoc}
                              </Badge>
                            </div>
                            {c.semeado
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              : <Clock className="w-4 h-4 text-amber-400 shrink-0" />}
                          </div>

                          {/* Título */}
                          <div className="px-4 pb-2">
                            <h3 className="text-sm font-semibold leading-snug line-clamp-2">{c.titulo}</h3>
                          </div>

                          {/* Preview do texto */}
                          <div className="px-4 pb-3 flex-1">
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                              {preview || "Sem conteúdo — clique em Editar para redigir."}
                            </p>
                          </div>

                          {/* Data */}
                          {c.semeado && c.atualizadoEm && (
                            <div className="px-4 pb-2">
                              <span className="text-[10px] text-muted-foreground">
                                Atualizado: {fmtData(c.atualizadoEm)}
                              </span>
                            </div>
                          )}

                          {/* Ações */}
                          <div className="border-t px-3 py-2 flex items-center gap-2 bg-white/50 rounded-b-lg">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 h-7 text-xs"
                              onClick={() => { abrirEditor(c); setModo("preview"); }}
                            >
                              <Eye className="w-3 h-3 mr-1" /> Ver contrato
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => { abrirEditor(c); setModo("editar"); }}
                            >
                              <Edit3 className="w-3 h-3 mr-1" /> Editar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* MODAL EDITOR / PREVIEW DE CADERNO */}
      {cadSelecionado && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-end">
          <div className="bg-background w-full max-w-4xl h-full flex flex-col shadow-2xl">

            {/* Header do modal */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-b bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className={`text-[11px] font-bold shrink-0 ${COR_BADGE[cadSelecionado.codigo] || ""}`}>
                  {cadSelecionado.codigo}
                </Badge>
                <span className="text-sm font-semibold truncate">{cadSelecionado.titulo}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant={modo === "preview" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setModo("preview")}
                >
                  <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                </Button>
                <Button
                  variant={modo === "editar" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setModo("editar")}
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCadSelecionado(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Corpo do modal */}
            <div className="flex-1 overflow-auto">
              {modo === "preview" ? (
                /* PREVIEW — documento renderizado com variáveis preenchidas */
                <div className="p-6">
                  <div className="max-w-3xl mx-auto rounded-lg border bg-white p-8 shadow-sm">
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: substituirVariaveis(htmlEditado || cadSelecionado.corpoHtml || "", dadosPreview),
                      }}
                    />
                  </div>
                </div>
              ) : (
                /* EDITOR */
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] h-full divide-x">
                  <div className="p-4 space-y-2 flex flex-col">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Use <code className="bg-muted px-1 rounded">{"{{variavel}}"}</code> para campos dinâmicos.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto shrink-0"
                        onClick={() => {
                          void navigator.clipboard.writeText(htmlEditado || cadSelecionado.corpoHtml || "");
                          toast({ title: "HTML copiado" });
                        }}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
                      </Button>
                    </div>
                    <textarea
                      value={htmlEditado}
                      onChange={(e) => setHtmlEditado(e.target.value)}
                      className="flex-1 w-full rounded-md border bg-background font-mono text-xs p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[500px]"
                      spellCheck={false}
                    />
                  </div>

                  {/* Variáveis */}
                  <div className="p-4 space-y-2 overflow-y-auto">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      Variáveis disponíveis
                    </p>
                    {(placeholders.length > 0 ? placeholders : cadSelecionado.placeholders || []).map((p) => (
                      <div key={p.key} className="space-y-0.5">
                        <button
                          onClick={() => setHtmlEditado((prev) => (prev || cadSelecionado.corpoHtml || "") + `{{${p.key}}}`)}
                          className="w-full text-left px-2 py-1.5 rounded border text-[11px] font-mono hover:bg-primary/10 hover:border-primary/40 transition-colors group"
                        >
                          <span className="text-primary font-semibold">{`{{${p.key}}}`}</span>
                          <Plus className="w-3 h-3 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        <p className="text-[10px] text-muted-foreground pl-2">{p.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do modal */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-muted/20 shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {cadSelecionado.semeado
                  ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Semeado no banco</>
                  : <><Clock className="w-3.5 h-3.5 text-amber-500" /> Não semeado</>}
                {cadSelecionado.atualizadoEm && (
                  <span>· {fmtData(cadSelecionado.atualizadoEm)}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={salvar} disabled={salvando}>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {salvando ? "Salvando…" : "Salvar alterações"}
                </Button>
                <Button
                  size="sm"
                  onClick={abrirEmissao}
                  disabled={!cadSelecionado.semeado}
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Emitir para Cliente
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* MODAL EMISSÃO */}
      {modalEmissao && cadSelecionado && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div className="bg-card rounded-xl border shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                Emitir: {cadSelecionado.titulo}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setModalEmissao(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-5 space-y-4">

              {/* Busca de cliente */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Selecionar Cliente
                </label>
                <Input
                  placeholder="Buscar por nome ou CPF…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border bg-muted/20 p-1">
                  {clientesFiltrados.slice(0, 25).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setClienteSel(c)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        clienteSel?.id === c.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                      }`}
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-[11px] opacity-70">{c.cpf || "sem CPF"} · {c.email || "sem e-mail"}</div>
                    </button>
                  ))}
                  {clientesFiltrados.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhum cliente encontrado</p>
                  )}
                </div>
              </div>

              {/* Canais */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Canais de envio</label>
                <div className="flex gap-2 flex-wrap">
                  {["WHATSAPP", "EMAIL", "TELEGRAM"].map((canal) => (
                    <button
                      key={canal}
                      onClick={() =>
                        setCanais((prev) =>
                          prev.includes(canal) ? prev.filter((c) => c !== canal) : [...prev, canal]
                        )
                      }
                      className={`px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                        canais.includes(canal)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      {canal}
                    </button>
                  ))}
                </div>
              </div>

              {clienteSel && (
                <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-medium">{clienteSel.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {clienteSel.email || "sem e-mail"} · {clienteSel.phone || "sem telefone"}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setModalEmissao(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={emitir} disabled={!clienteSel || emitindo}>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {emitindo ? "Enviando…" : "Enviar para Assinatura"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── NOTA DE RODAPÉ ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
        <FileText className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <strong className="text-foreground">Como usar:</strong>{" "}
          Clique em <em>"Ver contrato"</em> para visualizar o documento com dados preenchidos.
          Clique em <em>"Editar"</em> para alterar o texto HTML.
          Clique em <em>"Emitir para Cliente"</em> para enviar para assinatura digital (ZapSign ou ICP-Brasil).
          Os dados do preview são de demonstração (cliente Carlucia, protocolo Longevidade Plena).
        </div>
      </div>
    </div>
  );
}
