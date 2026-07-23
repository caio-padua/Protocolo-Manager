// ============================================================================
// ProcedenciaDocumentosBloco — Motor Unificado de Recebimento de Exames
// Pedido CEO 23/07/2026: unificar TODOS os motores de recebimento de exame
// em um único bloco robusto com:
//   • Card por documento (arquivo PDF de laudo)
//   • Origem (Portal / Drive-auto / Drive-import / Upload)
//   • Status da trajetória (processando → recebido → C1 → C2)
//   • Analitos extraídos (expansível, carregado sob demanda)
//   • Botões ABRIR NO DRIVE + BAIXAR
//   • Trilha de conferência C1/C2 com nomes, cargos e timestamps
//   • Indicador de renomeação e caminho de origem no Drive
// Usado em: /procedencia-exames e aba Evolução do Cockpit.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  CloudDownload,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Minus,
  RefreshCw,
  Upload,
  Shield,
  ShieldCheck,
  FolderSync,
  Globe,
  Laptop,
} from "lucide-react";

// ── Constantes visuais ───────────────────────────────────────────────────────
const NAVY   = "#16294a";
const GOLD   = "#9a7b32";
const MUTED  = "#647c97";
const CREAM  = "hsl(40 33% 96%)";
const BASE   = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Tipos ───────────────────────────────────────────────────────────────────
export interface DocRow {
  id: number;
  clientId: number;
  clientName?: string;
  fileName: string;
  labName: string | null;
  collectionDate: string | null;
  status: string;
  origin: string | null;
  sourcePdfDriveId: string | null;
  sourcePath: string | null;
  examKind: string | null;
  confidence: string | null;
  modelUsed: string | null;
  createdAt: string;
  conferredAt: string | null;
  conf1Name: string | null;
  conf1Cargo: string | null;
  conf1At: string | null;
  conf2Name: string | null;
  conf2Cargo: string | null;
  conf2At: string | null;
}

interface AnalyteResult {
  id: number;
  analyteCode: string | null;
  analyteNameRaw: string;
  valueRaw: string | null;
  unitRaw: string | null;
  valueCanonical: string | null;
  unitCanonical: string | null;
  status: string | null;
  collectionDate: string | null;
  unitConverted: boolean;
}

// ── Mapeamentos de label ─────────────────────────────────────────────────────
const ORIGIN_CONFIG: Record<string, { rotulo: string; cor: string; Icon: typeof Globe }> = {
  portal:           { rotulo: "Portal do Cliente", cor: "#1d4ed8", Icon: Globe      },
  upload:           { rotulo: "Upload Manual",     cor: "#7c3aed", Icon: Upload     },
  "drive-import":   { rotulo: "Drive (Importação)", cor: "#059669", Icon: FolderOpen },
  "drive-watcher":  { rotulo: "Drive (Automático)", cor: "#0891b2", Icon: FolderSync },
};
const ORIGIN_DEFAULT = { rotulo: "Origem desconhecida", cor: "#94a3b8", Icon: Laptop };

const STATUS_CONFIG: Record<string, { rotulo: string; cor: string }> = {
  processando: { rotulo: "Processando",   cor: "#0e7490" },
  recebido:    { rotulo: "Recebido",      cor: "#d97706" },
  conferido_1: { rotulo: "Conferido 1/2", cor: "#2563eb" },
  conferido:   { rotulo: "Conferido ✓",   cor: "#16a34a" },
  erro:        { rotulo: "Erro",          cor: "#dc2626" },
};

const ANALYTE_STATUS: Record<string, { cor: string; Icon: typeof Minus; label: string }> = {
  dentro:      { cor: "#16a34a", Icon: CheckCircle2,   label: "Dentro"  },
  acima:       { cor: "#dc2626", Icon: ArrowUp,        label: "Acima"   },
  abaixo:      { cor: "#1d4ed8", Icon: ArrowDown,      label: "Abaixo"  },
  conferencia: { cor: "#d97706", Icon: AlertTriangle,  label: "Revisar" },
};
const ANALYTE_DEFAULT = { cor: "#94a3b8", Icon: Minus, label: "—" };

