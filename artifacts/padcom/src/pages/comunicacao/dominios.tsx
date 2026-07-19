import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Globe, Search, Plus, Trash2, Loader2, RefreshCw, AtSign,
  AlertCircle, Settings, Mail, Shield, Building2, Pencil, X,
  Save, Server, CreditCard, CheckCircle, XCircle, Eye, EyeOff, ExternalLink, Key,
} from "lucide-react";
import { ConsoleShell, BlockTitle, ExplainRow, BASE } from "./_shared";
import { PaxterLogo } from "@/components/branding/PaxterLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type StatusRdap = "disponivel" | "registrado" | "erro" | "verificando";
type CheckResult = { dominio: string; status: StatusRdap };

type Proposta = {
  id: number;
  clinica_nome: string;
  clinica_cnpj: string | null;
  clinica_email: string | null;
  clinica_telefone: string | null;
  dominio: string;
  plano: string;
  emails_incluidos: number;
  valor_adesao_centavos: number;
  valor_mensal_centavos: number;
  status: "rascunho" | "aprovada" | "cobranca_gerada" | "paga" | "ativa" | "cancelada";
  asaas_invoice_url: string | null;
  criado_em: string;
};

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
  const base = "inline-block w-[100px] text-center text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded";
  if (status === "disponivel")
    return <span className={`${base} text-emerald-700 bg-emerald-500/15`}>Disponível</span>;
  if (status === "registrado")
    return <span className={`${base} text-red-600 bg-red-500/15`}>Registrado</span>;
  if (status === "verificando")
    return <span className={`${base} inline-flex items-center justify-center gap-1 text-slate-500 bg-slate-500/15`}><Loader2 className="h-3 w-3 animate-spin" />Verificando</span>;
  return <span className={`${base} text-amber-700 bg-amber-500/15`}>Erro</span>;
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
  // Placeholders realistas — mostram o FORMATO REAL de cada chave
  placeholders: Partial<Record<MasterField["key"], string>>;
};

