import { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  User, Loader2, AlertCircle, ChevronRight, LogOut, Home, Syringe,
  CalendarDays, FileText, Upload, CheckCircle, Download, Clock,
  FileUp, Wallet, FlaskConical, ClipboardList, KeyRound, ChevronDown, ChevronUp,
  HelpCircle, MessageCircle, TrendingUp, Sun, Moon,
} from "lucide-react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { PaxterWordmarkArt } from "@/components/layout/paxter-fx/PaxterWordmarkArt";
import { PadconSymbol } from "@/components/layout/paxter-fx/PadconSymbol";
import { PadconWordmark } from "@/components/layout/paxter-fx/PadconWordmark";
import { ParxisWordmark } from "@/components/layout/paxter-fx/ParxisWordmark";
import { PAXTER_SITE_URL } from "@/lib/brand";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
  if (digits.length <= 9) return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
  return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
}
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
}
function brDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}
function brMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

const METHOD_LABELS: Record<string, string> = {
  pix: "PIX", credit: "CARTÃO DE CRÉDITO", debit: "CARTÃO DE DÉBITO",
  boleto: "BOLETO", cash: "DINHEIRO",
};
const STATUS_LABELS: Record<string, string> = {
  scheduled: "AGENDADA", confirmed: "CONFIRMADA", completed: "REALIZADA",
  applied: "APLICADA", missed: "FALTOU", cancelled: "CANCELADA",
  pending: "PENDENTE", paid: "PAGO", active: "ATIVO", suggested: "SUGERIDO",
};
const PROC_LABELS: Record<string, string> = {
  iv: "ENDOVENOSO", im: "INTRAMUSCULAR", implant: "IMPLANTE", sc: "SUBCUTÂNEO",
};
const FILE_TYPES = [
  { value: "exame_sangue", label: "EXAME DE SANGUE / BIOQUÍMICA" },
  { value: "ultrassom", label: "ULTRASSOM" },
  { value: "tomografia", label: "TOMOGRAFIA" },
  { value: "ressonancia", label: "RESSONÂNCIA" },
  { value: "densitometria", label: "DENSITOMETRIA" },
  { value: "laudo", label: "LAUDO" },
  { value: "comprovante_pagamento", label: "COMPROVANTE DE PAGAMENTO" },
  { value: "foto", label: "FOTO / IMAGEM" },
  { value: "receita", label: "RECEITA MÉDICA" },
  { value: "atestado", label: "ATESTADO" },
  { value: "outro", label: "OUTRO" },
];
const BODY_REGIONS = [
  "ABDOME", "CABECA", "COLUNA", "FACE", "FIGADO", "JOELHO", "MAMAS", "MAO",
  "OMBRO", "PELVE", "PESCOCO", "RINS", "TIREOIDE", "TORAX", "QUADRIL",
];
const TYPES_WITH_BODY = ["ultrassom", "tomografia", "ressonancia", "densitometria"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Retorna só primeiro + último nome (sem abreviar; remove nomes do meio) */
function formatClientName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type ClientInfo = { id: number; name: string; cpf: string | null; token: string };
type TabKey = "inicio" | "protocolos" | "agenda" | "documentos" | "enviar"
           | "duvidas" | "suporte" | "evolucao";

const TABS: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: "inicio",     label: "INÍCIO",      icon: Home },
  { key: "protocolos", label: "PROTOCOLOS",  icon: Syringe },
  { key: "agenda",     label: "AGENDA",      icon: CalendarDays },
  { key: "documentos", label: "DOCUMENTOS",  icon: FileText },
  { key: "enviar",     label: "ENVIAR",      icon: Upload },
  { key: "duvidas",    label: "DÚVIDAS",     icon: HelpCircle },
  { key: "suporte",    label: "SUPORTE",     icon: MessageCircle },
  { key: "evolucao",   label: "EVOLUÇÃO",    icon: TrendingUp },
];

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function Area() {
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [tab, setTab] = useState<TabKey>("inicio");
  const [adminMode, setAdminMode] = useState(false);
  const { theme, toggle } = useScreenTheme();

  // Modo de preview admin: ?preview_id=<n>&preview_name=<name>&preview_token=<tok>
  // O dono da clínica usa a página /experiencia-cliente para gerar esta URL
  // e abre numa aba nova, sem precisar digitar CPF/senha do cliente.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("preview_id");
    const pname = params.get("preview_name");
    const ptoken = params.get("preview_token");
    if (pid && pname && ptoken) {
      setAdminMode(true);
      setClient({ id: Number(pid), name: decodeURIComponent(pname), cpf: null, token: ptoken });
      // Limpa a URL para não vazar o token no histórico
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleLogout = useCallback(() => {
    setClient(null);
    setTab("inicio");
    setAdminMode(false);
  }, []);

  // Ao trocar de aba, volta ao topo para a acao principal ficar visivel (sem rolar)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);

  if (!client) return <LoginScreen onSuccess={setClient} />;

  const themeClass = theme === "dark" ? "dark" : "";

  return (
    <div
      className={`${themeClass} area-elite relative`}
      style={{ minHeight: "100vh", background: theme === "dark" ? "linear-gradient(160deg, #0b1e3a 0%, #0e2244 55%, #122a50 100%)" : "#f3ecdd" }}
    >
      <div className="leva-fabric" aria-hidden="true" />
      <div className="relative z-10 flex flex-col min-h-screen">
      {/* Faixa de aviso quando o admin está no modo preview */}
      {adminMode && (
        <div className="bg-amber-500 text-white text-center text-[11px] font-black uppercase tracking-widest py-1.5 px-4">
          ⚙ MODO VISUALIZAÇÃO ADMIN — você está vendo como o cliente enxerga esta tela
        </div>
      )}
      {/* Header logado — mesma linguagem do LoginShell: símbolo glass + PARXIS filtrado + subtítulo centrado */}
      <header className="panel-3d sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b border-border/60">

        {/* Esquerda: símbolo glass + PARXIS + subtítulo centrado */}
        <a
          href={PAXTER_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="PARXIS — site institucional"
          className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70"
        >
          <PaxterSymbolGlass size={40} tone={theme === "dark" ? "dark" : "light"} sharp={true} />
          <div className="flex flex-col items-center">
            <img
              src="/brand/parxis-wordmark-clean.png"
              alt="PARXIS"
              className="h-8 w-auto object-contain"
              style={{ filter: "hue-rotate(14deg) saturate(0.72) brightness(1.06)" }}
              draggable={false}
            />
            <p className="text-accent text-[9px] uppercase tracking-widest mt-0.5">ÁREA DO PACIENTE</p>
          </div>
        </a>

        {/* Direita: nome do cliente — pill com fonte serifada de grife, sem ícone */}
        <div
          className="concave-3d flex items-center px-3 py-2 flex-shrink-0"
          style={{ borderRadius: 8 }}
        >
          <span
            className="text-accent"
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "1.05rem",
              letterSpacing: "0.04em",
              lineHeight: 1.1,
            }}
          >
            {formatClientName(client.name)}
          </span>
        </div>
      </header>

      {/* Conteúdo principal — pb-24 libera espaço para bottom nav fixa */}
      <main className="flex-1 px-4 py-5 max-w-lg w-full mx-auto pb-24">
        {tab === "inicio"     && <InicioTab     client={client} onGo={setTab} />}
        {tab === "protocolos" && <ProtocolosTab client={client} />}
        {tab === "agenda"     && <AgendaTab     client={client} />}
        {tab === "documentos" && <DocumentosTab client={client} />}
        {tab === "enviar"     && <EnviarTab     client={client} />}
      </main>

      {/* Mini-painel DEITADO SOBRE a nav — lado a lado → mesma altura que a nav */}
      <div
        className="panel-3d fixed bottom-0 right-0 z-30 border-t border-l border-border/60 flex flex-row"
        style={{ borderTopLeftRadius: 8 }}
      >
        {/* Botão tema — idêntico ao item de nav em altura */}
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          className="flex flex-col items-center gap-0.5 py-3 px-3 text-accent hover:text-accent/70 transition-colors"
        >
          <div className="concave-3d p-1.5 rounded-lg">
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider">
            {theme === "dark" ? "CLARO" : "ESCURO"}
          </span>
        </button>

        {/* Separador vertical entre os dois botões */}
        <div className="border-l border-border/40 my-3" />

        {/* Botão sair — mesmo py-3, lado a lado */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 py-3 px-3 text-muted-foreground hover:text-accent transition-colors"
        >
          <div className="p-1.5 rounded-lg">
            <LogOut className="w-5 h-5" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider">SAIR</span>
        </button>
      </div>

      {/* Bottom navigation — deslizante horizontal (8 itens) */}
      <nav
        className="panel-3d fixed bottom-0 left-0 right-0 z-20 border-t border-border/60"
        style={{ overflowX: "auto", scrollbarWidth: "none" }}
      >
        <div
          className="flex"
          style={{ minWidth: "max-content", paddingRight: 120 /* reserva espaço do mini-painel dir */ }}
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{ minWidth: 68 }}
                className={`flex flex-col items-center gap-0.5 py-3 px-1 transition-colors ${
                  active ? "text-accent" : "text-muted-foreground hover:text-accent"
                }`}
              >
                <div className={`p-1.5 rounded-lg ${active ? "concave-3d" : ""}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Carimbo discreto PADCON — fixo bottom-right, acima da nav */}
      <PadconWatermark bottom="76px" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------------
// Modos de entrada da tela de acesso:
//   nascimento -> CPF + data de nascimento (metodo original)
//   senha      -> CPF + senha (Bloco D)
//   trocar     -> troca obrigatoria no 1o acesso (senha provisoria)
//   definir    -> definir/recuperar senha pelo link do e-mail (?definir=token)
type LoginMode = "nascimento" | "senha" | "trocar" | "definir";

// ---------------------------------------------------------------------------
// CARIMBO DISCRETO — PADCON · Advanced Systems Architecture
// Fixo no canto inferior direito em TODAS as telas da /area.
// ---------------------------------------------------------------------------
function PadconWatermark({ bottom = "76px" }: { bottom?: string }) {
  return (
    <div
      className="fixed right-3 z-50 pointer-events-none select-none"
      style={{ bottom }}
      aria-hidden="true"
    >
      <div className="flex flex-col items-end gap-0.5 opacity-70">
        {/* Arte oficial PADCON — PNG recortado, ouro polido */}
        <PadconWordmark height={20} outlined />
        <p
          className="text-muted-foreground text-right"
          style={{ fontSize: 7, letterSpacing: "0.07em", lineHeight: 1.2 }}
        >
          Advanced Systems Architecture
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RODAPÉ DE ASSINATURA TERNO — PAXTER (esq) + PADCON (dir)
// Aparece tanto na tela de login quanto na área logada.
// ---------------------------------------------------------------------------
function TernoFooter({ theme = "light" }: { theme?: "light" | "dark" }) {
  const isDark = theme === "dark";
  return (
    <footer
      style={{
        /* fundo sólido igual ao da página — claramente diferente da nav branca/panel-3d */
        background: isDark ? "#0d1f3a" : "#f3ecdd",
        /* linha dourada embaixo = separador visual forte entre logo-bar e nav */
        borderTop:    `1px solid ${isDark ? "rgba(194,160,90,0.25)" : "rgba(138,109,47,0.30)"}`,
        borderBottom: `2px solid ${isDark ? "rgba(194,160,90,0.55)" : "rgba(138,109,47,0.50)"}`,
        padding: "7px 16px",
      }}
    >
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <PaxterWordmarkArt width={82} tone={isDark ? "dark" : "light"} />
        <PadconSymbol height={22} />
      </div>
    </footer>
  );
}

// Casca visual compartilhada por todas as telas de acesso (cabecalho PAXTER +
// rodape). Lê o tema atual do localStorage para manter coerência com a sessão
// anterior do cliente (claro ou escuro).
function LoginShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  const { theme, toggle } = useScreenTheme();
  const isDark = theme === "dark";
  const themeClass = isDark ? "dark" : "";
  return (
    <div
      className={`${themeClass} area-elite relative`}
      style={{ minHeight: "100vh", background: isDark ? "linear-gradient(160deg, #0b1e3a 0%, #0e2244 55%, #122a50 100%)" : "#f3ecdd" }}
    >
      <div className="leva-fabric" aria-hidden="true" />
      <div className="relative z-10 flex flex-col min-h-screen">
        <header className="panel-3d px-4 py-5 flex items-center justify-between border-b border-border/60">
          <div className="flex items-center gap-3">
            <a
              href={PAXTER_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="PAXTER — site institucional"
              className="flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70"
            >
              <PaxterSymbolGlass size={52} tone={isDark ? "dark" : "light"} sharp={true} />
            </a>
            <div className="flex flex-col items-center">
              <img
                src="/brand/parxis-wordmark-clean.png"
                alt="PARXIS"
                className="h-11 w-auto object-contain"
                style={{ filter: "hue-rotate(14deg) saturate(0.72) brightness(1.06)" }}
              />
              <p className="text-accent text-[10px] uppercase tracking-widest mt-0.5">{subtitle}</p>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </header>
        <main className="flex-1 flex items-start justify-center px-4 py-10">
          <div className="w-full max-w-sm space-y-6">
            {children}
            <div className="text-center">
              <a href={`${API_BASE}/anamnese/v2`}
                className="inline-flex items-center gap-1.5 text-accent text-xs uppercase tracking-wider hover:text-primary">
                <ClipboardList className="w-4 h-4" /> Preencher ficha de saúde
              </a>
            </div>
          </div>
        </main>
        <TernoFooter theme={theme} />
        {/* Carimbo discreto PADCON — fixo no canto inferior direito */}
        <PadconWatermark bottom="20px" />
      </div>
    </div>
  );
}

function LoginError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
      <p className="text-red-600 text-sm">{message}</p>
    </div>
  );
}

const INPUT_CLS =
  "concave-3d w-full h-12 px-4 text-primary text-lg font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg";
const LABEL_CLS =
  "block text-primary text-xs font-black uppercase tracking-widest mb-1.5";

function LoginScreen({ onSuccess }: { onSuccess: (c: ClientInfo) => void }) {
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [defineToken, setDefineToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<LoginMode>("nascimento");

  // Se o link do e-mail trouxe ?definir=<token>, abre direto a tela de definir
  // senha e limpa o token da URL (nao fica no historico).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("definir");
    if (t) {
      setDefineToken(t);
      setMode("definir");
      params.delete("definir");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, []);

  const switchMode = useCallback((m: LoginMode) => {
    setMode(m);
    setError("");
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }, []);

  // CPF + data de nascimento (metodo original).
  const handleIdentify = useCallback(async () => {
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) { setError("Digite os 11 dígitos do CPF"); return; }
    const cleanDate = birthDate.replace(/\D/g, "");
    if (cleanDate.length !== 8) { setError("Digite a data completa (DD/MM/AAAA)"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/client-portal/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf, birthDate: cleanDate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao identificar"); return; }
      onSuccess(data);
    } catch { setError("Erro de conexão. Tente novamente."); }
    finally { setLoading(false); }
  }, [cpf, birthDate, onSuccess]);

  // CPF + senha (Bloco D). Se a senha for provisoria, o backend responde
  // { mustChangePassword: true } SEM token e caimos na tela de troca.
  const handlePasswordLogin = useCallback(async () => {
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) { setError("Digite os 11 dígitos do CPF"); return; }
    if (!password) { setError("Digite sua senha"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "CPF ou senha incorretos."); return; }
      if (data.mustChangePassword) {
        setNewPassword(""); setConfirmPassword("");
        setMode("trocar");
        return;
      }
      onSuccess(data);
    } catch { setError("Erro de conexão. Tente novamente."); }
    finally { setLoading(false); }
  }, [cpf, password, onSuccess]);

  // Troca obrigatoria no 1o acesso: mantem o CPF + a senha provisoria (password)
  // ja digitados e envia a nova.
  const handleChangePassword = useCallback(async () => {
    if (newPassword.length < 6) { setError("A nova senha precisa ter pelo menos 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { setError("As senhas não conferem"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/trocar-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpf: cpf.replace(/\D/g, ""),
          currentPassword: password,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Não foi possível trocar a senha."); return; }
      onSuccess(data);
    } catch { setError("Erro de conexão. Tente novamente."); }
    finally { setLoading(false); }
  }, [cpf, password, newPassword, confirmPassword, onSuccess]);

  // Definir/recuperar senha pelo token do e-mail.
  const handleDefinePassword = useCallback(async () => {
    if (newPassword.length < 6) { setError("A senha precisa ter pelo menos 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { setError("As senhas não conferem"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/definir-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: defineToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Link inválido ou expirado."); return; }
      onSuccess(data);
    } catch { setError("Erro de conexão. Tente novamente."); }
    finally { setLoading(false); }
  }, [defineToken, newPassword, confirmPassword, onSuccess]);

  // MODO TESTE (apenas ambiente de desenvolvimento): entra com 1 clique como um
  // cliente real de teste, sem digitar CPF nem data. Some no app publicado.
  const modoTeste = import.meta.env.DEV;
  const quickEnter = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/client-portal/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: "12345678901", birthDate: "15051982" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Cliente de teste indisponível"); return; }
      onSuccess(data);
    } catch { setError("Erro de conexão. Tente novamente."); }
    finally { setLoading(false); }
  }, [onSuccess]);

  // --- Tela de troca no 1o acesso ---
  if (mode === "trocar") {
    return (
      <LoginShell subtitle="PRIMEIRO ACESSO">
        <div className="panel-3d rounded-xl overflow-hidden">
          <div className="login-card-topbar px-5 py-4">
            <div className="flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-accent" />
              <h2 className="text-primary font-black text-sm uppercase tracking-widest">CRIAR SUA SENHA</h2>
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              Você entrou com uma senha provisória. Defina uma senha só sua para continuar.
            </p>
          </div>
          <div className="login-card-body p-5 space-y-4">
            <div>
              <label className={LABEL_CLS}>NOVA SENHA</label>
              <input
                type="password" placeholder="mínimo 6 caracteres" value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>REPITA A NOVA SENHA</label>
              <input
                type="password" placeholder="repita a senha" value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
                className={INPUT_CLS}
              />
            </div>
            <LoginError message={error} />
            <button
              onClick={handleChangePassword}
              disabled={loading || newPassword.length < 6 || confirmPassword.length < 6}
              className="btn-3d w-full h-12 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest text-white"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>SALVAR E ENTRAR <ChevronRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      </LoginShell>
    );
  }

  // --- Tela de definir/recuperar senha pelo link do e-mail ---
  if (mode === "definir") {
    return (
      <LoginShell subtitle="DEFINIR SENHA">
        <div className="panel-3d rounded-xl overflow-hidden">
          <div className="login-card-topbar px-5 py-4">
            <div className="flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-accent" />
              <h2 className="text-primary font-black text-sm uppercase tracking-widest">DEFINIR SENHA</h2>
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              Crie a senha de acesso à sua área.
            </p>
          </div>
          <div className="login-card-body p-5 space-y-4">
            <div>
              <label className={LABEL_CLS}>NOVA SENHA</label>
              <input
                type="password" placeholder="mínimo 6 caracteres" value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>REPITA A NOVA SENHA</label>
              <input
                type="password" placeholder="repita a senha" value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleDefinePassword(); }}
                className={INPUT_CLS}
              />
            </div>
            <LoginError message={error} />
            <button
              onClick={handleDefinePassword}
              disabled={loading || newPassword.length < 6 || confirmPassword.length < 6}
              className="btn-3d w-full h-12 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest text-white"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>SALVAR E ENTRAR <ChevronRight className="w-4 h-4" /></>}
            </button>
            <button
              onClick={() => switchMode("nascimento")}
              className="w-full text-center text-accent text-xs uppercase tracking-wider hover:text-primary"
            >
              Voltar para a identificação
            </button>
          </div>
        </div>
      </LoginShell>
    );
  }

  // --- Telas de entrada normal (nascimento OU senha) ---
  const porSenha = mode === "senha";
  return (
    <LoginShell subtitle="ÁREA DO PACIENTE">
      <div className="panel-3d rounded-xl overflow-hidden">
        {/* Zona 1 — TOP BAR */}
        <div className="login-card-topbar px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="bevel-3d flex h-10 w-10 flex-shrink-0 items-center justify-center">
              {porSenha ? <KeyRound className="w-5 h-5 text-primary" /> : <User className="w-5 h-5 text-primary" />}
            </div>
            <div>
              <h2 className="text-base font-semibold uppercase tracking-[0.08em] text-primary leading-tight">
                {porSenha ? "ENTRAR COM SENHA" : "IDENTIFICAÇÃO"}
              </h2>
              <p className="text-muted-foreground text-xs mt-0.5">
                {porSenha ? "CPF + senha para entrar" : "CPF + data de nascimento para entrar"}
              </p>
            </div>
          </div>
        </div>

        <div className="login-card-body p-5 space-y-4">
          <div>
            <label className={LABEL_CLS}>CPF</label>
            <input
              type="tel" inputMode="numeric" placeholder="000.000.000-00" value={cpf}
              onChange={(e) => { setCpf(formatCpf(e.target.value)); setError(""); }}
              className={INPUT_CLS}
            />
          </div>

          {porSenha ? (
            <div>
              <label className={LABEL_CLS}>SENHA</label>
              <input
                type="password" placeholder="sua senha" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handlePasswordLogin(); }}
                className={INPUT_CLS}
              />
            </div>
          ) : (
            <div>
              <label className={LABEL_CLS}>DATA DE NASCIMENTO</label>
              <input
                type="tel" inputMode="numeric" placeholder="DD/MM/AAAA" value={birthDate}
                onChange={(e) => { setBirthDate(formatDateInput(e.target.value)); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleIdentify(); }}
                className={INPUT_CLS}
              />
            </div>
          )}

          <LoginError message={error} />

          <button
            onClick={porSenha ? handlePasswordLogin : handleIdentify}
            disabled={
              loading ||
              cpf.replace(/\D/g, "").length !== 11 ||
              (porSenha ? password.length === 0 : birthDate.replace(/\D/g, "").length !== 8)
            }
            className="btn-3d w-full h-12 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest text-white"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>ENTRAR <ChevronRight className="w-4 h-4" /></>}
          </button>

          {/* Alternar metodo de entrada */}
          <button
            onClick={() => switchMode(porSenha ? "nascimento" : "senha")}
            className="w-full text-center text-accent text-xs uppercase tracking-wider hover:text-primary"
          >
            {porSenha ? "Entrar com data de nascimento" : "Entrar com senha"}
          </button>

          {modoTeste && (
            <div className="border-t border-dashed border-amber-400/60 pt-3">
              <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-700 mb-2">Modo Teste</span>
              <button
                onClick={quickEnter}
                disabled={loading}
                className="w-full h-11 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest border border-amber-500 text-amber-700 rounded-lg hover:bg-amber-50 disabled:opacity-40"
              >
                ENTRAR SEM CÓDIGO (1 clique)
              </button>
            </div>
          )}
        </div>
      </div>
    </LoginShell>
  );
}

// ---------------------------------------------------------------------------
// Hook genérico de fetch com token
// ---------------------------------------------------------------------------
function useApi<T>(client: ClientInfo, path: string, refreshKey: number = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setLoading(true); setError("");
    fetch(`${API_BASE}/api/area-paciente/${path}`, {
      headers: { Authorization: `Bearer ${client.token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) throw new Error("Sessão expirada. Entre novamente.");
          throw new Error("Erro ao carregar dados");
        }
        return res.json();
      })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [client.token, path, refreshKey]);
  return { data, loading, error };
}

