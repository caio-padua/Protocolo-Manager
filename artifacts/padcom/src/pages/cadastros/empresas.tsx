import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Building2, Users, Briefcase, Plus, Loader2, Save, Pencil, Trash2,
  Phone, MapPin, Mail, ChevronDown, ChevronRight, ShieldCheck, Globe,
} from "lucide-react";
import { toast } from "sonner";

const apiBase = import.meta.env.VITE_API_URL || "/api";

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface Empresa {
  id: number; iheId: number | null;
  nome: string; nick: string | null; cnpj: string | null;
  tipo: string; tipoUnidade: string | null; status: string; ativa: boolean;
  donoNome: string | null; slug: string | null; timezone: string | null;
  endereco: string | null; cep: string | null; bairro: string | null;
  cidade: string | null; estado: string | null;
  telefone: string | null; emailGeral: string | null; emailAgenda: string | null;
  emailEnfermagem: string | null; emailFinanceiro: string | null;
  googleCalendarId: string | null; googleDriveFolderId: string | null;
  modulosAtivos: Record<string, boolean>;
  tipoContrato: string | null; fatMetaMensal: number | null;
}

interface Cargo {
  id: number; cargo: string; indice: string | null; codigoCompleto: string | null;
  modalidade: string | null; slaDefault: string | null; descricaoFuncao: string | null;
  podeAcessarFinanceiro: boolean; podeEditarProtocolos: boolean; podeAprovarDespesas: boolean;
  podeAuditarCards: boolean; podeVerOuvidoria: boolean; podeSupervisionar: boolean;
  ativa: boolean;
}

interface Colaborador {
  id: number; nomeCompleto: string; cpf: string | null;
  emailFuncional: string | null; telefone: string | null;
  statusAtivo: boolean; dataAdmissao: string | null; dataDemissao: string | null;
  cargoNome: string | null; cargoModalidade: string | null;
}

// ── Schema do formulário ───────────────────────────────────────────────────────
const formSchema = z.object({
  nome:            z.string().min(2, "Nome obrigatório"),
  nick:            z.string().optional(),
  cnpj:            z.string().optional(),
  tipo:            z.string(),
  tipoUnidade:     z.string().optional(),
  status:          z.string(),
  ativa:           z.boolean(),
  donoNome:        z.string().optional(),
  slug:            z.string().optional(),
  timezone:        z.string().optional(),
  endereco:        z.string().optional(),
  cep:             z.string().optional(),
  bairro:          z.string().optional(),
  cidade:          z.string().optional(),
  estado:          z.string().optional(),
  telefone:        z.string().optional(),
  emailGeral:      z.string().optional(),
  emailAgenda:     z.string().optional(),
  emailEnfermagem: z.string().optional(),
  emailFinanceiro: z.string().optional(),
  googleCalendarId:    z.string().optional(),
  googleDriveFolderId: z.string().optional(),
  tipoContrato:    z.string().optional(),
  fatMetaMensal:   z.coerce.number().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  nome: "", nick: "", cnpj: "", tipo: "clinic", tipoUnidade: "CLINICA_PARCEIRA",
  status: "ATIVO", ativa: true, donoNome: "", slug: "", timezone: "America/Sao_Paulo",
  endereco: "", cep: "", bairro: "", cidade: "", estado: "",
  telefone: "", emailGeral: "", emailAgenda: "", emailEnfermagem: "", emailFinanceiro: "",
  googleCalendarId: "", googleDriveFolderId: "", tipoContrato: "por_demanda", fatMetaMensal: undefined,
};

// ── Labels de referência ───────────────────────────────────────────────────────
const TIPO_LABELS: Record<string, string> = {
  clinic: "Clínica",
  genesis_seed: "Genesis (Template-Mestre)",
  telemedicina: "Telemedicina",
  enfermagem: "Enfermagem",
};
const TIPO_UNIDADE_LABELS: Record<string, string> = {
  CLINICA_OPERACIONAL: "Operacional",
  CLINICA_PARCEIRA: "Parceira",
  LABORATORIO_MESTRE: "Laboratório-Mestre",
};
const CONTRATO_LABELS: Record<string, string> = {
  por_demanda: "Por Demanda",
  full: "Full (Mensalidade Fixa)",
  pacote: "Pacote",
};
const STATUS_COLOR: Record<string, string> = {
  ATIVO: "text-emerald-600", SUSPENSO: "text-amber-600", CANCELADO: "text-red-600",
};

// ── Divisor de seção ───────────────────────────────────────────────────────────
function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px bg-primary/20 flex-1" />
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 shrink-0">{label}</span>
      <div className="h-px bg-primary/20 flex-1" />
    </div>
  );
}