const REGISTRADORES_INFO: RegistradorInfo[] = [
  {
    id: "registrobr",
    nome: "Registro.br / UOL Host",
    descricao: "Autoridade oficial brasileira — .com.br .net.br .org.br",
    icon: Shield,
    precos: ".com.br R$ 40/ano",
    categoria: "Nacional",
    linkExtra: { label: "Gerar token → registro.br → Gerenciar → API", href: "https://registro.br/ajuda/acesso-por-chave-api/" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: false },
    tooltipNA: { api_secret: "UOL/Registro.br não usa secret separado — só login + token", client_ip: "UOL Host não exige whitelist de IP da API", account_id: "Autenticação por login + token — sem Account ID" },
    placeholders: {
      login:   "meunome.registrobr",
      api_key: "tok_A7b3C9d2E1f8G4h5I6j7K8l9M0n1O2p3q4R5",
    },
  },
  {
    id: "locaweb",
    nome: "Locaweb",
    descricao: "Registrador brasileiro com suporte em PT-BR",
    icon: Globe,
    precos: ".com.br R$ 69/ano",
    categoria: "Nacional",
    linkExtra: { label: "Token → painel.locaweb.com.br → Integrações → API", href: "https://painel.locaweb.com.br" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: true  },
    tooltipNA: { api_secret: "Locaweb usa apenas token de acesso — sem secret adicional", client_ip: "Locaweb não exige whitelist de IP de origem" },
    placeholders: {
      login:      "clinica@email.com.br",
      api_key:    "lw_api_A1b2C3d4E5f6G7h8I9j0K1L2m3N4o5P6",
      account_id: "123456",
    },
  },
  {
    id: "namecheap",
    nome: "Namecheap",
    descricao: "Melhor custo-benefício global — API REST moderna",
    icon: CreditCard,
    precos: ".com ≈ R$ 57/ano",
    categoria: "Global",
    linkExtra: { label: "Profile → Tools → API Access → Enable + Whitelist IP", href: "https://ap.www.namecheap.com/settings/tools/apiaccess/" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: true,  account_id: false },
    tooltipNA: { api_secret: "Namecheap autentica com login + API Key — sem secret adicional", account_id: "Namecheap identifica pelo login, não por Account ID" },
    placeholders: {
      login:     "seunome",
      api_key:   "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8",
      client_ip: "203.0.113.42  ← IP do servidor Replit (obrigatório)",
    },
  },
  {
    id: "godaddy",
    nome: "GoDaddy",
    descricao: "Maior variedade de TLDs — .com.br via revenda + 500 outros",
    icon: Building2,
    precos: ".com ≈ R$ 75/ano",
    categoria: "Global",
    linkExtra: { label: "developer.godaddy.com → Keys → Criar par Key+Secret", href: "https://developer.godaddy.com/keys" },
    ativo:     { login: false, api_key: true,  api_secret: true,  client_ip: false, account_id: false },
    tooltipNA: { login: "GoDaddy autentica pelo par Key+Secret — sem login separado na API", client_ip: "GoDaddy não exige whitelist de IP da API", account_id: "GoDaddy não usa Account ID — identificação pelo par Key+Secret" },
    placeholders: {
      api_key:    "3mXEHRFD_sKjTwqRQpz4Qn7gA3LxPvb2kMNdY8s",
      api_secret: "VaXkPt7m_WnGcDhL5sRqB8jFyU2eRtW",
    },
  },
  {
    id: "cloudflare",
    nome: "Cloudflare Registrar",
    descricao: "Preço de custo — melhor DNS do mundo + proteção DDoS",
    icon: Server,
    precos: ".com ≈ R$ 57/ano",
    categoria: "Global",
    linkExtra: { label: "dash.cloudflare.com → Profile → API Tokens → Criar token", href: "https://dash.cloudflare.com/profile/api-tokens" },
    ativo:     { login: true,  api_key: true,  api_secret: false, client_ip: false, account_id: true  },
    tooltipNA: { api_secret: "Cloudflare usa API Token único — sem secret separado", client_ip: "Cloudflare não exige whitelist de IP para tokens de API" },
    placeholders: {
      login:      "seu.email@dominio.com",
      api_key:    "YXbBmKnA_pQrStUvWxYzA0123456789ABCDEF12",
      account_id: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Tela principal
// ─────────────────────────────────────────────────────────────────────────────

export default function PainelDominios() {
  const [, navigate] = useLocation();
  const [dominios, setDominios] = useState<Dominio[]>([]);
  const [loading, setLoading] = useState(false);

  // Propostas comerciais
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [loadingPropostas, setLoadingPropostas] = useState(false);

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
      const dados = creds[regId] ?? {};
      const r = await fetch(`${BASE}/api/registradores/credenciais/${regId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados }),
      });
      if (r.ok) {
        setSavedReg(regId);
        setTimeout(() => setSavedReg(null), 3000);
      }
    } finally { setSavingReg(null); }
  }

  const fetchDominios = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/dominios`);
      if (r.ok) { const d = await r.json(); setDominios(d.items ?? []); }
    } catch { /* silencioso */ } finally { setLoading(false); }
  }, []);

  const fetchPropostas = useCallback(async () => {
    setLoadingPropostas(true);
    try {
      const r = await fetch(`${BASE}/api/dominios-comercial/propostas`);
      if (r.ok) { const d = await r.json(); setPropostas(d.items ?? []); }
    } catch { /* silencioso */ } finally { setLoadingPropostas(false); }
  }, []);

  useEffect(() => { fetchDominios(); fetchPropostas(); }, [fetchDominios, fetchPropostas]);

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

  const reginfoAtivo = REGISTRADORES_INFO.find(r => r.id === regAtivo);

  return (
    <ConsoleShell
      icon={Globe}
      title="Painel de Domínios & Aliases"
      subtitle="Verifique disponibilidade, compre domínios via API, gerencie e-mails e aliases automaticamente via Zoho."
    >
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
                {/* Direita — badge + botão em container de largura fixa para alinhar verticalmente */}
                <div className="flex items-center gap-2 shrink-0 w-[200px] justify-end">
                  <BadgeRdap status={r.status} />
                  {r.status === "disponivel" ? (
                    <Button size="sm" className="btn-3d h-7 px-3 text-[11px] font-bold uppercase tracking-[0.08em]"
                      onClick={() => navigate(`/comunicacao/dominios/new?dominio=${encodeURIComponent(r.dominio)}`)}>
                      <Plus className="w-3 h-3 mr-1" /> Adicionar
                    </Button>
                  ) : (
                    <div className="w-[90px]" />
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
              onClick={() => navigate("/comunicacao/dominios/new")}
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
            <Button onClick={() => navigate("/comunicacao/dominios/new")} className="btn-3d h-9 px-4 text-[11px] font-bold uppercase tracking-[0.12em]">
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
                      onClick={() => navigate(`/comunicacao/dominios/${d.id}/edit`)}
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

        {/* ── Vitrine da plataforma ativa — bevel badge + glass card ──────── */}
        <div className="panel-3d-sub p-4 relative overflow-visible">
          <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
            <Settings className="h-3 w-3 text-primary" />
            Plataforma Ativa para Novos Registros
          </div>
          <div className="pt-2 flex items-center gap-4">
            {/* LED verde na ESQUERDA */}
            <span className="paxter-led paxter-led-breathe" style={{ background: "hsl(160 60% 40%)", boxShadow: "0 0 6px 2px hsl(160 60% 40% / 0.5)" }} />
            <div className="bevel-3d flex h-11 w-11 items-center justify-center shrink-0">
              {reginfoAtivo && <reginfoAtivo.icon className="h-6 w-6 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] text-foreground uppercase tracking-[0.04em]">
                {reginfoAtivo?.nome ?? "—"}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{reginfoAtivo?.precos}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded text-emerald-700 bg-emerald-500/15 shrink-0">
              Selecionado
            </span>
          </div>
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
                      {/* Linha do cabeçalho */}
                      <div className="flex items-center gap-3 p-4 w-full">
                        {/* Lado esquerdo — clicável para expandir */}
                        <button
                          type="button"
                          onClick={() => clickReg(reg.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          {/* LED verde à ESQUERDA quando selecionado */}
                          {sel ? (
                            <span className="paxter-led paxter-led-breathe shrink-0" style={{ background: "hsl(160 60% 40%)", boxShadow: "0 0 6px 2px hsl(160 60% 40% / 0.5)" }} />
                          ) : (
                            <span className="paxter-led paxter-led-off shrink-0" />
                          )}
                          <div className={`bevel-3d flex h-9 w-9 items-center justify-center shrink-0 ${sel ? "text-primary" : "text-muted-foreground/60"}`}>
                            <reg.icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold uppercase tracking-[0.05em]">{reg.nome}</p>
                            </div>
                            <div className="concave-3d inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-mono text-muted-foreground">
                              {reg.precos}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0 mr-2">
                            {exp ? "▲" : "▼"}
                          </span>
                        </button>

                        {/* Toggle retangular PAXTER — seleciona registrador ativo */}
                        <button
                          type="button"
                          onClick={() => setRegAtivo(reg.id)}
                          className={`shrink-0 bevel-3d h-8 px-3 rounded-[6px] text-[10px] font-bold uppercase tracking-[0.12em] transition-all border ${
                            sel
                              ? "border-primary/60 text-primary bg-primary/10"
                              : "border-border text-muted-foreground hover:border-primary/30 hover:text-primary/70"
                          }`}
                        >
                          {sel ? "✓ Ativo" : "Usar"}
                        </button>
                      </div>

                      {/* Grade Mestre — aparece ao expandir */}
                      {exp && (
                        <div className="border-t border-border">

                          {/* ── Cabeçalho da seção de credenciais ─────── */}
                          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                            <div className="flex items-center gap-2">
                              <div className="bevel-3d flex h-7 w-7 items-center justify-center shrink-0">
                                <Key className="h-3.5 w-3.5 text-primary" />
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                Credenciais de API
                              </span>
                              <span className="paxter-led paxter-led-amber paxter-led-breathe ml-1" />
                            </div>
                            {reg.linkExtra && (
                              <a
                                href={reg.linkExtra.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="hidden sm:inline">{reg.linkExtra.label}</span>
                                <span className="sm:hidden">Onde gerar ↗</span>
                              </a>
                            )}
                          </div>

                          {/* ── Grid 2 colunas — mesmo padrão da edição de clientes ── */}
                          <div className="px-4 pt-4 pb-4 grid grid-cols-2 gap-x-4 gap-y-4">
                            {MASTER_FIELDS.map(field => {
                              const ativo = reg.ativo[field.key];
                              const sensKey = `${reg.id}_${field.key}`;
                              const visible = showSens[sensKey];
                              const val = creds[reg.id]?.[field.key] ?? "";
                              const ph = ativo
                                ? (reg.placeholders[field.key] ?? field.placeholderAtivo)
                                : (reg.tooltipNA[field.key] ?? "Não aplicável a esta plataforma");
                              // api_key e api_secret ocupam a linha toda (mais largos)
                              const full = field.key === "api_key" || field.key === "api_secret";

                              return (
                                <div key={field.key} className={full ? "col-span-2" : "col-span-1"}>
                                  <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
                                    {field.label}
                                  </label>
                                  {ativo ? (
                                    <div className="relative">
                                      <input
                                        type={field.sensivel && !visible ? "password" : "text"}
                                        value={val}
                                        onChange={e => setCredsField(reg.id, field.key, e.target.value)}
                                        placeholder={ph}
                                        className="concave-3d w-full h-11 rounded-[6px] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 pr-10 font-mono"
                                      />
                                      {field.sensivel && (
                                        <button
                                          type="button"
                                          onClick={() => toggleSens(sensKey)}
                                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                          title={visible ? "Ocultar valor" : "Mostrar valor"}
                                        >
                                          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div
                                      className="concave-3d w-full h-11 rounded-[6px] px-3 flex items-center gap-2 opacity-35 cursor-not-allowed select-none"
                                      title={reg.tooltipNA[field.key]}
                                    >
                                      <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <span className="text-[11px] text-muted-foreground italic truncate">{ph}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* ── Rodapé — nota + botão Salvar ──────────── */}
                          <div className="flex items-center justify-between gap-4 px-4 pb-4 pt-1 border-t border-border/40 flex-wrap">
                            <p className="text-[11px] text-muted-foreground italic">
                              Armazenado de forma segura — nunca exposto em logs
                            </p>
                            <div className="flex items-center gap-3 ml-auto">
                              {savedReg === reg.id && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  Credenciais salvas
                                </span>
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

      {/* ─── Seção E — Painel Comercial · Domínios para Clínicas Licenciadas ─── */}
      <section className="panel-3d p-5 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <BlockTitle icon={Building2}>Domínios para Clínicas Licenciadas</BlockTitle>
          <Button
            onClick={() => navigate("/comunicacao/dominios/nova-proposta")}
            className="btn-3d h-8 px-4 text-[11px] font-bold uppercase tracking-[0.12em] -mt-1"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova Proposta
          </Button>
        </div>
        <ExplainRow>
          Domínios PAXTER comercializados para clínicas parceiras como módulo mensal com e-mail corporativo Zoho incluso.
          Fluxo: clínica solicita → CEO aprova → Asaas cobra → pagamento confirmado → e-mail criado automaticamente.
        </ExplainRow>

        {/* KPIs — derivados das propostas reais */}
        {(() => {
          const ativas = propostas.filter(p => p.status === "ativa");
          const receitaMensal = ativas.reduce((s, p) => s + (p.valor_mensal_centavos ?? 0), 0);
          const pendentes = propostas.filter(p => p.status !== "ativa" && p.status !== "cancelada").length;
          return (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Propostas Ativas", valor: String(ativas.length), cor: "text-emerald-700" },
                { label: "Receita Mensal Ativa", valor: receitaMensal > 0 ? `R$ ${(receitaMensal / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—", cor: "text-emerald-700" },
                { label: "Em Andamento", valor: String(pendentes), cor: pendentes > 0 ? "text-amber-600" : "text-muted-foreground" },
              ].map(k => (
                <div key={k.label} className="concave-3d px-4 py-3 rounded-[6px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">{k.label}</p>
                  <p className={`text-[18px] font-bold ${k.cor}`}>{k.valor}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Lista de propostas (da API) */}
        {loadingPropostas ? (
          <div className="concave-3d flex items-center justify-center gap-2 py-6 rounded-[6px] text-muted-foreground text-[12px]">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando propostas...
          </div>
        ) : propostas.length === 0 ? (
          <div className="concave-3d flex flex-col items-center gap-3 py-10 text-center rounded-[6px]">
            <Building2 className="h-10 w-10 opacity-10" />
            <p className="text-[13px] font-semibold text-muted-foreground">Nenhuma proposta ainda.</p>
            <p className="text-[11px] text-muted-foreground/70 max-w-xs">
              Clique em "Nova Proposta" para criar a primeira proposta comercial.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {propostas.map(p => {
              const statusCor: Record<string, string> = {
                rascunho: "text-amber-600 bg-amber-500/15",
                aprovada: "text-blue-600 bg-blue-500/15",
                cobranca_gerada: "text-indigo-600 bg-indigo-500/15",
                paga: "text-emerald-600 bg-emerald-500/15",
                ativa: "text-emerald-700 bg-emerald-500/20",
                cancelada: "text-slate-500 bg-slate-500/15",
              };
              const statusLabel: Record<string, string> = {
                rascunho: "Rascunho", aprovada: "Aprovada",
                cobranca_gerada: "Cobrança Gerada", paga: "Paga",
                ativa: "Ativa", cancelada: "Cancelada",
              };
              const faixa = p.status === "ativa" ? "bg-emerald-500/70"
                : p.status === "cancelada" ? "bg-slate-400/40"
                : "bg-amber-400/60";
              return (
                <div key={p.id} className="panel-3d overflow-hidden">
                  <div className="flex">
                    <div className={`w-1 shrink-0 ${faixa} rounded-l`} />
                    <div className="flex-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-[13px] text-foreground">{p.clinica_nome}</p>
                            <span className="font-mono text-[11px] text-cyan-700">{p.dominio}</span>
                            <span className={`text-[9px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${statusCor[p.status] ?? "text-slate-500 bg-slate-500/15"}`}>
                              {statusLabel[p.status] ?? p.status}
                            </span>
                          </div>
                          <div className="flex gap-4 mt-1.5 flex-wrap">
                            <span className="text-[11px] text-muted-foreground">
                              Adesão: <strong className="text-foreground">
                                {p.valor_adesao_centavos > 0
                                  ? `R$ ${(p.valor_adesao_centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                  : "Isento"}
                              </strong>
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Mensal: <strong className="text-emerald-700">
                                R$ {(p.valor_mensal_centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/mês
                              </strong>
                            </span>
                            <span className="text-[11px] text-muted-foreground capitalize">{p.plano}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.asaas_invoice_url && (
                            <a href={p.asaas_invoice_url} target="_blank" rel="noopener noreferrer"
                              className="btn-3d-soft h-7 px-2 flex items-center gap-1 text-[10px] font-semibold text-cyan-700">
                              <ExternalLink className="w-3 h-3" /> Fatura
                            </a>
                          )}
                          <Button variant="outline" size="sm" className="btn-3d-soft h-7 px-2"
                            onClick={() => navigate("/comunicacao/dominios/nova-proposta")}
                            title="Nova proposta">
                            <Pencil className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Fluxo e modelo de monetização */}
        <div className="panel-3d-sub p-4 relative overflow-visible space-y-3">
          <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
            <CreditCard className="h-3 w-3 text-primary" />
            Modelo de Monetização
          </div>
          <div className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Fluxo de Aprovação</p>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>① Clínica solicita via formulário ou WhatsApp</p>
                <p>② CEO aprova e define o valor no painel</p>
                <p>③ Asaas gera cobrança automática (PIX / boleto)</p>
                <p>④ Pagamento confirmado → Zoho cria e-mail corporativo</p>
                <p>⑤ Domínio marcado como ativo no sistema</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Tabela de Valores Sugeridos</p>
              <div className="space-y-1">
                {[
                  { plano: "Básico", desc: "1 e-mail", adesao: "R$ 297", mensal: "R$ 97/mês" },
                  { plano: "Profissional", desc: "5 e-mails", adesao: "R$ 497", mensal: "R$ 197/mês" },
                  { plano: "Clínica", desc: "ilimitado", adesao: "R$ 997", mensal: "R$ 397/mês" },
                ].map(p => (
                  <div key={p.plano} className="concave-3d px-3 py-2 rounded-[4px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-bold text-foreground">{p.plano}</span>
                      <span className="text-[10px] text-muted-foreground">({p.desc})</span>
                    </div>
                    <div className="flex gap-4 mt-1">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">Adesão: </span>
                        <span className="text-[12px] font-bold text-foreground">{p.adesao}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-[0.06em]">Mensal: </span>
                        <span className="text-[12px] font-bold text-emerald-700">{p.mensal}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 italic pt-1">
                Módulo de solicitação externa (portal da clínica): próxima onda.
              </p>
            </div>
          </div>
        </div>
      </section>
    </ConsoleShell>
  );
}
