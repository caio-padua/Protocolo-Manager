import { useState, useEffect, useCallback } from "react";
import {
  Globe, Search, Plus, Trash2, CheckCircle, XCircle, Loader2,
  RefreshCw, AtSign, AlertCircle, Settings, ChevronDown, ChevronUp,
  Eye, EyeOff, Save, Mail, Link, Shield, Server, CreditCard, Building2, Edit2, X
} from "lucide-react";
import { ConsoleShell, BASE } from "./_shared";

// ── tipos ─────────────────────────────────────────────────────────────────

type StatusRdap = "disponivel" | "registrado" | "erro" | "verificando";
type CheckResult = { dominio: string; status: StatusRdap };

type Dominio = {
  id: number; dominio: string; registrador: string | null; registrador_domain_id: string | null;
  status: string; expira_em: string | null; data_registro: string | null; auto_renovar: boolean;
  empresa_id: number | null; notas: string | null; titular_nome: string | null;
  titular_documento: string | null; modulo_pago: boolean; valor_mensal_centavos: number | null;
  ns1: string | null; ns2: string | null; ns3: string | null; ns4: string | null;
  dns_provider: string | null; cloudflare_zone_id: string | null;
  zoho_verificado: boolean; zoho_metodo_verificacao: string | null;
  zoho_conta_admin: string | null; zoho_auto_alias: boolean;
  criado_em: string;
};

type RegistradorId = "registrobr" | "locaweb" | "namecheap" | "godaddy" | "cloudflare" | "zoho";
type CategoriaRegistrador = "nacional" | "global" | "email";

// ── helpers visuais ───────────────────────────────────────────────────────

function Badge({ label, cor }: { label: string; cor: "verde" | "vermelho" | "amarelo" | "cinza" | "azul" }) {
  const map = {
    verde:    "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400",
    vermelho: "bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400",
    amarelo:  "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400",
    cinza:    "bg-muted text-muted-foreground",
    azul:     "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${map[cor]}`}>
      {label}
    </span>
  );
}

function BadgeRdap({ status }: { status: StatusRdap }) {
  if (status === "disponivel") return <Badge label="Disponível" cor="verde" />;
  if (status === "registrado") return <Badge label="Registrado" cor="vermelho" />;
  if (status === "verificando") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Verificando
    </span>
  );
  return <Badge label="Erro" cor="amarelo" />;
}

function BadgeDominio({ status }: { status: string }) {
  const cor: Record<string, "verde" | "vermelho" | "amarelo" | "cinza"> = {
    ativo: "verde", expirado: "vermelho", pendente: "amarelo", cancelado: "cinza"
  };
  return <Badge label={status} cor={cor[status] ?? "cinza"} />;
}

// ── Input helper ─────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = "text", placeholder = "", disabled = false, className = "" }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; disabled?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 disabled:cursor-not-allowed" />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-border"}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

// ── Formulário completo de domínio ────────────────────────────────────────

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

