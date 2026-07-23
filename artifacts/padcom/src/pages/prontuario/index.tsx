import { useState, useEffect } from "react";
import { useRoute, Link } from "wouter";
import {
  FileText, FlaskConical, Stethoscope, ClipboardList,
  ArrowLeft, Calendar, User, CheckCircle2, Clock,
  ExternalLink, AlertCircle, Download, FolderOpen, Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

// ============================================================================
// Prontuário por Paciente — 4 abas (Prescrições / Protocolos / Exames Solicitados / Exames Recebidos)
// Inspirado no modelo Support Clinic, com design Paxter navy/ouro.
// ============================================================================

type Tab = "prescricoes" | "protocolos" | "exames-indicados" | "exames-recebidos";

interface ProntuarioData {
  client: {
    id: number;
    nome: string;
    cpf: string | null;
    email: string | null;
    telefone: string | null;
    dataNascimento: string | null;
    foto: string | null;
    driveFolderId: string | null;
  };
  prescricoes: Record<string, unknown>[];
  protocolos: {
    id: number;
    titulo: string;
    status: string;
    createdAt: string;
  }[];
  examesIndicados: {
    id: number;
    tipo: string;
    fileName: string;
    examCount: number;
    observacao: string | null;
    token: string;
    createdAt: string;
  }[];
  examesRecebidos: {
    id: number;
    fileName: string;
    labName: string | null;
    collectionDate: string | null;
    examKind: string | null;
    status: string;
    origin: string | null;
    sourcePdfDriveId: string | null;
    createdAt: string;
  }[];
  analitos?: {
    id: number;
    examDocumentId: number;
    analyteCode: string | null;
    analyteNameRaw: string;
    valueRaw: string | null;
    unitRaw: string | null;
    valueCanonical: string | null;
    refLow: string | null;
    refHigh: string | null;
    status: string | null;
    collectionDate: string | null;
    labName: string | null;
  }[];
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return format(parseISO(val), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return val;
  }
}

function fmtDateTime(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return format(parseISO(val), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return val;
  }
}

function StatusProtocolo({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "ATIVO", cls: "bg-emerald-100 text-emerald-800" },
    suggested: { label: "SUGERIDO", cls: "bg-blue-100 text-blue-800" },
    completed: { label: "CONCLUÍDO", cls: "bg-gray-200 text-gray-700" },
    cancelled: { label: "CANCELADO", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status.toUpperCase(), cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block text-[10px] font-bold tracking-widest px-2 py-0.5 rounded ${s.cls}`}>
      {s.label}
    </span>
  );
}

function StatusExame({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    recebido: { label: "RECEBIDO", cls: "bg-blue-100 text-blue-800" },
    conferido_1: { label: "CONF. 1", cls: "bg-amber-100 text-amber-800" },
    conferido: { label: "CONFERIDO", cls: "bg-emerald-100 text-emerald-800" },
  };
  const s = map[status] ?? { label: status.toUpperCase(), cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block text-[10px] font-bold tracking-widest px-2 py-0.5 rounded ${s.cls}`}>
      {s.label}
    </span>
  );
}

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "prescricoes",       label: "Prescrições",         icon: <FileText className="w-4 h-4" /> },
  { key: "protocolos",        label: "Protocolos",          icon: <Stethoscope className="w-4 h-4" /> },
  { key: "exames-indicados",  label: "Exames Solicitados",  icon: <ClipboardList className="w-4 h-4" /> },
  { key: "exames-recebidos",  label: "Exames Recebidos",    icon: <FlaskConical className="w-4 h-4" /> },
];

