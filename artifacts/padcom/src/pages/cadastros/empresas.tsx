import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2, Users, Briefcase, Plus, Loader2, Save, Pencil, Trash2,
  Phone, MapPin, Mail, ChevronDown, ChevronRight, ShieldCheck, Globe, Tag,
  FileText, Upload, ExternalLink, X, FolderSearch, Check, AlertCircle,
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
  cidade: string | null; estado: string | null; zona: string | null;
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
  // Identificação básica
  nome:            z.string().min(2, "Nome obrigatório"),
  razaoSocial:     z.string().optional(),
  nick:            z.string().optional(),
  cnpj:            z.string().optional(),
  tipo:            z.string(),
  tipoUnidade:     z.string().optional(),
  status:          z.string(),
  ativa:           z.boolean(),
  donoNome:        z.string().optional(),
  slug:            z.string().optional(),
  timezone:        z.string().optional(),
  // Dados fiscais / jurídicos
  cnae:            z.string().optional(),
  cnaeDescricao:   z.string().optional(),
  naturezaJuridica:   z.string().optional(),
  regimeTributario:   z.string().optional(),
  inscricaoEstadual:  z.string().optional(),
  inscricaoMunicipal: z.string().optional(),
  dataAbertura:    z.string().optional(),
  capitalSocial:   z.string().optional(),
  optanteSimples:  z.boolean().optional(),
  // Responsável + Contador
  responsavelLegalNome: z.string().optional(),
  responsavelLegalCpf:  z.string().optional(),
  contadorNome:    z.string().optional(),
  contadorCrc:     z.string().optional(),
  contadorEmail:   z.string().optional(),
  contadorTelefone: z.string().optional(),
  // Endereço comercial
  endereco:        z.string().optional(),
  cep:             z.string().optional(),
  zona:            z.string().optional(),
  bairro:          z.string().optional(),
  cidade:          z.string().optional(),
  estado:          z.string().optional(),
  // Endereço fiscal
  complemento:     z.string().optional(),
  enderecoFiscal:  z.string().optional(),
  complementoFiscal: z.string().optional(),
  cepFiscal:       z.string().optional(),
  bairroFiscal:    z.string().optional(),
  cidadeFiscal:    z.string().optional(),
  estadoFiscal:    z.string().optional(),
  codigoIbge:      z.string().optional(),
  // Contatos
  telefone:        z.string().optional(),
  emailGeral:      z.string().optional(),
  emailAgenda:     z.string().optional(),
  emailEnfermagem: z.string().optional(),
  emailFinanceiro: z.string().optional(),
  // NF-e
  nfeAmbiente:     z.string().optional(),
  nfeSerie:        z.string().optional(),
  nfeProximoNumero: z.coerce.number().optional(),
  nfeCodigoServico: z.string().optional(),
  nfeAliquotaIss:  z.string().optional(),
  nfeCodigoIss:    z.string().optional(),
  nfeDiscriminacaoPadrao: z.string().optional(),
  // Certificado digital
  certTipo:        z.string().optional(),
  certValidade:    z.string().optional(),
  certStatus:      z.string().optional(),
  // ZapSign
  zapsignToken:    z.string().optional(),
  zapsignEmail:    z.string().optional(),
  // WhatsApp
  waNumero:        z.string().optional(),
  waPhoneNumberId: z.string().optional(),
  waBusinessAccountId: z.string().optional(),
  waToken:         z.string().optional(),
  // Twilio por empresa
  twilioAccountSid: z.string().optional(),
  twilioAuthToken:  z.string().optional(),
  twilioNumero:     z.string().optional(),
  // Telegram
  telegramBotToken:    z.string().optional(),
  telegramChatId:      z.string().optional(),
  telegramBotUsername: z.string().optional(),
  // Zoho / e-mail
  zohoEmail:       z.string().optional(),
  zohoStatus:      z.string().optional(),
  // Google
  googleCalendarId:    z.string().optional(),
  googleDriveFolderId: z.string().optional(),
  // Contrato PAXTER
  tipoContrato:    z.string().optional(),
  fatMetaMensal:   z.coerce.number().optional(),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  nome: "", razaoSocial: "", nick: "", cnpj: "", tipo: "clinic",
  tipoUnidade: "CLINICA_PARCEIRA", status: "ATIVO", ativa: true,
  donoNome: "", slug: "", timezone: "America/Sao_Paulo",
  cnae: "", cnaeDescricao: "", naturezaJuridica: "Ltda",
  regimeTributario: "simples_nacional", inscricaoEstadual: "",
  inscricaoMunicipal: "", dataAbertura: "", capitalSocial: "", optanteSimples: true,
  responsavelLegalNome: "", responsavelLegalCpf: "",
  contadorNome: "", contadorCrc: "", contadorEmail: "", contadorTelefone: "",
  endereco: "", complemento: "", cep: "", zona: "", bairro: "", cidade: "", estado: "",
  enderecoFiscal: "", complementoFiscal: "", cepFiscal: "", bairroFiscal: "", cidadeFiscal: "", estadoFiscal: "", codigoIbge: "",
  telefone: "", emailGeral: "", emailAgenda: "", emailEnfermagem: "", emailFinanceiro: "",
  nfeAmbiente: "homologacao", nfeSerie: "1", nfeProximoNumero: 1,
  nfeCodigoServico: "", nfeAliquotaIss: "", nfeCodigoIss: "", nfeDiscriminacaoPadrao: "",
  certTipo: "a1", certValidade: "", certStatus: "ausente",
  zapsignToken: "", zapsignEmail: "",
  waNumero: "", waPhoneNumberId: "", waBusinessAccountId: "", waToken: "",
  twilioAccountSid: "", twilioAuthToken: "", twilioNumero: "",
  telegramBotToken: "", telegramChatId: "", telegramBotUsername: "",
  zohoEmail: "", zohoStatus: "sugerido",
  googleCalendarId: "", googleDriveFolderId: "",
  tipoContrato: "por_demanda", fatMetaMensal: undefined,
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

