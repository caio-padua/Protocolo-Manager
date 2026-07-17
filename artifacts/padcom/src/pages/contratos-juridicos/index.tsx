import { useState, useEffect, useCallback } from "react";
import {
  FileSignature, RefreshCw, Sparkles, ChevronRight, Edit3, Eye,
  Save, Send, Copy, CheckCircle2, Clock, AlertCircle, Plus,
  Stamp, User, Building2, BookOpen, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeader(): HeadersInit {
  const token = localStorage.getItem("collab_token") || "";
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeader(), ...(opts?.headers ?? {}) } });
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
type ClienteLite = { id: number; name: string; cpf: string | null; phone: string | null; email: string | null };

const COR_CODIGO: Record<string, string> = {
  CGLO:    "bg-blue-500/15 text-blue-700 border-blue-400/40",
  CFOR:    "bg-orange-500/15 text-orange-700 border-orange-400/40",
  CIMU:    "bg-purple-500/15 text-purple-700 border-purple-400/40",
  CEND:    "bg-teal-500/15 text-teal-700 border-teal-400/40",
  CIMP:    "bg-amber-500/15 text-amber-700 border-amber-400/40",
  CSUB:    "bg-red-500/15 text-red-700 border-red-400/40",
  TCLE:    "bg-emerald-500/15 text-emerald-700 border-emerald-400/40",
  "RAS-JUR": "bg-slate-500/15 text-slate-700 border-slate-400/40",
};

const ICON_CODIGO: Record<string, typeof FileSignature> = {
  CGLO:    BookOpen,
  CFOR:    Sparkles,
  CIMU:    ShieldCheck,
  CEND:    ShieldCheck,
  CIMP:    Stamp,
  CSUB:    AlertCircle,
  TCLE:    FileSignature,
  "RAS-JUR": CheckCircle2,
};

