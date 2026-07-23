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
  /** Nome canônico do catálogo (display_name de exam_analyte_catalog) — K3 Kaizen-001 */
  canonicalName?: string | null;
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
    label: "Drive · Aspirador",
    sublabel: "Watcher automático (5 min)",
    led: "paxter-led paxter-led-breathe paxter-led-amber",
    Icon: FolderSync,
  },
  manual: {
    label: "Upload Manual",
    sublabel: "Enviado avulso pela equipe",
    led: "paxter-led paxter-led-breathe paxter-led-amber",
    Icon: Upload,
  },
  demo: {
    label: "Demonstração",
    sublabel: "Dado de teste do sistema",
    led: "paxter-led paxter-led-breathe",
    Icon: Bot,
  },
};
const CALHA_DEFAULT = {
  label: "Origem desconhecida",
  sublabel: "—",
  led: "paxter-led paxter-led-breathe",
  Icon: Globe,
};

// ── Canais fixos (para o Painel de Classificação) ─────────────────────────────
// TODOS os canais aparecem em POSIÇÃO FIXA em cada card — K2 Kaizen-001
const TODOS_CANAIS: Array<{ key: string; label: string; Icon: typeof Globe }> = [
  { key: "portal",        label: "Portal do Cliente",   Icon: Globe     },
  { key: "drive-watcher", label: "Drive · Aspirador",   Icon: FolderSync},
  { key: "drive-import",  label: "Importação em Massa", Icon: FolderOpen},
  { key: "upload",        label: "Upload pela Clínica", Icon: Upload    },
  { key: "demo",          label: "Demonstração",        Icon: Bot       },
];

