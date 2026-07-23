// ============================================================================
// ProcedenciaDocumentosBloco — Motor Único de Procedência de Exames
// CEO Dr. Caio · 23/07/2026 — Paxter Loop: spec → build → review
//
// DESIGN INTENT (TDAH + TOC):
//   • 2 chamadas de API no mount (documentos + todos os analitos do cliente)
//   • Analitos visíveis IMEDIATAMENTE como bloquinhos bevel — zero clique extra
//   • Cada card é autossuficiente: categoria, renomeação, extração, ação
//   • Visual premium: panel-3d-sub, bevel-3d, concave-3d (Paxter design system)
//   • Hierarquia clara: status → nome → analitos → ações
//
// USADO EM:
//   • Página /procedencia-exames (menu lateral esquerdo)
//   • Aba Evolução do Cockpit (abaixo da planilha de exames)
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Bot,
  CheckCircle2, CloudDownload, ExternalLink, FileImage,
  FileText, FlaskConical, FolderOpen, FolderSync, Globe,
  Loader2, Minus, RefreshCw, Upload, Zap,
} from "lucide-react";

// ── Tokens visuais ────────────────────────────────────────────────────────────
const NAVY  = "#16294a";
const GOLD  = "#9a7b32";
const MUTED = "#647c97";
const BASE  = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

// ── Tipos ─────────────────────────────────────────────────────────────────────
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

