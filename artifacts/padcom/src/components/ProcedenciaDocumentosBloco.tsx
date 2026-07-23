// ============================================================================
// ProcedenciaDocumentosBloco — Motor Único de Procedência de Exames
// REESCRITO seguindo skill-layout-paxter (Paxter Loop · 23/07/2026)
//
// DESIGN: panel-3d-sub + bevel-3d (saliente) + concave-3d (afundado) + btn-3d
// Grade imaginária: 4 zonas por card com linhas verticais fixas
// Calhas (canais): LED indicator por origem (verde=paciente, âmbar=auto, etc.)
// Analitos: grid de colunas FIXAS (não flex-wrap aleatório)
// Cores de chrome: APENAS navy/ouro. Status: verde/vermelho/azul/âmbar.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Bot,
  CheckCircle2, CloudDownload, ExternalLink, FileImage,
  FileText, FlaskConical, FolderOpen, FolderSync, Globe,
  Loader2, MapPin, RefreshCw, Upload, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Tokens ────────────────────────────────────────────────────────────────────
const NAVY  = "#16284a";
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
  /** Dados do watcher: nome original do arquivo no Drive antes da renomeação */
  originalName: string | null;
  /** Nome canônico após renomeação automática (ex: 26.07.23 EXAME SANGUE ...) */
  renamedTo: string | null;
  /** ID do arquivo copiado com nome canônico na mesma pasta do Drive */
  copiedDriveId: string | null;
  /** Nome do arquivo copiado */
  copiedName: string | null;
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
  /** Resultado extraído do histórico interno do laudo (coleta anterior impressa no PDF) */
  isHistory?: boolean;
}

// ── Calhas (canais de entrada) ─────────────────────────────────────────────────
// LED verde = direto do paciente / ativo em tempo real
// LED âmbar = automático / watcher / importação
const CALHA_CFG: Record<string, {
  label: string;
  sublabel: string;
  led: string;       // classe LED paxter
  Icon: typeof Globe;
}> = {
  portal: {
    label: "Calha Paciente",
    sublabel: "Portal do cliente",
    led: "paxter-led paxter-led-breathe paxter-led-green",
    Icon: Globe,
  },
  upload: {
    label: "Upload Clínica",
    sublabel: "Enviado pela equipe",
    led: "paxter-led paxter-led-breathe paxter-led-amber",
    Icon: Upload,
  },
  "drive-import": {
    label: "Importação Drive",
    sublabel: "Importado em massa",
    led: "paxter-led paxter-led-breathe paxter-led-amber",
    Icon: FolderOpen,
  },
  "drive-watcher": {
    label: "Calha Drive · Auto",
    sublabel: "Watcher automático",
    led: "paxter-led paxter-led-breathe paxter-led-amber",
    Icon: FolderSync,
  },
};
const CALHA_DEFAULT = {
  label: "Origem desconhecida",
  sublabel: "—",
  led: "paxter-led paxter-led-breathe",
  Icon: Globe,
};

// Tipo de exame → faixa lateral e ícone
const KIND_CFG: Record<string, { label: string; cor: string; Icon: typeof FileText }> = {
  lab:    { label: "Sangue / Lab", cor: "#b91c1c", Icon: FlaskConical },
  imagem: { label: "Imagem",       cor: "#1d4ed8", Icon: FileImage    },
};
const KIND_DEFAULT = { label: "Exame", cor: GOLD, Icon: FileText };

// Status do documento
const DOC_STATUS: Record<string, { label: string; cor: string }> = {
  processando: { label: "Processando",   cor: "#0e7490" },
  recebido:    { label: "Recebido",      cor: "#d97706" },
  conferido_1: { label: "Conf. C1",      cor: "#2563eb" },
  conferido:   { label: "Conferido",     cor: "#15803d" },
  erro:        { label: "Erro",          cor: "#dc2626" },
};

// Status do analito → cor + ícone
const ANALYTE_STATUS: Record<string, { cor: string; Icon: typeof CheckCircle2 }> = {
  dentro:      { cor: "#15803d", Icon: CheckCircle2  },
  acima:       { cor: "#dc2626", Icon: ArrowUp       },
  abaixo:      { cor: "#1d4ed8", Icon: ArrowDown     },
  conferencia: { cor: "#d97706", Icon: AlertTriangle },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
}
function basename(path: string): string {
  return path.split("/").at(-1)?.trim() ?? path;
}
function driveLink(id: string | null): string | null {
  return id ? `https://drive.google.com/file/d/${id}/view` : null;
}

