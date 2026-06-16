import { useState, useCallback, useEffect, useRef } from "react";
import {
  User, Loader2, AlertCircle, ChevronRight, LogOut, Home, Syringe,
  CalendarDays, Wallet, FlaskConical, FileText, Upload, ClipboardList,
  CheckCircle, Download, Clock, FileUp,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Helpers de formatacao (padrao Brasil)
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

const METHOD_LABELS: Record<string, string> = {
  pix: "PIX", credit: "CARTÃO DE CRÉDITO", debit: "CARTÃO DE DÉBITO",
  boleto: "BOLETO", cash: "DINHEIRO",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "AGENDADA", confirmed: "CONFIRMADA", completed: "REALIZADA",
  applied: "APLICADA", missed: "FALTOU", cancelled: "CANCELADA", pending: "PENDENTE",
  paid: "PAGO", active: "ATIVO", suggested: "SUGERIDO",
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
// Tipos
// ---------------------------------------------------------------------------
type ClientInfo = { id: number; name: string; cpf: string | null; token: string };

type TabKey = "inicio" | "protocolo" | "agenda" | "financeiro" | "exames" | "documentos" | "enviar";

const TABS: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: "inicio", label: "INÍCIO", icon: Home },
  { key: "protocolo", label: "PROTOCOLO", icon: Syringe },
  { key: "agenda", label: "AGENDA", icon: CalendarDays },
  { key: "financeiro", label: "FINANCEIRO", icon: Wallet },
  { key: "exames", label: "EXAMES", icon: FlaskConical },
  { key: "documentos", label: "DOCUMENTOS", icon: FileText },
  { key: "enviar", label: "ENVIAR", icon: Upload },
];

