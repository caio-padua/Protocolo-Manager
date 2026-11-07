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
import { Paxmed2bEmpresa } from "@/components/receituario/Paxmed2bEmpresa";
import {
  Building2, Plus, Loader2, Search, Save, Pencil, Trash2,
  Phone, MapPin, CalendarCheck, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { collabAuthHeaders } from "@/lib/collab-auth";

const apiBase = import.meta.env.VITE_API_URL || "/api";

interface Clinica {
  id: number; name: string; address: string | null; type: string;
  color: string; active: boolean; googleCalendarId: string | null;
  phone: string | null; cep: string | null; logradouro: string | null;
  numero: string | null; complemento: string | null; bairro: string | null;
  cidade: string | null; estado: string | null; zona: string | null;
}

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
function displayPhone(raw: string | null): string {
  if (!raw) return "—";
  const clean = raw.replace(/^\+55/, "").replace(/\D/g, "");
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return raw;
}
function calLabel(id: string | null): string {
  if (!id) return "—";
  if (id.includes("@group.calendar.google.com")) return id.split("@")[0].slice(0, 16) + "…";
  if (id.includes("@")) return id;
  return id.slice(0, 20) + (id.length > 20 ? "…" : "");
}

const TYPE_LABELS: Record<string, string> = {
  clinic: "Local de atendimento", homecare: "Domiciliar", lab: "Laboratório",
};

const EMPTY: FormValues = {
  name: "", type: "clinic", phone: "", cep: "", logradouro: "", numero: "",
  complemento: "", bairro: "", cidade: "", estado: "", zona: "",
  color: "#16284a", googleCalendarId: "", active: true,
};

// ── Card de clínica ───────────────────────────────────────────────────────────
function ClinicaCard({ c, onEdit, onDelete }: { c: Clinica; onEdit: () => void; onDelete: () => void }) {
  const endLine1 = [c.logradouro, c.numero, c.complemento].filter(Boolean).join(", ");
  const endLine2 = [c.bairro, c.cidade ? `${c.cidade}${c.estado ? " - " + c.estado : ""}` : c.estado].filter(Boolean).join(" · ");

  return (
    <div className="panel-3d relative overflow-hidden flex flex-col">
      {/* Faixa lateral de cor */}
      <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-[6px]" style={{ backgroundColor: c.color || "#16284a" }} />

      <div className="pl-4 pr-3 pt-3 pb-3 flex flex-col gap-2.5 flex-1">
        {/* Linha de topo: status + tipo + ID */}
        <div className="flex items-center gap-2">
          <span className={`paxter-led ${c.active ? "paxter-led-breathe paxter-led-green" : "paxter-led-amber"}`} />
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            {TYPE_LABELS[c.type] ?? c.type}
          </span>
          <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">#{c.id}</span>
          {!c.active && (
            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-amber-400/15 text-amber-700 rounded-[3px]">
              INATIVA
            </span>
          )}
        </div>

        {/* Nome */}
        <h3 className="font-black text-[15px] uppercase tracking-tight leading-tight">
          {c.name}
        </h3>

        {/* Bloco de informações — sempre visível */}
        <div className="concave-3d p-2.5 space-y-1.5 flex-1">
          {/* Endereço */}
          <div className="flex items-start gap-2 text-[11px]">
            <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/60" />
            <div className="min-w-0">
              {endLine1 ? (
                <>
                  <p className="text-foreground/80 truncate">{endLine1}</p>
                  {endLine2 && <p className="text-muted-foreground truncate">{endLine2}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">{c.address || "—"}</p>
              )}
            </div>
          </div>

          {/* Telefone */}
          <div className="flex items-center gap-2 text-[11px]">
            <Phone className="w-3 h-3 shrink-0 text-muted-foreground/60" />
            <span className={c.phone ? "text-foreground/80" : "text-muted-foreground"}>{displayPhone(c.phone)}</span>
          </div>

          {/* Zona */}
          {c.zona && (
            <div className="flex items-center gap-2 text-[11px]">
              <Tag className="w-3 h-3 shrink-0 text-muted-foreground/60" />
              <span className="text-primary font-semibold">{c.zona}</span>
            </div>
          )}

          {/* Google Calendar */}
          <div className="flex items-center gap-2 text-[11px]">
            <CalendarCheck className="w-3 h-3 shrink-0 text-muted-foreground/60" />
            <span className="text-muted-foreground font-mono truncate" title={c.googleCalendarId ?? undefined}>
              {calLabel(c.googleCalendarId)}
            </span>
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-2 pt-0.5">
          <button
            type="button"
            onClick={onEdit}
            className="bevel-3d flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 transition-colors"
          >
            <Pencil className="w-3 h-3" /> Editar
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="bevel-3d px-3 py-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [secao, setSecao] = useState<"identificacao" | "endereco" | "contato" | "documentos">("identificacao");
  const [documentosVisitados, setDocumentosVisitados] = useState(false);
  const [identidadeAlterada, setIdentidadeAlterada] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Clinica | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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
    queryKey: ["semantic-code-locations"],
    enabled: dialogOpen && editingId !== null && documentosVisitados,
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

  const doLookupCep = useCallback(async () => {
    const cep = form.getValues("cep")?.replace(/\D/g, "");
    if (!cep || cep.length !== 8) { toast.error("CEP deve ter 8 dígitos"); return; }
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!res.ok) { toast.error("CEP não encontrado"); return; }
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      form.setValue("logradouro", data.logradouro || "");
      form.setValue("bairro",     data.bairro     || "");
      form.setValue("cidade",     data.localidade || "");
      form.setValue("estado",     data.uf         || "");
      toast.success("Endereço preenchido automaticamente!");
    } catch { toast.error("Erro ao buscar CEP"); }
    finally  { setLoadingCep(false); }
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!editingId && (!novaEmpresaId || !empresasDisponiveis.data?.some((e) => String(e.id) === novaEmpresaId))) {
        throw new Error("Selecione a empresa responsável pelo local.");
      }
      const parts = [
        values.logradouro, values.numero, values.complemento && `(${values.complemento})`,
        values.bairro,
        values.cidade ? `${values.cidade}${values.estado ? " - " + values.estado : ""}` : values.estado,
        values.cep ? `CEP ${values.cep}` : "",
      ].filter(Boolean);
      const body = { ...values, address: parts.join(", ") || null, googleCalendarId: values.googleCalendarId || null };
      const url = editingId ? `${apiBase}/locations/${editingId}` : `${apiBase}/locations`;
      const headers = collabAuthHeaders({
        "Content-Type": "application/json",
        ...(!editingId ? { "X-Empresa-Id": novaEmpresaId } : {}),
      });
      const res = await fetch(url, { method: editingId ? "PUT" : "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Não foi possível salvar o local. Confira o acesso à empresa e tente novamente.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinicas"] });
      queryClient.invalidateQueries({ queryKey: ["empresas-locais-confirmados"] });
      queryClient.invalidateQueries({ queryKey: ["semantic-code-locations"] });
      toast.success(editingId ? "Local atualizado!" : "Local cadastrado!");
      setDialogOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}/locations/${id}`, { method: "DELETE" });
      if (res.status === 409) { const d = await res.json(); throw new Error(d.error || "Clínica possui sessões vinculadas."); }
      if (!res.ok) throw new Error("Erro ao apagar");
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clinicas"] }); toast.success("Clínica apagada."); setDeleteTarget(null); setDeleteConfirmText(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { saveMutation.reset(); setEditingId(null); setNovaEmpresaId(""); setErroEmpresa(""); setSecao("identificacao"); setDocumentosVisitados(false); setIdentidadeAlterada(false); form.reset(EMPTY); setDialogOpen(true); };
  const openEdit = (c: Clinica) => {
    saveMutation.reset();
    setEditingId(c.id);
    setSecao("identificacao");
    setDocumentosVisitados(false);
    setIdentidadeAlterada(false);
    form.reset({
      name: c.name, type: c.type, phone: c.phone || "", cep: c.cep || "",
      logradouro: c.logradouro || "", numero: c.numero || "", complemento: c.complemento || "",
      bairro: c.bairro || "", cidade: c.cidade || "", estado: c.estado || "",
      zona: c.zona || "", color: c.color || "#16284a",
      googleCalendarId: c.googleCalendarId || "", active: c.active,
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
    if (!open && (form.formState.isDirty || identidadeAlterada) &&
      !window.confirm("Há alterações não salvas. Fechar descartará essas alterações. Continuar?")) return;
    setDialogOpen(open);
  };

  // ── Agrupamento geográfico data-bound ────────────────────────────────────────
  // Grupo = "Cidade · UF" derivado dos dados reais do banco.
  // Nenhum valor de cidade ou estado é fixo no código.
  // Dentro de cada cidade com 3+ locais: sub-agrupamento por zona.

  const ativas = useMemo(() => clinicas.filter((c) => c.active), [clinicas]);

  const grupos = useMemo(() => {
    const map = new Map<string, Clinica[]>();
    for (const c of ativas) {
      const chave =
        c.cidade && c.estado ? `${c.cidade} · ${c.estado}` :
        c.cidade              ? c.cidade :
        c.estado              ? `Estado: ${c.estado}` :
                                "Sem Localização";
      if (!map.has(chave)) map.set(chave, []);
      map.get(chave)!.push(c);
    }
    // Ordena: maior grupo primeiro; empate → alfabético
    return [...map.entries()].sort(([a, ac], [b, bc]) =>
      bc.length !== ac.length ? bc.length - ac.length : a.localeCompare(b, "pt-BR")
    );
  }, [clinicas]);

  const inativas = useMemo(() => clinicas.filter((c) => !c.active), [clinicas]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bevel-3d p-2.5 shrink-0"><Building2 className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight uppercase">LOCAIS DE ATENDIMENTO</h1>
            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">
              {ativas.length} ativo{ativas.length !== 1 ? "s" : ""} · {inativas.length} inativo{inativas.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="btn-3d px-5 shrink-0">
          <Plus className="w-4 h-4 mr-2" /> NOVO LOCAL
        </Button>
      </div>

      {/* Grade de cards — agrupamento geográfico data-bound */}
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
        <div className="space-y-8">
          {/* Grupos geográficos — um painel por cidade */}
          {grupos.map(([cidadeKey, lista]) => {
            // Sub-agrupamento por zona dentro de cada cidade (só quando há zonas variadas)
            const zonaMap = new Map<string, Clinica[]>();
            for (const c of lista) {
              const z = c.zona || "—";
              if (!zonaMap.has(z)) zonaMap.set(z, []);
              zonaMap.get(z)!.push(c);
            }
            const temMultiploZonas = zonaMap.size > 1;

            return (
              <div key={cidadeKey}>
                {/* Cabeçalho da cidade */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="bevel-3d px-3 py-1.5 flex items-center gap-2 shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <span className="font-black text-[11px] uppercase tracking-widest">{cidadeKey}</span>
                    <span className="text-[9px] text-muted-foreground/60 font-bold">
                      {lista.length} local{lista.length !== 1 ? "is" : ""}
                    </span>
                  </div>
                  <div className="h-px bg-primary/15 flex-1" />
                </div>

                {temMultiploZonas ? (
                  /* Com sub-zonas: agrupa por área dentro da cidade */
                  <div className="space-y-5 pl-4 border-l-2 border-primary/10">
                    {[...zonaMap.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([zona, items]) => (
                      <div key={zona}>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/50 mb-2.5 flex items-center gap-2">
                          <Tag className="w-3 h-3" /> {zona}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {items.map((c) => (
                            <ClinicaCard key={c.id} c={c}
                              onEdit={() => openEdit(c)}
                              onDelete={() => { setDeleteTarget(c); setDeleteConfirmText(""); }} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Cidade única ou sem zonas: grade direta */
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {lista.map((c) => (
                      <ClinicaCard key={c.id} c={c}
                        onEdit={() => openEdit(c)}
                        onDelete={() => { setDeleteTarget(c); setDeleteConfirmText(""); }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Inativas — sempre ao final, separadas */}
          {inativas.length > 0 && (
            <div className="opacity-60">
              <SectionDivider label={`${inativas.length} inativa${inativas.length > 1 ? "s" : ""}`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                {inativas.map((c) => (
                  <ClinicaCard key={c.id} c={c}
                    onEdit={() => openEdit(c)}
                    onDelete={() => { setDeleteTarget(c); setDeleteConfirmText(""); }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dialog criar / editar ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">
              {editingId ? "EDITAR LOCAL" : "NOVO LOCAL"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 sm:px-6 py-3" role="group" aria-label="Seções do local">
            {([
              ["identificacao", "Identificação"],
              ["endereco", "Endereço"],
              ["contato", "Contato e agenda"],
              ["documentos", "Identidade dos documentos"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => { setSecao(value); if (value === "documentos") setDocumentosVisitados(true); }}
                aria-pressed={secao === value}
                className={`bevel-3d min-w-0 px-2 py-2 text-[10px] font-bold uppercase ${secao === value ? "text-primary ring-2 ring-primary/30" : "text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => {
              if (identidadeAlterada && !window.confirm("Salvar o local fechará esta janela e descartará as alterações não salvas da identidade. Continuar?")) return;
              if (!editingId && (!novaEmpresaId || !empresasDisponiveis.data?.some((e) => String(e.id) === novaEmpresaId))) {
                setErroEmpresa("Selecione a empresa responsável pelo local.");
                setSecao("identificacao");
                return;
              }
              setErroEmpresa("");
              saveMutation.mutate(v);
            }, () => setSecao("identificacao"))} className="flex flex-col min-h-0">
              <div className="min-h-0 overflow-y-auto px-6 pb-4">

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
                    <Select value={novaEmpresaId} onValueChange={(value) => { setNovaEmpresaId(value); setErroEmpresa(""); }}>
                      <SelectTrigger id="empresa-do-novo-local" className="field-engraved"><SelectValue placeholder="Selecionar empresa..." /></SelectTrigger>
                      <SelectContent>
                        {(empresasDisponiveis.data ?? []).map((empresa) => <SelectItem key={empresa.id} value={String(empresa.id)}>{empresa.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {erroEmpresa && <p role="alert" className="text-sm text-destructive">{erroEmpresa}</p>}
                  <p className="text-xs text-muted-foreground">O local será cadastrado para a empresa escolhida. O servidor confirma o seu acesso.</p>
                </div>
              )}
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
              </div>
              </div>

              {/* ── SEÇÃO 2: ENDEREÇO ── */}
              <div hidden={secao !== "endereco"} className="space-y-4">
              <SectionDivider label="Endereço" />

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

              {/* ── SEÇÃO 3: CONTATO & AGENDA ── */}
              <div hidden={secao !== "contato"} className="space-y-4">
              <SectionDivider label="Contato & Agenda Google" />

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
                      ID Agenda Google
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="...@group.calendar.google.com"
                        {...field}
                        className="field-engraved font-mono text-[11px]"
                      />
                    </FormControl>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                      Configurações do Google Calendar → Integração → ID da agenda
                    </p>
                  </FormItem>
                )} />
              </div>
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
                  ) : import.meta.env.DEV ? (
                    <>
                      <p className="text-sm font-semibold">Empresa vinculada: {empresaVinculada.nome}</p>
                      <Paxmed2bEmpresa key={`${editingId}-${empresaVinculada.id}`} empresaId={empresaVinculada.id} onDirtyChange={setIdentidadeAlterada} />
                    </>
                  ) : (
                    <p className="concave-3d p-4 text-sm">A personalização dos documentos ainda está em teste e não está disponível nesta versão.</p>
                  )}
                </div>
              )}
              </div>
              {/* Rodapé do form */}
              {saveMutation.isError && <p role="alert" className="px-6 pb-2 text-sm text-destructive">{saveMutation.error.message}</p>}
              <DialogFooter className="px-6 py-3 border-t border-border/40">
                <Button type="button" className="btn-3d-soft" onClick={() => handleDialogOpen(false)}>
                  CANCELAR
                </Button>
                <Button type="submit" className="btn-3d px-6" disabled={saveMutation.isPending}>
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

      {/* ── Dialog confirmar exclusão ──────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest text-destructive">
              APAGAR CLÍNICA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="concave-3d p-3 text-sm">
              <p className="text-muted-foreground mb-2">Esta ação é irreversível. Para confirmar, digite o nome exato:</p>
              <p className="font-black text-foreground">{deleteTarget?.name}</p>
            </div>
            <Input
              className="field-engraved"
              placeholder="Digite o nome exato da clínica"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" className="btn-3d-soft" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>
                CANCELAR
              </Button>
              <Button
                type="button" variant="destructive" className="btn-3d"
                disabled={deleteConfirmText !== deleteTarget?.name || deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                APAGAR
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