// ── Linha de analito (grade fixa: 6 colunas) ─────────────────────────────────
// Col 1: Nome + badge Histórico + data de coleta
// Col 2: Valor
// Col 3: Un. Lab (extraída do laudo)
// Col 4: Un. Canônica (padrão do sistema)
// Col 5: Conversão (↔ se convertida, ✓ se igual, — se sem canônica)
// Col 6: Status
const GRID_COLS = "1.6fr 68px 58px 62px 32px 80px";

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  // iso pode ser YYYY-MM-DD ou DD/MM/YY
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }
  return iso;
}

function AnalytoRow({ a, last }: { a: AnalyteResult; last: boolean }) {
  const stCfg    = ANALYTE_STATUS[a.status ?? ""];
  const valor    = a.valueCanonical ?? a.valueRaw ?? "—";
  const unLab    = a.unitRaw ?? "—";
  const unCanon  = a.unitCanonical ?? null;

  // Ícone de conversão
  let convIcon = "—";
  let convColor = MUTED;
  if (unCanon) {
    if (a.unitConverted) {
      convIcon = "↔"; convColor = "#1d4ed8";
    } else {
      convIcon = "✓"; convColor = "#15803d";
    }
  }

  return (
    <div
      className={`grid items-start gap-x-2 px-3 py-1.5 ${last ? "" : "border-b"}`}
      style={{ gridTemplateColumns: GRID_COLS, borderColor: "rgba(209,195,165,0.25)" }}
    >
      {/* Col 1 — Nome + badge + data */}
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-semibold leading-tight" style={{ color: NAVY }}>
          {a.analyteNameRaw}
          {a.analyteCode && (
            <span className="ml-1 text-[9px] font-black uppercase tracking-widest" style={{ color: MUTED }}>
              {a.analyteCode}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1 mt-0.5">
          {a.isHistory && (
            <span
              className="inline-block rounded-[3px] px-1 py-px text-[7px] font-black uppercase tracking-widest leading-none"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24" }}
            >
              Histórico
            </span>
          )}
          {a.collectionDate && (
            <span className="text-[8px]" style={{ color: MUTED }}>
              {fmtDateShort(a.collectionDate)}
            </span>
          )}
        </span>
      </span>

      {/* Col 2 — Valor (canônico se convertido, raw caso contrário) */}
      <span className="text-right leading-tight pt-0.5 min-w-0">
        <span className="block text-[11px] font-mono font-bold tabular-nums" style={{ color: valor === "—" ? MUTED : NAVY }}>
          {valor}
        </span>
        {/* Sub-linha: valor original quando houve conversão */}
        {a.unitConverted && a.valueRaw && a.valueRaw !== valor && (
          <span
            className="block text-right text-[8px] tabular-nums"
            style={{ color: "#1d4ed8" }}
            title="Valor original do laudo antes da conversão"
          >
            orig: {a.valueRaw}
          </span>
        )}
      </span>

      {/* Col 3 — Un. Lab (extraída do laudo, unidade original) */}
      <span className="text-[9px] leading-tight pt-0.5 min-w-0">
        <span className="block" style={{ color: a.unitConverted ? "#1d4ed8" : MUTED }}>
          {unLab}
        </span>
      </span>

      {/* Col 4 — Un. Canônica (padrão do sistema) */}
      <span className="text-[9px] font-semibold leading-tight pt-0.5 min-w-0">
        <span className="block" style={{ color: unCanon ? NAVY : MUTED }}>
          {unCanon ?? "—"}
        </span>
      </span>

      {/* Col 5 — Ícone de conversão */}
      <span
        className="text-center text-[12px] font-black leading-tight pt-0.5"
        style={{ color: convColor }}
        title={
          a.unitConverted
            ? `Convertido: ${a.unitRaw ?? "?"} → ${a.unitCanonical ?? "?"}`
            : unCanon
              ? "Unidade já canônica"
              : "Sem conversão catalogada"
        }
      >
        {convIcon}
      </span>

      {/* Col 6 — Status */}
      <span className="flex items-center gap-1 pt-0.5">
        {stCfg ? (
          <>
            <stCfg.Icon className="h-3 w-3 shrink-0" style={{ color: stCfg.cor }} />
            <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: stCfg.cor }}>
              {a.status}
            </span>
          </>
        ) : (
          <span className="text-[9px]" style={{ color: MUTED }}>—</span>
        )}
      </span>
    </div>
  );
}