// ===========================================================================
export default function Area() {
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [tab, setTab] = useState<TabKey>("inicio");

  const handleLogout = useCallback(() => {
    setClient(null);
    setTab("inicio");
  }, []);

  if (!client) {
    return <LoginScreen onSuccess={setClient} />;
  }

  return (
    <div className="min-h-screen bg-[#142e2e] flex flex-col">
      <header className="bg-[#0d1f1f] border-b border-[#1e4a4a] px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-[#1a4040] rounded flex items-center justify-center flex-shrink-0">
            <span className="text-[#d4ae35] font-bold text-lg">P</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-sm tracking-wide uppercase truncate">PADCON CONECT</h1>
            <p className="text-[#6b9b9b] text-[10px] uppercase tracking-widest truncate">{client.name}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-[#8fbfbf] text-xs hover:text-white px-2 py-1.5 rounded hover:bg-[#1e4a4a] transition-colors flex-shrink-0"
        >
          <LogOut className="w-4 h-4" /> SAIR
        </button>
      </header>

      {/* Abas horizontais com rolagem */}
      <nav className="bg-[#0d1f1f] border-b border-[#1e4a4a] sticky top-[57px] z-10">
        <div className="flex overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "text-[#d4ae35] border-[#d4ae35]"
                    : "text-[#6b9b9b] border-transparent hover:text-[#8fbfbf]"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="flex-1 px-4 py-5 max-w-2xl w-full mx-auto">
        {tab === "inicio" && <InicioTab client={client} onGo={setTab} />}
        {tab === "protocolo" && <ProtocoloTab client={client} />}
        {tab === "agenda" && <AgendaTab client={client} />}
        {tab === "financeiro" && <FinanceiroTab client={client} />}
        {tab === "exames" && <ExamesTab client={client} />}
        {tab === "documentos" && <DocumentosTab client={client} />}
        {tab === "enviar" && <EnviarTab client={client} />}
      </main>

      <footer className="px-4 py-4 text-center">
        <a
          href={`${API_BASE}/anamnese`}
          className="inline-flex items-center gap-2 text-[#8fbfbf] text-xs uppercase tracking-wider hover:text-white"
        >
          <ClipboardList className="w-4 h-4" /> Preencher ficha de anamnese
        </a>
        <p className="text-[#3a6666] text-[10px] mt-3 uppercase tracking-wider">
          Clínica Padua — Padcon Conect
        </p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
function LoginScreen({ onSuccess }: { onSuccess: (c: ClientInfo) => void }) {
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleIdentify = useCallback(async () => {
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) { setError("Digite os 11 dígitos do CPF"); return; }
    const cleanDate = birthDate.replace(/\D/g, "");
    if (cleanDate.length !== 8) { setError("Digite a data completa (DD/MM/AAAA)"); return; }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/client-portal/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf, birthDate: cleanDate }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao identificar"); return; }
      onSuccess(data);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [cpf, birthDate, onSuccess]);

  return (
    <div className="min-h-screen bg-[#142e2e] flex flex-col">
      <header className="bg-[#0d1f1f] border-b border-[#1e4a4a] px-4 py-4 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1a4040] rounded flex items-center justify-center">
            <span className="text-[#d4ae35] font-bold text-lg">P</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg tracking-wide uppercase">PADCON CONECT</h1>
            <p className="text-[#6b9b9b] text-xs uppercase tracking-widest">ÁREA DO PACIENTE</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-[#1a3a3a] border border-[#1e4a4a] rounded-md overflow-hidden">
            <div className="bg-[#0d1f1f] px-5 py-4 border-b border-[#1e4a4a]">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-[#d4ae35]" />
                <h2 className="text-white font-semibold text-sm uppercase tracking-wide">IDENTIFICAÇÃO</h2>
              </div>
              <p className="text-[#6b9b9b] text-xs mt-1">
                Digite seu CPF e data de nascimento para entrar
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">CPF</label>
                <input
                  type="tel" inputMode="numeric" placeholder="000.000.000-00" value={cpf}
                  onChange={(e) => { setCpf(formatCpf(e.target.value)); setError(""); }}
                  className="w-full h-12 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-lg placeholder:text-[#3a6666] focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">DATA DE NASCIMENTO</label>
                <input
                  type="tel" inputMode="numeric" placeholder="DD/MM/AAAA" value={birthDate}
                  onChange={(e) => { setBirthDate(formatDateInput(e.target.value)); setError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleIdentify(); }}
                  className="w-full h-12 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-lg placeholder:text-[#3a6666] focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleIdentify}
                disabled={loading || cpf.replace(/\D/g, "").length !== 11 || birthDate.replace(/\D/g, "").length !== 8}
                className="w-full h-12 bg-[#d4ae35] hover:bg-[#c9a330] text-[#0d1f1f] font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>ENTRAR <ChevronRight className="w-4 h-4" /></>}
              </button>
            </div>
          </div>
          <p className="text-center text-[#3a6666] text-xs mt-6 uppercase tracking-wider">
            Clínica Padua — Padcon Conect
          </p>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook generico de fetch com token
// ---------------------------------------------------------------------------
function useApi<T>(client: ClientInfo, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
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
  }, [client.token, path]);

  return { data, loading, error };
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 text-[#d4ae35] animate-spin" />
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-4 py-3">
      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
      <p className="text-red-300 text-sm">{msg}</p>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-[#6b9b9b] text-sm text-center py-10">{msg}</p>;
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      className="bg-[#1a3a3a] border border-[#1e4a4a] rounded-md overflow-hidden"
      style={accent ? { borderLeft: `4px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// INICIO
// ---------------------------------------------------------------------------
type Resumo = {
  client: { name: string };
  protocolsCount: number;
  activeProtocolsCount: number;
  totalSessions: number;
  completedSessions: number;
  nextSession: { id: number; scheduledDate: string; scheduledTime: string; unit: string | null; status: string } | null;
};

function InicioTab({ client, onGo }: { client: ClientInfo; onGo: (t: TabKey) => void }) {
  const { data, loading, error } = useApi<Resumo>(client, "resumo");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const pct = data.totalSessions > 0 ? Math.round((data.completedSessions / data.totalSessions) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card accent="#d4ae35">
        <div className="p-5">
          <p className="text-[#6b9b9b] text-xs uppercase tracking-widest">BEM-VINDO(A)</p>
          <h2 className="text-white font-bold text-xl mt-1">{data.client.name}</h2>
        </div>
      </Card>

      {data.nextSession ? (
        <Card accent="#45B8CC">
          <div className="p-5">
            <p className="text-[#6b9b9b] text-xs uppercase tracking-widest mb-2">PRÓXIMA SESSÃO</p>
            <div className="flex items-center gap-3">
              <CalendarDays className="w-8 h-8 text-[#45B8CC]" />
              <div>
                <p className="text-white font-bold text-lg">{brDate(data.nextSession.scheduledDate)} às {data.nextSession.scheduledTime}</p>
                <p className="text-[#8fbfbf] text-sm">{data.nextSession.unit || "—"}</p>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="p-5 flex items-center gap-3">
            <Clock className="w-6 h-6 text-[#6b9b9b]" />
            <p className="text-[#8fbfbf] text-sm">Nenhuma sessão futura agendada no momento.</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="p-4">
            <p className="text-[#6b9b9b] text-[10px] uppercase tracking-widest">PROTOCOLOS ATIVOS</p>
            <p className="text-white font-bold text-3xl mt-1">{data.activeProtocolsCount}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-[#6b9b9b] text-[10px] uppercase tracking-widest">SESSÕES REALIZADAS</p>
            <p className="text-white font-bold text-3xl mt-1">{data.completedSessions}<span className="text-[#6b9b9b] text-lg">/{data.totalSessions}</span></p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[#6b9b9b] text-[10px] uppercase tracking-widest">PROGRESSO DO TRATAMENTO</p>
            <p className="text-[#d4ae35] font-bold text-sm">{pct}%</p>
          </div>
          <div className="h-3 bg-[#0d1f1f] rounded-full overflow-hidden">
            <div className="h-full bg-[#45B8CC] rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button onClick={() => onGo("agenda")} className="flex items-center justify-center gap-2 h-12 bg-[#1a3a3a] border border-[#1e4a4a] rounded-md text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider hover:border-[#d4ae35] transition-colors">
          <CalendarDays className="w-4 h-4" /> Minha Agenda
        </button>
        <button onClick={() => onGo("documentos")} className="flex items-center justify-center gap-2 h-12 bg-[#1a3a3a] border border-[#1e4a4a] rounded-md text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider hover:border-[#d4ae35] transition-colors">
          <FileText className="w-4 h-4" /> Meus Documentos
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROTOCOLO
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

const PROC_LABELS: Record<string, string> = { iv: "ENDOVENOSO", im: "INTRAMUSCULAR", implant: "IMPLANTE", sc: "SUBCUTÂNEO" };

function ProtocoloTab({ client }: { client: ClientInfo }) {
  const { data, loading, error } = useApi<Proto[]>(client, "protocolos");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data || data.length === 0) return <Empty msg="Você ainda não possui protocolos." />;

  return (
    <div className="space-y-4">
      {data.map((p) => (
        <Card key={p.id} accent="#3D7A7A">
          <div className="bg-[#0d1f1f] px-5 py-3 border-b border-[#1e4a4a] flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-sm">{p.title}</h3>
              <p className="text-[#6b9b9b] text-xs mt-0.5">Início {brDate(p.startDate)} · {p.unit || "—"}</p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#0d1f1f] bg-[#45B8CC] px-2 py-1 rounded">{STATUS_LABELS[p.status] || p.status}</span>
          </div>
          <div className="p-4 space-y-3">
            {p.items.map((it) => (
              <div key={it.id} className="bg-[#0d1f1f] rounded-md p-3 border-l-4" style={{ borderColor: it.color }}>
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-white font-semibold text-sm">{it.substanceName}</p>
                  <span className="text-[#6b9b9b] text-[10px] uppercase tracking-wider">{PROC_LABELS[it.procedureType] || it.procedureType}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8fbfbf] flex-wrap">
                  <span>Dose: <span className="text-white">{it.dose}</span></span>
                  <span>Sessões: <span className="text-white">{it.completedSessions}/{it.totalSessions}</span></span>
                  <span>A cada <span className="text-white">{it.intervalDays}</span> dias</span>
                </div>
                {it.mainFunction && <p className="text-[#6b9b9b] text-xs mt-2 leading-snug">{it.mainFunction}</p>}
              </div>
            ))}
          </div>
        </Card>
      ))}
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
};

const SESS_BORDER: Record<string, string> = {
  completed: "#22c55e", confirmed: "#45B8CC", scheduled: "#3D7A7A", missed: "#ef4444", cancelled: "#6b7280",
};

function AgendaTab({ client }: { client: ClientInfo }) {
  const { data, loading, error } = useApi<Sess[]>(client, "sessoes");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data || data.length === 0) return <Empty msg="Você ainda não possui sessões agendadas." />;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.filter((s) => s.scheduledDate >= today);
  const past = data.filter((s) => s.scheduledDate < today).reverse();

  const renderSession = (s: Sess) => (
    <Card key={s.id} accent={SESS_BORDER[s.status] || "#3D7A7A"}>
      <div className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <p className="text-white font-bold text-sm">{brDate(s.scheduledDate)} · {s.scheduledTime}</p>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8fbfbf]">{STATUS_LABELS[s.status] || s.status}</span>
        </div>
        <p className="text-[#6b9b9b] text-xs mt-0.5">{s.unit || "—"}</p>
        {s.substances.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {s.substances.map((sub, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] text-white bg-[#0d1f1f] px-2 py-1 rounded border-l-2" style={{ borderColor: sub.color }}>
                {sub.status === "applied" && <CheckCircle className="w-3 h-3 text-green-400" />}
                {sub.substanceName} <span className="text-[#6b9b9b]">{sub.dose}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[#d4ae35] text-xs font-bold uppercase tracking-widest mb-2">PRÓXIMAS SESSÕES</p>
        {upcoming.length === 0 ? <Empty msg="Sem sessões futuras." /> : <div className="space-y-3">{upcoming.map(renderSession)}</div>}
      </div>
      {past.length > 0 && (
        <div>
          <p className="text-[#6b9b9b] text-xs font-bold uppercase tracking-widest mb-2">SESSÕES ANTERIORES</p>
          <div className="space-y-3">{past.map(renderSession)}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FINANCEIRO
// ---------------------------------------------------------------------------
type Pay = {
  id: number; amount: number; method: string; status: string; dueDate: string | null;
  paidAt: string | null; description: string | null; installments: number | null; cardLabel: string | null;
};
type Financeiro = { totalPago: number; totalPendente: number; payments: Pay[] };

function FinanceiroTab({ client }: { client: ClientInfo }) {
  const { data, loading, error } = useApi<Financeiro>(client, "financeiro");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card accent="#22c55e">
          <div className="p-4">
            <p className="text-[#6b9b9b] text-[10px] uppercase tracking-widest">TOTAL PAGO</p>
            <p className="text-green-400 font-bold text-xl mt-1">{brMoney(data.totalPago)}</p>
          </div>
        </Card>
        <Card accent="#d4ae35">
          <div className="p-4">
            <p className="text-[#6b9b9b] text-[10px] uppercase tracking-widest">PENDENTE</p>
            <p className="text-[#d4ae35] font-bold text-xl mt-1">{brMoney(data.totalPendente)}</p>
          </div>
        </Card>
      </div>

      {data.payments.length === 0 ? (
        <Empty msg="Nenhum pagamento registrado." />
      ) : (
        <div className="space-y-3">
          {data.payments.map((p) => (
            <Card key={p.id} accent={p.status === "paid" ? "#22c55e" : "#d4ae35"}>
              <div className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-white font-bold text-base">{brMoney(p.amount)}</p>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${p.status === "paid" ? "bg-green-900/40 text-green-300" : "bg-[#d4ae35]/20 text-[#d4ae35]"}`}>{STATUS_LABELS[p.status] || p.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-[#8fbfbf] flex-wrap">
                  <span>{METHOD_LABELS[p.method] || p.method.toUpperCase()}</span>
                  {p.installments && p.installments > 1 && <span>{p.installments}x</span>}
                  {p.cardLabel && <span>{p.cardLabel}</span>}
                </div>
                {p.description && <p className="text-[#6b9b9b] text-xs mt-1.5">{p.description}</p>}
                <p className="text-[#6b9b9b] text-[11px] mt-1.5">
                  {p.status === "paid" ? `Pago em ${brDate(p.paidAt)}` : `Vence em ${brDate(p.dueDate)}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EXAMES
// ---------------------------------------------------------------------------
type Exam = { id: number; token: string; tipo: string; fileName: string; examCount: number; observacao: string | null; createdAt: string };

function ExamesTab({ client }: { client: ClientInfo }) {
  const { data, loading, error } = useApi<Exam[]>(client, "exames");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data || data.length === 0) return <Empty msg="Nenhuma solicitação de exame disponível." />;

  return (
    <div className="space-y-3">
      <p className="text-[#6b9b9b] text-xs">Solicitações de exames emitidas pela clínica. Toque para abrir o PDF.</p>
      {data.map((e) => (
        <Card key={e.id} accent="#45B8CC">
          <a
            href={`${API_BASE}/api/exam-requests/file/${e.token}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 hover:bg-[#1e4a4a]/40 transition-colors"
          >
            <FlaskConical className="w-6 h-6 text-[#45B8CC] flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm truncate">{e.tipo}</p>
              <p className="text-[#6b9b9b] text-xs">{e.examCount} exame(s) · {brDate(e.createdAt)}</p>
            </div>
            <Download className="w-5 h-5 text-[#8fbfbf] flex-shrink-0" />
          </a>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DOCUMENTOS
// ---------------------------------------------------------------------------
type RasDoc = { id: number; serviceDate: string; unit: string; serviceType: string; professionalName: string };
type ProtoDoc = { id: number; title: string; startDate: string; status: string };
type Documentos = { ras: RasDoc[]; protocols: ProtoDoc[] };

function DocumentosTab({ client }: { client: ClientInfo }) {
  const { data, loading, error } = useApi<Documentos>(client, "documentos");
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return null;

  const noDocs = data.ras.length === 0 && data.protocols.length === 0;
  if (noDocs) return <Empty msg="Nenhum documento disponível ainda." />;

  return (
    <div className="space-y-5">
      {data.protocols.length > 0 && (
        <div>
          <p className="text-[#d4ae35] text-xs font-bold uppercase tracking-widest mb-2">PROTOCOLOS COMPLETOS</p>
          <div className="space-y-3">
            {data.protocols.map((p) => (
              <Card key={p.id} accent="#3D7A7A">
                <a
                  href={`${API_BASE}/api/area-paciente/protocolo/${p.id}/pdf?token=${client.token}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 hover:bg-[#1e4a4a]/40 transition-colors"
                >
                  <FileText className="w-6 h-6 text-[#3D7A7A] flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-sm truncate">{p.title}</p>
                    <p className="text-[#6b9b9b] text-xs">Documento completo · {brDate(p.startDate)}</p>
                  </div>
                  <Download className="w-5 h-5 text-[#8fbfbf] flex-shrink-0" />
                </a>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data.ras.length > 0 && (
        <div>
          <p className="text-[#d4ae35] text-xs font-bold uppercase tracking-widest mb-2">RAS — REGISTROS DE APLICAÇÃO ASSINADOS</p>
          <div className="space-y-3">
            {data.ras.map((r) => (
              <Card key={r.id} accent="#45B8CC">
                <a
                  href={`${API_BASE}/api/area-paciente/ras/${r.id}/pdf?token=${client.token}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 hover:bg-[#1e4a4a]/40 transition-colors"
                >
                  <FileText className="w-6 h-6 text-[#45B8CC] flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-sm">RAS {brDate(r.serviceDate)}</p>
                    <p className="text-[#6b9b9b] text-xs truncate">{r.professionalName} · {r.unit}</p>
                  </div>
                  <Download className="w-5 h-5 text-[#8fbfbf] flex-shrink-0" />
                </a>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ENVIAR DOCUMENTO (reusa logica do portal)
// ---------------------------------------------------------------------------
function EnviarTab({ client }: { client: ClientInfo }) {
  const [fileType, setFileType] = useState("");
  const [bodyRegion, setBodyRegion] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ fileName: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showBodyRegion = TYPES_WITH_BODY.includes(fileType);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !fileType) return;
    setUploading(true);
    setError("");
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
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }, [selectedFile, fileType, bodyRegion, description, client.token]);

  const reset = () => {
    setFileType(""); setBodyRegion(""); setDescription(""); setSelectedFile(null); setDone(null); setError("");
  };

  if (done) {
    return (
      <Card>
        <div className="p-8 flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-white font-bold text-lg uppercase">ARQUIVO ENVIADO!</h2>
          <p className="text-[#8fbfbf] text-sm">Seu arquivo foi recebido e será processado pela equipe.</p>
          <div className="bg-[#0d1f1f] rounded-md px-4 py-3 w-full text-left">
            <p className="text-[#6b9b9b] text-xs uppercase">Arquivo</p>
            <p className="text-white text-sm font-mono truncate">{done.fileName}</p>
          </div>
          <button onClick={reset} className="w-full h-12 bg-[#d4ae35] hover:bg-[#c9a330] text-[#0d1f1f] font-bold text-sm uppercase tracking-wider rounded-md transition-colors">
            ENVIAR OUTRO ARQUIVO
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="bg-[#0d1f1f] px-5 py-4 border-b border-[#1e4a4a]">
        <div className="flex items-center gap-3">
          <FileUp className="w-5 h-5 text-[#d4ae35]" />
          <h2 className="text-white font-semibold text-sm uppercase tracking-wide">ENVIAR ARQUIVO</h2>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">TIPO DO ARQUIVO</label>
          <select
            value={fileType}
            onChange={(e) => { setFileType(e.target.value); setBodyRegion(""); setError(""); }}
            className="w-full h-12 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent appearance-none"
          >
            <option value="" disabled>Selecione o tipo...</option>
            {FILE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {showBodyRegion && (
          <div>
            <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">REGIÃO DO CORPO <span className="text-[#3a6666]">(OPCIONAL)</span></label>
            <select
              value={bodyRegion}
              onChange={(e) => setBodyRegion(e.target.value)}
              className="w-full h-12 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent appearance-none"
            >
              <option value="">Selecione a região...</option>
              {BODY_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">DESCRIÇÃO <span className="text-[#3a6666]">(OPCIONAL)</span></label>
          <input
            type="text" placeholder="Ex: hemograma completo, raio-x do joelho..." value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-12 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-sm placeholder:text-[#3a6666] focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">ARQUIVO</label>
          <input
            ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx"
            onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setError(""); }}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-24 bg-[#0d1f1f] border-2 border-dashed border-[#1e4a4a] rounded-md flex flex-col items-center justify-center gap-2 hover:border-[#d4ae35] transition-colors"
          >
            {selectedFile ? (
              <>
                <CheckCircle className="w-6 h-6 text-green-400" />
                <span className="text-white text-sm font-medium truncate max-w-[90%]">{selectedFile.name}</span>
                <span className="text-[#6b9b9b] text-xs">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB — toque para trocar</span>
              </>
            ) : (
              <>
                <Upload className="w-6 h-6 text-[#6b9b9b]" />
                <span className="text-[#6b9b9b] text-sm">Toque para selecionar arquivo</span>
              </>
            )}
          </button>
        </div>

        {error && <ErrorBox msg={error} />}

        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !fileType}
          className="w-full h-12 bg-[#d4ae35] hover:bg-[#c9a330] text-[#0d1f1f] font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> ENVIANDO...</> : <><Upload className="w-5 h-5" /> ENVIAR ARQUIVO</>}
        </button>
      </div>
    </Card>
  );
}