function ModalDominio({
  inicial, onSave, onClose,
}: { inicial?: Partial<DominioForm>; onSave: (f: DominioForm) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<DominioForm>({ ...FORM_EMPTY, ...inicial });
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [secao, setSecao] = useState<1|2|3|4>(1);

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

  const secaoClass = (n: 1|2|3|4) =>
    `px-4 py-2 text-xs font-semibold rounded-t border-b-2 transition-colors cursor-pointer ${
      secao === n ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">
              {inicial?.dominio ? `Editar: ${inicial.dominio}` : "Adicionar Domínio"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Preencha as 4 seções para configuração completa</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-3 pt-2">
          <button className={secaoClass(1)} onClick={() => setSecao(1)}>1. Identificação</button>
          <button className={secaoClass(2)} onClick={() => setSecao(2)}>2. DNS / Nameservers</button>
          <button className={secaoClass(3)} onClick={() => setSecao(3)}>3. E-mail Zoho</button>
          <button className={secaoClass(4)} onClick={() => setSecao(4)}>4. Módulo Pago</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {secao === 1 && (
            <>
              <Field label="Domínio completo *" value={form.dominio} onChange={f("dominio")} placeholder="ex.: pawards.com.br" />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Registrador" value={form.registrador} onChange={f("registrador")} options={[
                  { value: "manual", label: "Manual (já tenho, só registrar)" },
                  { value: "registrobr", label: "Registro.br / UOL Host" },
                  { value: "namecheap", label: "Namecheap" },
                  { value: "godaddy", label: "GoDaddy" },
                  { value: "cloudflare", label: "Cloudflare Registrar" },
                  { value: "locaweb", label: "Locaweb" },
                  { value: "outros", label: "Outros" },
                ]} />
                <SelectField label="Status" value={form.status} onChange={f("status")} options={[
                  { value: "ativo", label: "Ativo" },
                  { value: "pendente", label: "Pendente / Em transferência" },
                  { value: "expirado", label: "Expirado" },
                  { value: "cancelado", label: "Cancelado" },
                ]} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Data de registro" value={form.data_registro} onChange={f("data_registro")} type="date" />
                <Field label="Data de expiração" value={form.expira_em} onChange={f("expira_em")} type="date" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Titular (nome / empresa)" value={form.titular_nome} onChange={f("titular_nome")} placeholder="ex.: PADCOM Ltda" />
                <Field label="CPF / CNPJ do titular" value={form.titular_documento} onChange={f("titular_documento")} placeholder="ex.: 00.000.000/0001-00" />
              </div>
              <Toggle label="Auto-renovar" value={form.auto_renovar} onChange={f("auto_renovar")} />
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Notas internas</label>
                <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} rows={3}
                  placeholder="Observações sobre este domínio..."
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
              </div>
            </>
          )}

          {secao === 2 && (
            <>
              <p className="text-sm text-muted-foreground">Nameservers apontados no painel do registrador. Necessários para configurar DNS do e-mail.</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="NS1 (primário)" value={form.ns1} onChange={f("ns1")} placeholder="ex.: ivan.ns.cloudflare.com" />
                <Field label="NS2 (secundário)" value={form.ns2} onChange={f("ns2")} placeholder="ex.: uma.ns.cloudflare.com" />
                <Field label="NS3 (opcional)" value={form.ns3} onChange={f("ns3")} placeholder="(opcional)" />
                <Field label="NS4 (opcional)" value={form.ns4} onChange={f("ns4")} placeholder="(opcional)" />
              </div>
              <SelectField label="Provedor DNS ativo" value={form.dns_provider} onChange={f("dns_provider")} options={[
                { value: "cloudflare", label: "Cloudflare (recomendado)" },
                { value: "registrobr", label: "Registro.br DNS" },
                { value: "uolhost", label: "UOL Host DNS" },
                { value: "godaddy", label: "GoDaddy DNS" },
                { value: "namecheap", label: "Namecheap DNS" },
                { value: "outro", label: "Outro" },
              ]} />
              {form.dns_provider === "cloudflare" && (
                <Field label="Cloudflare Zone ID (para automação DNS)" value={form.cloudflare_zone_id}
                  onChange={f("cloudflare_zone_id")} placeholder="ex.: abc123def456..." />
              )}
              <div className="rounded border border-dashed border-border p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Registros DNS recomendados para e-mail Zoho</p>
                <div className="font-mono text-xs space-y-1 text-muted-foreground">
                  <p>MX  10  mx.zoho.com</p>
                  <p>MX  20  mx2.zoho.com</p>
                  <p>MX  50  mx3.zoho.com</p>
                  <p>TXT     "v=spf1 include:zoho.com ~all"</p>
                  <p>CNAME zmail._domainkey  [fornecido pelo Zoho na verificação]</p>
                </div>
                <p className="text-[11px] text-muted-foreground">Após configurar o Cloudflare Zone ID, o botão "Aplicar DNS Zoho" ficará disponível para configurar automaticamente.</p>
              </div>
            </>
          )}

          {secao === 3 && (
            <>
              <p className="text-sm text-muted-foreground">Configure a integração com o Zoho Mail para este domínio.</p>
              <Toggle label="Domínio já verificado no Zoho?" value={form.zoho_verificado} onChange={f("zoho_verificado")} />
              {!form.zoho_verificado && (
                <SelectField label="Método de verificação Zoho" value={form.zoho_metodo_verificacao} onChange={f("zoho_metodo_verificacao")} options={[
                  { value: "txt", label: "Registro TXT no DNS (recomendado)" },
                  { value: "cname", label: "Registro CNAME" },
                  { value: "html", label: "Arquivo HTML no servidor" },
                ]} />
              )}
              <Field label="Conta admin Zoho padrão para este domínio"
                value={form.zoho_conta_admin} onChange={f("zoho_conta_admin")}
                placeholder="ex.: admin@pawards.com.br" type="email" />
              <Toggle label="Criar aliases automaticamente ao salvar?" value={form.zoho_auto_alias} onChange={f("zoho_auto_alias")} />
              <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Para criação automática de e-mail</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  Configure ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN no bloco Zoho da seção de Registradores abaixo.
                  Escopo necessário: <code>ZohoMail.organization.accounts.CREATE</code>
                </p>
              </div>
            </>
          )}

          {secao === 4 && (
            <>
              <p className="text-sm text-muted-foreground">Configure este domínio como serviço pago para clínicas licenciadas.</p>
              <Toggle label="Módulo pago para clínica licenciada?" value={form.modulo_pago} onChange={f("modulo_pago")} />
              {form.modulo_pago && (
                <Field label="Valor mensal (em centavos, ex.: 19900 = R$ 199,00)"
                  value={form.valor_mensal_centavos} onChange={f("valor_mensal_centavos")}
                  type="number" placeholder="ex.: 19900" />
              )}
              {form.modulo_pago && (
                <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold">Fluxo para clínicas licenciadas:</p>
                  <p>1. Clínica preenche formulário de solicitação</p>
                  <p>2. CEO recebe notificação (WhatsApp + card)</p>
                  <p>3. CEO aprova → sistema cobra via Asaas</p>
                  <p>4. Pagamento confirmado → e-mail criado automaticamente</p>
                  <p>5. Credenciais enviadas à clínica por e-mail</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between">
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
          {!erro && (
            <div className="flex gap-2">
              {([1,2,3,4] as const).map(n => (
                <div key={n} className={`h-1.5 w-6 rounded-full ${secao === n ? "bg-primary" : "bg-border"}`} />
              ))}
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            {secao > 1 && (
              <button onClick={() => setSecao(s => (s - 1) as 1|2|3|4)}
                className="rounded border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition-colors">
                Anterior
              </button>
            )}
            {secao < 4 && (
              <button onClick={() => setSecao(s => (s + 1) as 1|2|3|4)}
                className="btn-3d px-4 py-2 text-xs font-semibold">
                Próxima →
              </button>
            )}
            {secao === 4 && (
              <button onClick={handleSave} disabled={saving}
                className="btn-3d inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar Domínio
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bloco de credenciais de registrador ───────────────────────────────────

// ── GRADE MESTRE — 5 campos idênticos em TODOS os blocos ─────────────────
// Campos inativos (N/A): visíveis, cinzas, cursor bloqueado, tooltip explicativo.
// Alinhamento visual perfeito entre todas as plataformas.

type MasterField = {
  key: string;
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

type PrecoItem = { tld: string; valor: string; obs?: string };

type RegistradorConfig = {
  id: RegistradorId;
  categoria: CategoriaRegistrador;
  nome: string;
  descricao: string;
  icon: React.ComponentType<{ className?: string }>;
  cor: string;             // border-l color class
  corSeletor: string;      // ring/bg color quando selecionado
  tlds: string;
  aviso: string;
  linkExtra?: { label: string; href: string };
  precos: PrecoItem[];     // preços médios anuais em R$
  ativo: Record<string, boolean>;
  tooltipNA: Record<string, string>;
  mapeamento: Record<string, string>;
};

const REGISTRADORES: RegistradorConfig[] = [
  // ── Nacionais ─────────────────────────────────────────────────────────
  {
    id: "registrobr",
    categoria: "nacional",
    nome: "Registro.br / UOL Host",
    descricao: "Autoridade oficial brasileira — .com.br .net.br .org.br",
    icon: Shield,
    cor: "border-l-blue-600",
    corSeletor: "ring-blue-500 bg-blue-50 dark:bg-blue-950/30",
    tlds: ".com.br   .net.br   .org.br   .ind.br   .art.br",
    aviso: "Registro.br não tem API REST pública — usa protocolo EPP. O UOL Host (registrador credenciado) atua como proxy. Use o link abaixo para registro manual ou configure UOL Host.",
    linkExtra: { label: "Registro manual → registro.br", href: "https://registro.br/registro/novo/" },
    precos: [
      { tld: ".com.br", valor: "R$ 40/ano", obs: "preço oficial" },
      { tld: ".net.br", valor: "R$ 40/ano" },
      { tld: ".org.br", valor: "R$ 40/ano" },
    ],
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: false },
    tooltipNA: { api_secret: "Registro.br/UOL não usa secret separado", client_ip: "UOL Host não exige whitelist de IP", account_id: "Autenticação por login + key — sem Account ID" },
    mapeamento:{ login: "login", api_key: "api_key" },
  },
  {
    id: "locaweb",
    categoria: "nacional",
    nome: "Locaweb",
    descricao: "Registrador brasileiro — .com.br e domínios globais, suporte em PT-BR",
    icon: Globe,
    cor: "border-l-purple-600",
    corSeletor: "ring-purple-500 bg-purple-50 dark:bg-purple-950/30",
    tlds: ".com.br   .net.br   .org.br   .com   .net   .org   .io",
    aviso: "API disponível via painel de revenda Locaweb. Obtenha o token em painel.locaweb.com.br → API → Gerar token. Suporte em português.",
    linkExtra: { label: "Painel Locaweb ↗", href: "https://painel.locaweb.com.br" },
    precos: [
      { tld: ".com.br", valor: "R$ 69/ano" },
      { tld: ".com",    valor: "R$ 79/ano" },
      { tld: ".net",    valor: "R$ 69/ano" },
    ],
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: true  },
    tooltipNA: { api_secret: "Locaweb não usa secret separado — só token", client_ip: "Locaweb não exige whitelist de IP" },
    mapeamento:{ login: "login", api_key: "api_token", account_id: "account_id" },
  },
  // ── Globais ───────────────────────────────────────────────────────────
  {
    id: "namecheap",
    categoria: "global",
    nome: "Namecheap",
    descricao: "Melhor custo-benefício global — API REST moderna, sem markup",
    icon: CreditCard,
    cor: "border-l-orange-500",
    corSeletor: "ring-orange-500 bg-orange-50 dark:bg-orange-950/30",
    tlds: ".com   .net   .org   .io   .co   .app   .dev   (sem .com.br)",
    aviso: "Obtenha a API Key em namecheap.com → Profile → Tools → API Access. Depois adicione o IP deste servidor na lista de IPs autorizados antes de salvar.",
    precos: [
      { tld: ".com", valor: "≈ R$ 57/ano", obs: "~USD 10,98" },
      { tld: ".io",  valor: "≈ R$ 290/ano" },
      { tld: ".net", valor: "≈ R$ 47/ano" },
    ],
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: true,  account_id: false },
    tooltipNA: { api_secret: "Namecheap não usa secret — só API Key", account_id: "Identificação pelo login + API Key" },
    mapeamento:{ login: "api_user", api_key: "api_key", client_ip: "client_ip" },
  },
  {
    id: "godaddy",
    categoria: "global",
    nome: "GoDaddy",
    descricao: "Maior variedade de TLDs — .com.br via revenda + 500 outros",
    icon: Building2,
    cor: "border-l-green-600",
    corSeletor: "ring-green-500 bg-green-50 dark:bg-green-950/30",
    tlds: ".com   .net   .org   .com.br   .io   .co   e +500 outros",
    aviso: "Obtenha as chaves em developer.godaddy.com → Keys. Use chaves de produção (não OTE/sandbox) para compras reais. 1º ano costuma ter preço promocional.",
    precos: [
      { tld: ".com",    valor: "≈ R$ 75/ano", obs: "1º ano R$ 10" },
      { tld: ".com.br", valor: "≈ R$ 85/ano" },
      { tld: ".io",     valor: "≈ R$ 320/ano" },
    ],
    ativo:     { login: false, api_key: true,  api_secret: true,  client_ip: false, account_id: false },
    tooltipNA: { login: "GoDaddy autentica por key + secret — sem login separado", client_ip: "GoDaddy não exige whitelist de IP", account_id: "GoDaddy não usa Account ID nesta API" },
    mapeamento:{ api_key: "api_key", api_secret: "api_secret" },
  },
  {
    id: "cloudflare",
    categoria: "global",
    nome: "Cloudflare",
    descricao: "Preço de custo (at-cost, sem markup) + melhor DNS do mercado",
    icon: Server,
    cor: "border-l-amber-500",
    corSeletor: "ring-amber-500 bg-amber-50 dark:bg-amber-950/30",
    tlds: ".com   .net   .org   .io   .co   e outros   (sem .com.br)",
    aviso: "Crie o API Token em dash.cloudflare.com → My Profile → API Tokens. Permissões: Registrar:Edit + Zone:DNS:Edit. O Account ID fica na página inicial do painel.",
    precos: [
      { tld: ".com", valor: "≈ R$ 57/ano", obs: "at-cost, sem lucro" },
      { tld: ".io",  valor: "≈ R$ 280/ano" },
      { tld: ".net", valor: "≈ R$ 45/ano" },
    ],
    ativo:     { login: false, api_key: true,  api_secret: false, client_ip: false, account_id: true  },
    tooltipNA: { login: "Cloudflare autentica por token — sem login separado", api_secret: "Token único — sem secret separado", client_ip: "Cloudflare não exige whitelist de IP" },
    mapeamento:{ api_key: "api_token", account_id: "account_id" },
  },
  // ── E-mail ────────────────────────────────────────────────────────────
  {
    id: "zoho",
    categoria: "email",
    nome: "Zoho Mail Admin",
    descricao: "Criar e-mails, aliases e gerenciar contas — não registra domínios",
    icon: Mail,
    cor: "border-l-red-500",
    corSeletor: "ring-red-500 bg-red-50 dark:bg-red-950/30",
    tlds: "Não registra domínios — gerencia e-mail nos domínios já cadastrados acima",
    aviso: "Obtenha em console.zoho.com → Zoho API Console → Criar cliente OAuth → gerar token. Escopo necessário: ZohoMail.organization.accounts.ALL",
    precos: [
      { tld: "Gratuito",  valor: "até 5 contas", obs: "plano Free" },
      { tld: "Mail Lite", valor: "≈ R$ 8/usuário/mês" },
      { tld: "Mail Plus", valor: "≈ R$ 20/usuário/mês" },
    ],
    ativo:     { login: false, api_key: true,  api_secret: false, client_ip: false, account_id: true  },
    tooltipNA: { login: "Zoho autentica por OAuth token — sem login separado", api_secret: "Token OAuth único — sem secret separado", client_ip: "Zoho não exige whitelist de IP" },
    mapeamento:{ api_key: "zoho_admin_token", account_id: "zoho_org_id" },
  },
];

const CATEGORIAS: { id: CategoriaRegistrador; label: string; descricao: string }[] = [
  { id: "nacional",  label: "Nacionais (Brasil)",    descricao: ".com.br e TLDs brasileiros" },
  { id: "global",    label: "Internacionais",         descricao: ".com .io .co e outros" },
  { id: "email",     label: "E-mail",                 descricao: "Gestão de caixas e aliases" },
];

// ── Componente de campo master (reutilizável) ─────────────────────────────

function CampoMaster({
  field, ativo, tooltip, valor, onChangeValor, mostrarSenha, onToggleSenha,
}: {
  field: MasterField; ativo: boolean; tooltip: string;
  valor: string; onChangeValor: (v: string) => void;
  mostrarSenha: boolean; onToggleSenha: () => void;
}) {
  const inputType = field.sensivel && !mostrarSenha ? "password" : "text";
  return (
    <div className="relative" title={!ativo ? tooltip : undefined}>
      <div className="flex items-center gap-1.5 mb-1">
        <label className={`block text-[11px] font-semibold uppercase tracking-wider ${ativo ? "text-muted-foreground" : "text-muted-foreground/35"}`}>
          {field.label}
        </label>
        {!ativo && (
          <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-bold uppercase tracking-wider bg-muted/60 text-muted-foreground/40 border border-border/40">
            N/A
          </span>
        )}
      </div>
      <div className="relative">
        <input
          type={ativo ? inputType : "text"}
          disabled={!ativo}
          value={ativo ? valor : ""}
          onChange={e => ativo && onChangeValor(e.target.value)}
          placeholder={ativo ? field.placeholderAtivo : "—"}
          className={`w-full rounded border px-3 py-2 text-sm transition-colors ${
            ativo
              ? "border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 pr-9"
              : "border-border/25 bg-muted/15 text-muted-foreground/25 cursor-not-allowed select-none"
          }`}
        />
        {ativo && field.sensivel && (
          <button type="button" onClick={onToggleSenha}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
        {!ativo && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/20 text-xs select-none">✕</span>
        )}
      </div>
    </div>
  );
}

// ── Bloco único de registrador — grade uniforme ───────────────────────────

function BlocoRegistrador({
  config, ativo: isAtivo, onSelecionar,
}: {
  config: RegistradorConfig;
  ativo: boolean;
  onSelecionar: (id: RegistradorId) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [mostrarSenha, setMostrarSenha] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function salvarCredenciais() {
    const dadosMapeados: Record<string, string> = {};
    for (const [keyMaster, keyReal] of Object.entries(config.mapeamento)) {
      if (valores[keyMaster]) dadosMapeados[keyReal] = valores[keyMaster];
    }
    setSaving(true); setMsg("");
    try {
      const r = await fetch(`${BASE}/api/registradores/credenciais/${config.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados: dadosMapeados }),
      });
      if (r.ok) { setMsg("Credenciais salvas."); setTimeout(() => setMsg(""), 3000); }
      else { const d = await r.json(); setMsg("Erro: " + (d.error ?? "falha ao salvar")); }
    } catch { setMsg("Falha de rede"); }
    finally { setSaving(false); }
  }

  return (
    <div className={`panel-3d border-l-4 ${config.cor} overflow-hidden transition-all ${isAtivo ? `ring-2 ${config.corSeletor}` : ""}`}>
      {/* Header */}
      <div className="flex items-center">
        <button onClick={() => setAberto(v => !v)}
          className="flex-1 flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors text-left">
          <config.icon className={`h-4 w-4 flex-shrink-0 ${isAtivo ? "text-primary" : "text-muted-foreground"}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-semibold text-sm ${isAtivo ? "text-primary" : "text-foreground"}`}>{config.nome}</p>
              {isAtivo && (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30">
                  ✓ Plataforma Ativa
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{config.descricao}</p>
          </div>
          {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        </button>
        {/* Botão selecionar — fora do toggle */}
        {!isAtivo && config.categoria !== "email" && (
          <button onClick={() => onSelecionar(config.id)}
            className="px-3 py-3.5 text-[11px] font-semibold text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors border-l border-border flex-shrink-0"
            title="Usar como plataforma ativa para novos registros">
            Usar
          </button>
        )}
      </div>

      {aberto && (
        <div className="border-t border-border px-4 py-4 space-y-4">

          {/* TLDs + Preços lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            {/* TLDs */}
            <div className="rounded border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">TLDs Suportados</p>
              <p className="text-xs text-foreground font-mono leading-relaxed">{config.tlds}</p>
            </div>
            {/* Preços — insert bevel */}
            <div className="rounded border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Preço Médio (ano)</p>
              <div className="space-y-1">
                {config.precos.map(p => (
                  <div key={p.tld} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-muted-foreground">{p.tld}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-foreground">{p.valor}</span>
                      {p.obs && <span className="text-[10px] text-muted-foreground/70 italic">{p.obs}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Aviso */}
          <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{config.aviso}</p>
          </div>

          {/* GRADE MESTRE — 5 campos, 2 colunas, mesma ordem em todos os blocos */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2.5">Credenciais de Acesso</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {MASTER_FIELDS.map(field => (
                <CampoMaster
                  key={field.key}
                  field={field}
                  ativo={config.ativo[field.key] ?? false}
                  tooltip={config.tooltipNA[field.key] ?? "Não utilizado por esta plataforma"}
                  valor={valores[field.key] ?? ""}
                  onChangeValor={v => setValores(p => ({ ...p, [field.key]: v }))}
                  mostrarSenha={mostrarSenha[field.key] ?? false}
                  onToggleSenha={() => setMostrarSenha(p => ({ ...p, [field.key]: !p[field.key] }))}
                />
              ))}
            </div>
          </div>

          {/* Rodapé */}
          <div className="flex items-center gap-3 pt-1 border-t border-border flex-wrap">
            <button onClick={salvarCredenciais} disabled={saving}
              className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar credenciais
            </button>
            {config.categoria !== "email" && !isAtivo && (
              <button onClick={() => onSelecionar(config.id)}
                className="bevel-3d inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                Definir como plataforma ativa
              </button>
            )}
            {config.linkExtra && (
              <a href={config.linkExtra.href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 ml-auto">
                <Link className="h-3.5 w-3.5" /> {config.linkExtra.label}
              </a>
            )}
            {msg && (
              <p className={`text-xs font-semibold ${msg.startsWith("Erro") ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {msg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── BLOCO 1 — Verificador ─────────────────────────────────────────────────

function BlocoVerificador({ onAddToControl }: { onAddToControl: (dominio: string) => void }) {
  const [base, setBase] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [erro, setErro] = useState("");
  const [comprando, setComprando] = useState<string | null>(null);

  async function verificar() {
    const b = base.trim().toLowerCase().replace(/\..+$/, "");
    if (!b) { setErro("Digite o nome base do domínio"); return; }
    setErro(""); setLoading(true);
    const tlds = ["com.br", "com", "net.br", "net", "org.br", "org", "io"];
    setResults(tlds.map(t => ({ dominio: `${b}.${t}`, status: "verificando" })));
    try {
      const r = await fetch(`${BASE}/api/dominios/check?base=${encodeURIComponent(b)}`);
      if (r.ok) { const d = await r.json(); setResults(d.resultados); }
      else { setErro("Erro ao verificar disponibilidade"); setResults([]); }
    } catch { setErro("Falha de rede"); setResults([]); }
    finally { setLoading(false); }
  }

  async function comprar(dominio: string, registrador: string) {
    if (!window.confirm(`Confirmar compra de "${dominio}" via ${registrador}? Isso gerará cobrança real.`)) return;
    setComprando(dominio);
    try {
      const r = await fetch(`${BASE}/api/dominios/comprar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dominio, registrador }),
      });
      const d = await r.json();
      if (r.ok) {
        alert(`✓ ${dominio} registrado com sucesso!`);
        onAddToControl(dominio);
      } else {
        alert(`Erro: ${d.error ?? "falha na compra"}`);
      }
    } catch { alert("Falha de rede ao tentar comprar"); }
    finally { setComprando(null); }
  }

  function botoesPorTld(resultado: CheckResult) {
    if (resultado.status !== "disponivel") return null;
    const dom = resultado.dominio;
    const isBr = dom.endsWith(".com.br") || dom.endsWith(".net.br") || dom.endsWith(".org.br");
    const isGlobal = !isBr;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {isBr && (
          <>
            <button onClick={() => comprar(dom, "godaddy")} disabled={comprando === dom}
              className="text-[10px] bg-green-100 hover:bg-green-200 dark:bg-green-950/40 dark:hover:bg-green-950/60 text-green-700 dark:text-green-400 rounded px-2 py-0.5 font-semibold transition-colors">
              {comprando === dom ? "…" : "GoDaddy"}
            </button>
            <a href="https://registro.br/registro/novo/" target="_blank" rel="noopener noreferrer"
              className="text-[10px] bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded px-2 py-0.5 font-semibold">
              Registro.br ↗
            </a>
          </>
        )}
        {isGlobal && (
          <>
            <button onClick={() => comprar(dom, "namecheap")} disabled={comprando === dom}
              className="text-[10px] bg-orange-100 hover:bg-orange-200 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 rounded px-2 py-0.5 font-semibold transition-colors">
              {comprando === dom ? "…" : "Namecheap"}
            </button>
            <button onClick={() => comprar(dom, "godaddy")} disabled={comprando === dom}
              className="text-[10px] bg-green-100 hover:bg-green-200 dark:bg-green-950/40 text-green-700 dark:text-green-400 rounded px-2 py-0.5 font-semibold transition-colors">
              {comprando === dom ? "…" : "GoDaddy"}
            </button>
            <button onClick={() => comprar(dom, "cloudflare")} disabled={comprando === dom}
              className="text-[10px] bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded px-2 py-0.5 font-semibold transition-colors">
              {comprando === dom ? "…" : "Cloudflare"}
            </button>
          </>
        )}
        <button onClick={() => onAddToControl(dom)}
          className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground rounded px-2 py-0.5 font-semibold transition-colors">
          + Controle manual
        </button>
      </div>
    );
  }

  return (
    <div className="panel-3d space-y-4 p-5">
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Search className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bloco A — Verificador de Disponibilidade</span>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={base} onChange={e => setBase(e.target.value)} onKeyDown={e => e.key === "Enter" && verificar()}
            placeholder="ex.: padcon  (sem extensão)"
            className="w-full rounded border border-border bg-background pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <button onClick={verificar} disabled={loading}
          className="btn-3d inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Verificar
        </button>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {results.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map(r => (
            <div key={r.dominio} className="rounded border border-border bg-muted/20 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{r.dominio}</span>
                <BadgeRdap status={r.status} />
              </div>
              {botoesPorTld(r)}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">Verificação via RDAP público — Registro.br + Verisign. Botões de compra aparecem apenas para TLDs disponíveis. Credenciais dos registradores devem estar configuradas abaixo.</p>
    </div>
  );
}

// ── BLOCO 2 — Registradores ───────────────────────────────────────────────

// ── BLOCO B — Registradores com seletor + categorias ──────────────────────

const LS_KEY = "pda_registrador_ativo";

function BlocoRegistradores() {
  const [ativo, setAtivo] = useState<RegistradorId>(() => {
    const salvo = localStorage.getItem(LS_KEY) as RegistradorId | null;
    return salvo ?? "registrobr";
  });

  function selecionar(id: RegistradorId) {
    setAtivo(id);
    localStorage.setItem(LS_KEY, id);
    // Persiste também no backend para que o verificador use a plataforma certa
    fetch(`${BASE}/api/registradores/ativo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registradorId: id }),
    }).catch(() => {/* silencioso — localStorage é suficiente */});
  }

  const configAtivo = REGISTRADORES.find(r => r.id === ativo)!;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-1">
        <Settings className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Bloco B — Plataformas de Registro & Credenciais
        </span>
      </div>

      {/* SELETOR VISUAL — plataforma ativa para compras */}
      <div className="panel-3d p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Plataforma Ativa para Novos Registros</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Clique numa plataforma para usá-la ao comprar domínios pelo Verificador</p>
          </div>
          <div className={`flex items-center gap-2 rounded border px-3 py-1.5 ${configAtivo.corSeletor} border-current/30`}>
            <configAtivo.icon className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold text-primary">{configAtivo.nome}</span>
          </div>
        </div>

        {/* Cards do seletor — agrupados por categoria */}
        {CATEGORIAS.filter(c => c.id !== "email").map(cat => {
          const regs = REGISTRADORES.filter(r => r.categoria === cat.id);
          return (
            <div key={cat.id}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">{cat.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {regs.map(r => {
                  const sel = ativo === r.id;
                  return (
                    <button key={r.id} onClick={() => selecionar(r.id)}
                      className={`group flex items-center gap-2.5 rounded border px-3 py-2.5 text-left transition-all ${
                        sel
                          ? `ring-2 ${r.corSeletor} border-transparent`
                          : "border-border hover:border-primary/40 hover:bg-muted/30"
                      }`}>
                      <r.icon className={`h-4 w-4 flex-shrink-0 ${sel ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${sel ? "text-primary" : "text-foreground"}`}>{r.nome}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.precos[0]?.tld} {r.precos[0]?.valor}</p>
                      </div>
                      {sel && <span className="ml-auto text-primary text-xs flex-shrink-0">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* BLOCOS POR CATEGORIA */}
      {CATEGORIAS.map(cat => {
        const regs = REGISTRADORES.filter(r => r.categoria === cat.id);
        return (
          <div key={cat.id} className="space-y-2">
            {/* Separador de categoria */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2">{cat.label} — {cat.descricao}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {regs.map(r => (
              <BlocoRegistrador key={r.id} config={r} ativo={ativo === r.id} onSelecionar={selecionar} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── BLOCO 3 — Domínios Sob Controle ──────────────────────────────────────

function BlocoControle({
  dominios, loading, onRefresh, selecionados, onToggle, onAdd, onDelete,
}: {
  dominios: Dominio[]; loading: boolean; onRefresh: () => void;
  selecionados: Set<number>; onToggle: (id: number) => void;
  onAdd: (f: DominioForm) => Promise<void>;
  onDelete: (id: number, dominio: string) => Promise<void>;
}) {
  const [showModal, setShowModal] = useState(false);
  const [prefill, setPrefill] = useState<Partial<DominioForm>>({});

  function abrirModal(p?: Partial<DominioForm>) {
    setPrefill(p ?? {}); setShowModal(true);
  }

  return (
    <>
      {showModal && (
        <ModalDominio inicial={prefill} onSave={onAdd} onClose={() => setShowModal(false)} />
      )}
      <div className="panel-3d space-y-4 p-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Bloco C — Domínios Sob Controle ({dominios.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => abrirModal()}
              className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors">
              <Plus className="h-3.5 w-3.5" /> Adicionar domínio
            </button>
            <button onClick={onRefresh} disabled={loading}
              className="rounded border border-border p-1.5 hover:bg-muted transition-colors disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {selecionados.size > 0 && (
          <div className="rounded border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary">
            {selecionados.size} domínio{selecionados.size > 1 ? "s" : ""} selecionado{selecionados.size > 1 ? "s" : ""} — role para baixo para gerenciar e-mails e aliases
          </div>
        )}

        {dominios.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
            <Globe className="h-10 w-10 opacity-10" />
            <p className="text-sm">Nenhum domínio cadastrado.</p>
            <button onClick={() => abrirModal()} className="btn-3d inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold">
              <Plus className="h-3.5 w-3.5" /> Adicionar primeiro domínio
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2.5 w-10"></th>
                  <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Domínio</th>
                  <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Registrador</th>
                  <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">DNS</th>
                  <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Zoho</th>
                  <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Expira</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dominios.map(d => (
                  <tr key={d.id} className={`transition-colors ${selecionados.has(d.id) ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" checked={selecionados.has(d.id)} onChange={() => onToggle(d.id)}
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer" />
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono font-semibold">{d.dominio}</span>
                      {d.modulo_pago && <Badge label="Pago" cor="azul" />}
                    </td>
                    <td className="px-3 py-3"><BadgeDominio status={d.status} /></td>
                    <td className="px-3 py-3 capitalize text-muted-foreground">{d.registrador ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{d.dns_provider ?? "—"}</td>
                    <td className="px-3 py-3">
                      {d.zoho_verificado
                        ? <Badge label="Verificado" cor="verde" />
                        : <Badge label="Pendente" cor="amarelo" />}
                    </td>
                    <td className="px-3 py-3 font-mono text-muted-foreground">
                      {d.expira_em ? new Date(d.expira_em).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-2 py-3 flex items-center gap-1">
                      <button onClick={() => abrirModal({ dominio: d.dominio, registrador: d.registrador ?? "manual", notas: d.notas ?? "" })}
                        className="rounded p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => onDelete(d.id, d.dominio)}
                        className="rounded p-1 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-muted-foreground hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ── BLOCO 4 — Gerenciamento de E-mail ─────────────────────────────────────

function BlocoEmail({ dominiosSelecionados }: { dominiosSelecionados: Dominio[] }) {
  const [aba, setAba] = useState<"criar-email" | "criar-alias" | "dns" | "clinica">("criar-email");
  const [prefixo, setPrefixo] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [senha, setSenha] = useState("");
  const [aliasPrefixo, setAliasPrefixo] = useState("");
  const [contaDestino, setContaDestino] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const dominioNames = dominiosSelecionados.map(d => d.dominio);

  async function criarEmail() {
    if (!prefixo || !senha) { setMsg("Preencha prefixo e senha"); return; }
    setLoading(true); setMsg("");
    const erros: string[] = [];
    for (const d of dominiosSelecionados) {
      const r = await fetch(`${BASE}/api/dominios/${d.id}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName: prefixo, displayName: displayName || prefixo, password: senha }),
      });
      const j = await r.json();
      if (!r.ok) erros.push(`${d.dominio}: ${j.error}`);
    }
    setMsg(erros.length === 0 ? `✓ E-mail ${prefixo}@[domínio] criado em ${dominiosSelecionados.length} domínio(s)!` : erros.join(" | "));
    setLoading(false);
  }

  async function criarAlias() {
    if (!aliasPrefixo || !contaDestino) { setMsg("Preencha prefixo e conta de destino"); return; }
    setLoading(true); setMsg("");
    const erros: string[] = [];
    for (const d of dominiosSelecionados) {
      const r = await fetch(`${BASE}/api/dominios/${d.id}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: contaDestino, aliasPrefix: aliasPrefixo }),
      });
      const j = await r.json();
      if (!r.ok) erros.push(`${d.dominio}: ${j.error}`);
    }
    setMsg(erros.length === 0 ? `✓ Alias ${aliasPrefixo}@[domínio] criado!` : erros.join(" | "));
    setLoading(false);
  }

  const tabClass = (t: string) =>
    `px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
      aba === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="panel-3d space-y-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <AtSign className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Bloco D — Gerenciamento de E-mail ({dominiosSelecionados.length} domínio{dominiosSelecionados.length > 1 ? "s" : ""})
        </span>
      </div>

      <div className="flex border-b border-border px-3 overflow-x-auto">
        <button className={tabClass("criar-email")} onClick={() => setAba("criar-email")}>Criar E-mail</button>
        <button className={tabClass("criar-alias")} onClick={() => setAba("criar-alias")}>Criar Alias</button>
        <button className={tabClass("dns")} onClick={() => setAba("dns")}>DNS / MX</button>
        <button className={tabClass("clinica")} onClick={() => setAba("clinica")}>Módulo Pago Clínica</button>
      </div>

      <div className="p-5 space-y-4">
        {/* Domínios selecionados */}
        <div className="flex flex-wrap gap-2">
          {dominioNames.map(d => (
            <span key={d} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <AtSign className="h-3 w-3" />{d}
            </span>
          ))}
        </div>

        {aba === "criar-email" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Cria uma nova conta de e-mail nos domínios selecionados via Zoho Admin API.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prefixo (nome da conta)" value={prefixo} onChange={setPrefixo}
                placeholder="ex.: ceo  →  ceo@pawards.com.br" />
              <Field label="Nome de exibição" value={displayName} onChange={setDisplayName}
                placeholder="ex.: Dr. Caio Padua" />
            </div>
            <Field label="Senha inicial" value={senha} onChange={setSenha} type="password"
              placeholder="mínimo 8 caracteres" />
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Contas que serão criadas:</p>
              {dominioNames.map(d => (
                <p key={d} className="font-mono text-sm">
                  {prefixo || "conta"}@{d}
                </p>
              ))}
            </div>
            {msg && <p className={`text-sm ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
            <button onClick={criarEmail} disabled={loading}
              className="btn-3d inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Criar e-mail{dominiosSelecionados.length > 1 ? "s" : ""}
            </button>
          </div>
        )}

        {aba === "criar-alias" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Cria um alias (apelido de e-mail) que redireciona para uma conta já existente.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prefixo do alias" value={aliasPrefixo} onChange={setAliasPrefixo}
                placeholder="ex.: contato, clinica, atendimento" />
              <Field label="Account ID Zoho (conta de destino)" value={contaDestino} onChange={setContaDestino}
                placeholder="Account ID ou e-mail completo" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Aliases que serão criados:</p>
              {dominioNames.map(d => (
                <p key={d} className="font-mono text-sm">
                  {aliasPrefixo || "alias"}@{d} → <span className="text-muted-foreground">{contaDestino || "(conta de destino)"}</span>
                </p>
              ))}
            </div>
            {msg && <p className={`text-sm ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</p>}
            <button onClick={criarAlias} disabled={loading}
              className="btn-3d inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AtSign className="h-4 w-4" />}
              Criar alias{dominiosSelecionados.length > 1 ? "es" : ""}
            </button>
          </div>
        )}

        {aba === "dns" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Configure os registros DNS para e-mail nos domínios selecionados.</p>
            <div className="rounded border border-border bg-muted/30 overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead><tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2 text-left">Valor</th>
                  <th className="px-3 py-2 text-left">Prioridade</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  <tr><td className="px-3 py-2">MX</td><td className="px-3 py-2">@</td><td className="px-3 py-2">mx.zoho.com</td><td className="px-3 py-2">10</td></tr>
                  <tr><td className="px-3 py-2">MX</td><td className="px-3 py-2">@</td><td className="px-3 py-2">mx2.zoho.com</td><td className="px-3 py-2">20</td></tr>
                  <tr><td className="px-3 py-2">MX</td><td className="px-3 py-2">@</td><td className="px-3 py-2">mx3.zoho.com</td><td className="px-3 py-2">50</td></tr>
                  <tr><td className="px-3 py-2">TXT</td><td className="px-3 py-2">@</td><td className="px-3 py-2 text-muted-foreground break-all">v=spf1 include:zoho.com ~all</td><td className="px-3 py-2">—</td></tr>
                  <tr><td className="px-3 py-2">CNAME</td><td className="px-3 py-2">zmail._domainkey</td><td className="px-3 py-2 text-muted-foreground">Fornecido pelo Zoho</td><td className="px-3 py-2">—</td></tr>
                  <tr><td className="px-3 py-2">TXT</td><td className="px-3 py-2">_dmarc</td><td className="px-3 py-2 text-muted-foreground break-all">v=DMARC1; p=none; rua=mailto:admin@[domínio]</td><td className="px-3 py-2">—</td></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                <p className="font-semibold">Aplicação automática via Cloudflare</p>
                <p>Configure o Cloudflare Zone ID para cada domínio (na seção de edição do domínio) e as credenciais Cloudflare no Bloco B. O botão "Aplicar DNS Zoho automaticamente" ficará ativo.</p>
              </div>
            </div>
            <button disabled className="btn-3d inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold opacity-40 cursor-not-allowed">
              <Server className="h-4 w-4" /> Aplicar DNS Zoho via Cloudflare
            </button>
          </div>
        )}

        {aba === "clinica" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Clínicas licenciadas que queiram e-mail corporativo nos domínios PAXTER preenchem uma solicitação.
              O CEO aprova, o sistema cobra e cria o e-mail automaticamente.
            </p>
            <div className="rounded border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formulário de Solicitação (pré-visualização)</p>
              <div className="space-y-3 opacity-70 pointer-events-none">
                <Field label="Nome da clínica" value="" onChange={() => {}} placeholder="ex.: Clínica Vida Bela" />
                <Field label="E-mail desejado" value="" onChange={() => {}} placeholder="ex.: atendimento@padcon.com.br" />
                <SelectField label="Domínio" value="pawards.com.br" onChange={() => {}} options={dominioNames.map(d => ({ value: d, label: d }))} />
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Justificativa</label>
                  <textarea rows={2} disabled placeholder="Para que será usado este e-mail..."
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm resize-none opacity-70" />
                </div>
              </div>
            </div>
            <div className="rounded border border-border p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Fluxo de aprovação</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>1. Clínica preenche formulário → cria solicitação pendente</p>
                <p>2. CEO recebe WhatsApp + card na tela</p>
                <p>3. CEO aprova → Asaas gera cobrança (valor configurado no domínio)</p>
                <p>4. Pagamento confirmado → Zoho Admin API cria e-mail automaticamente</p>
                <p>5. Clínica recebe e-mail com credenciais de acesso</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground italic">Módulo de solicitação para clínicas: em construção. O fluxo completo estará disponível na próxima onda.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TELA PRINCIPAL ────────────────────────────────────────────────────────

export default function PainelDominios() {
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const fetchDominios = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/dominios`);
      if (r.ok) { const d = await r.json(); setDominios(d.items ?? []); }
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDominios(); }, [fetchDominios]);

  function toggleSelect(id: number) {
    setSelecionados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function handleAdd(form: DominioForm) {
    const r = await fetch(`${BASE}/api/dominios`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        valor_mensal_centavos: form.valor_mensal_centavos ? parseInt(form.valor_mensal_centavos) : null,
        expira_em: form.expira_em || null, data_registro: form.data_registro || null,
      }),
    });
    if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Erro ao salvar"); }
    await fetchDominios();
  }

  async function handleDelete(id: number, dominio: string) {
    if (!window.confirm(`Remover "${dominio}" do painel? O domínio em si não será cancelado.`)) return;
    await fetch(`${BASE}/api/dominios/${id}`, { method: "DELETE" });
    setSelecionados(prev => { const n = new Set(prev); n.delete(id); return n; });
    await fetchDominios();
  }

  function handleAddToControl(dominio: string) {
    // Ao clicar "Adicionar ao controle" no verificador, abre o modal com o domínio pré-preenchido
    // Para simplificar, adicionamos direto (forma simplificada) e depois o CEO pode editar
    handleAdd({ ...FORM_EMPTY, dominio }).catch(() => {});
  }

  const dominiosSelecionados = dominios.filter(d => selecionados.has(d.id));

  return (
    <ConsoleShell
      icon={Globe}
      title="Painel de Domínios & Aliases"
      subtitle="Verifique disponibilidade, compre domínios via API, gerencie e-mails e aliases automaticamente via Zoho."
    >
      {/* Bloco A — Verificador */}
      <BlocoVerificador onAddToControl={handleAddToControl} />

      {/* Bloco B — Registradores (5 blocos colapsáveis) */}
      <BlocoRegistradores />

      {/* Bloco C — Domínios Sob Controle */}
      <BlocoControle
        dominios={dominios} loading={loading} onRefresh={fetchDominios}
        selecionados={selecionados} onToggle={toggleSelect}
        onAdd={handleAdd} onDelete={handleDelete}
      />

      {/* Bloco D — E-mail (só aparece ao selecionar domínio) */}
      {selecionados.size > 0 && (
        <BlocoEmail dominiosSelecionados={dominiosSelecionados} />
      )}
    </ConsoleShell>
  );
}