export interface AnalyteResult {
  id: number;
  examDocumentId: number;
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

// ── Configurações ─────────────────────────────────────────────────────────────
const ORIGIN_CFG: Record<string, { label: string; cor: string; Icon: typeof Globe }> = {
  portal:          { label: "Portal do Cliente",  cor: "#1d4ed8", Icon: Globe      },
  upload:          { label: "Upload Manual",       cor: "#7c3aed", Icon: Upload     },
  "drive-import":  { label: "Drive (Importação)", cor: "#059669", Icon: FolderOpen  },
  "drive-watcher": { label: "Drive (Automático)", cor: "#0891b2", Icon: FolderSync  },
};
const ORIGIN_DEF = { label: "Origem desconhecida", cor: "#94a3b8", Icon: Globe };

const STATUS_CFG: Record<string, { label: string; cor: string; bg: string }> = {
  processando: { label: "Processando",   cor: "#0e7490", bg: "#ecfeff" },
  recebido:    { label: "Recebido",      cor: "#d97706", bg: "#fffbeb" },
  conferido_1: { label: "Conferido C1",  cor: "#2563eb", bg: "#eff6ff" },
  conferido:   { label: "Conferido ✓",   cor: "#15803d", bg: "#f0fdf4" },
  erro:        { label: "Erro",          cor: "#dc2626", bg: "#fef2f2" },
};

// Status do analito → borda e cor do bloquinho
const ANALYTE_BORDER: Record<string, string> = {
  dentro:      "#16a34a",
  acima:       "#dc2626",
  abaixo:      "#1d4ed8",
  conferencia: "#d97706",
};
const ANALYTE_BG: Record<string, string> = {
  dentro:      "rgba(22,163,74,0.06)",
  acima:       "rgba(220,38,38,0.06)",
  abaixo:      "rgba(29,78,216,0.06)",
  conferencia: "rgba(217,119,6,0.06)",
};
const ANALYTE_ICON: Record<string, { Icon: typeof Minus; cor: string }> = {
  dentro:      { Icon: CheckCircle2,  cor: "#16a34a" },
  acima:       { Icon: ArrowUp,       cor: "#dc2626" },
  abaixo:      { Icon: ArrowDown,     cor: "#1d4ed8" },
  conferencia: { Icon: AlertTriangle, cor: "#d97706" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
}

/** Extrai o nome do arquivo do caminho Drive (último segmento) */
function basename(path: string): string {
  return path.split("/").at(-1)?.trim() ?? path;
}

function driveLink(fileId: string | null): string | null {
  return fileId ? `https://drive.google.com/file/d/${fileId}/view` : null;
}

// ── Bloquinho de analito ──────────────────────────────────────────────────────
function AnalytoChip({ a }: { a: AnalyteResult }) {
  const borderCor = ANALYTE_BORDER[a.status ?? ""] ?? "#d1c5a5";
  const bgCor     = ANALYTE_BG[a.status ?? ""]     ?? "rgba(209,197,165,0.08)";
  const iCfg      = ANALYTE_ICON[a.status ?? ""];

  // Formata valor: prefere canônico, cai no bruto
  const valor = a.valueCanonical ?? a.valueRaw;
  const unidade = a.unitCanonical ?? a.unitRaw;

  return (
    <div
      title={`${a.analyteNameRaw}${valor ? ` · ${valor} ${unidade ?? ""}` : ""}${a.analyteCode ? ` (${a.analyteCode})` : ""}`}
      style={{
        borderLeft: `3px solid ${borderCor}`,
        background: bgCor,
        border: `1px solid ${borderCor}30`,
        borderLeftWidth: "3px",
        borderLeftColor: borderCor,
      }}
      className="flex items-center gap-1.5 rounded-r-[4px] px-2 py-1"
    >
      {iCfg && (
        <iCfg.Icon className="h-2.5 w-2.5 shrink-0" style={{ color: iCfg.cor }} />
      )}
      <span className="text-[10px] font-bold leading-none" style={{ color: NAVY }}>
        {a.analyteNameRaw}
      </span>
      {valor && (
        <span className="text-[10px] font-mono leading-none" style={{ color: MUTED }}>
          {valor}
          {unidade ? ` ${unidade}` : ""}
        </span>
      )}
      {a.unitConverted && (
        <span
          className="rounded px-1 text-[8px] font-black"
          style={{ background: "rgba(29,78,216,0.12)", color: "#1d4ed8" }}
        >
          conv
        </span>
      )}
    </div>
  );
}

// ── Card de um documento ──────────────────────────────────────────────────────
const PILLS_INICIAL = 12;

function DocumentoCard({
  doc,
  analitos,
}: {
  doc: DocRow;
  analitos: AnalyteResult[];
}) {
  const [verTodos, setVerTodos] = useState(false);
  const [baixando, setBaixando] = useState(false);

  const originCfg  = ORIGIN_CFG[doc.origin ?? ""] ?? ORIGIN_DEF;
  const statusCfg  = STATUS_CFG[doc.status] ?? { label: doc.status, cor: "#94a3b8", bg: "#f8fafc" };
  const dUrl       = driveLink(doc.sourcePdfDriveId);

  // Detecção de renomeação
  const nomeOrigem  = doc.sourcePath ? basename(doc.sourcePath) : null;
  const foiRenomeado = nomeOrigem && nomeOrigem !== doc.fileName;

  // Extração bem-sucedida = status conferido_1 ou conferido
  const extraidoOk = doc.status === "conferido_1" || doc.status === "conferido";

  // Tipo de exame
  const isImagem  = doc.examKind === "imagem";
  const isSangue  = doc.examKind === "lab";

  // Pills de analito
  const pillsVisiveis = verTodos ? analitos : analitos.slice(0, PILLS_INICIAL);
  const temMais       = analitos.length > PILLS_INICIAL;

  // Confiança da IA
  const confianca = doc.confidence ? Math.round(Number(doc.confidence) * 100) : null;

  // Download
  const handleBaixar = useCallback(async () => {
    if (baixando || !doc.sourcePdfDriveId) return;
    setBaixando(true);
    try {
      const r = await fetch(`${BASE}/api/exames-lab/documento/${doc.id}/arquivo`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url, download: doc.fileName,
      });
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBaixando(false);
    }
  }, [doc.id, doc.fileName, doc.sourcePdfDriveId, baixando]);

  return (
    <div
      className="panel-3d-sub overflow-hidden"
      style={{
        borderLeft: `4px solid ${isImagem ? "#1d4ed8" : isSangue ? "#dc2626" : GOLD}`,
      }}
    >
      {/* ── FAIXA DE TOPO: tipo + status + canal + confiança ─── */}
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2.5"
        style={{
          background: statusCfg.bg,
          borderBottom: `1px solid ${statusCfg.cor}22`,
        }}
      >
        {/* Categoria */}
        <span
          className="flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white"
          style={{ background: isImagem ? "#1d4ed8" : isSangue ? "#dc2626" : "#64748b" }}
        >
          {isImagem ? <FileImage className="h-3 w-3" /> : isSangue ? <FlaskConical className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
          {isImagem ? "Imagem" : isSangue ? "Sangue / Lab" : "Exame"}
        </span>

        {/* Status */}
        <span
          className="rounded-[5px] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"
          style={{ background: statusCfg.cor, color: "#fff" }}
        >
          {statusCfg.label}
        </span>

        {/* Extraído com sucesso */}
        {extraidoOk && (
          <span
            className="flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"
            style={{ background: "#166534", color: "#fff" }}
          >
            <Zap className="h-3 w-3" />
            Extraído com sucesso
          </span>
        )}

        {/* Canal de entrada */}
        <span
          className="flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white"
          style={{ background: originCfg.cor }}
        >
          <originCfg.Icon className="h-3 w-3" />
          {originCfg.label}
        </span>

        {/* IA + confiança */}
        {confianca !== null && (
          <span
            className="flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"
            style={{ background: "rgba(22,41,74,0.08)", color: NAVY }}
          >
            <Bot className="h-3 w-3" />
            IA · {confianca}%
          </span>
        )}

        {/* Contagem de analitos */}
        {analitos.length > 0 && (
          <span
            className="ml-auto rounded-[5px] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest"
            style={{ background: "rgba(154,123,50,0.14)", color: GOLD }}
          >
            {analitos.length} analito{analitos.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── CORPO DO CARD ─────────────────────────────────── */}
      <div className="px-4 py-3 space-y-3">

        {/* Nome atual do arquivo */}
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: MUTED }}>
            Arquivo
          </div>
          <div className="text-[14px] font-bold leading-snug" style={{ color: NAVY, wordBreak: "break-word" }}>
            {doc.fileName}
          </div>
        </div>

        {/* Renomeação: de → para */}
        {foiRenomeado && (
          <div
            className="concave-3d flex flex-wrap items-center gap-2 px-3 py-2"
          >
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: MUTED }}>
              Nome original
            </span>
            <span className="text-[11px] font-semibold" style={{ color: "#4a5d75" }}>
              {nomeOrigem}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0" style={{ color: GOLD }} />
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: MUTED }}>
              Renomeado para
            </span>
            <span className="text-[11px] font-bold" style={{ color: NAVY }}>
              {doc.fileName}
            </span>
          </div>
        )}

        {/* Meta: lab · coleta · entrada */}
        <div className="flex flex-wrap gap-4 text-[11px]" style={{ color: MUTED }}>
          {doc.labName && (
            <span>
              <span className="font-black uppercase tracking-widest">Laboratório:</span>{" "}
              <span style={{ color: NAVY, fontWeight: 600 }}>{doc.labName}</span>
            </span>
          )}
          {doc.collectionDate && (
            <span>
              <span className="font-black uppercase tracking-widest">Coleta:</span>{" "}
              <span style={{ color: NAVY, fontWeight: 600 }}>{fmtData(doc.collectionDate)}</span>
            </span>
          )}
          <span>
            <span className="font-black uppercase tracking-widest">Recebido em:</span>{" "}
            <span style={{ color: NAVY, fontWeight: 600 }}>{fmtDataHora(doc.createdAt)}</span>
          </span>
          {doc.sourcePath && (
            <span className="w-full">
              <span className="font-black uppercase tracking-widest">Caminho Drive:</span>{" "}
              <span style={{ color: "#4a5d75" }}>{doc.sourcePath}</span>
            </span>
          )}
        </div>

        {/* ── BLOQUINHOS DE ANALITOS ─────────────────────── */}
        {analitos.length > 0 && (
          <div>
            <div
              className="mb-2 text-[9px] font-black uppercase tracking-[0.22em]"
              style={{ color: NAVY }}
            >
              Analitos extraídos
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pillsVisiveis.map((a) => (
                <AnalytoChip key={a.id} a={a} />
              ))}
              {temMais && !verTodos && (
                <button
                  type="button"
                  onClick={() => setVerTodos(true)}
                  className="flex items-center gap-1 rounded-[4px] px-2 py-1 text-[10px] font-black uppercase tracking-widest transition-colors hover:opacity-80"
                  style={{ background: "rgba(154,123,50,0.13)", color: GOLD, border: `1px solid rgba(154,123,50,0.25)` }}
                >
                  +{analitos.length - PILLS_INICIAL} mais
                </button>
              )}
              {verTodos && temMais && (
                <button
                  type="button"
                  onClick={() => setVerTodos(false)}
                  className="flex items-center gap-1 rounded-[4px] px-2 py-1 text-[10px] font-black uppercase tracking-widest transition-colors hover:opacity-80"
                  style={{ background: "rgba(100,124,151,0.10)", color: MUTED, border: `1px solid rgba(100,124,151,0.20)` }}
                >
                  Mostrar menos
                </button>
              )}
            </div>
          </div>
        )}

        {analitos.length === 0 && doc.status !== "processando" && (
          <div
            className="concave-3d px-3 py-2 text-[11px]"
            style={{ color: MUTED }}
          >
            Nenhum analito extraído neste documento.
          </div>
        )}

        {/* ── CONFERÊNCIA ───────────────────────────────── */}
        {(doc.conf1Name || doc.conf2Name) && (
          <div className="flex flex-wrap gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest self-center" style={{ color: MUTED }}>
              Conferências:
            </span>
            {doc.conf1Name && (
              <span
                className="flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[10px]"
                style={{ background: "rgba(37,99,235,0.07)", border: "1px solid rgba(37,99,235,0.18)", color: "#1d4ed8" }}
              >
                C1 · <strong>{doc.conf1Name}</strong>
                {doc.conf1Cargo ? ` (${doc.conf1Cargo})` : ""}
                {doc.conf1At ? ` — ${fmtDataHora(doc.conf1At)}` : ""}
              </span>
            )}
            {doc.conf2Name && (
              <span
                className="flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[10px]"
                style={{ background: "rgba(22,163,74,0.07)", border: "1px solid rgba(22,163,74,0.18)", color: "#15803d" }}
              >
                C2 · <strong>{doc.conf2Name}</strong>
                {doc.conf2Cargo ? ` (${doc.conf2Cargo})` : ""}
                {doc.conf2At ? ` — ${fmtDataHora(doc.conf2At)}` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── BARRA DE AÇÕES ────────────────────────────────── */}
      <div
        className="flex items-center gap-2 border-t px-4 py-3"
        style={{ borderColor: "rgba(209,195,165,0.4)", background: "rgba(245,240,230,0.6)" }}
      >
        {dUrl ? (
          <a
            href={dUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bevel-3d flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white no-underline transition-opacity hover:opacity-90"
            style={{ background: "#16a34a" }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir no Drive
          </a>
        ) : (
          <span
            className="flex cursor-not-allowed items-center gap-2 rounded-[6px] px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white opacity-35"
            style={{ background: "#94a3b8" }}
            title="Arquivo não vinculado ao Drive"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir no Drive
          </span>
        )}

        <button
          type="button"
          onClick={handleBaixar}
          disabled={baixando || !doc.sourcePdfDriveId}
          className="bevel-3d flex items-center gap-2 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
          style={{ background: NAVY }}
        >
          {baixando
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <CloudDownload className="h-3.5 w-3.5" />}
          {baixando ? "Baixando…" : "Baixar arquivo"}
        </button>

        {/* Indicador de paciente (útil quando o bloco mostra sem clientName no contexto) */}
        {doc.clientName && (
          <span className="ml-auto text-[10px] font-semibold" style={{ color: MUTED }}>
            {doc.clientName}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Componente principal exportado ────────────────────────────────────────────
interface Props {
  clientId: number;
  comCabecalho?: boolean;
}

export default function ProcedenciaDocumentosBloco({ clientId, comCabecalho = false }: Props) {
  const [docs, setDocs]               = useState<DocRow[]>([]);
  const [analitos, setAnalitos]       = useState<AnalyteResult[]>([]);
  const [carregando, setCarregando]   = useState(true);
  const [erro, setErro]               = useState("");
  const abortRef                      = useRef<AbortController | null>(null);

  const carregar = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCarregando(true);
    setErro("");

    // 2 chamadas paralelas: documentos + todos analitos do cliente
    Promise.all([
      fetch(`${BASE}/api/exames-lab/documentos?clientId=${clientId}`, { signal: ctrl.signal })
        .then((r) => { if (!r.ok) throw new Error(`docs HTTP ${r.status}`); return r.json() as Promise<DocRow[]>; }),
      fetch(`${BASE}/api/exames-lab/resultados?clientId=${clientId}`, { signal: ctrl.signal })
        .then((r) => { if (!r.ok) throw new Error(`results HTTP ${r.status}`); return r.json() as Promise<AnalyteResult[]>; }),
    ])
      .then(([d, a]) => { setDocs(d); setAnalitos(a); })
      .catch((e: Error) => { if (e.name !== "AbortError") setErro("Não foi possível carregar os documentos."); })
      .finally(() => setCarregando(false));
  }, [clientId]);

  useEffect(() => {
    void carregar();
    return () => abortRef.current?.abort();
  }, [carregar]);

  // Agrupamento de analitos por documento
  const analitosPorDoc = new Map<number, AnalyteResult[]>();
  for (const a of analitos) {
    const lista = analitosPorDoc.get(a.examDocumentId) ?? [];
    lista.push(a);
    analitosPorDoc.set(a.examDocumentId, lista);
  }

  // KPIs
  const conferidos  = docs.filter((d) => d.status === "conferido").length;
  const comErro     = docs.filter((d) => d.status === "erro").length;
  const canais      = new Set(docs.map((d) => d.origin ?? "?")).size;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Cabeçalho opcional com botão de atualizar */}
      {comCabecalho && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.28em]" style={{ color: NAVY }}>
            Documentos de exame recebidos
          </span>
          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-slate-100 disabled:opacity-50"
            style={{ color: MUTED }}
          >
            {carregando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Atualizar
          </button>
        </div>
      )}

      {/* Estado: carregando */}
      {carregando && (
        <div
          className="flex items-center gap-3 rounded-[8px] px-5 py-6"
          style={{ background: "rgba(245,240,230,0.7)", border: "1px dashed rgba(209,195,165,0.5)" }}
        >
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: GOLD }} />
          <span className="text-[13px] font-semibold" style={{ color: NAVY }}>
            Carregando documentos e analitos…
          </span>
        </div>
      )}

      {/* Estado: erro */}
      {!carregando && erro && (
        <div
          className="flex items-center gap-3 rounded-[8px] border p-5"
          style={{ borderColor: "#fca5a5", background: "#fff5f5" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <div>
            <p className="text-[12px] font-bold text-red-700">{erro}</p>
            <button type="button" className="mt-1 text-[11px] underline text-red-600" onClick={carregar}>
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Estado: vazio */}
      {!carregando && !erro && docs.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-[8px] py-12 text-center"
          style={{ background: "rgba(245,240,230,0.7)", border: "1px dashed rgba(209,195,165,0.6)" }}
        >
          <FileText className="h-10 w-10 opacity-20" style={{ color: GOLD }} />
          <p className="text-[13px] font-black uppercase tracking-widest" style={{ color: NAVY }}>
            Nenhum exame recebido
          </p>
          <p className="text-[11px] max-w-xs" style={{ color: MUTED }}>
            Os laudos aparecem aqui conforme enviados pelo portal, importados do Drive
            ou captados pelo watcher automático.
          </p>
        </div>
      )}

      {/* KPIs + lista de cards */}
      {!carregando && !erro && docs.length > 0 && (
        <>
          {/* KPIs rápidos */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total de laudos",   valor: docs.length,          cor: NAVY        },
              { label: "Conferidos (C2)",    valor: conferidos,           cor: "#15803d"   },
              { label: "Canais de entrada",  valor: canais,               cor: "#0891b2"   },
              { label: "Com erro / Alerta",  valor: comErro,              cor: "#d97706"   },
            ].map((k) => (
              <div key={k.label} className="concave-3d px-3 py-3">
                <div className="text-[22px] font-black leading-none" style={{ color: k.cor }}>
                  {k.valor}
                </div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-widest" style={{ color: MUTED }}>
                  {k.label}
                </div>
              </div>
            ))}
          </div>

          {/* Sumário de canais */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(
              docs.reduce<Record<string, number>>((acc, d) => {
                const k = d.origin ?? "desconhecida";
                acc[k] = (acc[k] ?? 0) + 1;
                return acc;
              }, {})
            ).map(([origem, qtd]) => {
              const cfg = ORIGIN_CFG[origem] ?? ORIGIN_DEF;
              return (
                <span
                  key={origem}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white"
                  style={{ background: cfg.cor }}
                >
                  <cfg.Icon className="h-2.5 w-2.5" />
                  {cfg.label}: {qtd}
                </span>
              );
            })}
          </div>

          {/* Cards de documento */}
          <div className="space-y-3">
            {docs.map((doc) => (
              <DocumentoCard
                key={doc.id}
                doc={doc}
                analitos={analitosPorDoc.get(doc.id) ?? []}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
