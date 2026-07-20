// ─────────────────────────────────────────────────────────────────────────────
// ARABESQUE BAND — Motor unificado de faixas ornamentais para o padcom
// Dois modos: inline-svg (vetorial) e raster-strip (PNG do PADUA Designer)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useId } from "react";
import { ARABESQUE_MODELS, type ArabesqueModelId } from "./models";
import { getTileForModel } from "./InlinePatterns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Faixa SVG inline ─────────────────────────────────────────────────────────
function InlineSVGBand({ modelId, patternId, bandH, children }: {
  modelId: ArabesqueModelId; patternId: string; bandH: number; children: React.ReactNode;
}) {
  const m = ARABESQUE_MODELS[modelId];
  const tileW = m.tileW ?? 60, tileH = m.tileH ?? 60;
  const stroke = m.strokeColor ?? "#8a8a86", border = m.borderColor ?? stroke;
  const sw = m.strokeWidth ?? 1.2, op = m.strokeOpacity ?? 0.9;
  const scale = m.scaleToHeight ? bandH / tileH : 1;
  const scaledW = tileW * scale, scaledH = tileH * scale;

  return (
    <div style={{ position: "relative", isolation: "isolate",
      display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
      gap: "5mm", paddingInline: "10mm", minHeight: bandH + 48, alignItems: "center" }}>
      <svg width="100%" height={bandH} xmlns="http://www.w3.org/2000/svg"
        style={{ position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)", zIndex: 0 }}>
        <defs>
          <pattern id={patternId} x="0" y="0" width={scaledW} height={scaledH} patternUnits="userSpaceOnUse">
            <rect width={scaledW} height={scaledH} fill={m.bgColor ?? "#f3f3f0"}/>
            <g transform={scale !== 1 ? `scale(${scale})` : undefined}>
              {getTileForModel(modelId, stroke, sw, op)}
            </g>
          </pattern>
        </defs>
        <line x1="0" y1="0.8" x2="100%" y2="0.8" stroke={border} strokeWidth="0.8"/>
        <line x1="0" y1={bandH - 0.8} x2="100%" y2={bandH - 0.8} stroke={border} strokeWidth="0.8"/>
        <line x1="0" y1="3.2" x2="100%" y2="3.2" stroke={border} strokeWidth="0.35" opacity="0.55"/>
        <line x1="0" y1={bandH - 3.2} x2="100%" y2={bandH - 3.2} stroke={border} strokeWidth="0.35" opacity="0.55"/>
        <rect x="0" y="1" width="100%" height={bandH - 2} fill={`url(#${patternId})`}/>
      </svg>
      {children}
    </div>
  );
}

// ─── Faixa raster (PNG) ───────────────────────────────────────────────────────
function RasterBand({ modelId, bandH, children }: {
  modelId: ArabesqueModelId; bandH: number; children: React.ReactNode;
}) {
  const m = ARABESQUE_MODELS[modelId];
  const src = m.assetFile ? `${BASE}/assets/arabesques/${m.assetFile}` : "";
  const border = "#8f8f8b";
  return (
    <div style={{ position: "relative", isolation: "isolate",
      display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
      gap: "5mm", paddingInline: "10mm", minHeight: bandH + 48, alignItems: "center" }}>
      <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: bandH,
        transform: "translateY(-50%)", zIndex: 0,
        borderTop: `0.8px solid ${border}`, borderBottom: `0.8px solid ${border}`,
        overflow: "hidden", background: "#f3f3f0" }}>
        {src
          ? <img src={src} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}/>
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 7, color: "#aaa", letterSpacing: 2, fontStyle: "italic" }}>aguardando PNG</div>
        }
      </div>
      {children}
    </div>
  );
}

// ─── Cartão de identificação (z‑index 2, fundo branco) ────────────────────────
export function InfoCard({ titulo, rows }: { titulo: string; rows: [string, string][] }) {
  return (
    <div style={{ position: "relative", zIndex: 2, padding: "4mm 5mm", background: "#ffffff",
      border: "0.25mm solid #454545", borderRadius: 1,
      boxShadow: "0.6mm 0.6mm 0 rgba(0,0,0,0.05)" }}>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: 7.5, letterSpacing: 2,
        textTransform: "uppercase", marginBottom: 5,
        borderBottom: "0.4px solid #ccc", paddingBottom: 3, color: "#222" }}>{titulo}</div>
      {rows.map(([l, v]) => (
        <div key={l} style={{ display: "grid", gridTemplateColumns: "34mm 1fr", fontSize: 6.5, marginBottom: 3 }}>
          <b style={{ color: "#555" }}>{l}:</b>
          <span style={{ color: "#111" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Componente público ───────────────────────────────────────────────────────
export function ArabesqueBand({ modelId, children }: {
  modelId: ArabesqueModelId; children: React.ReactNode;
}) {
  const uid = useId();
  const pid = `abp-${uid}-${modelId}`.replace(/[^a-zA-Z0-9-]/g, "_");
  const m = ARABESQUE_MODELS[modelId];
  const bandH = m.bandHeightPx;
  return m.renderMode === "raster-strip"
    ? <RasterBand modelId={modelId} bandH={bandH}>{children}</RasterBand>
    : <InlineSVGBand modelId={modelId} patternId={pid} bandH={bandH}>{children}</InlineSVGBand>;
}