function fmtData(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function substituirVariaveis(html: string, dados: Record<string, string>): string {
  let out = html;
  for (const [k, v] of Object.entries(dados)) {
    out = out.replaceAll(`{{${k}}}`, v || `<span style="color:#c00">{{${k}}}</span>`);
  }
  return out;
}

export default function ContratosJuridicos() {
  const { toast } = useToast();
  const [cadernos, setCadernos] = useState<Caderno[]>([]);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [selecionado, setSelecionado] = useState<Caderno | null>(null);
  const [modo, setModo] = useState<"editar" | "preview">("editar");
  const [htmlEditado, setHtmlEditado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [semeando, setSemeando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  // Modal emissão
  const [modalAberto, setModalAberto] = useState(false);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [busca, setBusca] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteLite | null>(null);
  const [emitindo, setEmitindo] = useState(false);
  const [canais, setCanais] = useState<string[]>(["WHATSAPP", "EMAIL"]);

  // Dados de preenchimento para preview
  const [dadosPreview, setDadosPreview] = useState<Record<string, string>>({
    "cliente.nome": "Carlucia da Silva",
    "cliente.cpf": "000.000.000-00",
    "cliente.dataNascimento": "01/01/1980",
    "cliente.email": "carlucia@email.com",
    "cliente.telefone": "(11) 99999-9999",
    "medico.nome": "Dr. Caio Pádua",
    "medico.crm": "123456",
    "medico.uf": "SP",
    "protocolo.titulo": "Protocolo Longevidade Plena",
    "protocolo.substancias": "NAD+, Glutationa, Vitamina C IV, Ozônio IM, GLP-1 SC, Testosterona (Implante)",
    "protocolo.vias": "IV, IM, SC, Implante",
    "protocolo.dataInicio": "01/08/2026",
    "protocolo.totalSessoes": "12",
    "protocolo.valorTotal": "R$ 14.400,00",
    "clinica.nome": "Clínica Tatuapé",
    "clinica.endereco": "Rua Tuiuti, 1000 — Tatuapé, São Paulo — SP",
    "data.hoje": new Date().toLocaleDateString("pt-BR"),
  });

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

  const semear = async () => {
    setSemeando(true);
    try {
      const d = await apiFetch("/api/cadernos-juridicos/seed", { method: "POST" });
      toast({ title: `${d.inseridos} cadernos semeados com sucesso` });
      await carregar();
    } catch {
      toast({ title: "Erro ao semear cadernos", variant: "destructive" });
    } finally {
      setSemeando(false);
    }
  };

  const selecionar = (c: Caderno) => {
    setSelecionado(c);
    setHtmlEditado(c.corpoHtml || "");
    setModo("editar");
  };

  const salvar = async () => {
    if (!selecionado) return;
    setSalvando(true);
    try {
      const d = await apiFetch(`/api/cadernos-juridicos/${selecionado.codigo}`, {
        method: "PUT",
        body: JSON.stringify({ corpoHtml: htmlEditado }),
      });
      toast({ title: "Caderno salvo com sucesso" });
      setSelecionado(d.caderno);
      await carregar();
    } catch {
      toast({ title: "Erro ao salvar caderno", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const inserirPlaceholder = (key: string) => {
    const tag = `{{${key}}}`;
    setHtmlEditado((prev) => prev + tag);
  };

  const copiarHtml = () => {
    void navigator.clipboard.writeText(htmlEditado);
    toast({ title: "HTML copiado" });
  };

  const abrirModal = async () => {
    setModalAberto(true);
    try {
      const d = await apiFetch("/api/clients?limit=200");
      setClientes(Array.isArray(d) ? d : (d.clients || d.data || []));
    } catch { setClientes([]); }
  };

  const clientesFiltrados = clientes.filter((c) =>
    c.name.toLowerCase().includes(busca.toLowerCase()) ||
    (c.cpf || "").includes(busca)
  );

  const emitir = async () => {
    if (!clienteSelecionado || !selecionado) return;
    setEmitindo(true);
    try {
      await apiFetch("/api/assinaturas/enviar", {
        method: "POST",
        body: JSON.stringify({
          templateId: selecionado.id,
          tipoDoc: selecionado.tipoDoc,
          titulo: selecionado.titulo,
          pacienteId: clienteSelecionado.id,
          canaisDistribuir: canais,
          dadosHidratacao: {
            "cliente.nome": clienteSelecionado.name,
            "cliente.cpf": clienteSelecionado.cpf || "",
            "cliente.email": clienteSelecionado.email || "",
            "cliente.telefone": clienteSelecionado.phone || "",
          },
        }),
      });
      toast({ title: `${selecionado.titulo} enviado para ${clienteSelecionado.name}` });
      setModalAberto(false);
      setClienteSelecionado(null);
    } catch (e) {
      toast({ title: `Erro ao emitir: ${e instanceof Error ? e.message : "desconhecido"}`, variant: "destructive" });
    } finally {
      setEmitindo(false);
    }
  };

  const totalSemeados = cadernos.filter((c) => c.semeado).length;
  const totalCadernos = cadernos.length;
  const todosSemeados = totalSemeados >= totalCadernos && totalCadernos > 0;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="w-6 h-6 text-primary" />
            Cadernos Jurídicos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCadernos > 0 ? totalCadernos : 20} cadernos padrão — edite os textos e emita para assinatura digital
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

      {/* Status geral */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", valor: totalCadernos, cor: "text-foreground" },
          { label: "Semeados", valor: totalSemeados, cor: "text-emerald-600" },
          { label: "Pendentes", valor: Math.max(0, totalCadernos - totalSemeados), cor: "text-amber-600" },
          { label: "Ativos", valor: cadernos.filter((c) => c.semeado && c.ativo).length, cor: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-md border bg-card p-3 text-center">
            <div className={`text-2xl font-bold ${s.cor}`}>{s.valor}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Layout 2 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">

        {/* Lista de cadernos */}
        <div className="space-y-2">
          {carregando
            ? Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="h-16 rounded-md border bg-muted animate-pulse" />
              ))
            : cadernos.map((c) => {
                const Icon = ICON_CODIGO[c.codigo] || FileSignature;
                const corCls = COR_CODIGO[c.codigo] || "";
                const ativo = selecionado?.codigo === c.codigo;
                return (
                  <button
                    key={c.codigo}
                    onClick={() => selecionar(c)}
                    className={`w-full text-left rounded-md border p-3 transition-all ${
                      ativo
                        ? "border-primary/60 bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/30 hover:bg-accent/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] font-bold px-1.5 ${corCls}`}>
                        {c.codigo}
                      </Badge>
                      {c.semeado
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto shrink-0" />
                        : <Clock className="w-3.5 h-3.5 text-amber-500 ml-auto shrink-0" />}
                    </div>
                    <div className="flex items-start gap-2 mt-1.5">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium leading-tight">{c.titulo}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {c.semeado ? `Atualizado: ${fmtData(c.atualizadoEm)}` : "Não semeado — clique em Semear"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
        </div>

        {/* Painel de edição */}
        {selecionado ? (
          <div className="rounded-md border bg-card overflow-hidden">
            {/* Cabeçalho do painel */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] font-bold ${COR_CODIGO[selecionado.codigo] || ""}`}>
                  {selecionado.codigo}
                </Badge>
                <span className="text-sm font-semibold truncate">{selecionado.titulo}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant={modo === "editar" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setModo("editar")}
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                </Button>
                <Button
                  variant={modo === "preview" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setModo("preview")}
                >
                  <Eye className="w-3.5 h-3.5 mr-1" /> Preview
                </Button>
              </div>
            </div>

            {modo === "editar" ? (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] divide-y xl:divide-y-0 xl:divide-x">
                {/* Editor HTML */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      Use <code className="bg-muted px-1 rounded text-[11px]">{"{{variavel}}"}</code> para campos dinâmicos.
                      Clique nas variáveis à direita para inserir.
                    </p>
                    <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={copiarHtml}>
                      <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
                    </Button>
                  </div>
                  <textarea
                    value={htmlEditado}
                    onChange={(e) => setHtmlEditado(e.target.value)}
                    className="w-full h-[520px] rounded-md border bg-background font-mono text-xs p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                    spellCheck={false}
                  />
                </div>

                {/* Variáveis disponíveis */}
                <div className="p-4 space-y-2 overflow-y-auto max-h-[600px]">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Variáveis disponíveis
                  </p>
                  {placeholders.map((p) => (
                    <div key={p.key} className="space-y-0.5">
                      <button
                        onClick={() => inserirPlaceholder(p.key)}
                        title={`Inserir {{${p.key}}}`}
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
            ) : (
              /* Preview com substituição de variáveis */
              <div className="p-4 space-y-4">
                {/* Campos de preview */}
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Dados para preview (edite para testar)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { k: "cliente.nome", l: "Nome" },
                      { k: "cliente.cpf", l: "CPF" },
                      { k: "medico.nome", l: "Médico" },
                      { k: "medico.crm", l: "CRM" },
                      { k: "protocolo.titulo", l: "Protocolo" },
                      { k: "protocolo.substancias", l: "Substâncias" },
                      { k: "protocolo.vias", l: "Vias" },
                      { k: "clinica.nome", l: "Clínica" },
                    ].map(({ k, l }) => (
                      <div key={k} className="space-y-0.5">
                        <label className="text-[10px] text-muted-foreground">{l}</label>
                        <Input
                          value={dadosPreview[k] || ""}
                          onChange={(e) => setDadosPreview((p) => ({ ...p, [k]: e.target.value }))}
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Documento renderizado */}
                <div
                  className="rounded-md border bg-white p-6 prose prose-sm max-w-none min-h-[400px]"
                  dangerouslySetInnerHTML={{ __html: substituirVariaveis(htmlEditado, dadosPreview) }}
                />
              </div>
            )}

            {/* Rodapé de ações */}
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t bg-muted/20">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {selecionado.semeado
                  ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Semeado no banco</>
                  : <><Clock className="w-3.5 h-3.5 text-amber-500" /> Não semeado — salvar irá semear</>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={salvar} disabled={salvando}>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {salvando ? "Salvando…" : "Salvar"}
                </Button>
                <Button size="sm" onClick={abrirModal} disabled={!selecionado.semeado}>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Emitir para Cliente
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-card p-12 text-center text-muted-foreground">
            <FileSignature className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Selecione um caderno à esquerda</p>
            <p className="text-sm mt-1">Você poderá editar o texto e emitir para assinatura digital</p>
          </div>
        )}
      </div>

      {/* Modal de emissão */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg border shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                Emitir: {selecionado?.titulo}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setModalAberto(false)}>✕</Button>
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
                <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border bg-muted/20 p-1">
                  {clientesFiltrados.slice(0, 20).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setClienteSelecionado(c)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                        clienteSelecionado?.id === c.id
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
                <div className="flex gap-2">
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

              {clienteSelecionado && (
                <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="font-medium">{clienteSelecionado.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {clienteSelecionado.email || "sem e-mail"} · {clienteSelecionado.phone || "sem telefone"}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setModalAberto(false)}>Cancelar</Button>
              <Button size="sm" onClick={emitir} disabled={!clienteSelecionado || emitindo}>
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {emitindo ? "Enviando…" : "Enviar para Assinatura"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