// ---------------------------------------------------------------------------
// Componentes base Paxter
// ---------------------------------------------------------------------------
function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-accent animate-spin" />
    </div>
  );
}
function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
      <p className="text-red-600 text-sm">{msg}</p>
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return (
    <div className="panel-3d-sub rounded-xl p-8 text-center">
      <p className="text-muted-foreground text-sm">{msg}</p>
    </div>
  );
}

// MetaField canônico — slot fixo, vazio = "—", nunca some
function MetaField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="concave-3d rounded-lg px-3 py-2">
      <p className="text-accent text-[9px] font-black uppercase tracking-widest leading-none mb-1">{label}</p>
      <p className="text-primary text-xs font-semibold truncate">{value || "—"}</p>
    </div>
  );
}

// Separador de seção
function SecLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary text-[10px] font-black uppercase tracking-widest">{label}</span>
      {count !== undefined && (
        <span className="concave-3d text-[9px] font-black text-accent px-2 py-0.5 rounded">{count}</span>
      )}
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// Badge de status
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:    "bg-cyan-100 text-cyan-700 border-cyan-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-slate-100 text-slate-500 border-slate-200",
    scheduled: "bg-primary/10 text-primary border-primary/20",
    confirmed: "bg-cyan-100 text-cyan-700 border-cyan-200",
    missed:    "bg-red-100 text-red-600 border-red-200",
    paid:      "bg-primary/8 text-primary border-primary/15",
    pending:   "bg-red-100 text-red-600 border-red-200",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-500 border-slate-200";
  return (
    <span className={`inline-block border text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// INÍCIO
// ---------------------------------------------------------------------------
type Resumo = {
  client: { name: string };
  protocolsCount: number;
  activeProtocolsCount: number;
  totalSessions: number;
  completedSessions: number;
  nextSession: { id: number; scheduledDate: string; scheduledTime: string; unit: string | null; status: string } | null;
};

function ValidarCodigo({ client }: { client: ClientInfo }) {
  const [codigo, setCodigo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);

  const handleValidar = async () => {
    if (codigo.trim().length < 4) return;
    setLoading(true); setResultado(null);
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/validar-codigo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${client.token}`,
        },
        body: JSON.stringify({ codigo: codigo.trim().toUpperCase() }),
      });
      const data = await res.json();
      setResultado({ ok: res.ok, mensagem: data.mensagem || data.error || "Erro desconhecido" });
    } catch {
      setResultado({ ok: false, mensagem: "Erro de conexão" });
    } finally { setLoading(false); }
  };

  return (
    <div className="panel-3d rounded-xl overflow-hidden">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border-b border-border/40">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent" />
          <span className="text-primary text-xs font-black uppercase tracking-widest">VALIDAR PRESENÇA</span>
        </div>
        <span className="concave-3d text-[9px] font-black text-accent px-2 py-0.5 rounded uppercase tracking-wider">
          CÓDIGO DO DIA
        </span>
      </div>
      <div className="p-4 space-y-3">
        {resultado ? (
          <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${resultado.ok ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            {resultado.ok
              ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              : <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
            <p className={`text-sm font-semibold ${resultado.ok ? "text-green-700" : "text-red-600"}`}>{resultado.mensagem}</p>
          </div>
        ) : (
          <>
            <p className="text-accent text-xs">Digite o código enviado pelo WhatsApp ou sua senha permanente do protocolo.</p>
            <div className="flex gap-2">
              <input
                type="text" inputMode="text" placeholder="Ex: A7K3M2"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 12))}
                onKeyDown={(e) => { if (e.key === "Enter") handleValidar(); }}
                className="concave-3d flex-1 h-11 px-3 text-primary text-base font-mono tracking-widest placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg"
              />
              <button
                onClick={handleValidar}
                disabled={loading || codigo.trim().length < 4}
                className="btn-3d px-5 h-11 text-sm font-black uppercase tracking-wider disabled:opacity-40"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "OK"}
              </button>
            </div>
          </>
        )}
        {resultado && (
          <button onClick={() => { setCodigo(""); setResultado(null); }}
            className="text-accent text-xs underline">
            Tentar outro código
          </button>
        )}
      </div>
    </div>
  );
}

