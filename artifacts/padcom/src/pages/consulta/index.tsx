import { collabAuthHeaders } from "@/lib/collab-auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { tituloProprio } from "@/lib/utils";
import {
  Stethoscope,
  ClipboardList,
  TrendingUp,
  Activity,
  Loader2,
  Search,
  Trash2,
  Send,
  Mail,
  MessageCircle,
  TrendingDown,
  Minus,
  FileText,
  Bot,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { BASE, ConsoleShell, BlockTitle } from "../comunicacao/_shared";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { getCollabProfessional } from "@/lib/collab-auth";

// ===========================================================================
// CONSULTA (PRONTUARIO) — Tela unica do atendimento (spec
// specs/tela-consulta-prontuario.md). Escolhe o cliente UMA vez e, nas 3 abas,
// o medico: (1) prescreve exames, (2) ve a evolucao Antes/Depois por faixas
// com DATA / LABORATORIO / AUTOR empilhados no cabecalho da coluna, e (3) ve o
// acompanhamento do cliente. A tela SO consome os motores que ja existem:
//   - GET  /api/catalogos/exames        (catalogo de exames)
//   - GET  /api/professionals           (medicos solicitantes)
//   - POST /api/exam-requests/emit       (prescrever = gera PDF + envio)
//   - GET  /api/exames-lab/evolucao/:id  (evolucao antes/depois)
//   - GET  /api/cockpit/:id              (acompanhamento consolidado)
// ===========================================================================

type Aba = "prescrever" | "evolucao" | "acompanhamento";

interface ClienteOption {
  id: number;
  name: string;
}

interface ProfOption {
  id: number;
  name: string;
  crm?: string | null;
  role?: string | null;
}

type Tipo = "SANGUE" | "IMAGEM" | "OUTROS";

interface Exam {
  id: number;
  codigoExame: string | null;
  nomeExame: string | null;
  grupoPrincipal: string | null;
  subgrupo: string | null;
  modalidade: string | null;
  materialOuSetor: string | null;
  preparo: string | null;
  ativo?: boolean | null;
}

interface CartItem {
  id: number;
  nomeExame: string;
  codigoExame: string | null;
  grupoPrincipal: string | null;
  preparo: string | null;
  tipo: Tipo;
}

interface EmitResult {
  pdfs: Array<{ id: number; tipoLabel: string; fileName: string; examCount: number; url: string }>;
  email: { attempted: boolean; success: boolean; error?: string };
  whatsapp: { attempted: boolean; success: boolean; error?: string };
}

interface EvolucaoCell {
  value: string | null;
  valueNum: number | null;
  unit: string | null;
  status: string | null;
  documentId: number;
}

interface EvolucaoData {
  columns: Array<{
    key: string;
    date: string | null;
    lab: string | null;
    confLevel: "ia" | "c1" | "c2" | null;
    conferenteName: string | null;
    conferenteCargo: string | null;
  }>;
  analytes: Array<{
    key: string;
    name: string;
    unit: string | null;
    refLow: string | null;
    refHigh: string | null;
    trend: "subiu" | "caiu" | "estavel" | null;
    cells: Record<string, EvolucaoCell>;
  }>;
}

interface CockpitData {
  cliente: { id: number; nome: string; telefone: string | null; email: string | null };
  passado: {
    protocolos: unknown[];
    orcamentos: unknown[];
    respostasAnamnese: number;
  };
  presente: {
    escoreTotal: number | null;
    gradeGlobal: string | null;
    redFlag: boolean | null;
    blocos: unknown[];
    sintomas: unknown[];
    doencas: unknown[];
    alarmes: unknown[];
  };
  futuro: {
    formulas: Array<{ nome?: string } | string>;
    exames: Array<{ id: number; nome: string }>;
    injetaveis: Array<{ nome?: string } | string>;
    implantes: Array<{ nome?: string } | string>;
    dieta: string | null;
    treino: string | null;
  };
}

const TIPO_COLOR: Record<Tipo, string> = {
  SANGUE: "#B91C1C",
  IMAGEM: "#1D4ED8",
  OUTROS: "#7C3AED",
};

const IMAGING_MODALITIES = ["USG", "TC", "RM", "RX", "DENSITOMETRIA", "MAMOGRAFIA"];

function noAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function classifyTipo(
  modalidade: string | null,
  material: string | null,
  grupo: string | null,
): Tipo {
  const m = (modalidade ?? "").trim().toUpperCase();
  const mat = (material ?? "").trim().toUpperCase();
  const g = noAccents((grupo ?? "").trim().toUpperCase());
  if (m.includes("ENDOSCOP") || g.includes("ENDOSCOP")) return "OUTROS";
  const imagingByMod = IMAGING_MODALITIES.includes(m) || m.includes("IMAGEM");
  const imagingByMat = mat.includes("IMAGEM");
  const imagingByGroup =
    g.includes("IMAGEM") ||
    g.includes("RESSONANCIA") ||
    g.includes("ULTRASSOM") ||
    g.includes("MAMOGRAFIA") ||
    g === "TC" ||
    g === "BLOCO RX";
  if (imagingByMod || imagingByMat || imagingByGroup) return "IMAGEM";
  if (m === "CARDIO" || mat === "FUNCIONAL") return "OUTROS";
  return "SANGUE";
}

function formatDateBr(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Identidade do colaborador que fez a extracao/lancamento: "Sobrenome, Nome (Cargo)".
// Placeholders do sistema (ex.: lancamento legado, sem pessoa) ficam verbatim.
function formatColaborador(name: string | null, cargo: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return cargo ? `(${cargo.trim()})` : "—";
  if (!cargo && /legad|confer[êe]ncia|sistema|automátic|automatic/i.test(raw)) return raw;
  const clean = raw
    .replace(/^(dr\.?|dra\.?|enf\.?|psic\.?|nutr\.?|recep\.?|adm\.?|fin\.?)\s+/i, "")
    .trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  let base: string;
  if (parts.length === 0) base = "";
  else if (parts.length === 1) base = parts[0];
  else base = `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
  const c = (cargo ?? "").trim();
  if (!base) return c ? `(${c})` : "—";
  return c ? `${base} (${c})` : base;
}

function resultStatusClass(status: string | null): string {
  switch (status) {
    case "acima":
      return "bg-red-500/15 text-red-600";
    case "abaixo":
      return "bg-amber-500/15 text-amber-600";
    case "dentro":
      return "bg-emerald-500/15 text-emerald-700";
    case "conferencia":
      return "bg-slate-500/15 text-slate-600";
    default:
      return "text-muted-foreground";
  }
}

function nomeDeItem(x: { nome?: string } | string): string {
  return typeof x === "string" ? x : (x.nome ?? "(sem nome)");
}

export default function ConsultaProntuario() {
  const [aba, setAba] = useState<Aba>("prescrever");

  // ---- Cliente compartilhado por toda a tela ----
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const clienteAtual = useMemo(
    () => clientes.find((c) => String(c.id) === clienteId) ?? null,
    [clientes, clienteId],
  );

  useEffect(() => {
    fetch(`${BASE}/api/clients`)
      .then((r) => r.json())
      .then((d: ClienteOption[]) =>
        setClientes([...d].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))),
      )
      .catch(() => setClientes([]));
  }, []);

  // ===================== ABA 1: PRESCREVER =====================
  const [profissionais, setProfissionais] = useState<ProfOption[]>([]);
  const [professionalId, setProfessionalId] = useState<string>(() => {
    const p = getCollabProfessional();
    return p ? String(p.id) : "";
  });
  const [exams, setExams] = useState<Exam[]>([]);
  const [carregandoExams, setCarregandoExams] = useState(true);
  const [erroExams, setErroExams] = useState(false);
  const [erroProfissionais, setErroProfissionais] = useState(false);
  const [busca, setBusca] = useState("");
  const [cart, setCart] = useState<Record<number, CartItem>>({});
  const [observacao, setObservacao] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [emitResult, setEmitResult] = useState<EmitResult | null>(null);
  const [emitErro, setEmitErro] = useState<string | null>(null);

  const carregarProfissionais = useCallback(() => {
    setErroProfissionais(false);
    fetch(`${BASE}/api/professionals`, { headers: collabAuthHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("professionals"))))
      .then((d: ProfOption[]) =>
        setProfissionais(Array.isArray(d) ? [...d].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : []),
      )
      .catch(() => {
        setProfissionais([]);
        setErroProfissionais(true);
      });
  }, []);

  const carregarExams = useCallback(() => {
    setCarregandoExams(true);
    setErroExams(false);
    fetch(`${BASE}/api/catalogos/exames`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalogo"))))
      .then((d: Exam[]) => setExams(Array.isArray(d) ? d : []))
      .catch(() => {
        setExams([]);
        setErroExams(true);
      })
      .finally(() => setCarregandoExams(false));
  }, []);

  useEffect(() => {
    carregarProfissionais();
    carregarExams();
  }, [carregarProfissionais, carregarExams]);

  const examesFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    const ativos = exams.filter((e) => e.ativo !== false && e.nomeExame);
    if (!term) return ativos.slice(0, 40);
    return ativos
      .filter((e) =>
        [e.nomeExame, e.codigoExame, e.grupoPrincipal, e.subgrupo]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
      .slice(0, 60);
  }, [exams, busca]);

  const cartList = useMemo(() => Object.values(cart), [cart]);

  const toggleExam = (e: Exam) => {
    setCart((prev) => {
      const next = { ...prev };
      if (next[e.id]) delete next[e.id];
      else
        next[e.id] = {
          id: e.id,
          nomeExame: e.nomeExame ?? "(sem nome)",
          codigoExame: e.codigoExame,
          grupoPrincipal: e.grupoPrincipal,
          preparo: e.preparo,
          tipo: classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal),
        };
      return next;
    });
  };

  const emitir = async () => {
    if (!clienteId || cartList.length === 0) return;
    setEmitindo(true);
    setEmitErro(null);
    setEmitResult(null);
    try {
      const r = await fetch(`${BASE}/api/exam-requests/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: Number(clienteId),
          professionalId: professionalId ? Number(professionalId) : undefined,
          observacao: observacao.trim() || undefined,
          sendEmail,
          sendWhatsapp,
          items: cartList.map((i) => ({
            nomeExame: i.nomeExame,
            codigoExame: i.codigoExame,
            grupoPrincipal: i.grupoPrincipal,
            preparo: i.preparo,
            tipo: i.tipo,
          })),
        }),
      });
      const d = await r.json().catch(() => ({}) as Record<string, unknown>);
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Falha ao gerar solicitação");
      setEmitResult(d as EmitResult);
      setCart({});
    } catch (e) {
      setEmitErro((e as Error).message);
    } finally {
      setEmitindo(false);
    }
  };

  // ===================== ABA 2: EVOLUCAO =====================
  const [evolucao, setEvolucao] = useState<EvolucaoData | null>(null);
  const [carregandoEvolucao, setCarregandoEvolucao] = useState(false);
  const [erroEvolucao, setErroEvolucao] = useState(false);

  const carregarEvolucao = useCallback((cid: string) => {
    if (!cid) {
      setEvolucao(null);
      return;
    }
    setCarregandoEvolucao(true);
    setErroEvolucao(false);
    fetch(`${BASE}/api/exames-lab/evolucao/${cid}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("evolucao"))))
      .then((d: EvolucaoData) => setEvolucao(d))
      .catch(() => {
        setEvolucao(null);
        setErroEvolucao(true);
      })
      .finally(() => setCarregandoEvolucao(false));
  }, []);

  useEffect(() => {
    if (aba === "evolucao") carregarEvolucao(clienteId);
  }, [aba, clienteId, carregarEvolucao]);

  // ===================== ABA 3: ACOMPANHAMENTO =====================
  const [cockpit, setCockpit] = useState<CockpitData | null>(null);
  const [carregandoCockpit, setCarregandoCockpit] = useState(false);
  const [erroCockpit, setErroCockpit] = useState(false);

  const carregarCockpit = useCallback((cid: string) => {
    if (!cid) {
      setCockpit(null);
      return;
    }
    setCarregandoCockpit(true);
    setErroCockpit(false);
    fetch(`${BASE}/api/cockpit/${cid}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("cockpit"))))
      .then((d: CockpitData) => setCockpit(d))
      .catch(() => {
        setCockpit(null);
        setErroCockpit(true);
      })
      .finally(() => setCarregandoCockpit(false));
  }, []);

  useEffect(() => {
    if (aba === "acompanhamento") carregarCockpit(clienteId);
  }, [aba, clienteId, carregarCockpit]);

  // ===================== RENDER =====================
  const abas: Array<{ id: Aba; label: string; icon: typeof ClipboardList }> = [
    { id: "prescrever", label: "Prescrever Exames", icon: ClipboardList },
    { id: "evolucao", label: "Evolução (Antes/Depois)", icon: TrendingUp },
    { id: "acompanhamento", label: "Acompanhamento", icon: Activity },
  ];

  const semCliente = (
    <p className="py-10 text-center text-sm text-muted-foreground">
      Escolha um cliente no topo para começar.
    </p>
  );

  return (
    <ConsoleShell
      icon={Stethoscope}
      title="Consulta (Prontuário)"
      subtitle="Uma tela: prescrever exames · evolução antes/depois · acompanhamento do cliente"
    >
      {/* ---- Seletor de cliente compartilhado ---- */}
      <section className="panel-3d p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bevel-3d flex h-10 w-10 flex-shrink-0 items-center justify-center">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Cliente da consulta
            </label>
            <PaxterClientSelector
              clientes={clientes}
              value={clienteId ? Number(clienteId) : null}
              onChange={(id) => setClienteId(id == null ? "" : String(id))}
              placeholder="Selecionar cliente…"
              allOptionLabel="Escolher cliente…"
            />
          </div>
          {clienteAtual && (
            <div className="concave-3d rounded-md px-4 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Em atendimento
              </p>
              <p className="text-sm font-semibold">{tituloProprio(clienteAtual.name)}</p>
            </div>
          )}
        </div>
      </section>

      {/* ---- Abas ---- */}
      <div className="concave-3d inline-flex flex-wrap gap-0.5 p-0.5">
        {abas.map((a) => {
          const Icon = a.icon;
          const ativa = aba === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-colors ${
                ativa ? "btn-3d text-primary" : "text-muted-foreground neon-hover"
              }`}
              style={{ borderRadius: "4px" }}
            >
              <Icon className="h-4 w-4" /> {a.label}
            </button>
          );
        })}
      </div>

      {/* ================= ABA PRESCREVER ================= */}
      {aba === "prescrever" && (
        <section className="panel-3d p-5">
          <BlockTitle icon={ClipboardList}>Prescrever exames</BlockTitle>
          {!clienteId ? (
            semCliente
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
              {/* Catalogo */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    className="concave-3d h-10 w-full rounded-md bg-transparent pl-9 pr-3 text-sm"
                    placeholder="Buscar exame pelo nome…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                {carregandoExams ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…
                  </div>
                ) : erroExams ? (
                  <div className="bevel-3d flex items-center justify-between gap-2 px-3 py-3 text-sm text-red-600">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Falha ao carregar o catálogo de exames.
                    </span>
                    <button
                      type="button"
                      onClick={() => carregarExams()}
                      className="btn-3d-soft rounded px-2 py-1 text-xs font-semibold uppercase text-primary"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : (
                  <div className="max-h-[420px] divide-y overflow-y-auto rounded-md border">
                    {examesFiltrados.map((e) => {
                      const tipo = classifyTipo(e.modalidade, e.materialOuSetor, e.grupoPrincipal);
                      return (
                        <label
                          key={e.id}
                          className="flex cursor-pointer items-start gap-3 px-3 py-2 neon-hover"
                        >
                          <input
                            type="checkbox"
                            checked={!!cart[e.id]}
                            onChange={() => toggleExam(e)}
                            className="mt-1"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm">{e.nomeExame}</span>
                            <span className="block text-xs text-muted-foreground">
                              <span
                                className="mr-1 inline-block rounded px-1 text-[10px] font-bold uppercase text-white"
                                style={{ background: TIPO_COLOR[tipo] }}
                              >
                                {tipo}
                              </span>
                              {[e.codigoExame, e.grupoPrincipal].filter(Boolean).join(" • ")}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {examesFiltrados.length === 0 && (
                      <p className="px-3 py-6 text-sm text-muted-foreground">Nenhum exame encontrado.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Carrinho + acoes */}
              <div className="space-y-3">
                <div className="concave-3d rounded-md p-3">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Selecionados ({cartList.length})
                  </p>
                  {cartList.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Marque exames no catálogo ao lado.</p>
                  ) : (
                    <ul className="max-h-40 space-y-1 overflow-y-auto">
                      {cartList.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{i.nomeExame}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setCart((prev) => {
                                const n = { ...prev };
                                delete n[i.id];
                                return n;
                              })
                            }
                            className="text-muted-foreground hover:text-red-600"
                            aria-label="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <select
                  className="concave-3d h-10 w-full rounded-md bg-transparent px-2 text-sm"
                  value={professionalId}
                  onChange={(e) => setProfessionalId(e.target.value)}
                >
                  <option value="">Médico solicitante (opcional)…</option>
                  {profissionais.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                      {p.crm ? ` — CRM ${p.crm}` : ""}
                    </option>
                  ))}
                </select>
                {erroProfissionais && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> Falha ao carregar médicos.{" "}
                    <button
                      type="button"
                      onClick={() => carregarProfissionais()}
                      className="underline"
                    >
                      Tentar novamente
                    </button>
                  </p>
                )}

                <textarea
                  className="concave-3d min-h-[64px] w-full rounded-md bg-transparent px-3 py-2 text-sm"
                  placeholder="Observação (opcional)…"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                    <Mail className="h-4 w-4 text-muted-foreground" /> Enviar por e-mail
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sendWhatsapp}
                      onChange={(e) => setSendWhatsapp(e.target.checked)}
                    />
                    <MessageCircle className="h-4 w-4 text-muted-foreground" /> Enviar por WhatsApp
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void emitir()}
                  disabled={!clienteId || cartList.length === 0 || emitindo}
                  className="btn-3d-soft inline-flex h-11 w-full items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary disabled:opacity-60"
                >
                  {emitindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Emitir solicitação
                </button>

                {emitErro && (
                  <div className="bevel-3d flex items-start gap-2 px-3 py-2 text-xs text-red-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {emitErro}
                  </div>
                )}
                {emitResult && (
                  <div className="bevel-3d space-y-1 px-3 py-2 text-xs">
                    <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> {emitResult.pdfs.length} PDF(s) gerado(s)
                    </p>
                    {emitResult.pdfs.map((p) => (
                      <a
                        key={p.id}
                        href={`${BASE}${p.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-primary underline"
                      >
                        <FileText className="h-3.5 w-3.5" /> {p.tipoLabel} ({p.examCount})
                      </a>
                    ))}
                    {emitResult.email.attempted && (
                      <p className={emitResult.email.success ? "text-emerald-700" : "text-amber-600"}>
                        E-mail: {emitResult.email.success ? "enviado" : `falhou (${emitResult.email.error})`}
                      </p>
                    )}
                    {emitResult.whatsapp.attempted && (
                      <p className={emitResult.whatsapp.success ? "text-emerald-700" : "text-amber-600"}>
                        WhatsApp: {emitResult.whatsapp.success ? "enviado" : `falhou (${emitResult.whatsapp.error})`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================= ABA EVOLUCAO ================= */}
      {aba === "evolucao" && (
        <section className="panel-3d p-5">
          <BlockTitle icon={TrendingUp}>Evolução Antes/Depois</BlockTitle>
          {!clienteId ? (
            semCliente
          ) : carregandoEvolucao ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando evolução…
            </div>
          ) : erroEvolucao ? (
            <p className="py-6 text-sm text-red-600">Não foi possível carregar a evolução.</p>
          ) : !evolucao || evolucao.columns.length === 0 || evolucao.analytes.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nenhum exame para este cliente ainda.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left align-bottom text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Exame
                    </th>
                    {evolucao.columns.map((c) => (
                      <th key={c.key} className="min-w-[130px] px-3 py-2 text-left align-bottom">
                        {/* Empilhado: DATA / LABORATORIO / AUTOR da extracao */}
                        <span className="block text-sm font-black">{formatDateBr(c.date)}</span>
                        <span className="block text-xs font-medium text-primary">{c.lab ?? "Laboratório —"}</span>
                        <span className="mt-0.5 block text-[10px] font-medium normal-case text-muted-foreground">
                          {c.conferenteName ? (
                            <>
                              {c.confLevel === "c2" ? "Conferido: " : "Lançado: "}
                              {formatColaborador(c.conferenteName, c.conferenteCargo)}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Bot className="h-3 w-3" /> Aguardando conferência
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center align-bottom text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Tend.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {evolucao.analytes.map((a) => (
                    <tr key={a.key} className="border-t">
                      <td className="sticky left-0 z-10 bg-background px-3 py-2">
                        <span className="block font-medium">{a.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {[a.unit, a.refLow && a.refHigh ? `ref ${a.refLow}–${a.refHigh}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      {evolucao.columns.map((c) => {
                        const cell = a.cells[c.key];
                        return (
                          <td key={c.key} className="px-3 py-2">
                            {cell && cell.value != null ? (
                              <span
                                className={`inline-block rounded px-2 py-0.5 font-semibold ${resultStatusClass(cell.status)}`}
                              >
                                {cell.value}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        {a.trend === "subiu" ? (
                          <TrendingUp className="mx-auto h-4 w-4 text-red-500" />
                        ) : a.trend === "caiu" ? (
                          <TrendingDown className="mx-auto h-4 w-4 text-emerald-600" />
                        ) : (
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ================= ABA ACOMPANHAMENTO ================= */}
      {aba === "acompanhamento" && (
        <section className="panel-3d p-5">
          <BlockTitle icon={Activity}>Acompanhamento do cliente</BlockTitle>
          {!clienteId ? (
            semCliente
          ) : carregandoCockpit ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando acompanhamento…
            </div>
          ) : erroCockpit ? (
            <p className="py-6 text-sm text-red-600">Não foi possível carregar o acompanhamento.</p>
          ) : !cockpit ? (
            <p className="py-6 text-sm text-muted-foreground">Sem dados de acompanhamento.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {/* PASSADO */}
              <div className="concave-3d rounded-md p-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">Passado</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Protocolos</span>
                    <span className="font-semibold">{cockpit.passado.protocolos?.length ?? 0}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Orçamentos</span>
                    <span className="font-semibold">{cockpit.passado.orcamentos?.length ?? 0}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Respostas de anamnese</span>
                    <span className="font-semibold">{cockpit.passado.respostasAnamnese ?? 0}</span>
                  </li>
                </ul>
              </div>

              {/* PRESENTE */}
              <div className="concave-3d rounded-md p-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">Presente</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Escore total</span>
                    <span className="font-semibold">{cockpit.presente.escoreTotal ?? "—"}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Grade global</span>
                    <span className="font-semibold">{cockpit.presente.gradeGlobal ?? "—"}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Alarmes</span>
                    <span className="font-semibold">{cockpit.presente.alarmes?.length ?? 0}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Sinal vermelho</span>
                    <span className={`font-semibold ${cockpit.presente.redFlag ? "text-red-600" : "text-emerald-700"}`}>
                      {cockpit.presente.redFlag ? "SIM" : "não"}
                    </span>
                  </li>
                </ul>
              </div>

              {/* FUTURO */}
              <div className="concave-3d rounded-md p-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary">Futuro (sugerido)</p>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Fórmulas</span>
                    <span className="font-semibold">{cockpit.futuro.formulas?.length ?? 0}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Exames</span>
                    <span className="font-semibold">{cockpit.futuro.exames?.length ?? 0}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Injetáveis</span>
                    <span className="font-semibold">{cockpit.futuro.injetaveis?.length ?? 0}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-muted-foreground">Implantes</span>
                    <span className="font-semibold">{cockpit.futuro.implantes?.length ?? 0}</span>
                  </li>
                </ul>
                {cockpit.futuro.exames?.length > 0 && (
                  <div className="mt-3 border-t pt-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Exames sugeridos
                    </p>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {cockpit.futuro.exames.slice(0, 8).map((e) => (
                        <li key={e.id}>{e.nome}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {cockpit.futuro.formulas?.length > 0 && (
                  <div className="mt-2 border-t pt-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Fórmulas sugeridas
                    </p>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      {cockpit.futuro.formulas.slice(0, 8).map((f, i) => (
                        <li key={i}>{nomeDeItem(f)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </ConsoleShell>
  );
}
