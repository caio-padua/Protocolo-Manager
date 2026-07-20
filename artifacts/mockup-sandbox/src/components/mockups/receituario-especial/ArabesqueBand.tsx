// ─────────────────────────────────────────────────────────────────────────────
// ARABESQUE BAND — Motor unificado de faixas
// Suporta dois modos: inline-svg (vetorial) e raster-strip (PNG)
// Conforme especificação do ChatGPT PADUA DESIGNER
// ─────────────────────────────────────────────────────────────────────────────
import React, { useId } from "react";
import { ARABESQUE_MODELS, type ArabesqueModelId } from "./arabesqueModels";
import { getTileForModel } from "./InlinePatterns";

// ─── Props ────────────────────────────────────────────────────────────────────
type ArabesqueBandProps = {
  modelId: ArabesqueModelId;
  children: React.ReactNode;   // cartões brancos (z-index 2)
  minCardHeight?: number;       // altura mínima dos cartões em px
};

// ─── Motor inline-svg ─────────────────────────────────────────────────────────
function InlineSVGBand({
  modelId,
  patternId,
  bandH,
  children,
}: {
  modelId: ArabesqueModelId;
  patternId: string;
  bandH: number;
  children: React.ReactNode;
}) {
  const m = ARABESQUE_MODELS[modelId];
  const tileW = m.tileW ?? 60;
  const tileH = m.tileH ?? 60;
  const stroke = m.strokeColor ?? "#8a8a86";
  const border = m.borderColor ?? stroke;
  const sw = m.strokeWidth ?? 1.2;
  const op = m.strokeOpacity ?? 0.9;

  // Se scaleToHeight=true, escala o tile para preencher exatamente a altura da faixa
  // Se false, mantém o tile no tamanho original (tiles menores se repetem naturalmente)
  const scale = m.scaleToHeight ? bandH / tileH : 1;
  const scaledW = tileW * scale;
  const scaledH = tileH * scale; // = bandH se scaleToHeight=true

  return (
    <div style={{
      position: "relative", isolation: "isolate",
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "5mm", paddingInline: "10mm",
      minHeight: bandH + 48, alignItems: "center",
    }}>
      {/* Camada 0 — faixa SVG de ponta a ponta */}
      <svg
        width="100%" height={bandH}
        style={{ position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)", zIndex: 0 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id={patternId}
            x="0" y="0"
            width={scaledW}
            height={scaledH}
            patternUnits="userSpaceOnUse"
          >
            <rect width={scaledW} height={scaledH} fill={m.bgColor ?? "#f3f3f0"}/>
            <g transform={scale !== 1 ? `scale(${scale})` : undefined}>
              {getTileForModel(modelId, stroke, sw, op)}
            </g>
          </pattern>
        </defs>
        {/* Filetes externos */}
        <line x1="0" y1="0.8" x2="100%" y2="0.8" stroke={border} strokeWidth="0.8"/>
        <line x1="0" y1={bandH - 0.8} x2="100%" y2={bandH - 0.8} stroke={border} strokeWidth="0.8"/>
        <line x1="0" y1="3.2" x2="100%" y2="3.2" stroke={border} strokeWidth="0.35" opacity="0.55"/>
        <line x1="0" y1={bandH - 3.2} x2="100%" y2={bandH - 3.2} stroke={border} strokeWidth="0.35" opacity="0.55"/>
        {/* Faixa preenchida com o pattern */}
        <rect x="0" y="1" width="100%" height={bandH - 2} fill={`url(#${patternId})`}/>
      </svg>
      {/* Camada 2 — cartões (z-index 2, fundo branco opaco) */}
      {children}
    </div>
  );
}

// ─── Motor raster-strip ────────────────────────────────────────────────────────
function RasterStripBand({
  modelId,
  bandH,
  children,
}: {
  modelId: ArabesqueModelId;
  bandH: number;
  children: React.ReactNode;
}) {
  const m = ARABESQUE_MODELS[modelId];
  const border = "#8f8f8b";
  return (
    <div style={{
      position: "relative", isolation: "isolate",
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "5mm", paddingInline: "10mm",
      minHeight: bandH + 48, alignItems: "center",
    }}>
      {/* Camada 0 — imagem PNG de ponta a ponta */}
      <div style={{
        position: "absolute", top: "50%", left: 0, right: 0,
        height: bandH,
        transform: "translateY(-50%)",
        zIndex: 0,
        borderTop: `0.8px solid ${border}`,
        borderBottom: `0.8px solid ${border}`,
        overflow: "hidden",
        background: "#f3f3f0",
      }}>
        {m.assetUrl ? (
          <img
            src={m.assetUrl}
            alt=""
            style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
          />
        ) : (
          // Placeholder quando PNG ainda não foi fornecido
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 7, color: "#999", letterSpacing: 2, textTransform: "uppercase",
            fontStyle: "italic",
          }}>
            ← aguardando PNG 2325×300px do PADUA Designer →
          </div>
        )}
      </div>
      {/* Camada 2 — cartões (z-index 2) */}
      {children}
    </div>
  );
}

// ─── Cartão de identificação (z-index 2, fundo branco opaco) ─────────────────
export function InfoCard({
  titulo,
  rows,
  cardBorder = "#454545",
}: {
  titulo: string;
  rows: [string, string][];
  cardBorder?: string;
}) {
  return (
    <div style={{
      position: "relative", zIndex: 2,
      padding: "4mm 5mm",
      background: "#ffffff",
      border: `0.25mm solid ${cardBorder}`,
      borderRadius: 1,
      boxShadow: "0.6mm 0.6mm 0 rgba(0,0,0,0.05)",
    }}>
      <div style={{
        textAlign: "center", fontWeight: 700, fontSize: 7.5,
        letterSpacing: 2, textTransform: "uppercase",
        marginBottom: 5, borderBottom: "0.4px solid #ccc", paddingBottom: 3, color: "#222",
      }}>
        {titulo}
      </div>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display: "grid", gridTemplateColumns: "34mm 1fr", fontSize: 6.5, marginBottom: 3 }}>
          <b style={{ color: "#555" }}>{l}:</b>
          <span style={{ color: "#111" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Componente público: ArabesqueBand ───────────────────────────────────────
export function ArabesqueBand({ modelId, children }: ArabesqueBandProps) {
  const uid = useId();
  const patternId = `abp-${uid}-${modelId}`.replace(/[^a-zA-Z0-9-]/g, "_");
  const m = ARABESQUE_MODELS[modelId];
  const bandH = m.bandHeightPx;

  if (m.renderMode === "raster-strip") {
    return <RasterStripBand modelId={modelId} bandH={bandH}>{children}</RasterStripBand>;
  }
  return (
    <InlineSVGBand modelId={modelId} patternId={patternId} bandH={bandH}>
      {children}
    </InlineSVGBand>
  );
}