function ClassificationPanel({ activeOrigin }: { activeOrigin: string | null }) {
  const key = activeOrigin ?? "";
  return (
    <div
      className="bevel-3d flex-shrink-0 overflow-hidden"
      style={{ minWidth: 150, maxWidth: 164 }}
    >
      {/* Faixa-título compacta */}
      <div
        className="px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.24em]"
        style={{
          color: GOLD,
          borderBottom: "1px solid rgba(154,123,50,0.2)",
          background: "rgba(154,123,50,0.04)",
        }}
      >
        Origem do arquivo
      </div>

      {/* Canais — altura fixa por linha */}
      {TODOS_CANAIS.map(({ key: k, label, Icon }, i) => {
        const active = key === k;
        const cfg = CALHA_CFG[k];
        const isLast = i === TODOS_CANAIS.length - 1;
        return (
          <div
            key={k}
            className="flex items-center gap-2 px-2.5"
            style={{
              height: 26,
              background: active ? "rgba(22,40,74,0.09)" : "transparent",
              borderBottom: isLast ? "none" : "1px solid rgba(209,195,165,0.15)",
            }}
          >
            {active ? (
              <span className={`${cfg?.led ?? "paxter-led paxter-led-breathe paxter-led-amber"} flex-shrink-0`} />
            ) : (
              <span
                className="h-[5px] w-[5px] rounded-full flex-shrink-0"
                style={{ background: "rgba(100,124,151,0.2)" }}
              />
            )}
            <Icon
              className="h-[9px] w-[9px] flex-shrink-0"
              style={{ color: active ? NAVY : "rgba(100,124,151,0.38)" }}
            />
            <span
              className="truncate flex-1 text-[8px]"
              style={{ color: active ? NAVY : "rgba(100,124,151,0.5)", fontWeight: active ? 800 : 400 }}
            >
              {label}
            </span>
            {active && (
              <span
                className="flex-shrink-0 rounded-[2px] px-1 py-[1px] text-[6px] font-black uppercase tracking-widest"
                style={{ background: "rgba(21,128,61,0.13)", color: "#15803d" }}
              >
                ativo
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

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

// ── Bevel Célula — componente reutilizável para insert-bevels de altura FIXA ──
// Altura sempre 44px; conteúdo truncado; label abaixo, uniforme.
function BevelCelula({
  label,
  conteudo,
  cor,
  bold = false,
}: {
  label: string;
  conteudo: string;
  cor: string;
  bold?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div
        className="concave-3d flex h-[44px] items-center px-3 overflow-hidden"
        title={conteudo}
      >
        <span
          className="line-clamp-2 text-[10px] leading-snug"
          style={{ color: cor, fontWeight: bold ? 700 : 400 }}
        >
          {conteudo}
        </span>
      </div>
      <span
        className="text-center text-[7.5px] font-black uppercase tracking-[0.2em]"
        style={{ color: MUTED }}
      >
        {label}
      </span>
    </div>
  );
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

// ── Grade de analitos — 7 colunas FIXAS (TDAH: largura fixa, sempre texto) ──
// Col 1: Exame (nome canônico + extraído)
// Col 2: Coleta (data + badge HIST se histórico)
// Col 3: Valor Lab (valor bruto do laudo)
// Col 4: Un. Lab (unidade bruta)
// Col 5: Val. Padrão (convertido=azul / =verde / S/cat.=muted)
// Col 6: Un. Padrão (canônica)
// Col 7: Situação (sempre texto — Normal/Acima/Abaixo/Revisar/S/ ref.)
const GRID_COLS = "minmax(128px,1.5fr) 58px 58px 50px 62px 50px 72px";

const STATUS_ANALITO: Record<string, { label: string; cor: string }> = {
  dentro:      { label: "Normal",  cor: "#15803d" },
  acima:       { label: "Acima",   cor: "#dc2626" },
  abaixo:      { label: "Abaixo",  cor: "#1d4ed8" },
  conferencia: { label: "Revisar", cor: "#d97706" },
};
const STATUS_DEFAULT = { label: "S/ ref.", cor: MUTED };

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
  // ── Col 1: nome ──────────────────────────────────────────────────────────────
  const canonName = a.canonicalName
    ?? (a.analyteCode ? a.analyteCode.replace(/-/g, " ") : null)
    ?? a.analyteNameRaw;
  const showExtracted =
    !!a.analyteNameRaw && canonName.toLowerCase() !== a.analyteNameRaw.toLowerCase();

  // ── Col 2: data de coleta + badge HIST ───────────────────────────────────────
  const dataColeta = fmtDateShort(a.collectionDate);

  // ── Col 3: valor bruto do laudo ──────────────────────────────────────────────
  const valorLab = a.valueRaw ?? "—";

  // ── Col 4: unidade bruta ─────────────────────────────────────────────────────
  const unLab = a.unitRaw ?? "—";

  // ── Col 5: valor padrão ──────────────────────────────────────────────────────
  // Convertido (azul) | Mesmo padrão "=" (verde) | Sem catálogo (muted)
  let valPad: string; let valPadColor: string;
  if (!a.unitCanonical) {
    valPad = "S/ cat."; valPadColor = MUTED;
  } else if (a.unitConverted) {
    valPad = a.valueCanonical ?? "—"; valPadColor = "#1d4ed8";
  } else {
    valPad = "="; valPadColor = "#15803d";
  }

  // ── Col 6: unidade padrão ────────────────────────────────────────────────────
  const unPad      = a.unitCanonical ?? "S/ cat.";
  const unPadColor = a.unitCanonical ? NAVY : MUTED;

  // ── Col 7: situação — SEMPRE mostra texto ────────────────────────────────────
  const stLbl = STATUS_ANALITO[a.status ?? ""] ?? STATUS_DEFAULT;

  return (
    <div
      className={`grid items-center gap-x-2 px-3 py-[5px] ${last ? "" : "border-b"}`}
      style={{
        gridTemplateColumns: GRID_COLS,
        borderColor: "rgba(209,195,165,0.22)",
        borderLeft: a.unitConverted ? "2px solid rgba(29,78,216,0.22)" : "2px solid transparent",
      }}
    >
      {/* Col 1 — Nome canônico + nome extraído (sem prefixo) */}
      <span className="min-w-0 leading-none">
        <span
          className="block truncate text-[10.5px] font-bold"
          style={{ color: NAVY }}
          title={canonName}
        >
          {canonName}
        </span>
        {showExtracted && (
          <span
            className="block truncate text-[8.5px] italic mt-px"
            style={{ color: MUTED }}
            title={a.analyteNameRaw}
          >
            {a.analyteNameRaw}
          </span>
        )}
      </span>

      {/* Col 2 — Coleta (data + badge HIST se histórico) */}
      <span className="min-w-0 leading-none text-center">
        {a.isHistory && (
          <span
            className="block mx-auto w-fit rounded-[2px] px-1 py-px text-[6.5px] font-black uppercase tracking-widest leading-none mb-px"
            style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fbbf24" }}
          >
            HIST
          </span>
        )}
        <span className="block text-[8.5px] tabular-nums" style={{ color: MUTED }}>
          {dataColeta || (a.isHistory ? "—" : "Atual")}
        </span>
      </span>

      {/* Col 3 — Valor Lab (bruto, direto do laudo) */}
      <span
        className="text-right text-[10.5px] font-mono font-bold tabular-nums"
        style={{ color: valorLab === "—" ? MUTED : NAVY }}
      >
        {valorLab}
      </span>

      {/* Col 4 — Un. Lab */}
      <span className="text-[8.5px] truncate" style={{ color: MUTED }}>
        {unLab}
      </span>

      {/* Col 5 — Val. Padrão */}
      <span
        className="text-right text-[10.5px] font-mono font-bold tabular-nums"
        style={{ color: valPadColor }}
        title={
          a.unitConverted
            ? `Convertido: ${a.unitRaw ?? "?"} → ${a.unitCanonical ?? "?"}`
            : a.unitCanonical ? "Unidade já no padrão canônico" : "Sem catálogo de unidades"
        }
      >
        {valPad}
      </span>

      {/* Col 6 — Un. Padrão */}
      <span className="text-[8.5px] truncate" style={{ color: unPadColor }}>
        {unPad}
      </span>

      {/* Col 7 — Situação (campo fixo, sempre texto) */}
      <span
        className="text-center text-[7.5px] font-black uppercase tracking-widest rounded-[3px] px-1 py-[3px] truncate"
        style={{
          color: stLbl.cor,
          background: stLbl.cor === MUTED ? "rgba(100,124,151,0.08)" : `${stLbl.cor}18`,
        }}
      >
        {stLbl.label}
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

      {/* ── ZONA 1: TOP BAR — tipo + status + confiança (K2: origem saiu para ClassificationPanel) */}
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-2"
        style={{ borderBottom: "1px solid rgba(209,195,165,0.4)" }}
      >
        {/* Tipo de exame */}
        <span className="bevel-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px]">
          <kindCfg.Icon className="h-3 w-3" style={{ color: kindCfg.cor }} />
          {kindCfg.label}
        </span>

        {/* Status */}
        <span
          className="concave-3d ml-auto inline-flex items-center px-2.5 py-1 text-[9px] font-black uppercase tracking-widest"
          style={{ color: statusCfg.cor }}
        >
          {statusCfg.label}
        </span>

        {/* Confiança IA */}
        {confianca !== null && (
          <span
            className="concave-3d inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
            style={{ color: MUTED }}
          >
            <Bot className="h-2.5 w-2.5" />
            {confianca}%
          </span>
        )}

        {/* Extraído com sucesso */}
        {extraidoOk && (
          <span className="bevel-3d-ok inline-flex items-center gap-1 px-2.5 py-1 text-[9px]">
            <Zap className="h-2.5 w-2.5" />
            Extraído
          </span>
        )}
      </div>

      {/* ── ZONA 2: PAINEL DE CLASSIFICAÇÃO (esq) + TÍTULO E PROVENIÊNCIA (dir) — K2 Kaizen-001 */}
      <div className="flex gap-3 px-4 pt-3 pb-2">

        {/* Painel de Classificação — esquerda, bevel saliente, canais fixos */}
        <ClassificationPanel activeOrigin={doc.origin} />

        {/* Direita: título + 6 bevels em 2 linhas (TDAH: todos mesma altura fixa) */}
        <div className="flex-1 min-w-0 space-y-2">

          {/* Título: ícone + nome canônico PAXTER (arquivo renomeado pelo sistema) */}
          <div
            className="flex items-center gap-2"
            title={nomeOrig ? `Arquivo original: ${nomeOrig}` : undefined}
          >
            <kindCfg.Icon className="h-4 w-4 shrink-0" style={{ color: kindCfg.cor }} />
            <p className="truncate text-[12.5px] font-bold leading-snug" style={{ color: NAVY }}>
              {nomeRen || doc.fileName}
            </p>
          </div>

          {/* LINHA 1 de bevels: Nome PAXTER | Laboratório | Drive */}
          <div className="grid grid-cols-3 gap-2">
            {/* Bevel A — Nome canônico PAXTER */}
            <BevelCelula
              label="Arquivo PAXTER"
              conteudo={nomeRen || doc.fileName}
              cor={NAVY}
              bold
            />
            {/* Bevel B — Laboratório */}
            <BevelCelula
              label="Laboratório"
              conteudo={doc.labName || "—"}
              cor={doc.labName ? NAVY : MUTED}
            />
            {/* Bevel C — Clone / Drive */}
            <div className="flex flex-col gap-[5px]">
              <div className="concave-3d flex h-[44px] items-center justify-center px-2 overflow-hidden">
                {cloneUrl ? (
                  <a
                    href={cloneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[9.5px] font-bold no-underline"
                    style={{ color: "#15803d" }}
                  >
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    Cópia no Drive
                  </a>
                ) : doc.sourcePdfDriveId ? (
                  <button
                    onClick={handleClonarDrive}
                    disabled={clonando}
                    className="btn-3d-soft inline-flex items-center gap-1 px-2 py-1 text-[8.5px] font-black uppercase tracking-widest disabled:opacity-60"
                    style={{ color: NAVY }}
                  >
                    {clonando ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ArrowRight className="h-2.5 w-2.5" />}
                    {clonando ? "Clonando…" : "Clonar"}
                  </button>
                ) : (
                  <span className="text-[9px]" style={{ color: MUTED }}>Sem Drive</span>
                )}
              </div>
              <span className="text-center text-[7.5px] font-black uppercase tracking-[0.2em]" style={{ color: MUTED }}>
                Clone no Drive
              </span>
            </div>
          </div>

          {/* LINHA 2 de bevels: Data Coleta | Recebido em | Conferido em */}
          <div className="grid grid-cols-3 gap-2">
            <BevelCelula
              label="Data de Coleta"
              conteudo={doc.collectionDate ? fmtData(doc.collectionDate) : "—"}
              cor={doc.collectionDate ? NAVY : MUTED}
            />
            <BevelCelula
              label="Recebido em"
              conteudo={fmtData(doc.createdAt)}
              cor={NAVY}
            />
            <BevelCelula
              label="Conferido em"
              conteudo={doc.conferredAt ? fmtData(doc.conferredAt) : "—"}
              cor={doc.conferredAt ? "#15803d" : MUTED}
            />
          </div>

        </div>{/* fecha coluna direita flex-1 */}
      </div>{/* fecha flex gap-3 px-4 (ZONA 2) */}

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
          {/* Header da grade — 7 colunas TDAH */}
          <div
            className="grid border-b px-3 py-[5px]"
            style={{ gridTemplateColumns: GRID_COLS, borderColor: "rgba(209,195,165,0.4)" }}
          >
            {[
              { h: "Exame",        align: "left"   },
              { h: "Coleta",       align: "center" },
              { h: "Valor Lab",    align: "right"  },
              { h: "Un. Lab",      align: "left"   },
              { h: "Val. Padrão",  align: "right"  },
              { h: "Un. Padrão",   align: "left"   },
              { h: "Situação",     align: "center" },
            ].map(({ h, align }) => (
              <span
                key={h}
                className="text-[7.5px] font-black uppercase tracking-[0.16em]"
                style={{ color: MUTED, textAlign: align as "left" | "center" | "right" }}
              >
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