// ── Badge de permissão ─────────────────────────────────────────────────────────
function PermBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] ${ok ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground/40"}`}>
      {label}
    </span>
  );
}

// ── Card da empresa ────────────────────────────────────────────────────────────
function EmpresaCard({ empresa, onEdit, onDelete, onOpen }: {
  empresa: Empresa;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="panel-3d relative overflow-hidden flex flex-col cursor-default">
      {/* Faixa lateral: genesis=dourado, ativa=teal, inativa=amber */}
      <div className={`absolute left-0 top-0 bottom-0 w-[4px] rounded-l-[6px] ${
        empresa.tipo === "genesis_seed" ? "bg-amber-400" :
        empresa.ativa ? "bg-primary" : "bg-amber-500"
      }`} />

      <div className="pl-4 pr-3 pt-3 pb-3 flex flex-col gap-2.5 flex-1">
        {/* Linha de status */}
        <div className="flex items-center gap-2">
          <span className={`paxter-led ${empresa.ativa ? "paxter-led-breathe paxter-led-green" : "paxter-led-amber"}`} />
          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
            {TIPO_LABELS[empresa.tipo] ?? empresa.tipo}
          </span>
          {empresa.tipoUnidade && (
            <span className="text-[8px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-[3px] font-bold uppercase">
              {TIPO_UNIDADE_LABELS[empresa.tipoUnidade] ?? empresa.tipoUnidade}
            </span>
          )}
          <span className="ml-auto text-[9px] font-mono text-muted-foreground/40">#{empresa.id}</span>
        </div>

        {/* Nome */}
        <h3 className="font-black text-[15px] uppercase tracking-tight leading-tight">{empresa.nome}</h3>

        {/* Bloco de dados */}
        <div className="concave-3d p-2.5 space-y-1.5 flex-1">
          {empresa.cnpj && (
            <div className="flex items-center gap-2 text-[11px]">
              <ShieldCheck className="w-3 h-3 shrink-0 text-muted-foreground/60" />
              <span className="font-mono text-foreground/70">{empresa.cnpj}</span>
            </div>
          )}
          {(empresa.cidade || empresa.estado) && (
            <div className="flex items-center gap-2 text-[11px]">
              <MapPin className="w-3 h-3 shrink-0 text-muted-foreground/60" />
              <span className="text-foreground/70">
                {[empresa.bairro, empresa.cidade, empresa.estado].filter(Boolean).join(" · ")}
              </span>
            </div>
          )}
          {empresa.telefone && (
            <div className="flex items-center gap-2 text-[11px]">
              <Phone className="w-3 h-3 shrink-0 text-muted-foreground/60" />
              <span className="text-foreground/70">{empresa.telefone}</span>
            </div>
          )}
          {empresa.emailGeral && (
            <div className="flex items-center gap-2 text-[11px]">
              <Mail className="w-3 h-3 shrink-0 text-muted-foreground/60" />
              <span className="text-muted-foreground truncate">{empresa.emailGeral}</span>
            </div>
          )}
          {empresa.donoNome && (
            <div className="flex items-center gap-2 text-[11px]">
              <Users className="w-3 h-3 shrink-0 text-muted-foreground/60" />
              <span className="text-primary font-semibold">{empresa.donoNome}</span>
            </div>
          )}
          {empresa.tipoContrato && (
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Contrato: {CONTRATO_LABELS[empresa.tipoContrato] ?? empresa.tipoContrato}
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="flex gap-1.5 pt-0.5">
          <button type="button" onClick={onOpen}
            className="bevel-3d flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-primary/10 transition-colors">
            <ChevronRight className="w-3 h-3" /> Ver Equipe
          </button>
          <button type="button" onClick={onEdit}
            className="bevel-3d px-2.5 py-1.5 hover:bg-primary/10 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {empresa.tipo !== "genesis_seed" && (
            <button type="button" onClick={onDelete}
              className="bevel-3d px-2.5 py-1.5 text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Painel lateral de equipe ───────────────────────────────────────────────────
function PainelEquipe({ empresa, onClose }: { empresa: Empresa; onClose: () => void }) {
  const [tab, setTab] = useState<"cargos" | "colaboradores">("colaboradores");
  const [expandedCargo, setExpandedCargo] = useState<number | null>(null);

  const { data: cargos = [], isLoading: loadCargos } = useQuery<Cargo[]>({
    queryKey: ["cargos", empresa.id],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/empresas/${empresa.id}/cargos`);
      return r.json();
    },
  });

  const { data: colaboradores = [], isLoading: loadColab } = useQuery<Colaborador[]>({
    queryKey: ["colaboradores", empresa.id],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/empresas/${empresa.id}/colaboradores`);
      return r.json();
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho do painel */}
      <div className="bevel-3d p-3 mb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              {TIPO_LABELS[empresa.tipo] ?? empresa.tipo}
              {empresa.tipoUnidade ? ` · ${TIPO_UNIDADE_LABELS[empresa.tipoUnidade] ?? empresa.tipoUnidade}` : ""}
            </p>
            <h2 className="font-black text-base uppercase mt-0.5">{empresa.nome}</h2>
            {empresa.cnpj && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{empresa.cnpj}</p>}
          </div>
          <button type="button" onClick={onClose}
            className="text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground px-2 py-1 bevel-3d">
            Fechar
          </button>
        </div>
        {empresa.donoNome && (
          <p className="text-[11px] text-primary font-semibold mt-1.5">Responsável: {empresa.donoNome}</p>
        )}
        {empresa.tipoContrato && (
          <p className="text-[9px] text-muted-foreground/60 uppercase font-bold mt-0.5">
            Contrato: {CONTRATO_LABELS[empresa.tipoContrato] ?? empresa.tipoContrato}
          </p>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-3">
        {(["colaboradores", "cargos"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-[4px] transition-colors
              ${tab === t ? "bevel-3d text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "colaboradores"
              ? `Colaboradores (${colaboradores.length})`
              : `Cargos (${cargos.length})`}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {tab === "colaboradores" && (
          loadColab ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : colaboradores.length === 0 ? (
            <div className="concave-3d text-center py-8 text-muted-foreground text-sm">Nenhum colaborador cadastrado.</div>
          ) : (
            colaboradores.map((c) => (
              <div key={c.id} className="panel-3d px-3 py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`paxter-led ${c.statusAtivo ? "paxter-led-breathe paxter-led-green" : "paxter-led-amber"}`} />
                    <p className="font-bold text-[12px] truncate">{c.nomeCompleto}</p>
                  </div>
                  {c.cargoNome && (
                    <p className="text-[10px] text-primary font-semibold mt-0.5">
                      {c.cargoNome}
                      {c.cargoModalidade && <span className="text-muted-foreground font-normal"> · {c.cargoModalidade}</span>}
                    </p>
                  )}
                  {c.emailFuncional && (
                    <p className="text-[10px] text-muted-foreground truncate">{c.emailFuncional}</p>
                  )}
                  {c.dataAdmissao && (
                    <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                      Desde {new Date(c.dataAdmissao).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>
            ))
          )
        )}

        {tab === "cargos" && (
          loadCargos ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : cargos.length === 0 ? (
            <div className="concave-3d text-center py-8 text-muted-foreground text-sm">Nenhum cargo cadastrado.</div>
          ) : (
            cargos.map((ca) => (
              <div key={ca.id} className="panel-3d overflow-hidden">
                <button type="button"
                  onClick={() => setExpandedCargo(expandedCargo === ca.id ? null : ca.id)}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-primary/5 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <Briefcase className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
                    <div className="min-w-0 text-left">
                      <p className="font-bold text-[12px] truncate">{ca.cargo}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {ca.codigoCompleto} {ca.modalidade && `· ${ca.modalidade}`}
                        {ca.slaDefault && ` · SLA: ${ca.slaDefault}`}
                      </p>
                    </div>
                  </div>
                  {expandedCargo === ca.id
                    ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                </button>

                {expandedCargo === ca.id && (
                  <div className="concave-3d mx-3 mb-3 p-2.5 space-y-2">
                    {ca.descricaoFuncao && (
                      <p className="text-[11px] text-muted-foreground">{ca.descricaoFuncao}</p>
                    )}
                    <div className="flex flex-wrap gap-1 pt-1">
                      <PermBadge ok={ca.podeAcessarFinanceiro} label="pode_acessar_financeiro" />
                      <PermBadge ok={ca.podeEditarProtocolos}  label="pode_editar_protocolos" />
                      <PermBadge ok={ca.podeAprovarDespesas}   label="pode_aprovar_despesas" />
                      <PermBadge ok={ca.podeAuditarCards}      label="pode_auditar_cards" />
                      <PermBadge ok={ca.podeVerOuvidoria}      label="pode_ver_ouvidoria" />
                      <PermBadge ok={ca.podeSupervisionar}     label="pode_supervisionar_outros" />
                    </div>
                  </div>
                )}
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function CadastroEmpresas() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen]   = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Empresa | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [painelEmpresa, setPainelEmpresa] = useState<Empresa | null>(null);

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ["empresas"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/empresas`);
      if (!r.ok) throw new Error("Erro ao carregar empresas");
      return r.json();
    },
  });

  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const url = editingId ? `${apiBase}/empresas/${editingId}` : `${apiBase}/empresas`;
      const r = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!r.ok) throw new Error("Erro ao salvar");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      toast.success(editingId ? "Empresa atualizada!" : "Empresa cadastrada!");
      setFormOpen(false);
    },
    onError: () => toast.error("Erro ao salvar empresa."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${apiBase}/empresas/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro ao apagar");
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empresas"] });
      toast.success("Empresa apagada.");
      setDeleteTarget(null);
      setDeleteConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditingId(null); form.reset(EMPTY); setFormOpen(true); };
  const openEdit = (e: Empresa) => {
    setEditingId(e.id);
    form.reset({
      nome: e.nome, nick: e.nick || "", cnpj: e.cnpj || "",
      tipo: e.tipo, tipoUnidade: e.tipoUnidade || "",
      status: e.status, ativa: e.ativa,
      donoNome: e.donoNome || "", slug: e.slug || "",
      timezone: e.timezone || "America/Sao_Paulo",
      endereco: e.endereco || "", cep: e.cep || "",
      bairro: e.bairro || "", cidade: e.cidade || "", estado: e.estado || "",
      telefone: e.telefone || "", emailGeral: e.emailGeral || "",
      emailAgenda: e.emailAgenda || "", emailEnfermagem: e.emailEnfermagem || "",
      emailFinanceiro: e.emailFinanceiro || "",
      googleCalendarId: e.googleCalendarId || "",
      googleDriveFolderId: e.googleDriveFolderId || "",
      tipoContrato: e.tipoContrato || "por_demanda",
      fatMetaMensal: e.fatMetaMensal ?? undefined,
    });
    setFormOpen(true);
  };

  const ativas   = empresas.filter((e) => e.ativa);
  const inativas = empresas.filter((e) => !e.ativa);

  return (
    <div className="flex h-full gap-4">
      {/* Coluna principal */}
      <div className={`flex flex-col gap-4 flex-1 min-w-0 transition-all ${painelEmpresa ? "lg:max-w-[55%]" : ""}`}>

        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bevel-3d p-2.5 shrink-0"><Building2 className="w-5 h-5 text-primary" /></div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight uppercase">EMPRESAS LICENCIADAS</h1>
              <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest mt-0.5">
                Multi-tenant · {ativas.length} ativa{ativas.length !== 1 ? "s" : ""} · {inativas.length} inativa{inativas.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button onClick={openNew} className="btn-3d px-5 shrink-0">
            <Plus className="w-4 h-4 mr-2" /> NOVA EMPRESA
          </Button>
        </div>

        {/* Grade de cards */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {ativas.map((e) => (
                <EmpresaCard key={e.id} empresa={e}
                  onEdit={() => openEdit(e)}
                  onDelete={() => { setDeleteTarget(e); setDeleteConfirm(""); }}
                  onOpen={() => setPainelEmpresa(painelEmpresa?.id === e.id ? null : e)}
                />
              ))}
            </div>
            {inativas.length > 0 && (
              <>
                <Divider label={`${inativas.length} inativa${inativas.length > 1 ? "s" : ""}`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
                  {inativas.map((e) => (
                    <EmpresaCard key={e.id} empresa={e}
                      onEdit={() => openEdit(e)}
                      onDelete={() => { setDeleteTarget(e); setDeleteConfirm(""); }}
                      onOpen={() => setPainelEmpresa(painelEmpresa?.id === e.id ? null : e)}
                    />
                  ))}
                </div>
              </>
            )}
            {empresas.length === 0 && (
              <div className="concave-3d text-center py-16 text-muted-foreground text-sm">
                Nenhuma empresa cadastrada. Clique em NOVA EMPRESA.
              </div>
            )}
          </>
        )}
      </div>

      {/* Painel lateral de equipe */}
      {painelEmpresa && (
        <div className="hidden lg:flex flex-col w-[400px] shrink-0 panel-3d p-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
          <PainelEquipe empresa={painelEmpresa} onClose={() => setPainelEmpresa(null)} />
        </div>
      )}

      {/* Dialog — Formulário criar/editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">
              {editingId ? "EDITAR EMPRESA" : "NOVA EMPRESA"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4 pt-1">

              <Divider label="Identificação" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="nome" render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Nome *</FormLabel>
                    <FormControl><Input placeholder="Ex: Instituto Padua" {...field} className="field-engraved" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nick" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Apelido Interno</FormLabel>
                    <FormControl><Input placeholder="Como a equipe chama" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="cnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">CNPJ</FormLabel>
                    <FormControl><Input placeholder="00.000.000/0001-00" {...field} className="field-engraved font-mono" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tipo" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Tipo</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="clinic">Clínica</SelectItem>
                          <SelectItem value="genesis_seed">Genesis (Template-Mestre)</SelectItem>
                          <SelectItem value="telemedicina">Telemedicina</SelectItem>
                          <SelectItem value="enfermagem">Enfermagem</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tipoUnidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Categoria da Unidade</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="CLINICA_OPERACIONAL">Operacional (clínica do CEO)</SelectItem>
                          <SelectItem value="CLINICA_PARCEIRA">Parceira (licenciada)</SelectItem>
                          <SelectItem value="LABORATORIO_MESTRE">Laboratório-Mestre (template)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Status</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="ATIVO">Ativo</SelectItem>
                          <SelectItem value="SUSPENSO">Suspenso</SelectItem>
                          <SelectItem value="CANCELADO">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="donoNome" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Responsável (Nome)</FormLabel>
                    <FormControl><Input placeholder="Dr. Nome Completo" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="slug" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Slug (URL)</FormLabel>
                    <FormControl><Input placeholder="instituto-padua" {...field} className="field-engraved font-mono" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <Divider label="Endereço" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="cep" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">CEP</FormLabel>
                    <FormControl><Input placeholder="00000-000" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="endereco" render={({ field }) => (
                  <FormItem className="col-span-3">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Logradouro</FormLabel>
                    <FormControl><Input placeholder="Rua, Av..." {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Bairro</FormLabel>
                    <FormControl><Input {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Cidade</FormLabel>
                    <FormControl><Input {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="estado" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">UF</FormLabel>
                    <FormControl><Input maxLength={2} {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="field-engraved text-center font-bold" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <Divider label="Contatos" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([
                  ["telefone", "Telefone / WhatsApp", ""],
                  ["emailGeral", "E-mail Geral", ""],
                  ["emailAgenda", "E-mail Agenda", ""],
                  ["emailEnfermagem", "E-mail Enfermagem", ""],
                  ["emailFinanceiro", "E-mail Financeiro", ""],
                ] as const).map(([name, label]) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">{label}</FormLabel>
                      <FormControl><Input {...field} className="field-engraved" /></FormControl>
                    </FormItem>
                  )} />
                ))}
              </div>

              <Divider label="Integrações & Contrato" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="googleCalendarId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">ID Agenda Google</FormLabel>
                    <FormControl><Input placeholder="...@group.calendar.google.com" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="googleDriveFolderId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">ID Pasta Google Drive</FormLabel>
                    <FormControl><Input placeholder="ID da pasta raiz" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="tipoContrato" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Modelo de Contrato</FormLabel>
                    <div className="concave-3d p-1">
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="por_demanda">Por Demanda (pay-per-use)</SelectItem>
                          <SelectItem value="full">Full (mensalidade fixa)</SelectItem>
                          <SelectItem value="pacote">Pacote (módulos fechados)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="fatMetaMensal" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">Meta Faturamento Mensal (R$)</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} className="field-engraved" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" className="btn-3d-soft" onClick={() => setFormOpen(false)}>CANCELAR</Button>
                <Button type="submit" className="btn-3d px-6" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  SALVAR EMPRESA
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog — confirmar exclusão */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteConfirm(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest text-destructive">APAGAR EMPRESA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="concave-3d p-3 text-sm">
              <p className="text-muted-foreground mb-2">Ação irreversível. Todos os cargos e colaboradores desta empresa também serão removidos. Digite o nome para confirmar:</p>
              <p className="font-black text-foreground">{deleteTarget?.nome}</p>
            </div>
            <Input className="field-engraved" placeholder="Digite o nome exato"
              value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
            <DialogFooter>
              <Button type="button" className="btn-3d-soft" onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }}>CANCELAR</Button>
              <Button type="button" variant="destructive" className="btn-3d"
                disabled={deleteConfirm !== deleteTarget?.nome || deleteMutation.isPending}
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
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
