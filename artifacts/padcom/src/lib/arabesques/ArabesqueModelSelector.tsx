// ─────────────────────────────────────────────────────────────────────────────
// ARABESQUE MODEL SELECTOR — Seletor visual com miniaturas para o padcom
// ─────────────────────────────────────────────────────────────────────────────
import React, { useId } from "react";
import {
  ARABESQUE_MODELS, CATEGORY_LABELS,
  type ArabesqueModelId, type ArabesqueModel,
} from "./models";
import { getTileForModel } from "./InlinePatterns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Miniatura inline-svg ─────────────────────────────────────────────────────
function SvgThumb({ m }: { m: ArabesqueModel }) {
  const uid = useId();
  const pid = `th-${uid}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, "_");
  const tileW = m.tileW ?? 60, tileH = m.tileH ?? 60;
  const stroke = m.strokeColor ?? "#8a8a86";
  const sw = m.strokeWidth ?? 1.2, op = m.strokeOpacity ?? 0.9;
  const H = 44;
  const scale = m.scaleToHeight ? H / tileH : 1;
  const scaledW = tileW * scale, scaledH = tileH * scale;
  return (
    <svg width="150" height={H} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <pattern id={pid} x="0" y="0" width={scaledW} height={scaledH} patternUnits="userSpaceOnUse">
          <rect width={scaledW} height={scaledH} fill={m.bgColor ?? "#f3f3f0"}/>
          <g transform={scale !== 1 ? `scale(${scale})` : undefined}>
            {getTileForModel(m.id, stroke, sw, op)}
          </g>
        </pattern>
      </defs>
      <line x1="0" y1="0.5" x2="150" y2="0.5" stroke={m.borderColor ?? stroke} strokeWidth="0.8"/>
      <line x1="0" y1={H - 0.5} x2="150" y2={H - 0.5} stroke={m.borderColor ?? stroke} strokeWidth="0.8"/>
      <rect x="0" y="1" width="150" height={H - 2} fill={`url(#${pid})`}/>
    </svg>
  );
}

// ─── Miniatura raster ─────────────────────────────────────────────────────────
function RasterThumb({ m }: { m: ArabesqueModel }) {
  const src = m.assetFile ? `${BASE}/assets/arabesques/${m.assetFile}` : "";
  return (
    <div style={{ width: 150, height: 44, background: "#f3f3f0",
      border: "0.5px solid #aaa", overflow: "hidden", display: "flex",
      alignItems: "center", justifyContent: "center" }}>
      {src
        ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
        : <span style={{ fontSize: 6, color: "#bbb" }}>PNG pendente</span>
      }
    </div>
  );
}

// ─── Card de modelo ───────────────────────────────────────────────────────────
function ModelCard({ m, selected, onSelect, compact }: {
  m: ArabesqueModel; selected: boolean; onSelect: () => void; compact?: boolean;
}) {
  const thumbW = compact ? 110 : 150;
  const thumbH = compact ? 36  : 44;
  return (
    <button onClick={onSelect} style={{
      display: "flex", flexDirection: "column", alignItems: "stretch",
      padding: 0, cursor: "pointer",
      border: selected ? "2px solid #45B8CC" : "1.5px solid #ccc",
      borderRadius: 3,
      background: selected ? "#eef9fb" : "#fafaf8",
      boxShadow: selected ? "0 0 0 3px rgba(69,184,204,0.2)" : "none",
      transition: "all 0.12s",
      width: thumbW + 8, overflow: "hidden",
    }}>
      <div style={{ width: thumbW + 8, height: thumbH + 4, overflow: "hidden",
        display: "flex", justifyContent: "center", alignItems: "center", background: "#f0f0ee" }}>
        {m.renderMode === "inline-svg"
          ? <SvgThumb m={m}/>
          : <RasterThumb m={m}/>
        }
      </div>
      <div style={{ padding: compact ? "3px 5px" : "4px 6px",
        fontSize: compact ? 6 : 6.5, fontWeight: selected ? 700 : 500,
        color: selected ? "#2a8a9a" : "#333",
        letterSpacing: 0.5, lineHeight: 1.3,
        borderTop: `1px solid ${selected ? "#b0e8ee" : "#e8e8e6"}` }}>
        {m.name}
        {!compact && (
          <div style={{ fontSize: 5.5, color: "#999", fontWeight: 400, marginTop: 1 }}>
            {m.renderMode === "inline-svg" ? "SVG vetorial" : "PNG — PADUA Designer"}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Seletor público ──────────────────────────────────────────────────────────
export function ArabesqueModelSelector({ value, onChange, compact }: {
  value: ArabesqueModelId; onChange: (id: ArabesqueModelId) => void; compact?: boolean;
}) {
  const grouped = Object.values(ARABESQUE_MODELS).reduce<Record<string, ArabesqueModel[]>>(
    (acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; },
    {}
  );

  return (
    <div style={{ padding: compact ? "8px 10px" : "12px 16px",
      background: "#f8f8f6", border: "1px solid #ddd", borderRadius: 4 }}>
      {!compact && (
        <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
          marginBottom: 12, color: "#333" }}>
          Selecionar Faixa Ornamental
        </div>
      )}
      {Object.entries(grouped).map(([cat, models]) => (
        <div key={cat} style={{ marginBottom: compact ? 8 : 12 }}>
          <div style={{ fontSize: 6, letterSpacing: 1.5, textTransform: "uppercase",
            color: "#777", fontWeight: 600, marginBottom: compact ? 4 : 6,
            borderBottom: "0.5px solid #e0e0de", paddingBottom: 2 }}>
            {CATEGORY_LABELS[cat as ArabesqueModel["category"]]}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 5 : 8 }}>
            {models.map(m => (
              <ModelCard key={m.id} m={m} selected={value === m.id}
                onSelect={() => onChange(m.id)} compact={compact}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