// ── Card de documento ─────────────────────────────────────────────────────────
// Segue grade-imaginaria.md: 5 zonas com linhas-guia fixas
const MAX_ROWS = 10;

function DocumentoCard({ doc, analitos, onRefresh }: { doc: DocRow; analitos: AnalyteResult[]; onRefresh: () => void }) {
  const [verTodos, setVerTodos] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [reextrai, setReextrai] = useState(false);
  const [reextraiMsg, setReextraiMsg] = useState("");

  // Clone retroativo no Drive
  const [clonando, setClonando] = useState(false);
  const [cloneResultId, setCloneResultId] = useState<string | null>(doc.copiedDriveId ?? null);

  // Lab name editável (corrige quando a IA não reconheceu o laboratório)
  const [labEditando, setLabEditando] = useState(false);
  const [labValor, setLabValor] = useState(doc.labName ?? "");
  const [labSalvando, setLabSalvando] = useState(false);

  async function handleClonarDrive() {
    setClonando(true);
    try {
      const r = await fetch(`/api/exames-lab/documento/${doc.id}/clonar-drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json();
      if (r.ok && j.copiedDriveId) {
        setCloneResultId(j.copiedDriveId);
      } else if (r.status === 409 && j.copiedDriveId) {
        // Clone já existia — mostrar link
        setCloneResultId(j.copiedDriveId);
      } else {
        alert(`Erro ao clonar: ${j.error ?? r.status}`);
      }
    } catch (e) {
      alert(`Erro de rede: ${String(e)}`);
    } finally {
      setClonando(false);
    }
  }

  const calha     = CALHA_CFG[doc.origin ?? ""] ?? CALHA_DEFAULT;
  const kindCfg   = KIND_CFG[doc.examKind ?? ""] ?? KIND_DEFAULT;
  const statusCfg = DOC_STATUS[doc.status] ?? { label: doc.status, cor: "#94a3b8" };
  const dUrl      = driveLink(doc.sourcePdfDriveId);

  // Proveniência: prioridade watcher > sourcePath > fileName
  const nomeOrig  = doc.originalName ?? (doc.sourcePath ? basename(doc.sourcePath) : null) ?? doc.fileName;
  const nomeRen   = doc.renamedTo ?? doc.fileName;
  // cloneResultId é estado local — atualiza ao clicar "Clonar no Drive"
  const cloneUrl  = cloneResultId ? driveLink(cloneResultId) : null;

  // Extração OK
  const extraidoOk = doc.status === "conferido_1" || doc.status === "conferido";

  // Confiança
  const confianca  = doc.confidence ? Math.round(Number(doc.confidence) * 100) : null;

  // Analitos a mostrar
  const linhasVis  = verTodos ? analitos : analitos.slice(0, MAX_ROWS);
  const temMais    = analitos.length > MAX_ROWS;

  const handleBaixar = useCallback(async () => {
    if (baixando || !doc.sourcePdfDriveId) return;
    setBaixando(true);
    try {
      const r = await fetch(`${BASE}/api/exames-lab/documento/${doc.id}/arquivo`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: doc.fileName }).click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Falha ao baixar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBaixando(false);
    }
  }, [doc.id, doc.fileName, doc.sourcePdfDriveId, baixando]);

  const handleSalvarLab = useCallback(async () => {
    setLabSalvando(true);
    try {
      const r = await fetch(`${BASE}/api/exames-lab/documento/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labName: labValor.trim() || null }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLabEditando(false);
      onRefresh();
    } catch (e) {
      alert(`Falha ao salvar laboratório: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLabSalvando(false);
    }
  }, [doc.id, labValor, onRefresh]);

  const handleReextrair = useCallback(async (onDone: () => void) => {
    if (reextrai || !doc.sourcePdfDriveId) return;
    setReextrai(true);
    setReextraiMsg("Enviando PDF ao Gemini — pode levar 30–90s…");
    try {
      const r = await fetch(`${BASE}/api/exames-lab/documento/${doc.id}/reextrair`, { method: "POST" });
      const json = await r.json() as { ok?: boolean; analytes?: number; error?: string; modelUsed?: string };
      if (!r.ok) throw new Error(json.error ?? `HTTP ${r.status}`);
      setReextraiMsg(`Extração concluída — ${json.analytes ?? 0} analito(s) encontrado(s) via ${json.modelUsed ?? "Gemini"}`);
      setTimeout(() => { onDone(); setReextraiMsg(""); }, 1500);
    } catch (e) {
      setReextraiMsg(`Falha: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setReextrai(false);
    }
  }, [doc.id, doc.sourcePdfDriveId, reextrai]);

  return (
    <div
      className="panel-3d-sub overflow-hidden"
      style={{ borderLeft: `4px solid ${kindCfg.cor}` }}
    >

      {/* ── ZONA 1: TOP BAR — calha + status ───────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(209,195,165,0.4)" }}
      >
        {/* Calha — LED + label */}
        <span className="flex items-center gap-2">
          <span className={calha.led} />
          <span className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: NAVY }}>
            {calha.label}
          </span>
          <span className="text-[9px]" style={{ color: MUTED }}>
            · {calha.sublabel}
          </span>
        </span>

        {/* Separador */}
        <span className="h-4 w-px" style={{ background: "rgba(209,195,165,0.5)" }} />

        {/* Tipo de exame — bevel saliente */}
        <span className="bevel-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px]">
          <kindCfg.Icon className="h-3 w-3" style={{ color: kindCfg.cor }} />
          {kindCfg.label}
        </span>

        {/* Status — concave afundado */}
        <span
          className="concave-3d ml-auto inline-flex items-center px-2.5 py-1 text-[9px] font-black uppercase tracking-widest"
          style={{ color: statusCfg.cor }}
        >
          {statusCfg.label}
        </span>

        {/* Extraído com sucesso */}
        {extraidoOk && (
          <span className="bevel-3d-ok inline-flex items-center gap-1 px-2.5 py-1 text-[9px]">
            <Zap className="h-2.5 w-2.5" />
            Extraído com sucesso
          </span>
        )}
      </div>

      {/* ── ZONA 2: TÍTULO + RENOMEAÇÃO ──────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-start gap-2">
          <kindCfg.Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: kindCfg.cor }} />
          <p className="text-[13px] font-bold leading-snug" style={{ color: NAVY, wordBreak: "break-word" }}>
            {doc.fileName}
          </p>
          {confianca !== null && (
            <span
              className="concave-3d ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
              style={{ color: MUTED }}
            >
              <Bot className="h-2.5 w-2.5" />
              {confianca}%
            </span>
          )}
        </div>

        {/* ── ZONA 2: PROVENIÊNCIA — 3 insert-bevels separados ── */}
        {/* Padrão: valor dentro do bevel + label/subtítulo ABAIXO do bevel    */}
        <div className="grid grid-cols-3 gap-3 mx-4 mb-4">

          {/* Bevel 1 — Nome de importação (original do Drive) */}
          <div className="flex flex-col gap-1">
            <div
              className="concave-3d flex items-center px-3 py-2.5 min-h-[42px]"
              title={nomeOrig || "—"}
            >
              <span
                className="line-clamp-2 text-[10px] leading-snug"
                style={{ color: nomeOrig ? "#4a5d75" : MUTED }}
              >
                {nomeOrig || "—"}
              </span>
            </div>
            <span
              className="text-center text-[8px] font-black uppercase tracking-[0.2em]"
              style={{ color: MUTED }}
            >
              Nome de importação
            </span>
          </div>

          {/* Bevel 2 — Renomeado para (nome canônico PAXTER) */}
          <div className="flex flex-col gap-1">
            <div
              className="concave-3d flex items-center px-3 py-2.5 min-h-[42px]"
              title={nomeRen || "—"}
            >
              <span
                className="line-clamp-2 text-[10px] font-bold leading-snug"
                style={{ color: nomeRen !== nomeOrig ? NAVY : MUTED }}
              >
                {nomeRen || "—"}
              </span>
            </div>
            <span
              className="text-center text-[8px] font-black uppercase tracking-[0.2em]"
              style={{ color: MUTED }}
            >
              Renomeado para
            </span>
          </div>

          {/* Bevel 3 — Clone no Drive (link se existir, botão se não) */}
          <div className="flex flex-col gap-1">
            <div className="concave-3d flex items-center justify-center px-2 py-2.5 min-h-[42px]">
              {cloneUrl ? (
                <a
                  href={cloneUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold no-underline line-clamp-2"
                  style={{ color: "#15803d" }}
                >
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  {doc.copiedName ?? "clonado"}
                </a>
              ) : doc.sourcePdfDriveId ? (
                <button
                  onClick={handleClonarDrive}
                  disabled={clonando}
                  className="btn-3d-soft inline-flex items-center gap-1 px-2 py-1 text-[9px] font-black uppercase tracking-widest disabled:opacity-60"
                  style={{ color: NAVY }}
                >
                  {clonando ? (
                    <span className="animate-spin text-[11px]">⟳</span>
                  ) : (
                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {clonando ? "Clonando…" : "Clonar"}
                </button>
              ) : (
                <span className="text-[10px]" style={{ color: MUTED }}>
                  Sem fonte
                </span>
              )}
            </div>
            <span
              className="text-center text-[8px] font-black uppercase tracking-[0.2em]"
              style={{ color: MUTED }}
            >
              Clone no Drive
            </span>
          </div>

        </div>
      </div>

      {/* ── ZONA 3: META GRID (grid-cols-3 fixo) ─────────────────────────────── */}
      <div
        className="grid grid-cols-3 gap-0 border-t border-b mx-4 mb-3"
        style={{ borderColor: "rgba(209,195,165,0.35)" }}
      >
        {/* Célula 1 — Laboratório (editável quando IA não detectou) */}
        <div className="px-3 py-2 border-r" style={{ borderColor: "rgba(209,195,165,0.35)" }}>
          <div className="text-[8px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: MUTED }}>
            Laboratório
          </div>
          {labEditando ? (
            <div className="flex items-center gap-1 mt-0.5">
              <input
                type="text"
                value={labValor}
                onChange={(e) => setLabValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSalvarLab();
                  if (e.key === "Escape") setLabEditando(false);
                }}
                autoFocus
                className="concave-3d min-w-0 flex-1 px-1.5 py-0.5 text-[11px] font-bold outline-none"
                style={{ color: NAVY }}
                placeholder="Nome do laboratório"
              />
              <Button
                size="sm"
                className="btn-3d-soft h-5 px-1.5 text-[9px] font-black"
                onClick={() => void handleSalvarLab()}
                disabled={labSalvando}
              >
                OK
              </Button>
              <button
                type="button"
                className="px-1 text-[10px]"
                style={{ color: MUTED }}
                onClick={() => setLabEditando(false)}
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              className="group flex cursor-pointer items-center gap-1"
              title="Clique para corrigir o nome do laboratório"
              onClick={() => setLabEditando(true)}
            >
              <span className="text-[11px] font-bold" style={{ color: labValor || doc.labName ? NAVY : MUTED }}>
                {labValor || doc.labName || "—"}
              </span>
              <span
                className="text-[9px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: GOLD }}
              >
                ✎
              </span>
            </div>
          )}
        </div>

        {/* Célula 2 — Data de coleta */}
        <div className="px-3 py-2 border-r" style={{ borderColor: "rgba(209,195,165,0.35)" }}>
          <div className="text-[8px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: MUTED }}>
            Data de coleta
          </div>
          <div className="text-[11px] font-bold" style={{ color: NAVY }}>
            {fmtData(doc.collectionDate)}
          </div>
        </div>

        {/* Célula 3 — Entrada no sistema */}
        <div className="px-3 py-2">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: MUTED }}>
            Entrada no sistema
          </div>
          <div className="text-[11px] font-bold" style={{ color: NAVY }}>
            {fmtHora(doc.createdAt)}
          </div>
        </div>
      </div>

      {/* ── ZONA 4: ANALITOS ─────────────────────────────────────────────────── */}
      {analitos.length > 0 && (
        <div className="mx-4 mb-3">
          {/* Header da grade — 6 colunas */}
          <div
            className="grid border-b px-3 py-1"
            style={{ gridTemplateColumns: GRID_COLS, borderColor: "rgba(209,195,165,0.4)" }}
          >
            {["Analito extraído · data", "Valor", "Un. Lab", "Un. Canônica", "↔", "Status"].map((h) => (
              <span key={h} className="text-[8px] font-black uppercase tracking-[0.15em]" style={{ color: MUTED }}>
                {h}
              </span>
            ))}
          </div>

          {/* Linhas de analito */}
          <div className="concave-3d">
            {linhasVis.map((a, idx) => (
              <AnalytoRow key={a.id} a={a} last={idx === linhasVis.length - 1} />
            ))}
          </div>

          {/* Ver mais / menos */}
          {temMais && (
            <Button
              type="button"
              onClick={() => setVerTodos((v) => !v)}
              className="btn-3d-soft mt-2 w-full py-1.5 text-[10px] font-black uppercase tracking-widest"
            >
              {verTodos
                ? `Mostrar menos`
                : `Ver todos (${analitos.length - MAX_ROWS} analitos restantes)`}
            </Button>
          )}
        </div>
      )}

      {analitos.length === 0 && doc.status !== "processando" && (
        <div className="mx-4 mb-3 space-y-2">
          <div className="concave-3d px-3 py-2 text-[11px]" style={{ color: MUTED }}>
            Nenhum analito extraído neste documento.
          </div>
          {doc.sourcePdfDriveId && (
            <div className="space-y-1.5">
              <Button
                className="btn-3d-soft w-full inline-flex items-center justify-center gap-2 text-[11px]"
                onClick={() => void handleReextrair(onRefresh)}
                disabled={reextrai}
              >
                {reextrai
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Zap className="h-3.5 w-3.5" />}
                {reextrai ? "Processando…" : "Re-extrair com IA (Gemini Vision)"}
              </Button>
              {reextraiMsg && (
                <div
                  className="concave-3d px-3 py-1.5 text-[10px] font-semibold text-center"
                  style={{ color: reextraiMsg.startsWith("Falha") ? "#dc2626" : "#15803d" }}
                >
                  {reextraiMsg}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Conferência C1/C2 */}
      {(doc.conf1Name || doc.conf2Name) && (
        <div className="mx-4 mb-3 flex flex-wrap gap-2">
          {doc.conf1Name && (
            <span
              className="concave-3d px-2.5 py-1 text-[9px]"
              style={{ color: "#1d4ed8" }}
            >
              C1 · {doc.conf1Name}{doc.conf1Cargo ? ` (${doc.conf1Cargo})` : ""}
              {doc.conf1At ? ` — ${fmtHora(doc.conf1At)}` : ""}
            </span>
          )}
          {doc.conf2Name && (
            <span
              className="concave-3d px-2.5 py-1 text-[9px]"
              style={{ color: "#15803d" }}
            >
              C2 · {doc.conf2Name}{doc.conf2Cargo ? ` (${doc.conf2Cargo})` : ""}
              {doc.conf2At ? ` — ${fmtHora(doc.conf2At)}` : ""}
            </span>
          )}
        </div>
      )}

      {/* ── ZONA 5: AÇÕES ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 border-t px-4 py-3"
        style={{ borderColor: "rgba(209,195,165,0.4)" }}
      >
        {dUrl ? (
          <Button asChild className="btn-3d">
            <a href={dUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 no-underline">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir no Drive
            </a>
          </Button>
        ) : (
          <Button className="btn-3d opacity-40 cursor-not-allowed" disabled>
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir no Drive
          </Button>
        )}

        <Button
          className="btn-3d-soft inline-flex items-center gap-2"
          onClick={handleBaixar}
          disabled={baixando || !doc.sourcePdfDriveId}
        >
          {baixando
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <CloudDownload className="h-3.5 w-3.5" />}
          {baixando ? "Baixando…" : "Baixar arquivo"}
        </Button>

        {doc.sourcePath && (
          <span className="ml-auto text-[9px]" style={{ color: MUTED }}>
            Drive: {doc.sourcePath}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
interface Props {
  clientId: number;
  comCabecalho?: boolean;
}

export default function ProcedenciaDocumentosBloco({ clientId, comCabecalho = false }: Props) {
  const [docs, setDocs]           = useState<DocRow[]>([]);
  const [analitos, setAnalitos]   = useState<AnalyteResult[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]           = useState("");
  const abortRef                  = useRef<AbortController | null>(null);

  const carregar = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setCarregando(true);
    setErro("");

    Promise.all([
      fetch(`${BASE}/api/exames-lab/documentos?clientId=${clientId}`, { signal: ctrl.signal })
        .then((r) => { if (!r.ok) throw new Error(`docs ${r.status}`); return r.json() as Promise<DocRow[]>; }),
      fetch(`${BASE}/api/exames-lab/resultados?clientId=${clientId}`, { signal: ctrl.signal })
        .then((r) => { if (!r.ok) throw new Error(`results ${r.status}`); return r.json() as Promise<AnalyteResult[]>; }),
    ])
      .then(([d, a]) => { setDocs(d); setAnalitos(a); })
      .catch((e: Error) => { if (e.name !== "AbortError") setErro("Não foi possível carregar os documentos."); })
      .finally(() => setCarregando(false));
  }, [clientId]);

  useEffect(() => {
    void carregar();
    return () => abortRef.current?.abort();
  }, [carregar]);

  // Agrupa analitos por documento
  const porDoc = new Map<number, AnalyteResult[]>();
  for (const a of analitos) {
    const arr = porDoc.get(a.examDocumentId) ?? [];
    arr.push(a);
    porDoc.set(a.examDocumentId, arr);
  }

  // KPIs
  const conferidos = docs.filter((d) => d.status === "conferido").length;
  const erros      = docs.filter((d) => d.status === "erro").length;
  const canais     = new Set(docs.map((d) => d.origin ?? "?")).size;

  return (
    <div className="space-y-4">

      {/* Cabeçalho (opcional) com bevel-3d — NÃO dark gradient */}
      {comCabecalho && (
        <div className="flex items-center justify-between">
          <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px]">
            <MapPin className="h-3.5 w-3.5" />
            Laudos recebidos
          </span>
          <Button
            className="btn-3d-soft inline-flex items-center gap-1.5 text-[10px]"
            onClick={carregar}
            disabled={carregando}
          >
            {carregando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Atualizar
          </Button>
        </div>
      )}

      {/* Carregando */}
      {carregando && (
        <div className="concave-3d flex items-center gap-3 p-5">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: GOLD }} />
          <span className="text-[12px] font-semibold" style={{ color: NAVY }}>
            Carregando documentos e analitos…
          </span>
        </div>
      )}

      {/* Erro */}
      {!carregando && erro && (
        <div className="paxter-alert-red panel-3d-sub flex items-center gap-3 p-4">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <p className="text-[12px] font-semibold text-red-700">{erro}</p>
          <Button className="btn-3d-soft ml-auto text-[10px]" onClick={carregar}>Tentar novamente</Button>
        </div>
      )}

      {/* Vazio */}
      {!carregando && !erro && docs.length === 0 && (
        <div className="concave-3d flex flex-col items-center gap-3 py-10 text-center">
          <FileText className="h-8 w-8 opacity-20" style={{ color: GOLD }} />
          <p className="text-[12px] font-black uppercase tracking-widest" style={{ color: NAVY }}>
            Nenhum exame recebido
          </p>
          <p className="text-[11px] max-w-xs" style={{ color: MUTED }}>
            Laudos aparecem aqui conforme chegam pelo Portal do Paciente, Importação
            do Drive ou Watcher automático das pastas configuradas.
          </p>
        </div>
      )}

      {/* KPIs + cards */}
      {!carregando && !erro && docs.length > 0 && (
        <>
          {/* KPIs — concave-3d em grade fixa */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total de laudos",  valor: docs.length,  cor: NAVY        },
              { label: "Conferidos",        valor: conferidos,   cor: "#15803d"   },
              { label: "Canais ativos",     valor: canais,       cor: "#0891b2"   },
              { label: "Com erro",          valor: erros,        cor: "#d97706"   },
            ].map((k) => (
              <div key={k.label} className="concave-3d px-3 py-3">
                <div className="text-[20px] font-black leading-none" style={{ color: k.cor }}>
                  {k.valor}
                </div>
                <div className="mt-1 text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: MUTED }}>
                  {k.label}
                </div>
              </div>
            ))}
          </div>

          {/* Resumo dos canais */}
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(
              docs.reduce<Record<string, number>>((acc, d) => {
                const k = d.origin ?? "desconhecida";
                acc[k] = (acc[k] ?? 0) + 1;
                return acc;
              }, {})
            ).map(([origem, qtd]) => {
              const cfg = CALHA_CFG[origem] ?? CALHA_DEFAULT;
              return (
                <span key={origem} className="bevel-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px]">
                  <span className={cfg.led} />
                  <cfg.Icon className="h-3 w-3" />
                  {cfg.label}: {qtd}
                </span>
              );
            })}
          </div>

          {/* Cards */}
          <div className="space-y-3">
            {docs.map((doc) => (
              <DocumentoCard
                key={doc.id}
                doc={doc}
                analitos={porDoc.get(doc.id) ?? []}
                onRefresh={carregar}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