// ── Tipos de documento (contratos da empresa) ─────────────────────────────────
const DOC_TIPO_LABELS: Record<string, string> = {
  contrato_social:  "Contrato Social",
  termo_licenca:    "Termo de Licença PAXTER",
  acordo:           "Acordo Operacional",
  ata:              "Ata de Reunião",
  procuracao:       "Procuração",
  outro:            "Outro",
};

interface EmpresaContrato {
  id: number;
  empresaId: number;
  nome: string;
  tipo: string;
  tamanhoBytes: number | null;
  mimeType: string | null;
  driveFileId: string | null;
  driveUrl: string | null;
  observacao: string | null;
  criadoEm: string;
}

// ── Sub-componente: lista e upload de contratos ────────────────────────────────
function ContratosList({ empresaId }: { empresaId: number }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [tipo, setTipo] = useState("contrato_social");
  const [obs, setObs] = useState("");

  const { data: contratos = [], isLoading } = useQuery<EmpresaContrato[]>({
    queryKey: ["empresa-contratos", empresaId],
    queryFn: async () => {
      if (!empresaId) return [];
      const r = await fetch(`${apiBase}/empresas/${empresaId}/contratos`);
      if (!r.ok) throw new Error("Erro ao carregar contratos");
      return r.json();
    },
    enabled: !!empresaId,
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !empresaId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", tipo);
      if (obs) fd.append("observacao", obs);
      const r = await fetch(`${apiBase}/empresas/${empresaId}/contratos`, { method: "POST", body: fd });
      if (!r.ok) throw new Error("Erro no upload");
      toast.success("Documento enviado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["empresa-contratos", empresaId] });
      setObs("");
      e.target.value = "";
    } catch {
      toast.error("Falha ao enviar documento.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: number, nome: string) {
    if (!confirm(`Remover "${nome}" do sistema?`)) return;
    await fetch(`${apiBase}/empresas/${empresaId}/contratos/${docId}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["empresa-contratos", empresaId] });
    toast.success("Documento removido.");
  }

  function fmtSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-5">
      {/* Painel de upload */}
      <div className="panel-3d p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-primary mb-2">Adicionar Documento</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="lbl block mb-1">Tipo de Documento</label>
            <div className="concave-3d p-1">
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TIPO_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="lbl block mb-1">Observação (opcional)</label>
            <Input value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: Última alteração 2024, 3ª via..." className="field-engraved text-[11px]" />
          </div>
        </div>
        <label className={`bevel-3d flex items-center gap-2 px-4 py-2 cursor-pointer w-fit text-[11px] font-black uppercase tracking-wider ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
            : <><Upload className="w-3.5 h-3.5" /> Selecionar Arquivo</>}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip,.xml" />
        </label>
        <p className="text-[9px] text-muted-foreground/60">
          PDF, DOC, DOCX, imagem ou ZIP — até 100 MB. Se a empresa tiver pasta no Google Drive, o arquivo é enviado automaticamente.
        </p>
      </div>

      {/* Lista de documentos */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : contratos.length === 0 ? (
        <div className="concave-3d p-6 text-center text-[11px] text-muted-foreground">
          Nenhum documento cadastrado. Clique em "Selecionar Arquivo" para adicionar o primeiro.
        </div>
      ) : (
        <div className="space-y-2">
          {contratos.map((c) => (
            <div key={c.id} className="panel-3d p-3 flex items-center gap-3">
              <div className="concave-3d p-2 shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-foreground truncate">{c.nome}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="bevel-3d text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 text-primary">
                    {DOC_TIPO_LABELS[c.tipo] ?? c.tipo}
                  </span>
                  {c.tamanhoBytes && (
                    <span className="text-[9px] text-muted-foreground">{fmtSize(c.tamanhoBytes)}</span>
                  )}
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                  {c.driveUrl && (
                    <span className="text-[9px] text-emerald-600 font-bold">Drive ✓</span>
                  )}
                </div>
                {c.observacao && (
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5">{c.observacao}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {c.driveUrl && (
                  <a href={c.driveUrl} target="_blank" rel="noopener noreferrer"
                    className="bevel-3d p-1.5 text-primary hover:text-primary/80" title="Abrir no Drive">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button type="button" onClick={() => handleDelete(c.id, c.nome)}
                  className="bevel-3d p-1.5 text-destructive hover:text-destructive/80" title="Remover">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal: Importar Contratos do Google Drive ──────────────────────────────────
interface DriveArquivo {
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number | null;
  parentFolder: string | null;
  driveUrl: string;
  suggestedEmpresaId: number | null;
}
interface EmpresaSimples { id: number; nome: string; }

function DriveImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [folderUrl, setFolderUrl] = useState("https://drive.google.com/drive/folders/17yRHZ4wa6PhjfvYrgsXygNK_th1S72Wf");
  const [scanning, setScanning] = useState(false);
  const [arquivos, setArquivos] = useState<DriveArquivo[]>([]);
  const [empresasOpts, setEmpresasOpts] = useState<EmpresaSimples[]>([]);
  const [empresaMap, setEmpresaMap] = useState<Record<string, number | "">>({});
  const [tipoMap, setTipoMap] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function extractFolderId(url: string): string {
    const m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : url.trim();
  }

  async function handleScan() {
    setErro(null);
    setScanning(true);
    setArquivos([]);
    setSelecionados(new Set());
    try {
      const folderId = extractFolderId(folderUrl);
      const r = await fetch(`${apiBase}/empresas/drive-scan?folderId=${encodeURIComponent(folderId)}`);
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Erro ao escanear"); }
      const data = await r.json();
      setArquivos(data.arquivos);
      setEmpresasOpts(data.empresas);
      // pré-preenche os mapas com a sugestão automática
      const em: Record<string, number | ""> = {};
      const tm: Record<string, string> = {};
      const sel = new Set<string>();
      for (const a of data.arquivos as DriveArquivo[]) {
        em[a.driveFileId] = a.suggestedEmpresaId ?? "";
        tm[a.driveFileId] = "contrato_social";
        if (a.suggestedEmpresaId) sel.add(a.driveFileId);
      }
      setEmpresaMap(em);
      setTipoMap(tm);
      setSelecionados(sel);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    try {
      const itens = arquivos
        .filter(a => selecionados.has(a.driveFileId) && empresaMap[a.driveFileId])
        .map(a => ({
          driveFileId: a.driveFileId,
          empresaId: Number(empresaMap[a.driveFileId]),
          tipo: tipoMap[a.driveFileId] ?? "contrato_social",
          nome: a.name,
          mimeType: a.mimeType,
          size: a.size,
          driveUrl: a.driveUrl,
        }));
      if (!itens.length) { toast.error("Selecione ao menos um arquivo com empresa definida."); return; }
      const r = await fetch(`${apiBase}/empresas/drive-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      if (!r.ok) throw new Error("Erro ao importar");
      const data = await r.json();
      toast.success(`${data.inseridos} documento(s) vinculado(s) com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ["empresa-contratos"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  }

  function toggleSel(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function fmtSize(b: number | null) {
    if (!b) return "";
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  }

  const prontos = arquivos.filter(a => selecionados.has(a.driveFileId) && empresaMap[a.driveFileId]).length;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[13px] font-black uppercase tracking-wider">
            <FolderSearch className="w-4 h-4 text-primary" />
            Importar Contratos do Google Drive
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Input da URL */}
          <div className="panel-3d p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-primary">Pasta no Drive</p>
            <div className="flex gap-2">
              <Input value={folderUrl} onChange={e => setFolderUrl(e.target.value)}
                placeholder="URL ou ID da pasta do Google Drive"
                className="field-engraved text-[11px] font-mono flex-1" />
              <button type="button" onClick={handleScan} disabled={scanning || !folderUrl}
                className="bevel-3d px-4 py-2 text-[11px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-2 shrink-0">
                {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderSearch className="w-3.5 h-3.5" />}
                {scanning ? "Escaneando..." : "Escanear"}
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground/60">
              O sistema lista os arquivos da pasta (e subpastas de 1 nível), tenta casar cada arquivo com uma empresa pelo nome e pré-seleciona os que reconheceu.
            </p>
          </div>

          {/* Erro */}
          {erro && (
            <div className="concave-3d p-3 flex items-center gap-2 text-[11px] text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {erro}
            </div>
          )}

          {/* Tabela de resultados */}
          {arquivos.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-wider text-primary">
                  {arquivos.length} arquivo(s) encontrado(s) — {prontos} prontos para importar
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelecionados(new Set(arquivos.map(a => a.driveFileId)))}
                    className="bevel-3d px-2 py-1 text-[9px] font-black uppercase tracking-wider">Selecionar Todos</button>
                  <button type="button" onClick={() => setSelecionados(new Set())}
                    className="bevel-3d px-2 py-1 text-[9px] font-black uppercase tracking-wider">Limpar</button>
                </div>
              </div>

              <div className="concave-3d overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="py-2 px-2 text-left w-6"></th>
                      <th className="py-2 px-2 text-left font-black uppercase tracking-wider text-primary">Arquivo</th>
                      <th className="py-2 px-2 text-left font-black uppercase tracking-wider text-primary">Empresa</th>
                      <th className="py-2 px-2 text-left font-black uppercase tracking-wider text-primary">Tipo de Doc</th>
                      <th className="py-2 px-2 text-left font-black uppercase tracking-wider text-primary">Tamanho</th>
                      <th className="py-2 px-2 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {arquivos.map(a => (
                      <tr key={a.driveFileId} className={`border-b border-border/20 ${selecionados.has(a.driveFileId) ? "bg-primary/5" : ""}`}>
                        <td className="py-1.5 px-2">
                          <button type="button" onClick={() => toggleSel(a.driveFileId)}
                            className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${selecionados.has(a.driveFileId) ? "bg-primary border-primary" : "border-border/60"}`}>
                            {selecionados.has(a.driveFileId) && <Check className="w-2.5 h-2.5 text-white" />}
                          </button>
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="max-w-[200px]">
                            <p className="font-bold truncate" title={a.name}>{a.name}</p>
                            {a.parentFolder && <p className="text-muted-foreground/60 truncate">📁 {a.parentFolder}</p>}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 min-w-[160px]">
                          <div className="concave-3d p-0.5">
                            <select value={empresaMap[a.driveFileId] ?? ""}
                              onChange={e => setEmpresaMap(prev => ({ ...prev, [a.driveFileId]: e.target.value ? Number(e.target.value) : "" }))}
                              className="bg-transparent text-[10px] w-full px-1 py-0.5 outline-none">
                              <option value="">— não importar —</option>
                              {empresasOpts.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 min-w-[140px]">
                          <div className="concave-3d p-0.5">
                            <select value={tipoMap[a.driveFileId] ?? "contrato_social"}
                              onChange={e => setTipoMap(prev => ({ ...prev, [a.driveFileId]: e.target.value }))}
                              className="bg-transparent text-[10px] w-full px-1 py-0.5 outline-none">
                              {Object.entries(DOC_TIPO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="py-1.5 px-2 text-muted-foreground/70">{fmtSize(a.size)}</td>
                        <td className="py-1.5 px-2">
                          <a href={a.driveUrl} target="_blank" rel="noopener noreferrer"
                            className="text-primary hover:text-primary/70" title="Abrir no Drive">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border/40 shrink-0 flex justify-end gap-2">
          <Button type="button" className="btn-3d-soft" onClick={onClose}>Cancelar</Button>
          {prontos > 0 && (
            <Button type="button" className="btn-3d px-6" onClick={handleImport} disabled={importing}>
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Importar {prontos} documento{prontos !== 1 ? "s" : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const [driveImportOpen, setDriveImportOpen] = useState(false);

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
      nome: e.nome, razaoSocial: e.razaoSocial || "", nick: e.nick || "", cnpj: e.cnpj || "",
      tipo: e.tipo, tipoUnidade: e.tipoUnidade || "", status: e.status, ativa: e.ativa,
      donoNome: e.donoNome || "", slug: e.slug || "", timezone: e.timezone || "America/Sao_Paulo",
      cnae: e.cnae || "", cnaeDescricao: e.cnaeDescricao || "",
      naturezaJuridica: e.naturezaJuridica || "Ltda",
      regimeTributario: e.regimeTributario || "simples_nacional",
      inscricaoEstadual: e.inscricaoEstadual || "", inscricaoMunicipal: e.inscricaoMunicipal || "",
      dataAbertura: e.dataAbertura || "", capitalSocial: e.capitalSocial?.toString() || "",
      optanteSimples: e.optanteSimples ?? true,
      responsavelLegalNome: e.responsavelLegalNome || "", responsavelLegalCpf: e.responsavelLegalCpf || "",
      contadorNome: e.contadorNome || "", contadorCrc: e.contadorCrc || "",
      contadorEmail: e.contadorEmail || "", contadorTelefone: e.contadorTelefone || "",
      endereco: e.endereco || "", complemento: (e as any).complemento || "", cep: e.cep || "",
      bairro: e.bairro || "", cidade: e.cidade || "", estado: e.estado || "", zona: e.zona || "",
      enderecoFiscal: e.enderecoFiscal || "", complementoFiscal: (e as any).complementoFiscal || "", cepFiscal: e.cepFiscal || "",
      bairroFiscal: e.bairroFiscal || "", cidadeFiscal: e.cidadeFiscal || "",
      estadoFiscal: e.estadoFiscal || "", codigoIbge: e.codigoIbge || "",
      telefone: e.telefone || "", emailGeral: e.emailGeral || "",
      emailAgenda: e.emailAgenda || "", emailEnfermagem: e.emailEnfermagem || "",
      emailFinanceiro: e.emailFinanceiro || "",
      nfeAmbiente: e.nfeAmbiente || "homologacao", nfeSerie: e.nfeSerie || "1",
      nfeProximoNumero: e.nfeProximoNumero ?? 1,
      nfeCodigoServico: e.nfeCodigoServico || "", nfeAliquotaIss: e.nfeAliquotaIss?.toString() || "",
      nfeCodigoIss: e.nfeCodigoIss || "", nfeDiscriminacaoPadrao: e.nfeDiscriminacaoPadrao || "",
      certTipo: e.certTipo || "a1", certValidade: e.certValidade || "",
      certStatus: e.certStatus || "ausente",
      zapsignToken: e.zapsignToken || "", zapsignEmail: e.zapsignEmail || "",
      waNumero: e.waNumero || "", waPhoneNumberId: e.waPhoneNumberId || "",
      waBusinessAccountId: e.waBusinessAccountId || "", waToken: e.waToken || "",
      twilioAccountSid: e.twilioAccountSid || "", twilioAuthToken: e.twilioAuthToken || "",
      twilioNumero: e.twilioNumero || "",
      telegramBotToken: e.telegramBotToken || "", telegramChatId: e.telegramChatId || "",
      telegramBotUsername: e.telegramBotUsername || "",
      zohoEmail: e.zohoEmail || "", zohoStatus: e.zohoStatus || "sugerido",
      googleCalendarId: e.googleCalendarId || "", googleDriveFolderId: e.googleDriveFolderId || "",
      tipoContrato: e.tipoContrato || "por_demanda", fatMetaMensal: e.fatMetaMensal ?? undefined,
    });
    setFormOpen(true);
  };

  // ── Agrupamento geográfico data-bound ──────────────────────────────────────
  const grupos = useMemo(() => {
    const ativas = empresas.filter((e) => e.ativa);
    const map = new Map<string, Empresa[]>();
    for (const e of ativas) {
      const chave =
        e.cidade && e.estado ? `${e.cidade} · ${e.estado}` :
        e.cidade              ? e.cidade :
        e.estado              ? `Estado: ${e.estado}` :
                                "Sem Localização";
      if (!map.has(chave)) map.set(chave, []);
      map.get(chave)!.push(e);
    }
    return [...map.entries()].sort(([a, ac], [b, bc]) =>
      bc.length !== ac.length ? bc.length - ac.length : a.localeCompare(b, "pt-BR")
    );
  }, [empresas]);

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
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => setDriveImportOpen(true)} className="btn-3d-soft px-4">
              <FolderSearch className="w-4 h-4 mr-2" /> IMPORTAR DO DRIVE
            </Button>
            <Button onClick={openNew} className="btn-3d px-5">
              <Plus className="w-4 h-4 mr-2" /> NOVA EMPRESA
            </Button>
          </div>
        </div>

        {/* Grade de cards — agrupamento geográfico data-bound */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : empresas.length === 0 ? (
          <div className="concave-3d text-center py-16 text-muted-foreground text-sm">
            Nenhuma empresa cadastrada. Clique em NOVA EMPRESA.
          </div>
        ) : (
          <div className="space-y-8">
            {grupos.map(([cidadeKey, lista]) => {
              const zonaMap = new Map<string, Empresa[]>();
              for (const e of lista) {
                const z = e.zona || "—";
                if (!zonaMap.has(z)) zonaMap.set(z, []);
                zonaMap.get(z)!.push(e);
              }
              const temMultiplaZonas = zonaMap.size > 1;
              return (
                <div key={cidadeKey}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="bevel-3d px-3 py-1.5 flex items-center gap-2 shrink-0">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                      <span className="font-black text-[11px] uppercase tracking-widest">{cidadeKey}</span>
                      <span className="text-[9px] text-muted-foreground/60 font-bold">
                        {lista.length} empresa{lista.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="h-px bg-primary/15 flex-1" />
                  </div>
                  {temMultiplaZonas ? (
                    <div className="space-y-5 pl-4 border-l-2 border-primary/10">
                      {[...zonaMap.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([zona, items]) => (
                        <div key={zona}>
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/50 mb-2.5 flex items-center gap-2">
                            <Tag className="w-3 h-3" /> {zona}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {items.map((e) => (
                              <EmpresaCard key={e.id} empresa={e}
                                onEdit={() => openEdit(e)} onDelete={() => { setDeleteTarget(e); setDeleteConfirm(""); }}
                                onOpen={() => setPainelEmpresa(painelEmpresa?.id === e.id ? null : e)} />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {lista.map((e) => (
                        <EmpresaCard key={e.id} empresa={e}
                          onEdit={() => openEdit(e)} onDelete={() => { setDeleteTarget(e); setDeleteConfirm(""); }}
                          onOpen={() => setPainelEmpresa(painelEmpresa?.id === e.id ? null : e)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {inativas.length > 0 && (
              <div className="opacity-60">
                <Divider label={`${inativas.length} inativa${inativas.length > 1 ? "s" : ""}`} />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
                  {inativas.map((e) => (
                    <EmpresaCard key={e.id} empresa={e}
                      onEdit={() => openEdit(e)} onDelete={() => { setDeleteTarget(e); setDeleteConfirm(""); }}
                      onOpen={() => setPainelEmpresa(painelEmpresa?.id === e.id ? null : e)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Painel lateral de equipe */}
      {painelEmpresa && (
        <div className="hidden lg:flex flex-col w-[400px] shrink-0 panel-3d p-4 overflow-y-auto max-h-[calc(100vh-8rem)]">
          <PainelEquipe empresa={painelEmpresa} onClose={() => setPainelEmpresa(null)} />
        </div>
      )}

      {/* Modal: Importar do Drive */}
      <DriveImportModal open={driveImportOpen} onClose={() => setDriveImportOpen(false)} />

      {/* Dialog — Formulário criar/editar com abas */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl max-h-[94vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-border/40">
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest">
              {editingId ? "EDITAR EMPRESA" : "NOVA EMPRESA"}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="flex flex-col flex-1 min-h-0">
              <Tabs defaultValue="ident" className="flex flex-col flex-1 min-h-0">

                {/* Barra de abas */}
                <TabsList className="mx-6 mt-3 mb-0 justify-start gap-1 h-auto bg-transparent p-0 border-b border-border/30 rounded-none">
                  {[
                    { value: "ident",      label: "Identificação" },
                    { value: "fiscal",     label: "Jurídico & Fiscal" },
                    { value: "end",        label: "Endereços" },
                    { value: "nfe",        label: "NF-e & Cert." },
                    { value: "integ",      label: "Integrações" },
                    { value: "contratos",  label: "Contratos" },
                  ].map(({ value, label }) => (
                    <TabsTrigger key={value} value={value}
                      className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary bg-transparent shadow-none">
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* ── ABA 1: IDENTIFICAÇÃO ───────────────────────────────────────── */}
                <TabsContent value="ident" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 mt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="nome" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="lbl">Nome Fantasia *</FormLabel>
                        <FormControl><Input placeholder="Ex: Instituto Padua" {...field} className="field-engraved" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="razaoSocial" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="lbl">Razão Social</FormLabel>
                        <FormControl><Input placeholder="Nome jurídico completo (para NF-e e contratos)" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nick" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Apelido Interno</FormLabel>
                        <FormControl><Input placeholder="Como a equipe chama" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cnpj" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">CNPJ</FormLabel>
                        <FormControl><Input placeholder="00.000.000/0001-00" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="tipo" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Tipo</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
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
                        <FormLabel className="lbl">Categoria</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="CLINICA_OPERACIONAL">Operacional (clínica do CEO)</SelectItem>
                              <SelectItem value="CLINICA_PARCEIRA">Parceira (licenciada)</SelectItem>
                              <SelectItem value="LABORATORIO_MESTRE">Laboratório-Mestre</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Status</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
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
                        <FormLabel className="lbl">Responsável Principal</FormLabel>
                        <FormControl><Input placeholder="Dr. Nome Completo" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="slug" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Slug (URL interna)</FormLabel>
                        <FormControl><Input placeholder="instituto-padua" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                    <Divider label="Contatos" />
                    <FormField control={form.control} name="telefone" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Telefone / WhatsApp</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailGeral" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">E-mail Geral</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailAgenda" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">E-mail Agenda</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailEnfermagem" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">E-mail Enfermagem</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="emailFinanceiro" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">E-mail Financeiro</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <Divider label="Contrato PAXTER" />
                    <FormField control={form.control} name="tipoContrato" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Modelo de Contrato</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
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
                        <FormLabel className="lbl">Meta Faturamento Mensal (R$)</FormLabel>
                        <FormControl><Input type="number" placeholder="0" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                {/* ── ABA 2: JURÍDICO & FISCAL ───────────────────────────────────── */}
                <TabsContent value="fiscal" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 mt-0">
                  <Divider label="Dados Jurídicos" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="naturezaJuridica" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Natureza Jurídica</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="Ltda">Ltda</SelectItem>
                              <SelectItem value="SA">S/A</SelectItem>
                              <SelectItem value="MEI">MEI</SelectItem>
                              <SelectItem value="EIRELI">EIRELI</SelectItem>
                              <SelectItem value="Associação">Associação</SelectItem>
                              <SelectItem value="Fundação">Fundação</SelectItem>
                              <SelectItem value="SLU">SLU (Soc. Limitada Unipessoal)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="regimeTributario" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Regime Tributário</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                              <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                              <SelectItem value="lucro_real">Lucro Real</SelectItem>
                              <SelectItem value="mei">MEI</SelectItem>
                              <SelectItem value="isento">Isento</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cnae" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">CNAE Principal</FormLabel>
                        <FormControl><Input placeholder="8630-5/01" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cnaeDescricao" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Descrição do CNAE</FormLabel>
                        <FormControl><Input placeholder="Atividades de atenção ambulatorial..." {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="inscricaoEstadual" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Inscrição Estadual (IE)</FormLabel>
                        <FormControl><Input placeholder="isento ou número" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="inscricaoMunicipal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Inscrição Municipal (IM / CCM)</FormLabel>
                        <FormControl><Input placeholder="número" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dataAbertura" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Data de Abertura</FormLabel>
                        <FormControl><Input type="date" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="capitalSocial" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Capital Social (R$)</FormLabel>
                        <FormControl><Input placeholder="1.000,00" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <Divider label="Responsável Legal" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="responsavelLegalNome" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Nome do Sócio / Representante Legal</FormLabel>
                        <FormControl><Input placeholder="Nome Completo" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="responsavelLegalCpf" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">CPF do Responsável Legal</FormLabel>
                        <FormControl><Input placeholder="000.000.000-00" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <Divider label="Contador" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="contadorNome" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Nome do Contador</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contadorCrc" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">CRC do Contador</FormLabel>
                        <FormControl><Input placeholder="CRC SP-123456/O-1" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contadorEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">E-mail do Contador</FormLabel>
                        <FormControl><Input type="email" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contadorTelefone" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Telefone do Contador</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                {/* ── ABA 3: ENDEREÇOS ───────────────────────────────────────────── */}
                <TabsContent value="end" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 mt-0">
                  <Divider label="Endereço Comercial" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField control={form.control} name="cep" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">CEP</FormLabel>
                        <FormControl><Input placeholder="00000-000" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="endereco" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="lbl">Logradouro e Número</FormLabel>
                        <FormControl><Input placeholder="Rua, Av., número" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="complemento" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Complemento</FormLabel>
                        <FormControl><Input placeholder="Sala 01, Andar 2…" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="bairro" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Bairro</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cidade" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="lbl">Cidade</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="estado" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">UF</FormLabel>
                        <FormControl><Input maxLength={2} {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="field-engraved text-center font-bold" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="zona" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="lbl">Zona / Área</FormLabel>
                        <FormControl><Input placeholder="Automático pelo bairro (ex: Zona Leste)" {...field} className="field-engraved" /></FormControl>
                        <p className="text-[9px] text-muted-foreground/50">Vazio = servidor deriva pelo bairro/CEP</p>
                      </FormItem>
                    )} />
                  </div>

                  <Divider label="Endereço Fiscal (para NF-e — pode ser igual ao comercial)" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField control={form.control} name="cepFiscal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">CEP Fiscal</FormLabel>
                        <FormControl><Input placeholder="00000-000" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="enderecoFiscal" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="lbl">Logradouro Fiscal</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="complementoFiscal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Complemento Fiscal</FormLabel>
                        <FormControl><Input placeholder="Sala 03, Andar 1…" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="bairroFiscal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Bairro Fiscal</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cidadeFiscal" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="lbl">Cidade Fiscal</FormLabel>
                        <FormControl><Input {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="estadoFiscal" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">UF Fiscal</FormLabel>
                        <FormControl><Input maxLength={2} {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} className="field-engraved text-center font-bold" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="codigoIbge" render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="lbl">Código IBGE do Município <span className="text-destructive">*NF-e</span></FormLabel>
                        <FormControl><Input placeholder="3550308 (São Paulo)" {...field} className="field-engraved font-mono" /></FormControl>
                        <p className="text-[9px] text-muted-foreground/50">7 dígitos — obrigatório para emitir NF-e</p>
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                {/* ── ABA 4: NF-e & CERTIFICADO ─────────────────────────────────── */}
                <TabsContent value="nfe" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 mt-0">
                  <Divider label="Nota Fiscal Eletrônica (NFS-e / NF-e)" />
                  <div className="concave-3d p-3 text-[10px] text-muted-foreground mb-2">
                    Estes dados são puxados automaticamente pelo emissor de NF-e e pelo ZapSign na geração de contratos. Mantenha corretos.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="nfeAmbiente" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Ambiente NF-e</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || "homologacao"}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="homologacao">Homologação (teste)</SelectItem>
                              <SelectItem value="producao">Produção (real)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="optanteSimples" render={({ field }) => (
                      <FormItem className="flex items-center gap-3 pt-5">
                        <FormControl>
                          <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} className="w-4 h-4 accent-primary" />
                        </FormControl>
                        <FormLabel className="lbl !mt-0">Optante pelo Simples Nacional</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nfeSerie" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Série NF</FormLabel>
                        <FormControl><Input placeholder="1" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nfeProximoNumero" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Próximo Número NF</FormLabel>
                        <FormControl><Input type="number" placeholder="1" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nfeCodigoServico" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Código do Serviço (LC 116/2003)</FormLabel>
                        <FormControl><Input placeholder="8.01" {...field} className="field-engraved font-mono" /></FormControl>
                        <p className="text-[9px] text-muted-foreground/50">Ex: 8.01 = Medicina / Saúde</p>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nfeAliquotaIss" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Alíquota ISS (%)</FormLabel>
                        <FormControl><Input placeholder="2,00" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nfeCodigoIss" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Código ISS Municipal</FormLabel>
                        <FormControl><Input {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="nfeDiscriminacaoPadrao" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="lbl">Discriminação Padrão da Nota</FormLabel>
                        <FormControl><Textarea placeholder="Prestação de serviços médicos especializados em medicina integrativa e protocolos injetáveis..." {...field} className="field-engraved min-h-[60px] resize-none" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <Divider label="Certificado Digital A1 / A3" />
                  <div className="concave-3d p-3 text-[10px] text-muted-foreground mb-2">
                    O arquivo .pfx do certificado A1 é enviado via botão "Upload" e salvo na pasta CERTIFICADOS do Google Drive da empresa. Nunca fica no servidor.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="certTipo" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Tipo de Certificado</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || "a1"}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="a1">A1 (arquivo .pfx — upload aqui)</SelectItem>
                              <SelectItem value="a3">A3 (token físico / HSM externo)</SelectItem>
                              <SelectItem value="a3_externo">A3 via provedor externo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="certStatus" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Status do Certificado</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || "ausente"}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="ausente">Ausente (não configurado)</SelectItem>
                              <SelectItem value="valido">Válido</SelectItem>
                              <SelectItem value="vencido">Vencido</SelectItem>
                              <SelectItem value="a3_externo">A3 externo (sem upload)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="certValidade" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Validade do Certificado</FormLabel>
                        <FormControl><Input type="date" {...field} className="field-engraved" /></FormControl>
                        <p className="text-[9px] text-muted-foreground/50">Alerta automático 30 dias antes do vencimento</p>
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                {/* ── ABA 5: INTEGRAÇÕES ─────────────────────────────────────────── */}
                <TabsContent value="integ" className="flex-1 overflow-y-auto px-6 py-4 space-y-4 mt-0">

                  <Divider label="ZapSign — Assinatura Digital" />
                  <div className="concave-3d p-3 text-[10px] text-muted-foreground">
                    Cada empresa precisa de sua própria conta ZapSign. O sistema usa o token desta empresa para assinar contratos e documentos independentemente.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="zapsignEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">E-mail da Conta ZapSign</FormLabel>
                        <FormControl><Input type="email" placeholder="clinica@zapsign.com.br" {...field} className="field-engraved" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="zapsignToken" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">API Token ZapSign</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••••••••••" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <Divider label="WhatsApp Business API (Meta)" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="waNumero" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Número WhatsApp (+55...)</FormLabel>
                        <FormControl><Input placeholder="+5511999999999" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="waPhoneNumberId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Phone Number ID (Meta)</FormLabel>
                        <FormControl><Input {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="waBusinessAccountId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">WABA ID (WhatsApp Business Account)</FormLabel>
                        <FormControl><Input {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="waToken" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Token de Acesso WA</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••••••••••" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <Divider label="Twilio (SMS / WhatsApp Sandbox)" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="twilioAccountSid" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Twilio Account SID</FormLabel>
                        <FormControl><Input placeholder="ACxxxxxxxx" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="twilioNumero" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Número Sender Twilio</FormLabel>
                        <FormControl><Input placeholder="+14155238886" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="twilioAuthToken" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="lbl">Twilio Auth Token</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••••••••••" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <Divider label="Telegram" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="telegramBotUsername" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Username do Bot (@)</FormLabel>
                        <FormControl><Input placeholder="@PaxterClinicaBot" {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="telegramChatId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Chat ID</FormLabel>
                        <FormControl><Input {...field} className="field-engraved font-mono" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="telegramBotToken" render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel className="lbl">Bot Token</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••••••••••" {...field} className="field-engraved font-mono text-[11px]" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <Divider label="Zoho / E-mail da Empresa" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="zohoEmail" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">E-mail Zoho Criado</FormLabel>
                        <FormControl><Input type="email" placeholder="clinica@padcon.com.br" {...field} className="field-engraved" /></FormControl>
                        <p className="text-[9px] text-muted-foreground/50">Sugerido automaticamente ao criar a empresa</p>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="zohoStatus" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">Status Zoho</FormLabel>
                        <div className="concave-3d p-1">
                          <Select onValueChange={field.onChange} value={field.value || "sugerido"}>
                            <FormControl><SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]"><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="sugerido">Sugerido (aguardando compra da licença)</SelectItem>
                              <SelectItem value="criado">Criado (licença comprada)</SelectItem>
                              <SelectItem value="ativo">Ativo (configurado e funcionando)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </FormItem>
                    )} />
                  </div>

                  <Divider label="Google" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="googleCalendarId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">ID Agenda Google Calendar</FormLabel>
                        <FormControl><Input placeholder="...@group.calendar.google.com" {...field} className="field-engraved font-mono text-[10px]" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="googleDriveFolderId" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="lbl">ID Pasta Raiz Google Drive</FormLabel>
                        <FormControl><Input placeholder="ID da pasta desta empresa no Drive" {...field} className="field-engraved font-mono text-[10px]" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </TabsContent>

                {/* ── ABA 6: CONTRATOS ──────────────────────────────────────────── */}
                <TabsContent value="contratos" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
                  <ContratosList empresaId={selectedEmpresa?.id ?? 0} />
                </TabsContent>

              </Tabs>

              {/* Rodapé fixo com botões */}
              <div className="flex justify-end gap-2 px-6 py-3 border-t border-border/40 shrink-0">
                <Button type="button" className="btn-3d-soft" onClick={() => setFormOpen(false)}>CANCELAR</Button>
                <Button type="submit" className="btn-3d px-6" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  SALVAR EMPRESA
                </Button>
              </div>
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
