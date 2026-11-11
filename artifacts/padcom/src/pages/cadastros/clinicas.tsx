import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AgendaGoogleTab } from "./locais/AgendaGoogleTab";
import type { EnderecoLido } from "./locais/endereco-google";
import { LocaisPorEmpresa, type EmpresaFiltro } from "./locais/LocaisPorEmpresa";
import "./locais/locais.css";
import { MODO_META, compararEmpresas, type LocalAtendimento } from "./locais/locais-modo";
import {
  Building2, Plus, Loader2, Search, Save, Pencil,
  Video, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import { collabAuthHeaders } from "@/lib/collab-auth";

const apiBase = import.meta.env.VITE_API_URL || "/api";

type Clinica = LocalAtendimento;

const formSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  type: z.string(),
  phone: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  zona: z.string().optional(),
  color: z.string().optional(),
  googleCalendarId: z.string().optional(),
  active: z.boolean(),
  modalidade: z.enum(["presencial", "online", "definir"]),
  mesmoEnderecoEmpresa: z.boolean(),
  observacaoLocal: z.string().max(500, "Máximo de 500 caracteres").optional(),
  nomeEspaco: z.string().max(200, "Máximo de 200 caracteres").optional(),
});
type FormValues = z.infer<typeof formSchema>;

function formatCEP(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}
function formatPhone(value: string): string {
  if (value.startsWith("+")) return "+" + value.slice(1).replace(/\D/g, "").slice(0, 15);
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const EMPTY: FormValues = {
  name: "", type: "clinic", phone: "", cep: "", logradouro: "", numero: "",
  complemento: "", bairro: "", cidade: "", estado: "", zona: "",
  color: "#16284a", googleCalendarId: "", active: true,
  modalidade: "presencial", mesmoEnderecoEmpresa: false,
  observacaoLocal: "", nomeEspaco: "",
};

// ── Divisor de seção do formulário ────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px bg-primary/20 flex-1" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 shrink-0">{label}</span>
      <div className="h-px bg-primary/20 flex-1" />
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CadastroClinicas() {
  const queryClient = useQueryClient();
  const localSolicitado = useRef(new URLSearchParams(window.location.search).get("local"));
  const localAberto = useRef(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [novaEmpresaId, setNovaEmpresaId] = useState("");
  const [erroEmpresa, setErroEmpresa] = useState("");
  const [secao, setSecao] = useState<"identificacao" | "endereco" | "contato" | "agenda" | "documentos">("identificacao");
  const [documentosVisitados, setDocumentosVisitados] = useState(false);
  const [empresaFiltro, setEmpresaFiltro] = useState<EmpresaFiltro>("todas");
  const [, navegar] = useLocation();
  // Sessao do registro aberto: respostas atrasadas (CEP/Google) de outro registro sao descartadas.
  const sessaoRef = useRef(0);
  const [loadingCep, setLoadingCep] = useState(false);

  const { data: clinicas = [], isLoading, isError, refetch: refetchClinicas } = useQuery<Clinica[]>({
    queryKey: ["clinicas"],
    retry: false,
    queryFn: async () => {
      const res = await fetch(`${apiBase}/locations`);
      if (!res.ok) throw new Error("Erro ao carregar clínicas");
      return res.json();
    },
  });

  const empresasDisponiveis = useQuery<Array<{ id: number; nome: string }>>({
    queryKey: ["empresas-disponiveis-local", dialogOpen],
    enabled: dialogOpen && editingId === null,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const response = await fetch(`${apiBase}/semantic-codes/companies`, { headers: collabAuthHeaders() });
      if (!response.ok) throw new Error("Não foi possível consultar as empresas.");
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error("Resposta de empresas inválida.");
      return data;
    },
  });

  const vinculos = useQuery<{ locais: Array<{ locationId: number; empresaId: number }>; empresas: Array<{ id: number; nome: string }> }>({
    // Chave propria: o formato {locais, empresas} difere do cache "semantic-code-locations" (array) do SemanticCodeManager.
    queryKey: ["clinicas-vinculo-empresa"],
    enabled: dialogOpen && editingId !== null && documentosVisitados,
    // documentosVisitados = aba "Identidade" aberta: confirma a empresa dona antes de oferecer o atalho.
    queryFn: async () => {
      const headers = collabAuthHeaders();
      const [locaisResponse, empresasResponse] = await Promise.all([
        fetch(`${apiBase}/semantic-codes/locations`, { headers }),
        fetch(`${apiBase}/semantic-codes/companies`, { headers }),
      ]);
      if (!locaisResponse.ok || !empresasResponse.ok) throw new Error("Não foi possível consultar o vínculo da clínica.");
      const [locais, empresas] = await Promise.all([locaisResponse.json(), empresasResponse.json()]);
      if (!Array.isArray(locais) || !Array.isArray(empresas)) throw new Error("A resposta dos vínculos é inválida.");
      return { locais, empresas };
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const locaisVinculados = vinculos.data?.locais.filter((vinculo) => vinculo.locationId === editingId) ?? [];
  const empresaVinculada = locaisVinculados.length === 1
    ? vinculos.data?.empresas.find((empresa) => empresa.id === locaisVinculados[0].empresaId)
    : undefined;

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  // Leitura no render assina o proxy do react-hook-form; sem isso isDirty fica sempre falso nos handlers.
  const formSujo = form.formState.isDirty;
  const modalidadeAtual = form.watch("modalidade");
  const mesmoEnderecoAtual = form.watch("mesmoEnderecoEmpresa");
  const enderecoEmpresaEdicao = editingId ? (clinicas.find((c) => c.id === editingId)?.enderecoEmpresa ?? null) : null;

  const doLookupCep = useCallback(async () => {
    const cep = form.getValues("cep")?.replace(/\D/g, "");
    if (!cep || cep.length !== 8) { toast.error("CEP deve ter 8 dígitos"); return; }
    const sessao = sessaoRef.current;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (sessao !== sessaoRef.current) return;
      if (!res.ok) { toast.error("CEP não encontrado"); return; }
      const data = await res.json();
      // Descarta resposta atrasada: outro registro foi aberto ou o CEP mudou.
      if (sessao !== sessaoRef.current || form.getValues("cep")?.replace(/\D/g, "") !== cep) return;
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      form.setValue("logradouro", data.logradouro || "");
      form.setValue("bairro",     data.bairro     || "");
      form.setValue("cidade",     data.localidade || "");
      form.setValue("estado",     data.uf         || "");
      toast.success("Endereço preenchido automaticamente!");
    } catch { if (sessao === sessaoRef.current) toast.error("Erro ao buscar CEP"); }
    finally  { if (sessao === sessaoRef.current) setLoadingCep(false); }
  }, [form]);

  const aplicarEnderecoGoogle = useCallback((e: EnderecoLido, sessao: number) => {
    if (sessao !== sessaoRef.current) return;
    const opts = { shouldDirty: true };
    form.setValue("cep", e.cep, opts);
    form.setValue("logradouro", e.logradouro, opts);
    form.setValue("numero", e.numero, opts);
    form.setValue("complemento", e.complemento, opts);
    form.setValue("bairro", e.bairro, opts);
    form.setValue("cidade", e.cidade, opts);
    form.setValue("estado", e.estado, opts);
    form.setValue("zona", "", opts);
    form.setValue("mesmoEnderecoEmpresa", false, opts);
    if (form.getValues("modalidade") === "definir") form.setValue("modalidade", "presencial", opts);
    setSecao("endereco");
    toast.success("Endereço preenchido a partir do Google. Revise e clique em SALVAR LOCAL.");
  }, [form]);

  const saveMutation = useMutation({
    // Alvo capturado no envio: id e empresa nunca sao relidos do estado (que pode mudar durante a gravacao).
    mutationFn: async ({ values, alvoId, empresaId }: { values: FormValues; alvoId: number | null; empresaId: string }) => {
      if (!empresaId) throw new Error(alvoId ? "Este local não tem empresa proprietária confirmada; nada foi salvo." : "Selecione a empresa responsável pelo local.");
      const parts = [
        values.logradouro, values.numero, values.complemento && `(${values.complemento})`,
        values.bairro,
        values.cidade ? `${values.cidade}${values.estado ? " - " + values.estado : ""}` : values.estado,
        values.cep ? `CEP ${values.cep}` : "",
      ].filter(Boolean);
      const body = {
        ...values, address: parts.join(", ") || null, googleCalendarId: values.googleCalendarId || null,
        modalidade: values.modalidade === "definir" ? null : values.modalidade,
        mesmoEnderecoEmpresa: values.modalidade !== "definir" && values.mesmoEnderecoEmpresa,
        observacaoLocal: values.observacaoLocal?.trim() || null,
        nomeEspaco: values.nomeEspaco?.trim() || null,
      };
      const url = alvoId ? `${apiBase}/locations/${alvoId}` : `${apiBase}/locations`;
      const headers = collabAuthHeaders({ "Content-Type": "application/json", "X-Empresa-Id": empresaId });
      const res = await fetch(url, { method: alvoId ? "PUT" : "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Não foi possível salvar o local. Confira o acesso à empresa e tente novamente.");
      return res.json();
    },
    onSuccess: (_data, { alvoId }) => {
      queryClient.invalidateQueries({ queryKey: ["clinicas"] });
      queryClient.invalidateQueries({ queryKey: ["empresas-locais-confirmados"] });
      queryClient.invalidateQueries({ queryKey: ["semantic-code-locations"] });
      queryClient.invalidateQueries({ queryKey: ["clinicas-vinculo-empresa"] });
      toast.success(alvoId ? "Local atualizado!" : "Local cadastrado!");
      fecharDialogo();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Interruptor ativar/desativar (reversível). Apagar o local não é oferecido nesta tela por enquanto.
  const { toast: aviso } = useToast();
  const ativoMutation = useMutation({
    mutationFn: async ({ c, ativo }: { c: Clinica; ativo: boolean }) => {
      if (!c.empresaId) throw new Error("Este local não tem empresa proprietária confirmada; nada foi alterado.");
      const res = await fetch(`${apiBase}/locations/${c.id}`, {
        method: "PUT",
        headers: collabAuthHeaders({ "Content-Type": "application/json", "X-Empresa-Id": String(c.empresaId) }),
        body: JSON.stringify({ active: ativo }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error ?? "Não foi possível alterar o local.");
      return ativo;
    },
    onSuccess: (ativo, { c }) => {
      queryClient.invalidateQueries({ queryKey: ["clinicas"] });
      aviso({ title: ativo ? `"${c.name}" está ativo.` : `"${c.name}" foi desativado.`, description: ativo ? undefined : "Nada foi apagado; você pode reativar." });
    },
    onError: (e: Error) => aviso({ title: e.message, variant: "destructive" }),
  });

  const escreverUrlLocal = (id: number | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("local", String(id)); else url.searchParams.delete("local");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const fecharDialogo = () => { sessaoRef.current += 1; setLoadingCep(false); setDialogOpen(false); escreverUrlLocal(null); };
  const gravando = () => {
    if (!saveMutation.isPending) return false;
    toast.error("Aguarde: o local ainda está sendo salvo.");
    return true;
  };
  const openNew = () => {
    if (gravando()) return;
    sessaoRef.current += 1; setLoadingCep(false);
    saveMutation.reset(); setEditingId(null); setErroEmpresa(""); setSecao("identificacao"); setDocumentosVisitados(false);
    // Empresa escolhida na lista vira sugestao explicita; so vale se for autorizada (conferido no envio).
    setNovaEmpresaId(empresaFiltro !== "todas" && empresaFiltro.startsWith("e") ? empresaFiltro.slice(1) : "");
    form.reset(EMPTY); escreverUrlLocal(null); setDialogOpen(true);
  };
  const openEdit = (c: Clinica) => {
    if (gravando()) return;
    sessaoRef.current += 1; setLoadingCep(false);
    saveMutation.reset();
    setEditingId(c.id);
    setSecao("identificacao");
    setDocumentosVisitados(false);
    escreverUrlLocal(c.id);
    form.reset({
      name: c.name, type: c.type, phone: c.phone || "", cep: c.cep || "",
      logradouro: c.logradouro || "", numero: c.numero || "", complemento: c.complemento || "",
      bairro: c.bairro || "", cidade: c.cidade || "", estado: c.estado || "",
      zona: c.zona || "", color: c.color || "#16284a",
      googleCalendarId: c.googleCalendarId || "", active: c.active,
      modalidade: c.modalidade ?? "definir", mesmoEnderecoEmpresa: c.mesmoEnderecoEmpresa,
      observacaoLocal: c.observacaoLocal ?? "", nomeEspaco: c.nomeEspaco ?? "",
    });
    setDialogOpen(true);
  };
  useEffect(() => {
    if (localAberto.current || !localSolicitado.current || isLoading || isError) return;
    localAberto.current = true;
    const local = clinicas.find((item) => String(item.id) === localSolicitado.current);
    if (local) openEdit(local);
    else toast.error("O local solicitado não foi encontrado.");
  }, [clinicas, isLoading, isError]);
  const handleDialogOpen = (open: boolean) => {
    if (open) { setDialogOpen(true); return; }
    if (gravando()) return;
    if (formSujo &&
      !window.confirm("Há alterações não salvas. Fechar descartará essas alterações. Continuar?")) return;
    fecharDialogo();
  };
  const localEditado = editingId ? clinicas.find((c) => c.id === editingId) ?? null : null;
  const empresaNovaNome = empresasDisponiveis.data?.find((e) => String(e.id) === novaEmpresaId)?.nome ?? null;
  const empresaDona = editingId
    ? (localEditado?.empresaNome ?? empresaVinculada?.nome ?? null)
    : empresaNovaNome;
  const abrirIdentidadeNaEmpresa = (empresaId: number) => {
    if (gravando()) return;
    if (formSujo &&
      !window.confirm("Há alterações não salvas neste local. Abrir a empresa descartará essas alterações. Continuar?")) return;
    sessaoRef.current += 1;
    setDialogOpen(false);
    navegar(`/cadastros/empresas?empresa=${empresaId}&aba=marca-documento`);
  };

  const ativas = useMemo(() => clinicas.filter((c) => c.active), [clinicas]);
  const inativas = useMemo(() => clinicas.filter((c) => !c.active), [clinicas]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Cabeçalho */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-testid="locais-cabecalho">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bevel-3d p-2.5 shrink-0"><Building2 className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase">LOCAIS DE ATENDIMENTO</h1>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">
              {ativas.length} ativo{ativas.length !== 1 ? "s" : ""} · {inativas.length} inativo{inativas.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="btn-3d px-5 shrink-0 w-full sm:w-auto" data-testid="local-novo">
          <Plus className="w-4 h-4 mr-2" /> NOVO LOCAL
        </Button>
      </div>

      {/* Locais agrupados: Empresa > Estado > Cidade > Região, com selo de modalidade */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : isError ? (
        <div role="alert" className="concave-3d text-center py-10 text-sm">
          <p>Não foi possível carregar os locais. Verifique sua sessão e tente novamente.</p>
          <Button type="button" className="btn-3d-soft mt-4" onClick={() => void refetchClinicas()}>Tentar novamente</Button>
        </div>
      ) : clinicas.length === 0 ? (
        <div className="concave-3d text-center py-16 text-muted-foreground text-sm">
          Nenhum local cadastrado. Clique em NOVO LOCAL.
        </div>
      ) : (
        <LocaisPorEmpresa locais={clinicas} onEdit={openEdit}
          empresaFiltro={empresaFiltro} onEmpresaFiltro={setEmpresaFiltro}
          onToggleAtivo={(c, ativo) => ativoMutation.mutate({ c, ativo })} />
      )}

      {/* ── Dialog criar / editar ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpen}>
        <DialogContent className="pax-dialogo-fixo top-2 translate-y-0 max-w-3xl p-0 gap-0" data-testid="local-dialogo">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0 space-y-2">
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">
              {editingId ? "EDITAR LOCAL" : "NOVO LOCAL"}
            </DialogTitle>
            <div className="concave-3d px-3 py-2 flex items-center gap-2 min-w-0" data-testid="local-empresa-proprietaria">
              <Building2 className="w-4 h-4 text-primary shrink-0" aria-hidden />
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0">Empresa proprietária</span>
              <span className="text-[12px] font-bold truncate" data-testid="local-empresa-proprietaria-nome">
                {empresaDona ?? (editingId ? "Sem empresa vinculada" : "Nenhuma empresa escolhida")}
              </span>
              {editingId && <span className="ml-auto text-[9px] font-mono text-muted-foreground shrink-0">Local #{editingId}</span>}
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 px-4 sm:px-6 py-3 shrink-0" role="group" aria-label="Seções do local">
            {([
              ["identificacao", "Identificação"],
              ["endereco", "Endereço"],
              ["contato", "Contato"],
              ["agenda", "Agenda Google"],
              ["documentos", "Identidade dos documentos"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => { setSecao(value); if (value === "documentos") setDocumentosVisitados(true); }}
                aria-pressed={secao === value} data-testid={`local-secao-${value}`}
                className="bevel-3d pax-escolha min-w-0 h-11 px-2 text-[10px] font-bold uppercase leading-tight">
                {label}
              </button>
            ))}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => {
              if (!editingId && (!novaEmpresaId || !empresasDisponiveis.data?.some((e) => String(e.id) === novaEmpresaId))) {
                setErroEmpresa("Selecione a empresa responsável pelo local.");
                setSecao("identificacao");
                return;
              }
              setErroEmpresa("");
              if (saveMutation.isPending) return;
              const alvo = editingId ? clinicas.find((c) => c.id === editingId) : null;
              saveMutation.mutate({ values: v, alvoId: editingId, empresaId: editingId ? (alvo?.empresaId ? String(alvo.empresaId) : "") : novaEmpresaId });
            }, () => setSecao("identificacao"))} className="flex flex-col min-h-0">
              <div className="pax-dialogo-miolo px-6 pb-4" data-testid="local-dialogo-miolo">

              {/* ── SEÇÃO 1: IDENTIFICAÇÃO ── */}
              <div hidden={secao !== "identificacao"} className="space-y-4">
              <SectionDivider label="Identificação" />
              {!editingId && (
                <div className="space-y-2">
                  <label htmlFor="empresa-do-novo-local" className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Empresa responsável pelo local *</label>
                  {empresasDisponiveis.isLoading ? (
                    <p role="status" className="text-sm">Consultando empresas disponíveis...</p>
                  ) : empresasDisponiveis.isError ? (
                    <div role="alert" className="text-sm">Não foi possível consultar as empresas. <button type="button" className="btn-3d-soft px-2 py-1" onClick={() => void empresasDisponiveis.refetch()}>Tentar novamente</button></div>
                  ) : (
                    <Select value={empresasDisponiveis.data?.some((e) => String(e.id) === novaEmpresaId) ? novaEmpresaId : ""} onValueChange={(value) => { setNovaEmpresaId(value); setErroEmpresa(""); }}>
                      <SelectTrigger id="empresa-do-novo-local" className="field-engraved" data-testid="local-novo-empresa"><SelectValue placeholder="Selecionar empresa..." /></SelectTrigger>
                      <SelectContent>
                        {[...(empresasDisponiveis.data ?? [])].sort(compararEmpresas).map((empresa) => <SelectItem key={empresa.id} value={String(empresa.id)}>{empresa.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {erroEmpresa && <p role="alert" className="text-sm text-destructive">{erroEmpresa}</p>}
                  <p className="text-xs text-muted-foreground">O local será cadastrado para a empresa escolhida. O servidor confirma o seu acesso.</p>
                </div>
              )}
              {/* Modalidade do atendimento: selo visual + sinalizador "mesmo endereço da empresa" */}
              <div className="space-y-2">
                <p className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Como este local atende *</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="Modalidade do local">
                  {([
                    ["presencial", "Presencial", "Sede ou local externo", MODO_META.sede.Icon],
                    ["online", "Online", "Endereço só como referência", Video],
                    ["definir", "Indefinido", "Informar depois", MODO_META.definir.Icon],
                  ] as const).map(([valor, titulo, sub, Icone]) => {
                    const ativo = modalidadeAtual === valor;
                    return (
                      <button key={valor} type="button" aria-pressed={ativo} data-testid={`local-modalidade-${valor}`}
                        onClick={() => { form.setValue("modalidade", valor, { shouldDirty: true }); if (valor === "definir") form.setValue("mesmoEnderecoEmpresa", false, { shouldDirty: true }); }}
                        className="bevel-3d pax-escolha h-16 p-3 flex items-center gap-3 text-left">
                        <Icone className="w-5 h-5 shrink-0" aria-hidden />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-black uppercase tracking-widest">{titulo}</span>
                          <span className="block text-[10px] opacity-75">{sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {modalidadeAtual !== "definir" && (
                  <div className="concave-3d p-3 flex items-start gap-3">
                    <Switch id="mesmo-endereco-empresa" checked={mesmoEnderecoAtual}
                      onCheckedChange={(v) => form.setValue("mesmoEnderecoEmpresa", v, { shouldDirty: true })} />
                    <div className="min-w-0">
                      <label htmlFor="mesmo-endereco-empresa" className="text-[11px] font-black uppercase tracking-widest cursor-pointer">
                        {modalidadeAtual === "online" ? "Usar o endereço da empresa como referência" : "O local físico é o mesmo endereço da empresa"}
                      </label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {mesmoEnderecoAtual
                          ? (enderecoEmpresaEdicao ? `Sede de ${empresaDona ?? "empresa proprietária"}: ${enderecoEmpresaEdicao}` : `Será usado o endereço da sede de ${empresaDona ?? "empresa escolhida"} ao salvar.`)
                          : (modalidadeAtual === "online" ? "Desligado: informe na aba Endereço um endereço de referência, se houver." : "Desligado: informe o endereço deste local na aba Endereço (sala alugada, coworking, outra cidade).")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Nome *</FormLabel>
                    <FormControl><Input placeholder="Ex: Instituto Padua — Tatuapé" {...field} className="field-engraved" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Tipo</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="clinic">Local de atendimento</SelectItem>
                          <SelectItem value="homecare">Domiciliar / Itinerante</SelectItem>
                          <SelectItem value="lab">Laboratório</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />

                <FormField control={form.control} name="active" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Status</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={(v) => field.onChange(v === "true")} value={field.value ? "true" : "false"}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="true">Ativa</SelectItem>
                          <SelectItem value="false">Inativa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />

                <FormField control={form.control} name="color" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Cor de identificação</FormLabel>
                    <div className="flex items-center gap-3">
                      <FormControl>
                        <Input type="color" {...field} className="field-engraved h-10 w-14 p-1 cursor-pointer" />
                      </FormControl>
                      <div className="flex gap-1.5 flex-wrap">
                        {["#16284a","#3D7A7A","#45B8CC","#10B981","#7C3AED","#D97706","#E11D48","#3B82F6"].map((col) => (
                          <button
                            key={col} type="button"
                            onClick={() => form.setValue("color", col)}
                            className="w-6 h-6 rounded-[4px] border-2 transition-all"
                            style={{ backgroundColor: col, borderColor: field.value === col ? "#fff" : "transparent" }}
                          />
                        ))}
                      </div>
                    </div>
                  </FormItem>
                )} />

                {modalidadeAtual === "presencial" && !mesmoEnderecoAtual && (
                  <FormField control={form.control} name="nomeEspaco" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Nome do espaço (sala, coworking, clínica parceira)</FormLabel>
                      <FormControl><Input placeholder="Ex: Sala 706 — Locação de consultórios" {...field} className="field-engraved" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <FormField control={form.control} name="observacaoLocal" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Observação do local</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Ex: Atendimento online, endereço da empresa só como referência." {...field} className="field-engraved" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              </div>

              {/* ── SEÇÃO 2: ENDEREÇO ── */}
              <div hidden={secao !== "endereco"} className="space-y-4">
              <SectionDivider label="Endereço" />
              {modalidadeAtual === "online" && !mesmoEnderecoAtual && (
                <p className="concave-3d p-4 text-sm flex items-center gap-2"><Video className="w-4 h-4 shrink-0" /> Atendimento online: o endereço abaixo é apenas uma referência (opcional).</p>
              )}
              {mesmoEnderecoAtual ? (
                <p className="concave-3d p-4 text-sm flex items-start gap-2">
                  <Building2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Endereço herdado da empresa{enderecoEmpresaEdicao ? `: ${enderecoEmpresaEdicao}` : "."} Para usar outro endereço, desligue "mesmo endereço da empresa" na aba Identificação.</span>
                </p>
              ) : null}
              <div className={mesmoEnderecoAtual ? "hidden" : "space-y-4"}>

              {/* CEP + busca automática */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="cep" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">CEP</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="00000-000" className="field-engraved"
                          value={field.value}
                          onChange={(e) => {
                            const f = formatCEP(e.target.value);
                            field.onChange(f);
                            if (f.replace(/\D/g, "").length === 8) setTimeout(doLookupCep, 120);
                          }}
                        />
                      </FormControl>
                      <Button type="button" size="icon" onClick={doLookupCep} disabled={loadingCep} className="btn-3d-soft shrink-0">
                        {loadingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">Preenchido automaticamente ao digitar</p>
                  </FormItem>
                )} />

                <FormField control={form.control} name="logradouro" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Logradouro</FormLabel>
                    <FormControl><Input placeholder="Rua, Avenida, SHLS..." {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="numero" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Número</FormLabel>
                    <FormControl><Input placeholder="123" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="complemento" render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Complemento</FormLabel>
                    <FormControl><Input placeholder="Sala 101, Andar 4, Cj 72..." {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Bairro</FormLabel>
                    <FormControl><Input placeholder="Tatuapé" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Cidade</FormLabel>
                    <FormControl><Input placeholder="São Paulo" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="estado" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">UF</FormLabel>
                    <FormControl>
                      <Input placeholder="SP" maxLength={2} {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        className="field-engraved text-center font-bold" />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="zona" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">
                      Zona / Área
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Automático pelo bairro (ex: Zona Leste)"
                        {...field}
                        className="field-engraved"
                      />
                    </FormControl>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                      Deixe vazio = servidor detecta pelo bairro/CEP automaticamente
                    </p>
                  </FormItem>
                )} />
              </div>
              </div>
              </div>

              {/* ── SEÇÃO 3: CONTATO & AGENDA ── */}
              <div hidden={secao !== "contato"} className="space-y-4">
              <SectionDivider label="Contato" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">
                      Telefone / WhatsApp
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="(11) 90000-0000"
                        className="field-engraved"
                        value={field.value}
                        onChange={(e) => field.onChange(formatPhone(e.target.value))}
                      />
                    </FormControl>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                      DDI +55 adicionado automaticamente no Brasil
                    </p>
                  </FormItem>
                )} />

                <FormField control={form.control} name="googleCalendarId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">
                      ID Agenda Google (somente leitura)
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Escolha na aba Agenda Google"
                        {...field}
                        readOnly
                        className="field-engraved font-mono text-[11px]"
                      />
                    </FormControl>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                      Para trocar a agenda, use a aba Agenda Google.
                    </p>
                  </FormItem>
                )} />
              </div>
              </div>

              <div hidden={secao !== "agenda"} className="space-y-4">
                <SectionDivider label="Agenda Google" />
                <AgendaGoogleTab
                  key={`agenda-${sessaoRef.current}`}
                  localId={editingId}
                  googleCalendarId={form.watch("googleCalendarId") || null}
                  papelInicial={clinicas.find((c) => c.id === editingId)?.agendaPapel ?? null}
                  onVinculado={({ googleCalendarId, cor }) => {
                    form.setValue("googleCalendarId", googleCalendarId);
                    if (cor) form.setValue("color", cor);
                  }}
                  onUsarEndereco={((sessao) => (e: EnderecoLido) => aplicarEnderecoGoogle(e, sessao))(sessaoRef.current)}
                />
              </div>

              {documentosVisitados && (
                <div hidden={secao !== "documentos"} className="space-y-3">
                  {!editingId ? (
                    <p className="concave-3d p-4 text-sm">Salve o local primeiro para consultar a empresa vinculada.</p>
                  ) : vinculos.isLoading || vinculos.isFetching ? (
                    <p role="status" className="concave-3d p-4 text-sm">Consultando a empresa vinculada...</p>
                  ) : vinculos.isError ? (
                    <div role="alert" className="concave-3d p-4 text-sm">
                      <p>Não foi possível consultar o vínculo do local. Nenhuma empresa foi selecionada.</p>
                      <Button type="button" className="btn-3d-soft mt-3" onClick={() => void vinculos.refetch()}>Tentar novamente</Button>
                    </div>
                  ) : !empresaVinculada ? (
                    <div role="alert" className="concave-3d p-4 text-sm">
                      Não foi possível confirmar uma empresa vinculada a este local. Confira o vínculo antes de configurar a identidade.
                    </div>
                  ) : (
                    <div className="concave-3d p-4 space-y-3" data-testid="local-identidade-atalho">
                      <p className="text-sm">A identidade e o logotipo dos documentos pertencem à empresa. Há um único editor, no cadastro da empresa.</p>
                      <p className="text-sm font-semibold">Empresa vinculada: {empresaVinculada.nome}</p>
                      <Button type="button" className="btn-3d-soft" data-testid="local-abrir-identidade-empresa" disabled={saveMutation.isPending}
                        onClick={() => abrirIdentidadeNaEmpresa(empresaVinculada.id)}>
                        <ExternalLink className="w-4 h-4 mr-2" /> Abrir identidade em Empresas
                      </Button>
                    </div>
                  )}
                </div>
              )}
              </div>
              {/* Rodapé do form */}
              {saveMutation.isError && <p role="alert" className="px-6 pb-2 text-sm text-destructive shrink-0">{saveMutation.error.message}</p>}
              <DialogFooter className="px-6 py-3 border-t border-border/40 shrink-0" data-testid="local-dialogo-rodape">
                <Button type="button" className="btn-3d-soft" disabled={saveMutation.isPending} onClick={() => handleDialogOpen(false)}>
                  CANCELAR
                </Button>
                <Button type="submit" className="btn-3d px-6" disabled={saveMutation.isPending} data-testid="local-salvar">
                  {saveMutation.isPending
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <Save className="w-4 h-4 mr-2" />}
                  SALVAR LOCAL
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