export default function Prontuario() {
  const [, params] = useRoute("/clients/:id/prontuario");
  const id = parseInt(params?.id || "0", 10);

  const [data, setData] = useState<ProntuarioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("prescricoes");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/prontuario/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("collab_token") ?? ""}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then(setData)
      .catch(() => setError("Não foi possível carregar o prontuário."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>{error ?? "Cliente não encontrado."}</span>
        </div>
      </div>
    );
  }

  const { client, prescricoes, protocolos, examesIndicados, examesRecebidos, analitos = [] } = data;

  return (
    <div className="flex flex-col min-h-screen bg-[#f5f7f9]">

      {/* ── Cabeçalho do Paciente ── */}
      <div className="bg-[#1a2744] text-white px-6 py-5">
        <div className="flex items-start gap-4">
          {/* Foto */}
          <div className="w-16 h-16 rounded-[6px] overflow-hidden bg-[#2d3e6b] flex-shrink-0 border border-white/10">
            {client.foto ? (
              <img src={client.foto} alt={client.nome} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className="w-8 h-8 text-white/40" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/clients/${id}`}>
                <button className="text-white/50 hover:text-white flex items-center gap-1 text-xs">
                  <ArrowLeft className="w-3 h-3" />
                  Ficha
                </button>
              </Link>
            </div>
            <h1 className="text-xl font-bold text-white leading-tight">{client.nome}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-white/70">
              {client.cpf && <span>CPF: {client.cpf}</span>}
              {client.dataNascimento && <span>Nasc: {fmtDate(client.dataNascimento)}</span>}
              {client.email && <span>{client.email}</span>}
              {client.telefone && <span>{client.telefone}</span>}
            </div>
          </div>

          {/* Ações rápidas */}
          <div className="flex gap-2 flex-shrink-0">
            <Link href={`/clients/${id}`}>
              <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 border border-white/20">
                <User className="w-4 h-4 mr-1" /> Ficha
              </Button>
            </Link>
            {client.driveFolderId && (
              <a
                href={`https://drive.google.com/drive/folders/${client.driveFolderId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 border border-white/20">
                  <FolderOpen className="w-4 h-4 mr-1" /> Drive
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Contadores rápidos */}
        <div className="grid grid-cols-4 gap-3 mt-5">
          {[
            { label: "Prescrições",        count: prescricoes.length,        tab: "prescricoes" as Tab },
            { label: "Protocolos",         count: protocolos.length,         tab: "protocolos" as Tab },
            { label: "Exames Solicitados", count: examesIndicados.length,    tab: "exames-indicados" as Tab },
            { label: "Exames Recebidos",   count: examesRecebidos.length,    tab: "exames-recebidos" as Tab },
          ].map((item) => (
            <button
              key={item.tab}
              onClick={() => setTab(item.tab)}
              className={`text-left rounded-[6px] px-3 py-2 border transition-all ${
                tab === item.tab
                  ? "bg-[#c9a227]/20 border-[#c9a227]/60"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <div className={`text-2xl font-bold ${tab === item.tab ? "text-[#c9a227]" : "text-white"}`}>
                {item.count}
              </div>
              <div className="text-[10px] text-white/60 uppercase tracking-wider mt-0.5">
                {item.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-[#1a2744] text-[#1a2744]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo das Abas ── */}
      <div className="flex-1 p-6">

        {/* ABA: Prescrições */}
        {tab === "prescricoes" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">
                Receituários Emitidos ({prescricoes.length})
              </h2>
              <Link href={`/receituario-automatico?clientId=${id}`}>
                <Button size="sm" className="bg-[#1a2744] hover:bg-[#243660] text-white">
                  <Plus className="w-4 h-4 mr-1" /> Nova Prescrição
                </Button>
              </Link>
            </div>

            {prescricoes.length === 0 ? (
              <EmptyState icon={<FileText />} label="Nenhuma prescrição emitida" />
            ) : (
              <div className="space-y-2">
                {prescricoes.map((p) => (
                  <div
                    key={String(p.token)}
                    className="bg-white rounded-[6px] border border-gray-200 px-4 py-3 flex items-center justify-between hover:border-[#1a2744]/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-[#1a2744]/50" />
                      <div>
                        <div className="font-medium text-sm text-gray-900">
                          {String(p.arquivo || "Receituário")}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {fmtDate(String(p.data_emissao))} · {String(p.medico || "—")} · {String(p.crm || "—")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                        {String(p.token)}
                      </span>
                      {p.drive_url && (
                        <a href={String(p.drive_url)} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="text-[#1a2744] h-7 px-2">
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      )}
                      <a href={`/consulta-receituario?token=${String(p.token)}`} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="text-gray-500 h-7 px-2 text-xs">
                          QR
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: Protocolos */}
        {tab === "protocolos" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">
                Protocolos Indicados ({protocolos.length})
              </h2>
              <Link href={`/protocols/new?clientId=${id}`}>
                <Button size="sm" className="bg-[#1a2744] hover:bg-[#243660] text-white">
                  <Plus className="w-4 h-4 mr-1" /> Novo Protocolo
                </Button>
              </Link>
            </div>

            {protocolos.length === 0 ? (
              <EmptyState icon={<Stethoscope />} label="Nenhum protocolo indicado" />
            ) : (
              <div className="space-y-2">
                {protocolos.map((p) => (
                  <Link key={p.id} href={`/protocols/${p.id}`}>
                    <div className="bg-white rounded-[6px] border border-gray-200 px-4 py-3 flex items-center justify-between hover:border-[#1a2744]/30 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <Stethoscope className="w-5 h-5 text-[#1a2744]/50" />
                        <div>
                          <div className="font-medium text-sm text-gray-900">{p.titulo}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Criado em {fmtDate(p.createdAt)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusProtocolo status={p.status} />
                        <ExternalLink className="w-3 h-3 text-gray-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: Exames Solicitados */}
        {tab === "exames-indicados" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">
                Exames Solicitados ({examesIndicados.length})
              </h2>
              <Link href={`/prescricao?clientId=${id}`}>
                <Button size="sm" className="bg-[#1a2744] hover:bg-[#243660] text-white">
                  <Plus className="w-4 h-4 mr-1" /> Solicitar Exames
                </Button>
              </Link>
            </div>

            {examesIndicados.length === 0 ? (
              <EmptyState icon={<ClipboardList />} label="Nenhum exame solicitado" />
            ) : (
              <div className="space-y-2">
                {examesIndicados.map((e) => (
                  <div
                    key={e.id}
                    className="bg-white rounded-[6px] border border-gray-200 px-4 py-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <ClipboardList className="w-5 h-5 text-[#1a2744]/50" />
                      <div>
                        <div className="font-medium text-sm text-gray-900">{e.fileName}</div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {e.tipo} · {e.examCount} exame(s) · {fmtDateTime(e.createdAt)}
                        </div>
                        {e.observacao && (
                          <div className="text-xs text-gray-400 italic mt-0.5">{e.observacao}</div>
                        )}
                      </div>
                    </div>
                    <a
                      href={`/api/exam-requests/pdf/${e.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="sm" className="text-[#1a2744] h-7 px-2">
                        <Download className="w-3 h-3 mr-1" /> PDF
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: Exames Recebidos */}
        {tab === "exames-recebidos" && (
          <div className="space-y-6">

            {/* Lista de laudos recebidos */}
            <div>
              <h2 className="text-sm font-semibold text-[#1a2744] uppercase tracking-widest mb-3">
                Laudos Recebidos ({examesRecebidos.length})
              </h2>
              {examesRecebidos.length === 0 ? (
                <EmptyState icon={<FlaskConical />} label="Nenhum exame recebido" />
              ) : (
                <div className="space-y-2">
                  {examesRecebidos.map((e) => (
                    <div
                      key={e.id}
                      className="bg-white rounded-[6px] border border-gray-200 px-4 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <FlaskConical className="w-5 h-5 text-[#1a2744]/50" />
                        <div>
                          <div className="font-medium text-sm text-gray-900">{e.fileName}</div>
                          <div className="text-xs text-gray-500 mt-0.5 flex gap-2">
                            {e.labName && <span>{e.labName}</span>}
                            {e.collectionDate && <span>Coleta: {fmtDate(e.collectionDate)}</span>}
                            {e.examKind && (
                              <span className="capitalize">
                                {e.examKind === "lab" ? "Laboratorial" : "Imagem"}
                              </span>
                            )}
                            <span>{fmtDate(e.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusExame status={e.status} />
                        {e.sourcePdfDriveId && (
                          <a
                            href={`https://drive.google.com/file/d/${e.sourcePdfDriveId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="ghost" size="sm" className="text-[#1a2744] h-7 px-2">
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Planilha comparativa de analitos */}
            <PlanilhaComparativa analitos={analitos} />
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Planilha comparativa de analitos (pivot: analito × data de coleta)
// ─────────────────────────────────────────────────────────────────────────────
type AnalitoRow = {
  id: number;
  examDocumentId: number;
  analyteCode: string | null;
  analyteNameRaw: string;
  valueRaw: string | null;
  unitRaw: string | null;
  valueCanonical: string | null;
  refLow: string | null;
  refHigh: string | null;
  status: string | null;
  collectionDate: string | null;
  labName: string | null;
};

function statusCor(status: string | null): string {
  if (!status || status === "normal") return "text-emerald-700 bg-emerald-50";
  if (status === "acima") return "text-red-700 bg-red-50";
  if (status === "abaixo") return "text-amber-700 bg-amber-50";
  return "text-gray-700";
}

function PlanilhaComparativa({ analitos }: { analitos: AnalitoRow[] }) {
  const [filtro, setFiltro] = useState("");

  if (analitos.length === 0) {
    return (
      <div>
        <h2 className="text-sm font-semibold text-[#1a2744] uppercase tracking-widest mb-3">
          Planilha Comparativa
        </h2>
        <div className="bg-white rounded-[6px] border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
          Nenhum analito extraído ainda — aguarde o próximo ciclo de importação automática.
        </div>
      </div>
    );
  }

  // Datas únicas ordenadas (colunas)
  const datasSet = new Set(analitos.map((a) => a.collectionDate ?? "sem-data"));
  const datas = Array.from(datasSet).sort();

  // Analitos únicos ordenados (linhas), com filtro
  const nomesSet = new Set(analitos.map((a) => a.analyteNameRaw));
  const nomesOrdenados = Array.from(nomesSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const nomesFiltrados = filtro.trim()
    ? nomesOrdenados.filter((n) => n.toLowerCase().includes(filtro.toLowerCase()))
    : nomesOrdenados;

  // Índice: nome → data → analito
  const idx = new Map<string, Map<string, AnalitoRow>>();
  for (const a of analitos) {
    const data = a.collectionDate ?? "sem-data";
    if (!idx.has(a.analyteNameRaw)) idx.set(a.analyteNameRaw, new Map());
    idx.get(a.analyteNameRaw)!.set(data, a);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#1a2744] uppercase tracking-widest">
          Planilha Comparativa — {nomesFiltrados.length} analito{nomesFiltrados.length !== 1 ? "s" : ""}
        </h2>
        <input
          type="search"
          placeholder="Filtrar analito..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="text-sm border border-gray-200 rounded-[6px] px-3 py-1 w-52 focus:outline-none focus:ring-1 focus:ring-[#45B8CC]"
        />
      </div>
      <div className="overflow-x-auto rounded-[6px] border border-gray-200">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#1a2744] text-white">
              <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-[#1a2744] z-10 min-w-[200px]">
                Analito
              </th>
              {datas.map((d) => (
                <th key={d} className="text-center px-3 py-2 font-semibold whitespace-nowrap min-w-[90px]">
                  {d === "sem-data" ? "S/Data" : fmtDate(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nomesFiltrados.map((nome, i) => {
              const mapa = idx.get(nome);
              const unit = analitos.find((a) => a.analyteNameRaw === nome)?.unitRaw;
              return (
                <tr key={nome} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-1.5 font-medium text-gray-800 sticky left-0 z-10 bg-inherit border-r border-gray-200">
                    <div className="truncate max-w-[200px]" title={nome}>{nome}</div>
                    {unit && <div className="text-[10px] text-gray-400">{unit}</div>}
                  </td>
                  {datas.map((d) => {
                    const a = mapa?.get(d);
                    if (!a) {
                      return (
                        <td key={d} className="px-3 py-1.5 text-center text-gray-300">
                          —
                        </td>
                      );
                    }
                    const cor = statusCor(a.status);
                    return (
                      <td key={d} className="px-3 py-1.5 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-semibold ${cor}`}>
                          {a.valueRaw ?? "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 inline-block border border-emerald-300" /> Normal</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block border border-red-300" /> Acima</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 inline-block border border-amber-300" /> Abaixo</span>
      </div>
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white rounded-[6px] border border-dashed border-gray-300 p-12 flex flex-col items-center gap-3 text-gray-400">
      <div className="w-10 h-10 [&>svg]:w-10 [&>svg]:h-10">{icon}</div>
      <span className="text-sm">{label}</span>
    </div>
  );
}
