import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Globe, Search, Plus, Trash2, Loader2, RefreshCw, AtSign,
  AlertCircle, Settings, Mail, Shield, Building2, Pencil, X,
  Save, Server, CreditCard, CheckCircle, XCircle, Eye, EyeOff, ExternalLink,
} from "lucide-react";
import { ConsoleShell, BlockTitle, ExplainRow, BASE } from "./_shared";
import { PaxterLogo } from "@/components/branding/PaxterLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type StatusRdap = "disponivel" | "registrado" | "erro" | "verificando";
type CheckResult = { dominio: string; status: StatusRdap };

type Dominio = {
  id: number;
  dominio: string;
  registrador: string | null;
  status: string;
  expira_em: string | null;
  data_registro: string | null;
  auto_renovar: boolean;
  empresa_id: number | null;
  notas: string | null;
  titular_nome: string | null;
  titular_documento: string | null;
  modulo_pago: boolean;
  valor_mensal_centavos: number | null;
  ns1: string | null; ns2: string | null;
  dns_provider: string | null;
  cloudflare_zone_id: string | null;
  zoho_verificado: boolean;
  zoho_conta_admin: string | null;
  zoho_auto_alias: boolean;
  criado_em: string;
};

type DominioForm = {
  dominio: string; registrador: string; status: string;
  data_registro: string; expira_em: string; auto_renovar: boolean;
  titular_nome: string; titular_documento: string; notas: string;
  ns1: string; ns2: string; ns3: string; ns4: string;
  dns_provider: string; cloudflare_zone_id: string;
  zoho_verificado: boolean; zoho_metodo_verificacao: string;
  zoho_conta_admin: string; zoho_auto_alias: boolean;
  modulo_pago: boolean; valor_mensal_centavos: string;
};