const KIND_ROTULO: Record<string, string> = {
  lab:    "Laboratório",
  imagem: "Imagem",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtData(iso: string | null | undefined, com_hora?: boolean): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    ...(com_hora ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function driveUrl(fileId: string | null): string | null {
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// ── Sub-componente: trilha de conferência ────────────────────────────────────
function ConferenciaTrail({ doc }: { doc: DocRow }) {
  const c1ok = Boolean(doc.conf1Name);
  const c2ok = Boolean(doc.conf2Name);
  if (!c1ok && !c2ok) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px]">
      <span className="font-black uppercase tracking-widest" style={{ color: MUTED }}>
        Conferências:
      </span>
      {c1ok && (
        <span
          className="flex items-center gap-1 rounded px-2 py-0.5"
          style={{ background: "rgba(37,99,235,0.08)", color: "#1d4ed8", border: "1px solid rgba(37,99,235,0.22)" }}
        >
          <Shield className="h-2.5 w-2.5" />
          C1 · {doc.conf1Name}
          {doc.conf1Cargo ? ` (${doc.conf1Cargo})` : ""}
          {doc.conf1At ? ` — ${fmtData(doc.conf1At, true)}` : ""}
        </span>
      )}
      {c2ok && (
        <span
          className="flex items-center gap-1 rounded px-2 py-0.5"
          style={{ background: "rgba(22,163,74,0.08)", color: "#15803d", border: "1px solid rgba(22,163,74,0.22)" }}
        >
          <ShieldCheck className="h-2.5 w-2.5" />
          C2 · {doc.conf2Name}
          {doc.conf2Cargo ? ` (${doc.conf2Cargo})` : ""}
          {doc.conf2At ? ` — ${fmtData(doc.conf2At, true)}` : ""}
        </span>
      )}
    </div>
  );
}

// ── Sub-componente: lista de analitos ────────────────────────────────────────
function AnalitosLista({ docId }: { docId: number }) {
  const [analitos, setAnalitos] = useState<AnalyteResult[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    fetch(`${BASE}/api/exames-lab/documentos/${docId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ results?: AnalyteResult[] }>;
      })
      .then((d) => { if (ativo) setAnalitos(d.results ?? []); })
      .catch(() => { if (ativo) setErro("Falha ao carregar analitos."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [docId]);

  if (carregando) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: MUTED }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-[11px]">Carregando analitos extraídos…</span>
      </div>
    );
  }
  if (erro) {
    return <p className="py-2 text-[11px] text-red-600">{erro}</p>;
  }
  if (analitos.length === 0) {
    return (
      <p className="py-3 text-[11px] italic" style={{ color: MUTED }}>
        Nenhum analito extraído deste documento.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr
            className="border-b text-left text-[9px] font-black uppercase tracking-[0.15em]"
            style={{ color: MUTED, borderColor: "rgba(209,195,165,0.4)" }}
          >
            <th className="py-2 pr-3">Analito (grafia do laudo)</th>
            <th className="py-2 pr-3">Código canônico</th>
            <th className="py-2 pr-3 text-right">Valor bruto</th>
            <th className="py-2 pr-3 text-right">Valor canônico</th>
            <th className="py-2 pr-3">Unidade</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2">Coleta</th>
          </tr>
        </thead>
        <tbody>
          {analitos.map((a) => {
            const st = ANALYTE_STATUS[a.status ?? ""] ?? ANALYTE_DEFAULT;
            return (
              <tr
                key={a.id}
                className="border-b last:border-0"
                style={{ borderColor: "rgba(209,195,165,0.25)" }}
              >
                {/* Analito raw */}
                <td className="py-2 pr-3 font-semibold" style={{ color: NAVY }}>
                  {a.analyteNameRaw}
                </td>
                {/* Código canônico */}
                <td className="py-2 pr-3">
                  {a.analyteCode ? (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest"
                      style={{ background: "rgba(154,123,50,0.12)", color: GOLD }}
                    >
                      {a.analyteCode}
                    </span>
                  ) : (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest"
                      style={{ background: "rgba(148,163,184,0.15)", color: MUTED }}
                    >
                      Sem código
                    </span>
                  )}
                </td>
                {/* Valor bruto */}
                <td className="py-2 pr-3 text-right font-mono" style={{ color: "#4a5d75" }}>
                  {a.valueRaw ?? "—"}
                  {a.unitRaw && (
                    <span className="ml-1 text-[9px]" style={{ color: MUTED }}>
                      {a.unitRaw}
                    </span>
                  )}
                </td>
                {/* Valor canônico */}
                <td className="py-2 pr-3 text-right font-mono font-bold" style={{ color: NAVY }}>
                  {a.valueCanonical ?? "—"}
                  {a.unitConverted && (
                    <span
                      className="ml-1 rounded px-1 py-0.5 text-[8px] font-black uppercase"
                      style={{ background: "rgba(37,99,235,0.1)", color: "#1d4ed8" }}
                    >
                      conv.
                    </span>
                  )}
                </td>
                {/* Unidade canônica */}
                <td className="py-2 pr-3 text-[10px]" style={{ color: MUTED }}>
                  {a.unitCanonical ?? "—"}
                </td>
                {/* Status */}
                <td className="py-2 pr-3">
                  <span
                    className="flex items-center gap-1"
                    style={{ color: st.cor }}
                  >
                    <st.Icon className="h-3 w-3 shrink-0" />
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      {st.label}
                    </span>
                  </span>
                </td>
                {/* Coleta */}
                <td className="py-2 text-[10px]" style={{ color: MUTED }}>
                  {fmtData(a.collectionDate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] italic" style={{ color: MUTED }}>
        {analitos.length} analito{analitos.length !== 1 ? "s" : ""} extraído{analitos.length !== 1 ? "s" : ""} deste documento.
      </p>
    </div>
  );
}

// ── Sub-componente: card de um documento ─────────────────────────────────────
function DocumentoCard({ doc }: { doc: DocRow }) {
  const [expandido, setExpandido] = useState(false);
  const [baixando, setBaixando] = useState(false);

  const origemCfg = ORIGIN_CONFIG[doc.origin ?? ""] ?? ORIGIN_DEFAULT;
  const statusCfg = STATUS_CONFIG[doc.status] ?? { rotulo: doc.status, cor: "#94a3b8" };
  const dUrl      = driveUrl(doc.sourcePdfDriveId);

  const handleBaixar = useCallback(async () => {
    if (baixando) return;
    setBaixando(true);
    try {
      const resp = await fetch(`${BASE}/api/exames-lab/documento/${doc.id}/arquivo`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silencia e habilita novamente
    } finally {
      setBaixando(false);
    }
  }, [doc.id, doc.fileName, baixando]);

  // Indicador de renomeação: se sourcePath existir e for diferente do fileName
  const foiRenomeado =
    doc.sourcePath && doc.sourcePath !== doc.fileName;

  return (
    <div
      className="overflow-hidden rounded-[8px] transition-shadow"
      style={{
        background: "#fff",
        border: "1px solid rgba(209,195,165,0.55)",
        boxShadow: expandido
          ? "0 4px 20px rgba(22,41,74,0.12)"
          : "0 1px 4px rgba(22,41,74,0.06)",
      }}
    >
      {/* ── HEADER DO CARD ─────────────────────────────────────────── */}
      <button
        type="button"
        className="w-full text-left px-4 py-3"
        onClick={() => setExpandido((v) => !v)}
      >
        <div className="flex flex-wrap items-start gap-2">
          {/* Ícone do tipo de laudo */}
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px]"
            style={{ background: "rgba(22,41,74,0.06)" }}
          >
            <FileText className="h-4 w-4" style={{ color: GOLD }} />
          </div>

          {/* Nome do arquivo + badges */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="text-[13px] font-bold leading-tight"
                style={{ color: NAVY, wordBreak: "break-word" }}
              >
                {doc.fileName}
              </span>
              {foiRenomeado && (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  style={{ background: "rgba(37,99,235,0.10)", color: "#1d4ed8" }}
                  title={`Nome original no Drive: ${doc.sourcePath}`}
                >
                  Renomeado
                </span>
              )}
            </div>

            {/* Badges de origem / status / tipo */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white"
                style={{ background: origemCfg.cor }}
              >
                <origemCfg.Icon className="h-2.5 w-2.5" />
                {origemCfg.rotulo}
              </span>
              <span
                className="rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white"
                style={{ background: statusCfg.cor }}
              >
                {statusCfg.rotulo}
              </span>
              {doc.examKind && KIND_ROTULO[doc.examKind] && (
                <span
                  className="rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  style={{ background: "rgba(154,123,50,0.12)", color: GOLD }}
                >
                  {KIND_ROTULO[doc.examKind]}
                </span>
              )}
              {doc.modelUsed && (
                <span
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  style={{ background: "rgba(22,41,74,0.07)", color: NAVY }}
                >
                  <Bot className="h-2.5 w-2.5" />
                  {doc.modelUsed.replace("gemini-", "G").replace("gpt-", "GPT-")}
                  {doc.confidence && ` · ${(Number(doc.confidence) * 100).toFixed(0)}%`}
                </span>
              )}
            </div>

            {/* Meta: lab · coleta · entrada */}
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px]" style={{ color: MUTED }}>
              {doc.labName && (
                <span>
                  <span className="font-bold uppercase tracking-wide">Lab:</span> {doc.labName}
                </span>
              )}
              {doc.collectionDate && (
                <span>
                  <span className="font-bold uppercase tracking-wide">Coleta:</span>{" "}
                  {fmtData(doc.collectionDate)}
                </span>
              )}
              <span>
                <span className="font-bold uppercase tracking-wide">Entrada:</span>{" "}
                {fmtData(doc.createdAt, true)}
              </span>
            </div>
          </div>

          {/* Chevron expansão */}
          <div className="shrink-0 mt-1">
            {expandido ? (
              <ChevronDown className="h-4 w-4" style={{ color: GOLD }} />
            ) : (
              <ChevronRight className="h-4 w-4" style={{ color: MUTED }} />
            )}
          </div>
        </div>
      </button>

      {/* ── BARRA DE AÇÕES (sempre visível) ──────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5"
        style={{ borderColor: "rgba(209,195,165,0.35)", background: "rgba(245,240,230,0.5)" }}
      >
        {/* ABRIR NO DRIVE */}
        {dUrl ? (
          <a
            href={dUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90"
            style={{ background: "#16a34a" }}
          >
            <ExternalLink className="h-3 w-3" />
            Abrir no Drive
          </a>
        ) : (
          <span
            className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest opacity-40 cursor-not-allowed"
            style={{ background: "#94a3b8", color: "#fff" }}
            title="Arquivo não vinculado ao Drive"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir no Drive
          </span>
        )}

        {/* BAIXAR */}
        <button
          type="button"
          onClick={handleBaixar}
          disabled={baixando || !doc.sourcePdfDriveId}
          className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: NAVY }}
        >
          {baixando ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CloudDownload className="h-3 w-3" />
          )}
          {baixando ? "Baixando…" : "Baixar"}
        </button>

        {/* Origem no Drive (sourcePath) */}
        {doc.sourcePath && (
          <span className="ml-auto text-[10px]" style={{ color: MUTED }}>
            <span className="font-bold uppercase tracking-widest">Drive:</span>{" "}
            {doc.sourcePath}
          </span>
        )}

        {/* Expansão de analitos */}
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors"
          style={
            expandido
              ? { background: "rgba(154,123,50,0.15)", color: GOLD }
              : { background: "rgba(22,41,74,0.06)", color: NAVY }
          }
        >
          {expandido ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expandido ? "Ocultar analitos" : "Ver analitos extraídos"}
        </button>
      </div>

      {/* ── SEÇÃO EXPANSÍVEL: analitos + conferência ─────────────── */}
      {expandido && (
        <div
          className="border-t px-4 py-4"
          style={{ borderColor: "rgba(209,195,165,0.35)", background: "rgba(249,246,239,0.6)" }}
        >
          {/* Origem detalhada */}
          {doc.sourcePath && doc.sourcePath !== doc.fileName && (
            <div
              className="mb-3 flex items-center gap-2 rounded-[6px] px-3 py-2 text-[10px]"
              style={{
                background: "rgba(37,99,235,0.06)",
                border: "1px solid rgba(37,99,235,0.15)",
                color: "#1d4ed8",
              }}
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Nome original no Drive:</strong> {doc.sourcePath}
              </span>
            </div>
          )}

          {/* Analitos extraídos */}
          <div
            className="mb-1 text-[10px] font-black uppercase tracking-[0.22em]"
            style={{ color: NAVY }}
          >
            Analitos / resultados extraídos
          </div>
          <AnalitosLista docId={doc.id} />

          {/* Trilha de conferência */}
          <ConferenciaTrail doc={doc} />
        </div>
      )}
    </div>
  );
}

// ── Componente exportado principal ───────────────────────────────────────────
interface ProcedenciaDocumentosBlocoProps {
  clientId: number;
  /** Se true, exibe cabeçalho interno (para uso em /procedencia-exames). */
  comCabecalho?: boolean;
}

export default function ProcedenciaDocumentosBloco({
  clientId,
  comCabecalho = false,
}: ProcedenciaDocumentosBlocoProps) {
  const [docs, setDocs]           = useState<DocRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]           = useState("");
  const abortRef                  = useRef<AbortController | null>(null);

  const carregar = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCarregando(true);
    setErro("");
    fetch(`${BASE}/api/exames-lab/documentos?clientId=${clientId}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DocRow[]>;
      })
      .then((data) => setDocs(data))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setErro("Não foi possível carregar os documentos de exame.");
      })
      .finally(() => setCarregando(false));
  }, [clientId]);

  useEffect(() => {
    void carregar();
    return () => abortRef.current?.abort();
  }, [carregar]);

  // ── Sumário por origem ─────────────────────────────────────────────────────
  const origemCount = docs.reduce<Record<string, number>>((acc, d) => {
    const k = d.origin ?? "desconhecida";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const conferidos = docs.filter((d) => d.status === "conferido").length;
  const totalAnalitos = 0; // carregado lazy por documento

  return (
    <div className="space-y-4">
      {/* Cabeçalho opcional */}
      {comCabecalho && (
        <div className="flex items-center justify-between">
          <div
            className="text-[10px] font-black uppercase tracking-[0.28em]"
            style={{ color: NAVY }}
          >
            Documentos de exame recebidos
          </div>
          <button
            type="button"
            onClick={carregar}
            className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-slate-100"
            style={{ color: MUTED }}
            disabled={carregando}
          >
            {carregando ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Atualizar
          </button>
        </div>
      )}

      {/* KPIs rápidos */}
      {docs.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { rotulo: "Total de arquivos",   valor: docs.length,          cor: NAVY  },
            { rotulo: "Conferidos (C2)",      valor: conferidos,           cor: "#16a34a" },
            { rotulo: "Canais de entrada",    valor: Object.keys(origemCount).length, cor: "#0891b2" },
            { rotulo: "Pendentes / Erro",     valor: docs.filter(d => d.status === "recebido" || d.status === "erro").length, cor: "#d97706" },
          ].map((kpi) => (
            <div
              key={kpi.rotulo}
              className="concave-3d px-3 py-2.5"
            >
              <div className="text-[18px] font-black" style={{ color: kpi.cor }}>
                {kpi.valor}
              </div>
              <div className="mt-0.5 text-[9px] font-black uppercase tracking-widest" style={{ color: MUTED }}>
                {kpi.rotulo}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Estados de carga / erro / vazio */}
      {carregando ? (
        <div className="flex items-center gap-3 rounded-[8px] p-6" style={{ background: "rgba(245,240,230,0.7)" }}>
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: GOLD }} />
          <span className="text-[13px] font-semibold" style={{ color: NAVY }}>
            Carregando documentos de exame…
          </span>
        </div>
      ) : erro ? (
        <div
          className="flex items-center gap-3 rounded-[8px] border p-5"
          style={{ borderColor: "#fca5a5", background: "#fff5f5" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="text-[12px] font-bold text-red-700">{erro}</p>
            <button
              type="button"
              className="mt-1 text-[11px] underline text-red-600"
              onClick={carregar}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : docs.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-[8px] p-10 text-center"
          style={{ background: "rgba(245,240,230,0.7)", border: "1px dashed rgba(209,195,165,0.6)" }}
        >
          <FileText className="h-10 w-10 opacity-20" style={{ color: GOLD }} />
          <p className="text-[13px] font-bold uppercase tracking-widest" style={{ color: NAVY }}>
            Nenhum exame recebido
          </p>
          <p className="text-[11px]" style={{ color: MUTED }}>
            Os documentos de laudo aparecem aqui conforme são enviados pelo portal,
            importados do Drive ou recebidos pelo watcher automático.
          </p>
        </div>
      ) : (
        /* Lista de documentos */
        <div className="space-y-3">
          {/* Sumário de canais */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(origemCount).map(([origem, qtd]) => {
              const cfg = ORIGIN_CONFIG[origem] ?? ORIGIN_DEFAULT;
              return (
                <span
                  key={origem}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white"
                  style={{ background: cfg.cor }}
                >
                  <cfg.Icon className="h-2.5 w-2.5" />
                  {cfg.rotulo}: {qtd}
                </span>
              );
            })}
          </div>

          {/* Cards de documento */}
          {docs.map((doc) => (
            <DocumentoCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}
