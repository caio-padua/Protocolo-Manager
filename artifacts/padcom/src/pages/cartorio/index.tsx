import { useEffect, useMemo, useState } from "react";
import { useGetESignatureSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Stamp,
  Send,
  Save,
  Search,
  Mail,
  MessageCircle,
  FileSignature,
  ShieldAlert,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { DocumentEditor } from "./Editor";
import {
  listarClientes,
  listarTimeline,
  listarTemplates,
  salvarTemplate,
  enviarParaAssinatura,
  ApiError,
  type ClienteLite,
  type TimelineItem,
  type Template,
} from "@/lib/cartorio-api";

const TIPOS_DOC = [
  { value: "TERMO", label: "Termo de Consentimento" },
  { value: "RAS", label: "RAS (Jurídico/Clínico)" },
  { value: "ORCAMENTO", label: "Orçamento" },
  { value: "CONTRATO", label: "Contrato" },
  { value: "OUTRO", label: "Outro" },
];

const CANAIS = [
  { value: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
  { value: "EMAIL", label: "E-mail", icon: Mail },
];

function statusVisual(status: string): { label: string; cls: string; icon: typeof Clock } {
  const s = status.toUpperCase();
  if (s === "ASSINADO" || s === "CONCLUIDO")
    return { label: "ASSINADO", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40", icon: CheckCircle2 };
  if (s === "RECUSADO" || s === "CANCELADO" || s === "EXPIRADO")
    return { label: s, cls: "bg-red-500/15 text-red-700 border-red-500/40", icon: ShieldAlert };
  return { label: s || "ENVIADO", cls: "bg-amber-500/15 text-amber-700 border-amber-500/40", icon: Clock };
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function Cartorio() {
  const { toast } = useToast();
  const settings = useGetESignatureSettings();
  // MODO TESTE: sem token configurado, o motor opera em mock (não envia de verdade).
  const modoTeste = !settings.data?.tokenStatus?.isSet;

  // ---- Timeline ----
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineErro, setTimelineErro] = useState<string | null>(null);
  const [carregandoTimeline, setCarregandoTimeline] = useState(true);

  async function recarregarTimeline() {
    setCarregandoTimeline(true);
    setTimelineErro(null);
    try {
      setTimeline(await listarTimeline());
    } catch (e) {
      const err = e as ApiError;
      setTimelineErro(err.status === 401 ? "login" : "erro");
    } finally {
      setCarregandoTimeline(false);
    }
  }

  // ---- Templates ----
  const [templates, setTemplates] = useState<Template[]>([]);
  async function recarregarTemplates() {
    try {
      setTemplates(await listarTemplates());
    } catch {
      /* silencioso — exige login; a timeline já avisa */
    }
  }

  useEffect(() => {
    void recarregarTimeline();
    void recarregarTemplates();
  }, []);

  // ---- Seletor de paciente ----
  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [paciente, setPaciente] = useState<ClienteLite | null>(null);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      if (busca.trim().length < 2) {
        setClientes([]);
        return;
      }
      setBuscando(true);
      try {
        const rows = await listarClientes(busca);
        if (vivo) setClientes(rows.slice(0, 8));
      } catch {
        if (vivo) setClientes([]);
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [busca]);

  // ---- Documento ----
  const [tipoDoc, setTipoDoc] = useState("TERMO");
  const [titulo, setTitulo] = useState("");
  const [conteudoHtml, setConteudoHtml] = useState("<p></p>");
  const [incluirMedico, setIncluirMedico] = useState(false);
  const [canais, setCanais] = useState<string[]>(["WHATSAPP"]);
  const [templateCodigo, setTemplateCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [salvandoTpl, setSalvandoTpl] = useState(false);

  function aplicarTemplate(codigo: string) {
    setTemplateCodigo(codigo);
    const tpl = templates.find((t) => t.codigo === codigo);
    if (tpl) {
      setConteudoHtml(tpl.corpoHtml);
      setTipoDoc(tpl.tipoDoc);
      if (!titulo) setTitulo(tpl.titulo);
    }
  }

  const conteudoVazio = useMemo(
    () => conteudoHtml.replace(/<[^>]*>/g, "").trim().length === 0,
    [conteudoHtml],
  );

  function toggleCanal(c: string) {
    setCanais((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function onEnviar() {
    if (!paciente) {
      toast({ title: "Selecione o paciente", variant: "destructive" });
      return;
    }
    if (conteudoVazio) {
      toast({ title: "Escreva o documento antes de enviar", variant: "destructive" });
      return;
    }
    if (canais.length === 0) {
      toast({ title: "Escolha pelo menos um canal de envio", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarParaAssinatura({
        pacienteId: paciente.id,
        conteudoHtml,
        tipoDoc,
        titulo: titulo.trim() || undefined,
        incluirMedico,
        canais,
      });
      toast({
        title: r.mock ? "Enviado em MODO TESTE (mock)" : "Documento enviado para assinatura",
        description: `Solicitação #${r.solicitacaoId} • ${r.status}`,
      });
      // DoD da spec: limpar o formulário após envio bem-sucedido.
      setPaciente(null);
      setBusca("");
      setTitulo("");
      setConteudoHtml("<p></p>");
      setTemplateCodigo("");
      setTipoDoc("TERMO");
      setIncluirMedico(false);
      setCanais(["WHATSAPP"]);
      await recarregarTimeline();
    } catch (e) {
      const err = e as ApiError;
      const msg =
        err.code.startsWith("paciente_sem_canal")
          ? "Paciente sem e-mail nem WhatsApp — cadastre um canal antes de enviar."
          : err.status === 401
            ? "Entre como colaborador para enviar documentos."
            : `Falha ao enviar (${err.code}).`;
      toast({ title: "Não foi possível enviar", description: msg, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function onSalvarTemplate() {
    if (conteudoVazio) {
      toast({ title: "Escreva o documento antes de salvar o modelo", variant: "destructive" });
      return;
    }
    const codigo = window.prompt("Código do modelo (ex.: TCLE_IV). Reusar o mesmo código atualiza o modelo:", templateCodigo || "");
    if (codigo === null) return;
    if (!codigo.trim()) {
      toast({ title: "Informe um código para o modelo", variant: "destructive" });
      return;
    }
    setSalvandoTpl(true);
    try {
      await salvarTemplate({
        codigo: codigo.trim(),
        titulo: titulo.trim() || codigo.trim(),
        tipoDoc,
        corpoHtml: conteudoHtml,
        exigeMedico: incluirMedico,
      });
      toast({ title: "Modelo salvo", description: codigo.trim() });
      await recarregarTemplates();
      setTemplateCodigo(codigo.trim());
    } catch (e) {
      const err = e as ApiError;
      const msg = err.status === 401 ? "Entre como colaborador para salvar modelos." : `Falha (${err.code}).`;
      toast({ title: "Não foi possível salvar o modelo", description: msg, variant: "destructive" });
    } finally {
      setSalvandoTpl(false);
    }
  }

  const pacienteSemCanal = paciente && !paciente.email && !paciente.phone;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="panel-3d flex h-11 w-11 items-center justify-center text-primary">
            <Stamp className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cartório</h1>
            <p className="text-sm text-muted-foreground">
              Documentos &amp; Consentimento — crie, envie para assinatura e use como trava de consentimento.
            </p>
          </div>
        </div>
        {modoTeste && (
          <div className="flex items-center gap-2 rounded-[6px] border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-amber-700">
            <ShieldAlert className="w-4 h-4" />
            Modo teste — sem token ZapSign (envio simulado)
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(320px,420px)_1fr]">
        {/* ZONA ESQUERDA — Timeline */}
        <section className="panel-3d p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Linha do tempo
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Recarregar"
              onClick={() => void recarregarTimeline()}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {carregandoTimeline ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : timelineErro === "login" ? (
            <div className="concave-3d p-4 text-sm text-muted-foreground">
              Entre como colaborador para ver os documentos enviados.
            </div>
          ) : timelineErro === "erro" ? (
            <div className="concave-3d p-4 text-sm text-red-600">Falha ao carregar a linha do tempo.</div>
          ) : timeline.length === 0 ? (
            <div className="concave-3d p-4 text-sm text-muted-foreground">
              Nenhum documento enviado ainda.
            </div>
          ) : (
            <ul className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 280px)" }}>
              {timeline.map((it) => {
                const sv = statusVisual(it.status);
                const Icon = sv.icon;
                return (
                  <li key={it.id} className="concave-3d p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                        #{it.id}
                        <span
                          className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sv.cls}`}
                        >
                          <Icon className="w-3 h-3" />
                          {sv.label}
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {it.tipoDoc}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold">
                      {it.titulo || "(sem título)"}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[12px] text-muted-foreground">
                      <span className="truncate">{it.pacienteNome || `Paciente #${it.pacienteId}`}</span>
                      <span>{fmtData(it.enviadoEm || it.criadoEm)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ZONA DIREITA — Novo documento */}
        <section className="panel-3d space-y-4 p-4">
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Novo documento
            </h2>
          </div>

          {/* Paciente */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Paciente
            </label>
            {paciente ? (
              <div className="concave-3d flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{paciente.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {paciente.phone && (
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" /> {paciente.phone}
                      </span>
                    )}
                    {paciente.email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {paciente.email}
                      </span>
                    )}
                    {pacienteSemCanal && (
                      <span className="font-semibold text-red-600">sem e-mail/WhatsApp</span>
                    )}
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPaciente(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <div className="field-engraved flex items-center gap-2 px-3">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input
                    className="w-full bg-transparent py-2 text-sm outline-none"
                    placeholder="Buscar por nome ou CPF…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                {(buscando || clientes.length > 0) && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-[6px] border border-border bg-popover shadow-lg">
                    {buscando && (
                      <div className="px-3 py-2 text-[12px] text-muted-foreground">Buscando…</div>
                    )}
                    {clientes.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setPaciente(c);
                          setBusca("");
                          setClientes([]);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/60"
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.cpf && <span className="ml-2 text-[11px] text-muted-foreground">{c.cpf}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tipo + Modelo + Título */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Tipo de documento
              </label>
              <select
                className="field-engraved w-full bg-transparent px-3 py-2 text-sm outline-none"
                value={tipoDoc}
                onChange={(e) => setTipoDoc(e.target.value)}
              >
                {TIPOS_DOC.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Modelo (opcional)
              </label>
              <select
                className="field-engraved w-full bg-transparent px-3 py-2 text-sm outline-none"
                value={templateCodigo}
                onChange={(e) => aplicarTemplate(e.target.value)}
              >
                <option value="">— Em branco —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.codigo}>
                    {t.titulo} ({t.codigo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Título do documento
            </label>
            <Input
              className="field-engraved"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Termo de Consentimento — Soroterapia"
            />
          </div>

          {/* Editor */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Conteúdo
            </label>
            <DocumentEditor value={conteudoHtml} onChange={setConteudoHtml} />
          </div>

          {/* Canais + médico */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Enviar por
              </span>
              {CANAIS.map((c) => {
                const Icon = c.icon;
                const on = canais.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleCanal(c.value)}
                    className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      on
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {c.label}
                  </button>
                );
              })}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-muted-foreground">
              <input
                type="checkbox"
                checked={incluirMedico}
                onChange={(e) => setIncluirMedico(e.target.checked)}
              />
              Incluir assinatura do médico
            </label>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              className="bevel-3d"
              onClick={() => void onSalvarTemplate()}
              disabled={salvandoTpl}
            >
              <Save className="w-4 h-4 mr-2" />
              {salvandoTpl ? "Salvando…" : "Salvar como modelo"}
            </Button>
            <Button
              type="button"
              className="btn-3d"
              onClick={() => void onEnviar()}
              disabled={enviando || !paciente || conteudoVazio}
            >
              <Send className="w-4 h-4 mr-2" />
              {enviando ? "Enviando…" : "Enviar para assinatura"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