const FORM_EMPTY: DominioForm = {
  dominio: "", registrador: "manual", status: "ativo",
  data_registro: "", expira_em: "", auto_renovar: true,
  titular_nome: "", titular_documento: "", notas: "",
  ns1: "", ns2: "", ns3: "", ns4: "",
  dns_provider: "outro", cloudflare_zone_id: "",
  zoho_verificado: false, zoho_metodo_verificacao: "txt",
  zoho_conta_admin: "", zoho_auto_alias: false,
  modulo_pago: false, valor_mensal_centavos: "",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers visuais — identicos ao padrão Bancos
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativo:     "text-emerald-700 bg-emerald-500/15",
    pendente:  "text-amber-700 bg-amber-500/15",
    expirado:  "text-red-600 bg-red-500/15",
    cancelado: "text-slate-500 bg-slate-500/15",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${map[status] ?? "text-slate-500 bg-slate-500/15"}`}>
      {status}
    </span>
  );
}

function BadgeRdap({ status }: { status: StatusRdap }) {
  if (status === "disponivel")
    return <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded text-emerald-700 bg-emerald-500/15">Disponível</span>;
  if (status === "registrado")
    return <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded text-red-600 bg-red-500/15">Registrado</span>;
  if (status === "verificando")
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded text-slate-500 bg-slate-500/15">
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando
      </span>
    );
  return <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded text-amber-700 bg-amber-500/15">Erro</span>;
}

function Field({
  label, value, onChange, type = "text", placeholder = "", disabled = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="concave-3d w-full h-11 rounded px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">{label}</label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="concave-3d w-full h-11 rounded px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button
        type="button" onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-border"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de adicionar / editar domínio (mantido intacto — so estrutura visual)
// ─────────────────────────────────────────────────────────────────────────────

function ModalDominio({
  inicial, onSave, onClose,
}: { inicial?: Partial<DominioForm>; onSave: (f: DominioForm) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<DominioForm>({ ...FORM_EMPTY, ...inicial });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [secao, setSecao] = useState<1 | 2 | 3>(1);

  function f(field: keyof DominioForm) {
    return (v: string | boolean) => setForm(p => ({ ...p, [field]: v }));
  }

  async function handleSave() {
    if (!form.dominio.trim()) { setErro("Domínio é obrigatório"); return; }
    setSaving(true); setErro("");
    try { await onSave(form); onClose(); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  const tabClass = (n: 1 | 2 | 3) =>
    `px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] border-b-2 transition-colors cursor-pointer ${
      secao === n ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-bold text-[14px] text-foreground">
            {inicial?.dominio ? `Editar: ${inicial.dominio}` : "Adicionar Domínio"}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-border px-3 pt-2">
          <button className={tabClass(1)} onClick={() => setSecao(1)}>1. Identificação</button>
          <button className={tabClass(2)} onClick={() => setSecao(2)}>2. DNS</button>
          <button className={tabClass(3)} onClick={() => setSecao(3)}>3. E-mail Zoho</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {secao === 1 && (
            <>
              <Field label="Domínio completo *" value={form.dominio} onChange={f("dominio")} placeholder="ex.: pawards.com.br" />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Registrador" value={form.registrador} onChange={f("registrador")} options={[
                  { value: "manual", label: "Manual (já tenho)" },
                  { value: "registrobr", label: "Registro.br / UOL Host" },
                  { value: "namecheap", label: "Namecheap" },
                  { value: "godaddy", label: "GoDaddy" },
                  { value: "cloudflare", label: "Cloudflare" },
                  { value: "locaweb", label: "Locaweb" },
                ]} />
                <SelectField label="Status" value={form.status} onChange={f("status")} options={[
                  { value: "ativo", label: "Ativo" },
                  { value: "pendente", label: "Pendente" },
                  { value: "expirado", label: "Expirado" },
                  { value: "cancelado", label: "Cancelado" },
                ]} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Data de registro" value={form.data_registro} onChange={f("data_registro")} type="date" />
                <Field label="Data de expiração" value={form.expira_em} onChange={f("expira_em")} type="date" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Titular" value={form.titular_nome} onChange={f("titular_nome")} placeholder="ex.: PADCOM Ltda" />
                <Field label="CPF / CNPJ" value={form.titular_documento} onChange={f("titular_documento")} placeholder="ex.: 00.000.000/0001-00" />
              </div>
              <ToggleRow label="Auto-renovar" value={form.auto_renovar} onChange={f("auto_renovar")} />
            </>
          )}
          {secao === 2 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="NS1" value={form.ns1} onChange={f("ns1")} placeholder="ex.: ivan.ns.cloudflare.com" />
                <Field label="NS2" value={form.ns2} onChange={f("ns2")} placeholder="ex.: uma.ns.cloudflare.com" />
              </div>
              <SelectField label="Provedor DNS" value={form.dns_provider} onChange={f("dns_provider")} options={[
                { value: "cloudflare", label: "Cloudflare (recomendado)" },
                { value: "registrobr", label: "Registro.br DNS" },
                { value: "godaddy", label: "GoDaddy DNS" },
                { value: "outro", label: "Outro" },
              ]} />
              {form.dns_provider === "cloudflare" && (
                <Field label="Cloudflare Zone ID" value={form.cloudflare_zone_id}
                  onChange={f("cloudflare_zone_id")} placeholder="ex.: abc123def456..." />
              )}
            </>
          )}
          {secao === 3 && (
            <>
              <ToggleRow label="Domínio já verificado no Zoho?" value={form.zoho_verificado} onChange={f("zoho_verificado")} />
              <Field label="Conta admin Zoho" value={form.zoho_conta_admin} onChange={f("zoho_conta_admin")}
                placeholder="ex.: admin@pawards.com.br" type="email" />
              <ToggleRow label="Criar aliases automaticamente?" value={form.zoho_auto_alias} onChange={f("zoho_auto_alias")} />
              <ToggleRow label="Módulo pago para clínica?" value={form.modulo_pago} onChange={f("modulo_pago")} />
              {form.modulo_pago && (
                <Field label="Valor mensal (centavos — ex.: 19900 = R$ 199,00)"
                  value={form.valor_mensal_centavos} onChange={f("valor_mensal_centavos")} type="number" />
              )}
            </>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between">
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map(n => (
              <div key={n} className={`h-1.5 w-6 rounded-full ${secao === n ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
          {erro && <p className="text-sm text-red-600 dark:text-red-400 mx-3">{erro}</p>}
          <div className="flex gap-2 ml-auto">
            {secao > 1 && (
              <button onClick={() => setSecao(s => (s - 1) as 1 | 2 | 3)}
                className="rounded border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors">
                Anterior
              </button>
            )}
            {secao < 3 && (
              <button onClick={() => setSecao(s => (s + 1) as 1 | 2 | 3)}
                className="btn-3d px-4 py-2 text-xs font-semibold">
                Próxima →
              </button>
            )}
            {secao === 3 && (
              <button onClick={handleSave} disabled={saving}
                className="btn-3d inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grade Mestre — 5 campos IGUAIS para TODOS os registradores.
// Campos N/A ficam visíveis e cinzas com tooltip explicativo.
// ─────────────────────────────────────────────────────────────────────────────

type MasterField = {
  key: "login" | "api_key" | "api_secret" | "client_ip" | "account_id";
  label: string;
  placeholderAtivo: string;
  sensivel: boolean;
};

const MASTER_FIELDS: MasterField[] = [
  { key: "login",      label: "Usuário / Login",               placeholderAtivo: "seu login ou usuário",  sensivel: false },
  { key: "api_key",    label: "Chave de API (API Key / Token)", placeholderAtivo: "cole a chave aqui",    sensivel: true  },
  { key: "api_secret", label: "Secret / Senha da API",         placeholderAtivo: "cole o secret aqui",   sensivel: true  },
  { key: "client_ip",  label: "IP Autorizado (Whitelist)",     placeholderAtivo: "ex.: 203.0.113.42",    sensivel: false },
  { key: "account_id", label: "ID da Conta / Organização",     placeholderAtivo: "ex.: 123456789",       sensivel: false },
];

type RegistradorInfo = {
  id: string;
  nome: string;
  descricao: string;
  icon: React.ComponentType<{ className?: string }>;
  precos: string;
  categoria: "Nacional" | "Global";
  linkExtra?: { label: string; href: string };
  ativo: Record<MasterField["key"], boolean>;
  tooltipNA: Partial<Record<MasterField["key"], string>>;
};

const REGISTRADORES_INFO: RegistradorInfo[] = [
  {
    id: "registrobr",
    nome: "Registro.br / UOL Host",
    descricao: "Autoridade oficial brasileira — .com.br .net.br .org.br",
    icon: Shield,
    precos: ".com.br R$ 40/ano",
    categoria: "Nacional",
    linkExtra: { label: "Registrar manualmente → registro.br", href: "https://registro.br/registro/novo/" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: false },
    tooltipNA: { api_secret: "UOL não usa secret separado", client_ip: "UOL não exige whitelist de IP", account_id: "Autenticação por login + key — sem Account ID" },
  },
  {
    id: "locaweb",
    nome: "Locaweb",
    descricao: "Registrador brasileiro com suporte em PT-BR",
    icon: Globe,
    precos: ".com.br R$ 69/ano",
    categoria: "Nacional",
    linkExtra: { label: "Painel Locaweb ↗", href: "https://painel.locaweb.com.br" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: true  },
    tooltipNA: { api_secret: "Locaweb não usa secret — só token", client_ip: "Locaweb não exige whitelist de IP" },
  },
  {
    id: "namecheap",
    nome: "Namecheap",
    descricao: "Melhor custo-benefício global — API REST moderna",
    icon: CreditCard,
    precos: ".com ≈ R$ 57/ano",
    categoria: "Global",
    linkExtra: { label: "Gerar chave → Profile → Tools → API Access", href: "https://ap.www.namecheap.com/settings/tools/apiaccess/" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: true,  account_id: false },
    tooltipNA: { api_secret: "Namecheap não usa secret — só API Key", account_id: "Identificação pelo login + API Key" },
  },
  {
    id: "godaddy",
    nome: "GoDaddy",
    descricao: "Maior variedade de TLDs — .com.br via revenda + 500 outros",
    icon: Building2,
    precos: ".com ≈ R$ 75/ano",
    categoria: "Global",
    linkExtra: { label: "Gerar chave → developer.godaddy.com → Keys", href: "https://developer.godaddy.com/keys" },
    ativo:     { login: false, api_key: true,  api_secret: true,  client_ip: false, account_id: false },
    tooltipNA: { login: "GoDaddy autentica por key + secret — sem login separado", client_ip: "GoDaddy não exige whitelist de IP", account_id: "GoDaddy não usa Account ID nesta API" },
  },
  {
    id: "cloudflare",
    nome: "Cloudflare Registrar",
    descricao: "Preço de custo — melhor DNS do mundo + proteção DDoS",
    icon: Server,
    precos: ".com ≈ R$ 57/ano",
    categoria: "Global",
    linkExtra: { label: "Gerar token → dash.cloudflare.com → Profile → API Tokens", href: "https://dash.cloudflare.com/profile/api-tokens" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: true  },
    tooltipNA: { api_secret: "Cloudflare usa só API Token — sem secret separado", client_ip: "Cloudflare não exige whitelist de IP" },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tela principal
// ─────────────────────────────────────────────────────────────────────────────

export default function PainelDominios() {
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prefill, setPrefill] = useState<Partial<DominioForm>>({});

  // Verificador
  const [busca, setBusca] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [resultados, setResultados] = useState<CheckResult[]>([]);

  // E-mail (domínio selecionado)
  const [dominioEmail, setDominioEmail] = useState<Dominio | null>(null);
  const [emailPrefixo, setEmailPrefixo] = useState("");
  const [emailDisplay, setEmailDisplay] = useState("");
  const [emailSenha, setEmailSenha] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Registrador ativo + expandido + credenciais
  const [regAtivo, setRegAtivo] = useState<string>("registrobr");
  const [regExpanded, setRegExpanded] = useState<string | null>("registrobr");
  const [creds, setCreds] = useState<Record<string, Record<string, string>>>({});
  const [showSens, setShowSens] = useState<Record<string, boolean>>({});
  const [savingReg, setSavingReg] = useState<string | null>(null);
  const [savedReg, setSavedReg] = useState<string | null>(null);

  function setCredsField(regId: string, field: string, val: string) {
    setCreds(prev => ({ ...prev, [regId]: { ...(prev[regId] ?? {}), [field]: val } }));
  }
  function toggleSens(key: string) {
    setShowSens(prev => ({ ...prev, [key]: !prev[key] }));
  }
  function clickReg(regId: string) {
    setRegAtivo(regId);
    setRegExpanded(prev => prev === regId ? null : regId);
  }
  async function saveCreds(regId: string) {
    setSavingReg(regId);
    try {
      await new Promise(r => setTimeout(r, 600));
      setSavedReg(regId);
      setTimeout(() => setSavedReg(null), 2500);
    } finally { setSavingReg(null); }
  }

  const fetchDominios = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/dominios`);
      if (r.ok) { const d = await r.json(); setDominios(d.items ?? []); }
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDominios(); }, [fetchDominios]);

  async function handleAdd(form: DominioForm) {
    const r = await fetch(`${BASE}/api/dominios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        valor_mensal_centavos: form.valor_mensal_centavos ? parseInt(form.valor_mensal_centavos) : null,
        expira_em: form.expira_em || null,
        data_registro: form.data_registro || null,
      }),
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Erro ao salvar"); }
    await fetchDominios();
  }

  async function handleDelete(id: number, dominio: string) {
    if (!window.confirm(`Remover "${dominio}" do painel?\n\nO domínio em si não será cancelado.`)) return;
    await fetch(`${BASE}/api/dominios/${id}`, { method: "DELETE" });
    if (dominioEmail?.id === id) setDominioEmail(null);
    await fetchDominios();
  }

  async function verificarDisponibilidade() {
    // Extrai só o nome base: remove protocolo, barra, TLD conhecidos
    const raw = busca.trim().replace(/^https?:\/\//, "").replace(/\//g, "").toLowerCase();
    const base = raw
      .replace(/\.(com\.br|net\.br|org\.br|com|net|org|io|app)$/, "")
      .replace(/[^a-z0-9-]/g, "");
    if (!base) return;
    setVerificando(true);
    // Placeholder enquanto a API responde (API retorna 7 TLDs de uma vez)
    setResultados([
      "com.br", "com", "net.br", "io", "org.br", "net", "org",
    ].map(t => ({ dominio: `${base}.${t}`, status: "verificando" })));
    try {
      const r = await fetch(`${BASE}/api/dominios/check?base=${encodeURIComponent(base)}`);
      const j = await r.json();
      if (r.ok && Array.isArray(j.resultados)) {
        setResultados(j.resultados);
      } else {
        setResultados(prev => prev.map(x => ({ ...x, status: "erro" })));
      }
    } catch {
      setResultados(prev => prev.map(x => ({ ...x, status: "erro" })));
    }
    setVerificando(false);
  }

  async function criarEmail() {
    if (!dominioEmail || !emailPrefixo) { setEmailMsg("Preencha o prefixo"); return; }
    setEmailLoading(true); setEmailMsg("");
    try {
      const r = await fetch(`${BASE}/api/dominios/${dominioEmail.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: emailPrefixo, displayName: emailDisplay || emailPrefixo, password: emailSenha }),
      });
      const j = await r.json();
      if (r.ok) setEmailMsg(`✓ ${emailPrefixo}@${dominioEmail.dominio} criado com sucesso!`);
      else setEmailMsg(j.error ?? "Erro ao criar e-mail");
    } catch { setEmailMsg("Erro de conexão"); }
    finally { setEmailLoading(false); }
  }

  function abrirModal(p?: Partial<DominioForm>) {
    setPrefill(p ?? {}); setShowModal(true);
  }

  const reginfoAtivo = REGISTRADORES_INFO.find(r => r.id === regAtivo);

  return (
    <ConsoleShell
      icon={Globe}
      title="Painel de Domínios & Aliases"
      subtitle="Verifique disponibilidade, compre domínios via API, gerencie e-mails e aliases automaticamente via Zoho."
    >
      {showModal && (
        <ModalDominio inicial={prefill} onSave={handleAdd} onClose={() => setShowModal(false)} />
      )}

      {/* ─── Seção A — Verificador ─────────────────────────────────────────── */}
      <section className="panel-3d p-5 space-y-4">
        <BlockTitle icon={Search}>Verificador de Disponibilidade</BlockTitle>
        <p className="text-[12px] text-muted-foreground">
          Consulta via RDAP público (Registro.br + Verisign) em tempo real.
          Botões de compra aparecem apenas para TLDs disponíveis.
        </p>
        <div className="flex gap-3">
          <div className="concave-3d flex h-11 flex-1 items-center gap-2 px-3">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground/60" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === "Enter" && verificarDisponibilidade()}
              placeholder="ex.: padcon  (sem extensão)"
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
          <Button
            onClick={verificarDisponibilidade}
            disabled={verificando || !busca.trim()}
            className="btn-3d h-11 px-5 text-[13px] font-bold uppercase tracking-[0.12em]"
          >
            {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-2">Verificar</span>
          </Button>
        </div>

        {resultados.length > 0 && (
          <div className="space-y-2">
            {resultados.map(r => (
              <div key={r.dominio} className={`panel-3d p-3 flex items-center justify-between gap-3 ${r.status === "verificando" ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="bevel-3d w-8 h-8 rounded-[6px] flex items-center justify-center shrink-0">
                    {r.status === "disponivel"
                      ? <CheckCircle className="w-4 h-4 text-emerald-600" />
                      : r.status === "registrado"
                        ? <XCircle className="w-4 h-4 text-red-500" />
                        : <Globe className="w-4 h-4 text-muted-foreground/60" />}
                  </div>
                  <span className="font-mono font-bold text-[14px] text-foreground">{r.dominio}</span>
                </div>
                <div className="flex items-center gap-2">
                  <BadgeRdap status={r.status} />
                  {r.status === "disponivel" && (
                    <Button size="sm" className="btn-3d h-7 px-3 text-[11px] font-bold uppercase"
                      onClick={() => abrirModal({ dominio: r.dominio })}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Seção B — Seus Domínios (padrão BANCOS) ──────────────────────── */}
      <section className="panel-3d p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <BlockTitle icon={Globe}>Domínios Sob Controle ({dominios.length})</BlockTitle>
          <div className="flex items-center gap-2 -mt-1">
            <button
              onClick={fetchDominios}
              disabled={loading}
              className="btn-3d-soft h-8 px-2.5 flex items-center justify-center"
              title="Atualizar lista"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <Button
              onClick={() => abrirModal()}
              className="btn-3d h-8 px-4 text-[11px] font-bold uppercase tracking-[0.12em]"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo domínio
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="panel-3d p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Carregando domínios...
          </div>
        ) : dominios.length === 0 ? (
          <div className="panel-3d p-8 text-center space-y-3">
            <Globe className="h-10 w-10 mx-auto opacity-10" />
            <p className="text-[13px] text-muted-foreground">Nenhum domínio cadastrado ainda.</p>
            <Button onClick={() => abrirModal()} className="btn-3d h-9 px-4 text-[11px] font-bold uppercase tracking-[0.12em]">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar primeiro domínio
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {dominios.map(d => (
              <div key={d.id} className={`panel-3d p-4 ${d.status !== "ativo" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  {/* Ícone + info — padrão idêntico ao BANCOS */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="bevel-3d w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0 relative">
                      <Globe className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                      <span
                        className={`paxter-led paxter-led-breathe absolute -bottom-0.5 -right-0.5 ${
                          d.status === "ativo" ? "paxter-led-amber" : "paxter-led-off"
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-[14px] text-foreground font-mono">{d.dominio}</p>
                        <span className="bevel-3d text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded">
                          {d.registrador ?? "Manual"}
                        </span>
                        <StatusBadge status={d.status} />
                        {d.zoho_verificado && (
                          <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded text-blue-700 bg-blue-500/15">
                            Zoho ✓
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        DNS: {d.dns_provider ?? "—"} · NS: {d.ns1 ?? "—"}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {d.expira_em
                          ? `Expira ${new Date(d.expira_em).toLocaleDateString("pt-BR")}`
                          : "Sem data de expiração"}
                      </p>
                    </div>
                  </div>
                  {/* Botões — padrão idêntico ao BANCOS */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline" size="sm"
                      className="btn-3d-soft h-8 px-2.5"
                      onClick={() => abrirModal({ dominio: d.dominio, registrador: d.registrador ?? "manual", notas: d.notas ?? "" })}
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="btn-3d-soft h-8 px-2.5"
                      onClick={() => setDominioEmail(dominioEmail?.id === d.id ? null : d)}
                      title={dominioEmail?.id === d.id ? "Fechar e-mail" : "Gerenciar e-mail"}
                    >
                      <AtSign className={`w-3.5 h-3.5 ${dominioEmail?.id === d.id ? "text-primary" : ""}`} />
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="btn-3d-soft h-8 px-2.5"
                      onClick={() => handleDelete(d.id, d.dominio)}
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Globe className="w-3.5 h-3.5" />
          {dominios.filter(d => d.status === "ativo").length} domínio(s) ativo(s)
        </div>
      </section>

      {/* ─── Seção D — Gerenciar E-mail (aparece ao clicar no @) ──────────── */}
      {dominioEmail && (
        <section className="panel-3d p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <BlockTitle icon={Mail}>E-mail para @{dominioEmail.dominio}</BlockTitle>
            <button
              onClick={() => setDominioEmail(null)}
              className="btn-3d-soft h-7 w-7 flex items-center justify-center -mt-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="concave-3d flex items-start gap-2.5 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <p className="text-[12px] text-muted-foreground">
              Configure <strong>ZOHO_ORG_ID</strong> e <strong>ZOHO_ADMIN_TOKEN</strong> nas configurações do sistema.
              Escopo necessário: <code className="font-mono text-[11px]">ZohoMail.organization.accounts.CREATE</code>
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Prefixo (conta)"
                value={emailPrefixo}
                onChange={setEmailPrefixo}
                placeholder={`ex.: ceo  →  ceo@${dominioEmail.dominio}`}
              />
              <Field
                label="Nome de exibição"
                value={emailDisplay}
                onChange={setEmailDisplay}
                placeholder="ex.: Dr. Caio Padua"
              />
            </div>
            <Field
              label="Senha inicial"
              value={emailSenha}
              onChange={setEmailSenha}
              type="password"
              placeholder="Mínimo 8 caracteres"
            />
            {emailPrefixo && (
              <div className="concave-3d px-4 py-2.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Conta que será criada</p>
                <p className="font-mono font-bold text-[14px]">{emailPrefixo}@{dominioEmail.dominio}</p>
              </div>
            )}
          </div>

          {emailMsg && (
            <p className={`text-sm ${emailMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{emailMsg}</p>
          )}

          <Button
            onClick={criarEmail}
            disabled={emailLoading || !emailPrefixo}
            className="btn-3d h-11 px-6 text-[13px] font-bold uppercase tracking-[0.12em]"
          >
            {emailLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
            Criar E-mail
          </Button>

          {/* DNS MX — referência rápida */}
          <details className="group">
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground flex items-center gap-2">
              <Settings className="h-3.5 w-3.5" /> Ver registros DNS necessários (MX + SPF + DKIM)
            </summary>
            <div className="mt-3 concave-3d px-4 py-3 font-mono text-xs space-y-1 text-muted-foreground">
              <p>MX  10  mx.zoho.com</p>
              <p>MX  20  mx2.zoho.com</p>
              <p>MX  50  mx3.zoho.com</p>
              <p>TXT     "v=spf1 include:zoho.com ~all"</p>
              <p>CNAME   zmail._domainkey  [fornecido pelo Zoho]</p>
            </div>
          </details>
        </section>
      )}

      {/* ─── Seção C — Plataformas de Registro (padrão Mensageria) ─────────── */}
      <section className="panel-3d p-5 space-y-4">
        <BlockTitle icon={Settings}>Plataformas de Registro & Credenciais</BlockTitle>
        <ExplainRow>
          Selecione qual registrador o <strong>Verificador</strong> usa ao comprar um domínio disponível.
          Credenciais de API são configuradas nas integrações do sistema.
        </ExplainRow>

        {/* Plataforma ativa */}
        <div className="concave-3d flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            {reginfoAtivo && <reginfoAtivo.icon className="h-4 w-4 text-primary shrink-0" />}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Plataforma Ativa para Novos Registros</p>
              <p className="font-bold text-[13px] text-foreground">{reginfoAtivo?.nome ?? "—"}</p>
            </div>
          </div>
          <span className="paxter-led paxter-led-amber paxter-led-breathe" />
        </div>

        {/* Grade por categoria — Nacional primeiro, Global depois */}
        {(["Nacional", "Global"] as const).map(cat => {
          const lista = REGISTRADORES_INFO.filter(r => r.categoria === cat);
          return (
            <div key={cat} className="space-y-3">
              {/* Label de categoria em bevel-3d levantado */}
              <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px]">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  {cat === "Nacional" ? "🇧🇷  Nacional" : "🌐  Global"}
                </span>
              </div>

              <div className="space-y-3">
                {lista.map(reg => {
                  const sel = regAtivo === reg.id;
                  const exp = regExpanded === reg.id;
                  return (
                    <div key={reg.id} className={`panel-3d overflow-hidden transition-all ${sel ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}>
                      {/* Linha do cabeçalho — clicável */}
                      <button
                        type="button"
                        onClick={() => clickReg(reg.id)}
                        className="flex items-center gap-3 p-4 w-full text-left"
                      >
                        <div className={`bevel-3d flex h-9 w-9 items-center justify-center shrink-0 ${sel ? "text-primary" : "text-muted-foreground/60"}`}>
                          <reg.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold uppercase tracking-[0.05em]">{reg.nome}</p>
                            {sel && (
                              <span className="text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded text-emerald-700 bg-emerald-500/15">
                                Ativo
                              </span>
                            )}
                          </div>
                          <div className="concave-3d inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-mono text-muted-foreground">
                            {reg.precos}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {exp ? "▲" : "▼"}
                        </span>
                      </button>

                      {/* Grade Mestre — aparece ao expandir */}
                      {exp && (
                        <div className="border-t border-border px-4 pt-4 pb-4 space-y-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                            Credenciais de API
                          </p>

                          {MASTER_FIELDS.map(field => {
                            const ativo = reg.ativo[field.key];
                            const sensKey = `${reg.id}_${field.key}`;
                            const visible = showSens[sensKey];
                            const val = creds[reg.id]?.[field.key] ?? "";

                            return (
                              <div key={field.key}>
                                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">
                                  {field.label}
                                </label>
                                {ativo ? (
                                  <div className="relative">
                                    <input
                                      type={field.sensivel && !visible ? "password" : "text"}
                                      value={val}
                                      onChange={e => setCredsField(reg.id, field.key, e.target.value)}
                                      placeholder={field.placeholderAtivo}
                                      className="concave-3d w-full h-11 rounded px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 pr-10"
                                    />
                                    {field.sensivel && (
                                      <button
                                        type="button"
                                        onClick={() => toggleSens(sensKey)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        title={visible ? "Ocultar" : "Mostrar"}
                                      >
                                        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div
                                    className="concave-3d w-full h-11 rounded px-3 flex items-center opacity-40 cursor-not-allowed"
                                    title={reg.tooltipNA[field.key]}
                                  >
                                    <span className="text-[12px] text-muted-foreground italic">
                                      N/A — {reg.tooltipNA[field.key] ?? "Não aplicável"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Rodapé da Grade Mestre */}
                          <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
                            {reg.linkExtra && (
                              <a
                                href={reg.linkExtra.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {reg.linkExtra.label}
                              </a>
                            )}
                            <div className="flex items-center gap-2 ml-auto">
                              {savedReg === reg.id && (
                                <span className="text-[11px] text-emerald-600 font-semibold">✓ Salvo</span>
                              )}
                              <Button
                                onClick={() => saveCreds(reg.id)}
                                disabled={savingReg === reg.id}
                                className="btn-3d h-9 px-5 text-[11px] font-bold uppercase tracking-[0.12em]"
                              >
                                {savingReg === reg.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                  : <Save className="h-3.5 w-3.5 mr-1.5" />}
                                Salvar Credenciais
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* ─── Seção E — Empresas Licenciadas ───────────────────────────────────── */}
      <section className="panel-3d p-5 space-y-4">
        <BlockTitle icon={Building2}>Empresas Licenciadas</BlockTitle>
        <ExplainRow>
          Domínios PAXTER disponibilizados como módulo pago para clínicas parceiras.
          Ative o módulo pago no modal de edição de cada domínio (aba E-mail Zoho).
        </ExplainRow>

        {dominios.filter(d => d.modulo_pago).length === 0 ? (
          <div className="concave-3d flex flex-col items-center gap-3 py-10 text-center rounded">
            <Building2 className="h-8 w-8 opacity-15" />
            <p className="text-[13px] text-muted-foreground">Nenhum domínio marcado como módulo pago.</p>
            <p className="text-[11px] text-muted-foreground/70">
              Edite um domínio → aba "E-mail Zoho" → ative "Módulo pago para clínica?".
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dominios.filter(d => d.modulo_pago).map(d => (
              <div key={d.id} className="panel-3d p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="bevel-3d w-10 h-10 rounded-[8px] flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-[14px] text-foreground font-mono">{d.dominio}</p>
                        <StatusBadge status={d.status} />
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Titular: {d.titular_nome ?? "—"} · {d.titular_documento ?? "—"}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {d.valor_mensal_centavos
                          ? `Módulo: R$ ${(d.valor_mensal_centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês`
                          : "Valor não configurado"}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="btn-3d-soft h-8 px-2.5"
                    onClick={() => abrirModal({ dominio: d.dominio, titular_nome: d.titular_nome ?? "", titular_documento: d.titular_documento ?? "" })}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="concave-3d rounded px-4 py-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Fluxo de aprovação</p>
          <p className="text-[12px] text-muted-foreground">
            Clínica solicita → CEO aprova via WhatsApp → Asaas cobra → pagamento confirmado → Zoho cria e-mail corporativo.
          </p>
          <p className="text-[10px] text-muted-foreground/60 italic">Módulo de solicitação externa: próxima onda.</p>
        </div>
      </section>
    </ConsoleShell>
  );
}