function InicioTab({ client, onGo }: { client: ClientInfo; onGo: (t: TabKey) => void }) {
  const { data, loading, error } = useApi<Resumo>(client, "resumo");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const pct = data.totalSessions > 0 ? Math.round((data.completedSessions / data.totalSessions) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Saudação */}
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-muted-foreground text-xs uppercase tracking-widest">BEM-VINDO(A)</p>
          <h2 className="text-primary font-black text-2xl mt-0.5">{firstName(data.client.name)}</h2>
        </div>
        {/* Meta grid 2×2 */}
        <div className="grid grid-cols-2 gap-2 p-3">
          <MetaField label="PROTOCOLOS ATIVOS" value={data.activeProtocolsCount} />
          <MetaField label="ATENDIMENTOS REALIZADOS" value={`${data.completedSessions} / ${data.totalSessions}`} />
        </div>
        {/* Barra de progresso */}
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-accent text-[9px] font-black uppercase tracking-widest">PROGRESSO DO TRATAMENTO</p>
            <p className="text-accent font-black text-sm">{pct}%</p>
          </div>
          <div className="concave-3d h-3 rounded-[2px] overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#1e3a5f] to-[#c2a05a] rounded-[2px] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Próximo atendimento */}
      {data.nextSession ? (
        <div className="panel-3d rounded-xl overflow-hidden">
          {/* TOP BAR */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-accent" />
              <span className="text-primary text-xs font-black uppercase tracking-widest">PRÓXIMO ATENDIMENTO</span>
            </div>
            <StatusBadge status={data.nextSession.status} />
          </div>
          <div className="p-4 grid grid-cols-2 gap-2">
            <MetaField label="DATA" value={brDate(data.nextSession.scheduledDate)} />
            <MetaField label="HORA" value={data.nextSession.scheduledTime} />
            <MetaField label="LOCAL" value={data.nextSession.unit} />
            <MetaField label="CÓDIGO DE ACESSO" value="Ver WhatsApp" />
          </div>
        </div>
      ) : (
        <div className="panel-3d-sub rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <p className="text-accent text-sm">Nenhum atendimento futuro agendado.</p>
        </div>
      )}

      {/* Validação de código */}
      <ValidarCodigo client={client} />

      {/* Atalhos */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onGo("protocolos")}
          className="btn-3d-soft flex items-center justify-center gap-2 h-12 text-xs font-black uppercase tracking-wider">
          <Syringe className="w-4 h-4" /> Protocolos
        </button>
        <button onClick={() => onGo("documentos")}
          className="btn-3d-soft flex items-center justify-center gap-2 h-12 text-xs font-black uppercase tracking-wider">
          <FileText className="w-4 h-4" /> Documentos
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROTOCOLOS — Grade Imaginária aplicada
// ---------------------------------------------------------------------------
type ProtoItem = {
  id: number; substanceName: string; color: string; procedureType: string; dose: string;
  totalSessions: number; completedSessions: number; intervalDays: number; startDate: string;
  frequency: string; mainFunction: string | null;
};
type Proto = {
  id: number; title: string; status: string; startDate: string; endDate: string | null;
  unit: string | null; serviceType: string; totalSessions: number; completedSessions: number;
  totalValue: number; items: ProtoItem[];
};

function ProtocolCard({ p }: { p: Proto }) {
  const [expanded, setExpanded] = useState(p.status === "active");
  const pct = p.totalSessions > 0 ? Math.round((p.completedSessions / p.totalSessions) * 100) : 0;

  return (
    <div className="panel-3d rounded-xl overflow-hidden">
      {/* ZONA 1 — TOP BAR: status + data */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={p.status} />
        </div>
        <span className="text-muted-foreground text-[10px] font-semibold shrink-0">Início {brDate(p.startDate)}</span>
      </div>

      {/* ZONA 2 — TÍTULO */}
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-primary font-black text-base uppercase truncate">{p.title}</h3>
      </div>

      {/* ZONA 3 — IDENTIDADE: progresso concave + badge tipo */}
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="concave-3d px-3 py-1 rounded-lg shrink-0">
          <span className="text-primary text-xs font-black">{p.completedSessions} / {p.totalSessions} atendimentos</span>
        </div>
        <div className="concave-3d px-3 py-1 rounded-lg shrink-0">
          <span className="text-accent text-[10px] font-black uppercase tracking-wider">{PROC_LABELS[p.serviceType] ?? p.serviceType}</span>
        </div>
      </div>

      {/* ZONA 4 — META GRID 2×2 */}
      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        <MetaField label="LOCAL" value={p.unit} />
        <MetaField label="CONCLUSÃO" value={brDate(p.endDate)} />
      </div>

      {/* ZONA 5 — BARRA DE PROGRESSO */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-accent text-[9px] font-black uppercase tracking-widest">PROGRESSO</span>
          <span className="text-accent text-xs font-black">{pct}%</span>
        </div>
        <div className="concave-3d h-2.5 rounded-[2px] overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#1e3a5f] to-[#c2a05a] rounded-[2px] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Substâncias — colapsável */}
      <div className="border-t border-border/40">
        <button
          onClick={() => setExpanded((x) => !x)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-accent hover:text-primary transition-colors"
        >
          <span className="text-[10px] font-black uppercase tracking-widest">
            {p.items.length} {p.items.length === 1 ? "substância" : "substâncias"}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {expanded && (
          <div className="concave-3d mx-4 mb-4 rounded-xl p-3 space-y-2">
            {p.items.map((it) => (
              <div key={it.id} className="panel-3d-sub rounded-lg p-3 border-l-4 flex flex-col gap-1.5"
                style={{ borderLeftColor: it.color }}>
                {/* Grade interna da substância */}
                <div className="flex items-start justify-between gap-2">
                  <p className="text-primary font-black text-sm leading-tight min-w-0 truncate">{it.substanceName}</p>
                  <span className="text-[9px] font-black uppercase tracking-wider text-accent shrink-0">
                    {PROC_LABELS[it.procedureType] ?? it.procedureType}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <div className="concave-3d rounded px-2 py-1">
                    <p className="text-[8px] font-black text-accent uppercase tracking-wider">DOSE</p>
                    <p className="text-primary text-xs font-semibold">{it.dose || "—"}</p>
                  </div>
                  <div className="concave-3d rounded px-2 py-1">
                    <p className="text-[8px] font-black text-accent uppercase tracking-wider">SESSÕES</p>
                    <p className="text-primary text-xs font-semibold">{it.completedSessions}/{it.totalSessions}</p>
                  </div>
                  <div className="concave-3d rounded px-2 py-1">
                    <p className="text-[8px] font-black text-accent uppercase tracking-wider">INTERVALO</p>
                    <p className="text-primary text-xs font-semibold">A cada {it.intervalDays}d</p>
                  </div>
                </div>
                {it.mainFunction && (
                  <p className="text-accent text-xs leading-snug">{it.mainFunction}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProtocolosTab({ client }: { client: ClientInfo }) {
  const { data, loading, error } = useApi<Proto[]>(client, "protocolos");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data || data.length === 0) return <Empty msg="Você ainda não possui protocolos." />;

  const ativos    = data.filter((p) => p.status === "active");
  const outros    = data.filter((p) => p.status !== "active");

  return (
    <div className="space-y-5">
      {ativos.length > 0 && (
        <div className="space-y-3">
          <SecLabel label="PROTOCOLOS ATIVOS" count={ativos.length} />
          {ativos.map((p) => <ProtocolCard key={p.id} p={p} />)}
        </div>
      )}
      {outros.length > 0 && (
        <div className="space-y-3">
          <SecLabel label="HISTÓRICO" count={outros.length} />
          {outros.map((p) => <ProtocolCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AGENDA
// ---------------------------------------------------------------------------
type SessSubstance = { substanceName: string; color: string; dose: string; status: string; availability: string };
type Sess = {
  id: number; scheduledDate: string; scheduledTime: string; status: string;
  unit: string | null; serviceType: string; weekNumber: number; substances: SessSubstance[];
  protocolTitle?: string | null;
};

const SESS_ACCENT: Record<string, string> = {
  completed: "border-green-400", confirmed: "border-cyan-400",
  scheduled: "border-primary", missed: "border-red-400", cancelled: "border-slate-300",
};

function AgendaTab({ client }: { client: ClientInfo }) {
  const [tick, setTick] = useState(0);
  const [reagendarAlvo, setReagendarAlvo] = useState<Sess | null>(null);
  const { data, loading, error } = useApi<Sess[]>(client, "sessoes", tick);

  const today = new Date().toISOString().slice(0, 10);
  const tmrw = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const upcoming = (data ?? []).filter((s) => s.scheduledDate >= today);
  const past     = (data ?? []).filter((s) => s.scheduledDate < today).reverse();

  const renderSession = (s: Sess) => (
    <div key={s.id} className={`panel-3d rounded-xl overflow-hidden border-l-4 ${SESS_ACCENT[s.status] ?? "border-border"}`}>
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <span className="text-primary text-xs font-black">{brDate(s.scheduledDate)} · {s.scheduledTime}</span>
        <StatusBadge status={s.status} />
      </div>
      {s.protocolTitle && (
        <div className="px-4 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
          {s.protocolTitle}
        </div>
      )}
      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MetaField label="LOCAL" value={s.unit} />
        <MetaField label="PROCEDIMENTO" value={PROC_LABELS[s.serviceType] ?? s.serviceType} />
      </div>
      {/* Substâncias */}
      {s.substances.length > 0 && (
        <div className="concave-3d mx-3 mb-3 rounded-xl p-2.5 flex flex-wrap gap-1.5">
          {s.substances.map((sub, i) => (
            <span key={i}
              className="inline-flex items-center gap-1 text-[11px] text-primary bg-white/60 px-2 py-1 rounded border-l-2"
              style={{ borderLeftColor: sub.color }}>
              {sub.status === "applied" && <CheckCircle className="w-3 h-3 text-green-500" />}
              {sub.substanceName}
              {sub.dose && <span className="text-muted-foreground">{sub.dose}</span>}
            </span>
          ))}
        </div>
      )}
      {/* Reagendar (Onda 2) — so para sessoes agendadas a partir de amanha */}
      {s.status === "scheduled" && s.scheduledDate >= tmrw && (
        <div className="px-3 pb-3">
          <button
            onClick={() => setReagendarAlvo(s)}
            className="w-full h-10 text-xs font-black uppercase tracking-widest text-primary rounded-lg border border-border hover:bg-muted"
          >
            REAGENDAR
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <SelfScheduler client={client} onBooked={() => setTick((t) => t + 1)} />
      {reagendarAlvo && (
        <SelfScheduler
          client={client}
          reagendar={{ id: reagendarAlvo.id, scheduledDate: reagendarAlvo.scheduledDate }}
          onBooked={() => setTick((t) => t + 1)}
          onClose={() => setReagendarAlvo(null)}
        />
      )}

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox msg={error} />
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <SecLabel label="PRÓXIMOS ATENDIMENTOS" count={upcoming.length} />
              {upcoming.map(renderSession)}
            </div>
          )}
          {upcoming.length === 0 && <Empty msg="Sem atendimentos futuros agendados." />}
          {past.length > 0 && (
            <div className="space-y-3">
              <SecLabel label="HISTÓRICO" count={past.length} />
              {past.map(renderSession)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AUTOAGENDAMENTO DO PACIENTE (F4)
// ---------------------------------------------------------------------------
type AgendaRecurso = { id: number; name: string; kind: string; modality: string; color: string };
const MODALITY_PT: Record<string, string> = { domiciliar: "Domiciliar", local: "Na clínica", online: "Online" };

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO(): string {
  return new Date(Date.now() + 864e5).toISOString().slice(0, 10);
}

function SelfScheduler({ client, onBooked, reagendar, onClose }: { client: ClientInfo; onBooked: () => void; reagendar?: { id: number; scheduledDate: string } | null; onClose?: () => void }) {
  const isReagendar = !!reagendar;
  const [open, setOpen] = useState(isReagendar);
  const [recursos, setRecursos] = useState<AgendaRecurso[]>([]);
  const [resourceId, setResourceId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(isReagendar ? tomorrowISO() : todayISO());
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [done, setDone] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`${API_BASE}/api/area-paciente/agenda-recursos`, {
      headers: { Authorization: `Bearer ${client.token}` },
    })
      .then((r) => r.json())
      .then((d: AgendaRecurso[]) => {
        setRecursos(d);
        if (d.length > 0) setResourceId((prev) => prev ?? d[0].id);
      })
      .catch(() => setError("Não foi possível carregar os locais de atendimento."));
  }, [open, client.token]);

  useEffect(() => {
    if (!open || !resourceId || !date) { setSlots([]); return; }
    setLoadingSlots(true); setError(""); setTime("");
    fetch(`${API_BASE}/api/area-paciente/agenda-slots?resourceId=${resourceId}&date=${date}`, {
      headers: { Authorization: `Bearer ${client.token}` },
    })
      .then((r) => r.json())
      .then((d: { slots: { time: string }[] }) => setSlots((d.slots ?? []).map((s) => s.time)))
      .catch(() => setError("Não foi possível carregar os horários."))
      .finally(() => setLoadingSlots(false));
  }, [open, resourceId, date, client.token, reloadKey]);

  const confirmar = useCallback(async () => {
    if (!resourceId || !date || !time) return;
    setSaving(true); setError(""); setWarning("");
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/${isReagendar ? "reagendar" : "agendar"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${client.token}` },
        body: JSON.stringify(isReagendar ? { sessionId: reagendar!.id, resourceId, date, time } : { resourceId, date, time }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (isReagendar ? "Não foi possível remarcar." : "Não foi possível agendar."));
        setTime("");
        setReloadKey((k) => k + 1); // régua pode ter mudado (slot encheu/cadeia)
        return;
      }
      if (data.googleSyncWarning) setWarning(data.googleSyncWarning);
      setDone({ date, time });
      setTime("");
      onBooked();
    } catch { setError("Erro de conexão. Tente novamente."); }
    finally { setSaving(false); }
  }, [resourceId, date, time, client.token, onBooked, isReagendar, reagendar]);

  if (done) {
    return (
      <div className="panel-3d rounded-xl p-6 flex flex-col items-center text-center space-y-3">
        <div className="w-14 h-14 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-green-500" />
        </div>
        <h2 className="text-primary font-black text-base uppercase">{isReagendar ? "REMARCAÇÃO CONFIRMADA" : "AGENDAMENTO CONFIRMADO"}</h2>
        <p className="text-accent text-sm">{brDate(done.date)} às {done.time}. Até lá!</p>
        {warning && (
          <p className="text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{warning}</p>
        )}
        <button
          onClick={() => { if (isReagendar) { onClose?.(); } else { setDone(null); setOpen(true); } }}
          className="btn-3d w-full h-11 text-sm font-black uppercase tracking-wider"
        >
          {isReagendar ? "FECHAR" : "AGENDAR OUTRO"}
        </button>
      </div>
    );
  }

  if (!open && !isReagendar) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn-3d w-full px-4 py-4 flex items-center gap-3 text-left"
      >
        <div className="w-11 h-11 bg-accent/15 rounded-lg flex items-center justify-center flex-shrink-0">
          <CalendarDays className="w-6 h-6 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-black uppercase tracking-widest leading-tight">GERENCIAR AGENDA</span>
          <span className="block text-[11px] font-semibold tracking-wide opacity-80 leading-tight mt-0.5">Marcar ou remarcar seu atendimento</span>
        </div>
        <ChevronRight className="w-5 h-5 flex-shrink-0 opacity-80" />
      </button>
    );
  }

  return (
    <div className="panel-3d rounded-xl overflow-hidden">
      <div className="login-card-topbar px-5 py-4 flex items-center gap-3">
        <CalendarDays className="w-5 h-5 text-accent" />
        <h2 className="text-primary font-black text-sm uppercase tracking-widest">{isReagendar ? "REMARCAR ATENDIMENTO" : "GERENCIAR AGENDA"}</h2>
      </div>
      <div className="p-5 space-y-4">
        {isReagendar && (
          <p className="text-accent text-xs bg-muted border border-border rounded-lg px-3 py-2">
            Atendimento atual: <strong>{brDate(reagendar!.scheduledDate)}</strong>. Escolha o novo local, data e horário.
          </p>
        )}
        <div>
          <label className="block text-primary text-xs font-black uppercase tracking-widest mb-1.5">LOCAL / TIPO</label>
          <select
            value={resourceId ?? ""}
            onChange={(e) => setResourceId(Number(e.target.value))}
            className="concave-3d w-full h-12 px-4 text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg appearance-none"
          >
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>{r.name} · {MODALITY_PT[r.modality] ?? r.modality}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-primary text-xs font-black uppercase tracking-widest mb-1.5">DATA</label>
          <input
            type="date" min={isReagendar ? tomorrowISO() : todayISO()} value={date}
            onChange={(e) => setDate(e.target.value)}
            className="concave-3d w-full h-12 px-4 text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg"
          />
        </div>

        <div>
          <label className="block text-primary text-xs font-black uppercase tracking-widest mb-1.5">HORÁRIO DISPONÍVEL</label>
          {loadingSlots ? (
            <p className="text-muted-foreground text-sm py-2">Carregando horários…</p>
          ) : slots.length === 0 ? (
            <p className="text-muted-foreground text-sm py-2">Nenhum horário disponível neste dia. Tente outra data.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((t) => (
                <button
                  key={t} type="button" onClick={() => setTime(t)}
                  className={`px-3 py-2 text-sm font-bold tabular-nums rounded-lg transition ${
                    time === t ? "bg-cyan-500 text-white ring-2 ring-cyan-300" : "concave-3d text-primary hover:text-primary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-xs font-semibold">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => { if (isReagendar) onClose?.(); else setOpen(false); }}
            className="flex-1 h-12 text-sm font-black uppercase tracking-wider text-accent rounded-lg border border-border"
          >
            CANCELAR
          </button>
          <button
            onClick={confirmar}
            disabled={saving || !time}
            className="btn-3d flex-1 h-12 text-sm font-black uppercase tracking-wider disabled:opacity-50"
          >
            {saving ? (isReagendar ? "REMARCANDO…" : "AGENDANDO…") : (isReagendar ? "REMARCAR" : "CONFIRMAR")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOCUMENTOS — categorias colapsáveis + Financeiro + Exames
// ---------------------------------------------------------------------------
type RasDoc    = { id: number; serviceDate: string; unit: string; serviceType: string; professionalName: string };
type ProtoDoc  = { id: number; title: string; startDate: string; status: string };
type Documentos = { ras: RasDoc[]; protocols: ProtoDoc[] };
type Pay = { id: number; amount: number; method: string; status: string; dueDate: string | null; paidAt: string | null; description: string | null; installments: number | null; cardLabel: string | null };
type Financeiro = { totalPago: number; totalPendente: number; payments: Pay[] };
type Exam = { id: number; token: string; tipo: string; fileName: string; examCount: number; observacao: string | null; createdAt: string };

function CategorySection({ label, count, defaultOpen, children }: {
  label: string; count: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="panel-3d rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border/40"
      >
        <div className="flex items-center gap-2">
          <span className="text-primary text-xs font-black uppercase tracking-widest">{label}</span>
          <span className="concave-3d text-[9px] font-black text-accent px-2 py-0.5 rounded">{count}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-3 space-y-2">{children}</div>}
    </div>
  );
}

function DocumentosTab({ client }: { client: ClientInfo }) {
  const docs = useApi<Documentos>(client, "documentos");
  const fin  = useApi<Financeiro>(client,  "financeiro");
  const exams = useApi<Exam[]>(client,     "exames");

  if (docs.loading || fin.loading || exams.loading) return <Loading />;
  if (docs.error) return <ErrorBox msg={docs.error} />;

  const d = docs.data;
  const f = fin.data;
  const e = exams.data ?? [];

  return (
    <div className="space-y-4">
      {/* RAS */}
      {d && d.ras.length > 0 && (
        <CategorySection label="REGISTROS DE APLICAÇÃO (RAS)" count={d.ras.length} defaultOpen>
          {d.ras.map((r) => (
            <a key={r.id}
              href={`${API_BASE}/api/area-paciente/ras/${r.id}/pdf?token=${client.token}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 panel-3d-sub rounded-lg p-3 hover:bg-muted transition-colors"
            >
              <FileText className="w-5 h-5 text-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-primary font-semibold text-sm">RAS — {brDate(r.serviceDate)}</p>
                <p className="text-muted-foreground text-xs truncate">{r.professionalName} · {r.unit}</p>
              </div>
              <Download className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </a>
          ))}
        </CategorySection>
      )}

      {/* Protocolos PDF */}
      {d && d.protocols.length > 0 && (
        <CategorySection label="PROTOCOLOS COMPLETOS (PDF)" count={d.protocols.length} defaultOpen>
          {d.protocols.map((p) => (
            <a key={p.id}
              href={`${API_BASE}/api/area-paciente/protocolo/${p.id}/pdf?token=${client.token}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 panel-3d-sub rounded-lg p-3 hover:bg-muted transition-colors"
            >
              <FileText className="w-5 h-5 text-accent flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-primary font-semibold text-sm truncate">{p.title}</p>
                <p className="text-muted-foreground text-xs">Documento completo · {brDate(p.startDate)}</p>
              </div>
              <Download className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </a>
          ))}
        </CategorySection>
      )}

      {/* Exames solicitados */}
      {e.length > 0 && (
        <CategorySection label="SOLICITAÇÕES DE EXAMES" count={e.length} defaultOpen={false}>
          {e.map((ex) => (
            <a key={ex.id}
              href={`${API_BASE}/api/exam-requests/file/${ex.token}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 panel-3d-sub rounded-lg p-3 hover:bg-muted transition-colors"
            >
              <FlaskConical className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-primary font-semibold text-sm truncate">{ex.tipo}</p>
                <p className="text-muted-foreground text-xs">{ex.examCount} exame(s) · {brDate(ex.createdAt)}</p>
              </div>
              <Download className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </a>
          ))}
        </CategorySection>
      )}

      {/* Contratos — slot permanente */}
      <CategorySection label="CONTRATOS E PAGAMENTOS" count={f?.payments.length ?? 0} defaultOpen={false}>
        {f ? (
          <>
            {/* Resumo financeiro */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="concave-3d rounded-lg px-3 py-2">
                <p className="text-[9px] font-black text-accent uppercase tracking-widest">TOTAL PAGO</p>
                <p className="text-green-500 font-black text-xl" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{brMoney(f.totalPago)}</p>
              </div>
              <div className="concave-3d rounded-lg px-3 py-2">
                <p className="text-[9px] font-black text-accent uppercase tracking-widest">PENDENTE</p>
                <p className="text-red-500 font-black text-xl" style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{brMoney(f.totalPendente)}</p>
              </div>
            </div>
            {f.payments.length === 0 && <p className="text-muted-foreground text-xs text-center py-2">Nenhum pagamento registrado.</p>}
            {f.payments.map((p) => (
              <div key={p.id} className="panel-3d-sub rounded-lg p-3 border-l-4"
                style={{ borderLeftColor: p.status === "paid" ? "#22c55e" : "#ef4444" }}>
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={`font-black text-lg ${p.status === "paid" ? "text-primary" : "text-red-500"}`}
                    style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}
                  >
                    {brMoney(p.amount)}
                  </p>
                  <StatusBadge status={p.status} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{METHOD_LABELS[p.method] ?? p.method.toUpperCase()}</span>
                  {p.installments && p.installments > 1 && <span>{p.installments}x</span>}
                  {p.cardLabel && <span>{p.cardLabel}</span>}
                </div>
                {p.description && <p className="text-muted-foreground text-xs mt-1">{p.description}</p>}
                <p className="text-muted-foreground text-[11px] mt-1">
                  {p.status === "paid" ? `Pago em ${brDate(p.paidAt)}` : `Vence em ${brDate(p.dueDate)}`}
                </p>
              </div>
            ))}
          </>
        ) : fin.error ? (
          <p className="text-red-400 text-xs">{fin.error}</p>
        ) : (
          <p className="text-muted-foreground text-xs text-center py-2">—</p>
        )}
      </CategorySection>

      {(!d || (d.ras.length === 0 && d.protocols.length === 0)) && e.length === 0 && !f?.payments.length && (
        <Empty msg="Nenhum documento disponível ainda." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ENVIAR DOCUMENTO
// ---------------------------------------------------------------------------
function EnviarTab({ client }: { client: ClientInfo }) {
  const [fileType, setFileType]       = useState("");
  const [bodyRegion, setBodyRegion]   = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState("");
  const [done, setDone]               = useState<{ fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showBodyRegion = TYPES_WITH_BODY.includes(fileType);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !fileType) return;
    setUploading(true); setError("");
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("token", client.token);
      formData.append("fileType", fileType);
      if (bodyRegion) formData.append("bodyRegion", bodyRegion);
      if (description) formData.append("description", description);
      const res = await fetch(`${API_BASE}/api/client-portal/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao enviar"); return; }
      setDone(data);
    } catch { setError("Erro de conexão. Tente novamente."); }
    finally { setUploading(false); }
  }, [selectedFile, fileType, bodyRegion, description, client.token]);

  const reset = () => {
    setFileType(""); setBodyRegion(""); setDescription(""); setSelectedFile(null); setDone(null); setError("");
  };

  if (done) {
    return (
      <div className="panel-3d rounded-xl p-8 flex flex-col items-center text-center space-y-4">
        <div className="w-16 h-16 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-primary font-black text-lg uppercase">ARQUIVO ENVIADO!</h2>
        <p className="text-accent text-sm">Seu arquivo foi recebido e será processado pela equipe.</p>
        <div className="concave-3d rounded-lg px-4 py-3 w-full text-left">
          <p className="text-muted-foreground text-xs uppercase font-black tracking-wider mb-1">ARQUIVO</p>
          <p className="text-primary text-sm font-mono truncate">{done.fileName}</p>
        </div>
        <button onClick={reset} className="btn-3d w-full h-12 text-sm font-black uppercase tracking-wider">
          ENVIAR OUTRO ARQUIVO
        </button>
      </div>
    );
  }

  return (
    <div className="panel-3d rounded-xl overflow-hidden">
      {/* TOP BAR */}
      <div className="login-card-topbar px-5 py-4 flex items-center gap-3">
        <FileUp className="w-5 h-5 text-accent" />
        <h2 className="text-primary font-black text-sm uppercase tracking-widest">ENVIAR ARQUIVO</h2>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-primary text-xs font-black uppercase tracking-widest mb-1.5">TIPO DO ARQUIVO</label>
          <select
            value={fileType}
            onChange={(e) => { setFileType(e.target.value); setBodyRegion(""); setError(""); }}
            className="concave-3d w-full h-12 px-4 text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg appearance-none"
          >
            <option value="" disabled>Selecione o tipo...</option>
            {FILE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {showBodyRegion && (
          <div>
            <label className="block text-primary text-xs font-black uppercase tracking-widest mb-1.5">REGIÃO DO CORPO <span className="text-muted-foreground">(OPCIONAL)</span></label>
            <select
              value={bodyRegion}
              onChange={(e) => setBodyRegion(e.target.value)}
              className="concave-3d w-full h-12 px-4 text-primary text-sm focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg appearance-none"
            >
              <option value="">Selecione a região...</option>
              {BODY_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-primary text-xs font-black uppercase tracking-widest mb-1.5">DESCRIÇÃO <span className="text-muted-foreground">(OPCIONAL)</span></label>
          <input
            type="text" placeholder="Ex: hemograma completo, raio-x do joelho..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="concave-3d w-full h-12 px-4 text-primary text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg"
          />
        </div>

        <div>
          <label className="block text-primary text-xs font-black uppercase tracking-widest mb-1.5">ARQUIVO</label>
          <input
            ref={fileInputRef} type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx"
            onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setError(""); }}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="concave-3d w-full h-24 rounded-xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border hover:border-accent transition-colors"
          >
            {selectedFile ? (
              <>
                <CheckCircle className="w-6 h-6 text-green-500" />
                <span className="text-primary text-sm font-semibold truncate max-w-[90%]">{selectedFile.name}</span>
                <span className="text-muted-foreground text-xs">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB — toque para trocar</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="text-accent text-sm">Toque para selecionar arquivo</span>
              </>
            )}
          </button>
        </div>

        {error && <ErrorBox msg={error} />}

        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !fileType}
          className="btn-3d w-full h-12 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> ENVIANDO...</> : <><Upload className="w-5 h-5" /> ENVIAR ARQUIVO</>}
        </button>
      </div>
    </div>
  );
}
