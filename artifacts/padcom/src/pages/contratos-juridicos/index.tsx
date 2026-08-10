import { useState, useEffect, useCallback, useMemo } from "react";
import { useListClients } from "@workspace/api-client-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { tituloProprio } from "@/lib/utils";
import {
  FileSignature, RefreshCw, Sparkles, Edit3, Eye,
  Save, X, BookOpen, FlaskConical, Syringe, Lock,
  DollarSign, Camera, FileText, ChevronDown, ChevronRight,
  Send, Loader2, Search, CheckSquare, Square,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeader(): HeadersInit {
  const t = localStorage.getItem("collab_token") || "";
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
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

// ─── Tipos ─────────────────────────────────────────────────────────────────
type Caderno = {
  id: number | null;
  codigo: string;
  titulo: string;
  tipoDoc: string;
  corpoHtml: string;
  semeado: boolean;
  ativo: boolean;
  atualizadoEm?: string;
};
type PlaceholderDef = { key: string; label: string; exemplo: string };
type ClienteLite = { id: number; name: string; cpf: string | null; email: string | null; phone: string | null };
type ProtocoloLite = { id: number; title: string; status: string; startDate: string; totalSessions: number; totalValue: number };

// ─── Categorias ────────────────────────────────────────────────────────────
type Categoria = {
  id: string;
  label: string;
  descricao: string;
  icon: typeof FileSignature;
  faixa: string;      // cor da faixa lateral 4px
  codigos: string[];
};

const CATEGORIAS: Categoria[] = [
  {
    id: "fundamentos",
    label: "Fundamentos do Protocolo",
    descricao: "Documentos-base obrigatórios para qualquer protocolo",
    icon: BookOpen,
    faixa: "bg-sky-400",
    codigos: ["CGLO", "TCLE", "CTCLE_G"],
  },
  {
    id: "vias",
    label: "Consentimentos por Via",
    descricao: "IV · IM · Implante · Fórmulas Magistrais",
    icon: Syringe,
    faixa: "bg-emerald-400",
    codigos: ["CEND", "CIMU", "CIMP", "CFOR"],
  },
  {
    id: "substancias",
    label: "Substâncias Especiais",
    descricao: "Peptídeos · GLP-1 · Secretagogos de GH · Lipolíticos",
    icon: FlaskConical,
    faixa: "bg-violet-400",
    codigos: ["CSUB", "CINC", "CPEP", "CLIP"],
  },
  {
    id: "estetica",
    label: "Procedimentos Estéticos",
    descricao: "Estética invasiva e por tecnologia",
    icon: Sparkles,
    faixa: "bg-rose-400",
    codigos: ["CEIN", "CETE"],
  },
  {
    id: "dados",
    label: "Proteção de Dados",
    descricao: "LGPD · Sigilo médico · Assinatura eletrônica",
    icon: Lock,
    faixa: "bg-emerald-500",
    codigos: ["CLGPD", "CPRIV", "CDIG"],
  },
  {
    id: "comercial",
    label: "Contratos Comerciais",
    descricao: "Ciência financeira · Obrigação de meio",
    icon: DollarSign,
    faixa: "bg-amber-400",
    codigos: ["CFIN", "CGAR"],
  },
  {
    id: "autorizacoes",
    label: "Autorizações e Registros",
    descricao: "Uso de imagem · RAS com valor jurídico",
    icon: Camera,
    faixa: "bg-slate-400",
    codigos: ["CIMG", "RAS-JUR"],
  },
];

// Substituição simples de variáveis no HTML
function hidratarHtml(html: string, dados: Record<string, string>): string {
  let out = html;
  for (const [k, v] of Object.entries(dados)) {
    out = out.replaceAll(
      `{{${k}}}`,
      v || `<span style="color:#c00;font-weight:bold">{{${k}}}</span>`,
    );
  }
  return out;
}

function stripPreview(html: string, chars = 160): string {
  const txt = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return txt.length > chars ? txt.slice(0, chars) + "…" : txt;
}

function fmtData(iso?: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

// ─── Dados de preview fixos (amostra clínica) ──────────────────────────────
const DADOS_PREVIEW: Record<string, string> = {
  "cliente.nome":           "Carlucia da Silva",
  "cliente.cpf":            "000.000.000-00",
  "cliente.dataNascimento": "01/01/1980",
  "cliente.email":          "carlucia@email.com",
  "cliente.telefone":       "(11) 99999-9999",
  "medico.nome":            "Dr. Caio Pádua",
  "medico.crm":             "123456",
  "medico.uf":              "SP",
  "protocolo.titulo":       "Protocolo Longevidade Plena",
  "protocolo.substancias":  "NAD+, Glutationa, Vitamina C IV, Ozônio IM, Testosterona (Implante)",
  "protocolo.vias":         "Endovenosa (IV), Intramuscular (IM), Implante Subcutâneo",
  "protocolo.dataInicio":   "01/08/2026",
  "protocolo.totalSessoes": "12",
  "protocolo.sessoes":      "12",
  "protocolo.valorTotal":   "R$ 14.400,00",
  "protocolo.valor":        "R$ 14.400,00",
  "pagamento.metodo":       "PIX",
  "pagamento.parcelas":     "1",
  "clinica.nome":           "Clínica Padcon · Tatuapé",
  "clinica.endereco":       "Rua Tuiuti, 1000 — Tatuapé, São Paulo — SP",
  "clinica.email":          "contato@padconconect.com.br",
  "data.hoje":              new Date().toLocaleDateString("pt-BR"),
};

// ─── Componente principal ───────────────────────────────────────────────────
export default function ContratosJuridicos() {
  const { toast } = useToast();

  // Estado dos cadernos
  const [cadernos, setCadernos]   = useState<Caderno[]>([]);
  const [placeholders, setPlaceholders] = useState<PlaceholderDef[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [semeando, setSemeando]   = useState(false);

  // Categorias expandidas
  const [expandidas, setExpandidas] = useState<Set<string>>(
    new Set(CATEGORIAS.map((c) => c.id)),
  );

  // Slide-over de edição/preview
  const [cadSel, setCadSel]       = useState<Caderno | null>(null);
  const [modo, setModo]           = useState<"ver" | "editar">("ver");
  const [htmlEdit, setHtmlEdit]   = useState("");
  const [salvando, setSalvando]   = useState(false);

  // Modal de emissão
  const [modalEmissao, setModalEmissao] = useState(false);
  const [clienteSelId, setClienteSelId] = useState<number | null>(null);
  const [protocolos, setProtocolos]     = useState<ProtocoloLite[]>([]);
  const [protocoloSel, setProtocoloSel] = useState<ProtocoloLite | null>(null);
  const [codigosEmitir, setCodigosEmitir] = useState<Set<string>>(new Set());
  const [dadosHidratacao, setDadosHidratacao] = useState<Record<string, string>>({});
  const [resolvendo, setResolvendo]     = useState(false);
  const [emitindo, setEmitindo]         = useState(false);

  const { data: allClients } = useListClients();
  const clienteSelOpts = useMemo(() => (allClients ?? []).map(cl => ({ id: cl.id, name: cl.name, cpf: cl.cpf ?? null, phone: cl.phone ?? null, photoUrl: (cl as any).photoUrl ?? null })), [allClients]);
  const clienteSel = useMemo(() => (allClients ?? []).find(cl => cl.id === clienteSelId) ?? null, [allClients, clienteSelId]);

  // ── Carregar cadernos ─────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const d = await apiFetch("/api/cadernos-juridicos");
      setCadernos(d.cadernos ?? []);
      setPlaceholders(d.placeholders ?? []);
    } catch {
      toast({ title: "Erro ao carregar cadernos", variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  // ── Semear ────────────────────────────────────────────────────────────────
  const semear = async () => {
    setSemeando(true);
    try {
      const d = await apiFetch("/api/cadernos-juridicos/seed", { method: "POST" });
      toast({ title: `${d.inseridos} cadernos semeados` });
      await carregar();
    } catch {
      toast({ title: "Erro ao semear", variant: "destructive" });
    } finally {
      setSemeando(false);
    }
  };

  // ── Abrir slide-over ──────────────────────────────────────────────────────
  const abrirVer = (c: Caderno) => {
    setCadSel(c);
    setHtmlEdit(c.corpoHtml ?? "");
    setModo("ver");
  };
  const abrirEditar = (c: Caderno) => {
    setCadSel(c);
    setHtmlEdit(c.corpoHtml ?? "");
    setModo("editar");
  };

  // ── Salvar caderno ────────────────────────────────────────────────────────
  const salvar = async () => {
    if (!cadSel) return;
    setSalvando(true);
    try {
      const d = await apiFetch(`/api/cadernos-juridicos/${cadSel.codigo}`, {
        method: "PUT",
        body: JSON.stringify({ corpoHtml: htmlEdit }),
      });
      toast({ title: "Caderno salvo" });
      setCadSel(d.caderno);
      await carregar();
      setModo("ver");
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  // ── Abrir modal emissão ───────────────────────────────────────────────────
  const abrirEmissao = () => {
    setModalEmissao(true);
    setClienteSelId(null);
    setProtocoloSel(null);
    setProtocolos([]);
    setCodigosEmitir(new Set());
    setDadosHidratacao({});
  };

  // ── Selecionar cliente → carregar protocolos ──────────────────────────────
  const onPickClienteId = async (id: number | null) => {
    setClienteSelId(id);
    setProtocoloSel(null);
    setCodigosEmitir(new Set());
    setDadosHidratacao({});
    if (!id) { setProtocolos([]); return; }
    try {
      const d = await apiFetch(`/api/protocols?clientId=${id}`);
      setProtocolos(Array.isArray(d) ? d : (d.protocols ?? []));
    } catch { setProtocolos([]); }
  };

  // ── Selecionar protocolo → resolver cadernos ──────────────────────────────
  const selecionarProtocolo = async (p: ProtocoloLite) => {
    setProtocoloSel(p);
    setResolvendo(true);
    try {
      const d = await apiFetch(`/api/cadernos-juridicos/resolver/${p.id}`);
      setCodigosEmitir(new Set(d.codigos ?? []));
      setDadosHidratacao(d.dadosHidratacao ?? {});
    } catch {
      // fallback: seleciona todos
      setCodigosEmitir(new Set(CATEGORIAS.flatMap((c) => c.codigos)));
      toast({ title: "Não foi possível resolver automaticamente — seleção completa ativada", variant: "destructive" });
    } finally {
      setResolvendo(false);
    }
  };

  // ── Emitir lote ───────────────────────────────────────────────────────────
  const emitir = async () => {
    if (!clienteSel || codigosEmitir.size === 0) return;
    setEmitindo(true);
    try {
      const d = await apiFetch("/api/cadernos-juridicos/emitir-lote", {
        method: "POST",
        body: JSON.stringify({
          clientId: clienteSel.id,
          protocolId: protocoloSel?.id,
          codigos: [...codigosEmitir],
          dadosHidratacao,
          canais: ["WHATSAPP", "EMAIL"],
        }),
      });
      toast({ title: `${d.enviados} cadernos emitidos para ${clienteSel.name}` });
      setModalEmissao(false);
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : "desconhecido"}`, variant: "destructive" });
    } finally {
      setEmitindo(false);
    }
  };

  // ── Derivados ─────────────────────────────────────────────────────────────
  const mapa        = new Map(cadernos.map((c) => [c.codigo, c]));
  const totalCad    = cadernos.length || 20;
  const totalSem    = cadernos.filter((c) => c.semeado).length;
  const totalAtivos = cadernos.filter((c) => c.semeado && c.ativo).length;
  const todosSem    = totalSem >= totalCad && totalCad > 0;

  const toggleCategoria = (id: string) =>
    setExpandidas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleCodigo = (cod: string) =>
    setCodigosEmitir((prev) => {
      const next = new Set(prev);
      next.has(cod) ? next.delete(cod) : next.add(cod);
      return next;
    });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-16">

      {/* ── CABEÇALHO ───────────────────────────────────────────────────── */}
      <div className="panel-3d p-5 flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 mb-3 uppercase tracking-widest text-sm font-bold">
            <FileSignature className="w-4 h-4" />
            Cadernos Jurídicos
          </div>
          <p className="text-sm text-muted-foreground">
            Configuração e edição dos {totalCad} modelos de consentimento — emitidos ao cliente no fechamento de contrato
          </p>
        </div>

        {/* KPIs */}
        <div className="flex gap-2 flex-wrap shrink-0">
          {[
            { label: "TOTAL",    valor: totalCad },
            { label: "SEMEADOS", valor: totalSem,    cor: "text-emerald-600" },
            { label: "ATIVOS",   valor: totalAtivos,  cor: "text-sky-600" },
            { label: "PENDENTES",valor: Math.max(0, totalCad - totalSem), cor: "text-amber-600" },
          ].map((k) => (
            <div key={k.label} className="screen-3d px-3 py-2 text-center min-w-[64px]">
              <div className={`text-xl font-bold ${k.cor ?? ""}`}>{k.valor}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BARRA DE AÇÕES ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button className="btn-3d gap-2" onClick={abrirEmissao}>
          <Send className="w-4 h-4" />
          Emitir ao Cliente
        </Button>
        <Button className="btn-3d-soft gap-2" onClick={carregar} disabled={carregando}>
          <RefreshCw className={`w-4 h-4 ${carregando ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
        {!todosSem && (
          <Button className="btn-3d-soft gap-2" onClick={semear} disabled={semeando}>
            <Sparkles className="w-4 h-4" />
            {semeando ? "Semeando…" : `Semear ${totalCad - totalSem}`}
          </Button>
        )}
      </div>

      {/* ── CATEGORIAS ───────────────────────────────────────────────────── */}
      {carregando ? (
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-28 panel-3d animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {CATEGORIAS.map((cat) => {
            const Icon    = cat.icon;
            const aberta  = expandidas.has(cat.id);
            const cads    = cat.codigos.map((cod) => mapa.get(cod)).filter(Boolean) as Caderno[];
            const nSem    = cads.filter((c) => c.semeado).length;

            return (
              <div key={cat.id} className="panel-3d overflow-hidden">

                {/* Cabeçalho da categoria */}
                <button
                  onClick={() => toggleCategoria(cat.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/5 transition-colors"
                >
                  <div className={`w-1 self-stretch rounded-full ${cat.faixa}`} />
                  <div className={`p-1.5 rounded-[6px] bg-white/60 dark:bg-white/10`}>
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest font-bold">
                        {cat.label}
                      </span>
                      <span className="concave-3d text-[10px] px-2 py-0.5 font-mono">
                        {nSem}/{cat.codigos.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{cat.descricao}</p>
                  </div>
                  {aberta
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Cards dos cadernos */}
                {aberta && (
                  <div className="p-3 pt-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {cat.codigos.map((cod) => {
                      const c = mapa.get(cod);

                      if (!c) return (
                        <div key={cod} className="panel-3d-sub flex items-center gap-3 p-4 opacity-60">
                          <div className={`w-1 self-stretch rounded-full bg-muted`} />
                          <div className="text-sm text-muted-foreground">
                            <span className="concave-3d px-2 py-0.5 font-mono text-[11px] mr-2">{cod}</span>
                            Não semeado
                          </div>
                        </div>
                      );

                      const preview = stripPreview(c.corpoHtml ?? "");

                      return (
                        <div key={c.codigo} className="panel-3d-sub flex overflow-hidden">

                          {/* Faixa lateral de categoria — 4px */}
                          <div className={`w-1 shrink-0 ${cat.faixa}`} />

                          <div className="flex-1 flex flex-col p-3 min-w-0">
                            {/* Linha superior: código + data */}
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="concave-3d px-2 py-0.5 text-[11px] font-mono font-bold tracking-wide">
                                {c.codigo}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {fmtData(c.atualizadoEm)}
                              </span>
                            </div>

                            {/* Título */}
                            <p className="text-sm font-semibold leading-tight line-clamp-2 mb-1.5">
                              {c.titulo}
                            </p>

                            {/* Preview */}
                            <p className="text-xs text-muted-foreground line-clamp-2 flex-1 mb-3">
                              {preview}
                            </p>

                            {/* Botões */}
                            <div className="flex gap-2">
                              <Button
                                className="btn-3d-soft h-7 text-xs gap-1 flex-1"
                                onClick={() => abrirVer(c)}
                              >
                                <Eye className="w-3 h-3" /> Ver
                              </Button>
                              <Button
                                className="btn-3d-soft h-7 text-xs gap-1 flex-1"
                                onClick={() => abrirEditar(c)}
                              >
                                <Edit3 className="w-3 h-3" /> Editar
                              </Button>
                            </div>
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

      {/* ═══════════════════════════════════════════════════════════════════
          SLIDE-OVER: EDITAR / VER CADERNO
      ═══════════════════════════════════════════════════════════════════ */}
      {cadSel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setCadSel(null)}
          />

          {/* Painel lateral */}
          <div className="relative w-full max-w-2xl h-full flex flex-col panel-3d rounded-none shadow-2xl overflow-hidden">

            {/* Cabeçalho */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80">
              <div className="bevel-3d px-2 py-0.5 text-[11px] font-mono font-bold">{cadSel.codigo}</div>
              <h2 className="flex-1 font-semibold text-sm leading-tight truncate">{cadSel.titulo}</h2>
              <button
                className="concave-3d w-8 h-8 flex items-center justify-center rounded-[6px] hover:text-destructive transition-colors"
                onClick={() => setCadSel(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Abas */}
            <div className="flex border-b border-border">
              {(["ver", "editar"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium uppercase tracking-wide transition-colors ${
                    modo === m
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "ver" ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                  {m === "ver" ? "Visualizar" : "Editar"}
                </button>
              ))}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto">

              {/* ── VER ── */}
              {modo === "ver" && (
                <div className="p-5">
                  <div className="concave-3d p-1 mb-3 text-[10px] text-muted-foreground uppercase tracking-widest text-center">
                    Pré-visualização com dados de exemplo (Carlucia · Longevidade Plena)
                  </div>
                  <div
                    className="prose prose-sm max-w-none [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-semibold [&_p]:text-sm [&_li]:text-sm"
                    dangerouslySetInnerHTML={{
                      __html: hidratarHtml(cadSel.corpoHtml ?? "", DADOS_PREVIEW),
                    }}
                  />
                </div>
              )}

              {/* ── EDITAR ── */}
              {modo === "editar" && (
                <div className="p-4 space-y-4">
                  {/* Paleta de variáveis */}
                  <div className="panel-3d-sub p-3">
                    <div className="bevel-3d text-[10px] px-2 py-0.5 uppercase tracking-widest mb-2 inline-block">
                      Variáveis disponíveis
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {placeholders.map((p) => (
                        <button
                          key={p.key}
                          className="concave-3d text-[10px] font-mono px-2 py-0.5 hover:text-primary transition-colors"
                          title={`${p.label} — Ex: ${p.exemplo}`}
                          onClick={() => setHtmlEdit((h) => h + `{{${p.key}}}`)}
                        >
                          {`{{${p.key}}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Editor HTML */}
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1 block">
                      Corpo HTML do Contrato
                    </label>
                    <textarea
                      className="field-engraved w-full font-mono text-xs leading-relaxed resize-none"
                      rows={22}
                      value={htmlEdit}
                      onChange={(e) => setHtmlEdit(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do slide-over */}
            {modo === "editar" && (
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-card/80">
                <Button className="btn-3d-soft" onClick={() => setModo("ver")}>
                  Cancelar
                </Button>
                <Button className="btn-3d gap-2" onClick={salvar} disabled={salvando}>
                  {salvando
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
                    : <><Save className="w-4 h-4" /> Salvar Caderno</>}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: EMITIR AO CLIENTE
      ═══════════════════════════════════════════════════════════════════ */}
      {modalEmissao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setModalEmissao(false)}
          />

          <div className="relative w-full max-w-xl panel-3d overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">

            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm uppercase tracking-widest font-bold">
                <Send className="w-4 h-4" />
                Emitir Cadernos ao Cliente
              </div>
              <button
                className="concave-3d w-8 h-8 flex items-center justify-center rounded-[6px]"
                onClick={() => setModalEmissao(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* ── 1. Buscar cliente ── */}
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <span className="concave-3d px-1.5 py-0.5 text-[10px] font-bold">1</span>
                  Selecionar Cliente
                </label>
                <PaxterClientSelector
                  clientes={clienteSelOpts}
                  value={clienteSelId}
                  onChange={(id) => { void onPickClienteId(id); }}
                  placeholder="Selecionar cliente…"
                />
              </div>

              {/* ── 2. Selecionar protocolo ── */}
              {clienteSel && (
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <span className="concave-3d px-1.5 py-0.5 text-[10px] font-bold">2</span>
                    Protocolo a Assinar
                  </label>
                  {protocolos.length === 0 ? (
                    <p className="text-sm text-muted-foreground concave-3d p-3 text-center">
                      Nenhum protocolo encontrado para este cliente
                    </p>
                  ) : (
                    <div className="panel-3d-sub max-h-36 overflow-y-auto">
                      {protocolos.map((p) => (
                        <button
                          key={p.id}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                            protocoloSel?.id === p.id
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-primary/5"
                          }`}
                          onClick={() => selecionarProtocolo(p)}
                          disabled={resolvendo}
                        >
                          <FileText className="w-4 h-4 shrink-0" />
                          <span className="font-medium flex-1 truncate">{p.title}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{p.totalSessions} sess.</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {resolvendo && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1.5 px-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Identificando cadernos necessários para este protocolo…
                    </div>
                  )}
                </div>
              )}

              {/* ── 3. Cadernos selecionados ── */}
              {protocoloSel && codigosEmitir.size > 0 && (
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <span className="concave-3d px-1.5 py-0.5 text-[10px] font-bold">3</span>
                    Cadernos a Emitir
                    <span className="concave-3d px-2 py-0.5 text-[10px] font-mono ml-auto">
                      {codigosEmitir.size} selecionados
                    </span>
                  </label>
                  <div className="panel-3d-sub max-h-52 overflow-y-auto grid grid-cols-1 divide-y divide-border/50">
                    {CATEGORIAS.flatMap((cat) => cat.codigos).filter((cod) => {
                      const c = mapa.get(cod);
                      return c && c.semeado;
                    }).map((cod) => {
                      const c = mapa.get(cod)!;
                      const selecionado = codigosEmitir.has(cod);
                      return (
                        <button
                          key={cod}
                          className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-primary/5 transition-colors text-left"
                          onClick={() => toggleCodigo(cod)}
                        >
                          {selecionado
                            ? <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                            : <Square className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <span className="concave-3d text-[10px] font-mono px-1.5 py-0.5 shrink-0">{cod}</span>
                          <span className={`flex-1 truncate text-xs ${!selecionado ? "text-muted-foreground line-through" : ""}`}>
                            {c.titulo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do modal */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <Button className="btn-3d-soft" onClick={() => setModalEmissao(false)}>
                Cancelar
              </Button>
              <Button
                className="btn-3d gap-2"
                onClick={emitir}
                disabled={emitindo || !clienteSel || codigosEmitir.size === 0}
              >
                {emitindo
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Emitindo…</>
                  : <><Send className="w-4 h-4" /> Emitir {codigosEmitir.size > 0 ? `${codigosEmitir.size} cadernos` : ""}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
