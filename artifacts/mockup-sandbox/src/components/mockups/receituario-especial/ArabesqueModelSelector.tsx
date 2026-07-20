// ─────────────────────────────────────────────────────────────────────────────
// ARABESQUE MODEL SELECTOR — Seletor visual com miniaturas
// ─────────────────────────────────────────────────────────────────────────────
import React, { useId } from "react";
import {
  ARABESQUE_MODELS, ARABESQUE_MODEL_IDS, CATEGORY_LABELS,
  type ArabesqueModelId, type ArabesqueModel,
} from "./arabesqueModels";
import { getTileForModel } from "./InlinePatterns";

// ─── Miniatura inline-svg ─────────────────────────────────────────────────────
function InlineSvgThumb({ m, uid }: { m: ArabesqueModel; uid: string }) {
  const pid = `th-${uid}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, "_");
  const tileW = m.tileW ?? 60;
  const tileH = m.tileH ?? 60;
  const stroke = m.strokeColor ?? "#8a8a86";
  const sw = m.strokeWidth ?? 1.2;
  const op = m.strokeOpacity ?? 0.9;
  const H = 40; // miniatura fixa: 120×40px
  const scale = m.scaleToHeight ? H / tileH : 1;
  const scaledW = tileW * scale;
  const scaledH = tileH * scale;

  return (
    <svg width="120" height={H} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={pid} x="0" y="0" width={scaledW} height={scaledH} patternUnits="userSpaceOnUse">
          <rect width={scaledW} height={scaledH} fill={m.bgColor ?? "#f3f3f0"}/>
          <g transform={scale !== 1 ? `scale(${scale})` : undefined}>
            {getTileForModel(m.id, stroke, sw, op)}
          </g>
        </pattern>
      </defs>
      <line x1="0" y1="0.6" x2="120" y2="0.6" stroke={m.borderColor ?? stroke} strokeWidth="0.8"/>
      <line x1="0" y1={H - 0.6} x2="120" y2={H - 0.6} stroke={m.borderColor ?? stroke} strokeWidth="0.8"/>
      <rect x="0" y="1" width="120" height={H - 2} fill={`url(#${pid})`}/>
    </svg>
  );
}

// ─── Miniatura raster-strip ───────────────────────────────────────────────────
function RasterThumb({ m }: { m: ArabesqueModel }) {
  return (
    <div style={{
      width: 120, height: 40,
      background: "#f3f3f0",
      border: "0.5px solid #aaa",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {m.assetUrl ? (
        <img src={m.assetUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      ) : (
        <span style={{ fontSize: 6, color: "#999", textAlign: "center", letterSpacing: 1 }}>
          PNG pendente<br/>PADUA Designer
        </span>
      )}
    </div>
  );
}

// ─── Card de modelo ───────────────────────────────────────────────────────────
function ModelCard({
  m, selected, onSelect,
}: {
  m: ArabesqueModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const uid = useId();
  return (
    <button
      onClick={onSelect}
      style={{
        display: "flex", flexDirection: "column", alignItems: "stretch",
        padding: 0, cursor: "pointer",
        border: selected ? "2px solid #2a6a8a" : "1.5px solid #ccc",
        borderRadius: 3,
        background: selected ? "#eef6fb" : "#fafaf8",
        boxShadow: selected ? "0 0 0 3px rgba(42,106,138,0.18)" : "none",
        transition: "all 0.12s",
        width: 128, overflow: "hidden",
      }}
    >
      {/* Miniatura */}
      <div style={{ width: 128, height: 44, overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", background: "#f0f0ee" }}>
        {m.renderMode === "inline-svg"
          ? <InlineSvgThumb m={m} uid={uid}/>
          : <RasterThumb m={m}/>
        }
      </div>
      {/* Label */}
      <div style={{
        padding: "4px 6px",
        fontSize: 6.5, fontWeight: selected ? 700 : 500,
        color: selected ? "#2a6a8a" : "#333",
        letterSpacing: 0.5, lineHeight: 1.3,
        borderTop: `1px solid ${selected ? "#b0d4e8" : "#e8e8e6"}`,
      }}>
        {m.name}
        <div style={{ fontSize: 5.5, color: "#999", fontWeight: 400, marginTop: 1 }}>
          {m.renderMode === "inline-svg" ? "SVG vetorial" : "PNG raster"}
        </div>
      </div>
    </button>
  );
}

// ─── Seletor público ──────────────────────────────────────────────────────────
export function ArabesqueModelSelector({
  value,
  onChange,
}: {
  value: ArabesqueModelId;
  onChange: (id: ArabesqueModelId) => void;
}) {
  // Agrupar por categoria
  const grouped = Object.values(ARABESQUE_MODELS).reduce<Record<string, ArabesqueModel[]>>(
    (acc, m) => {
      const key = m.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(m);
      return acc;
    },
    {}
  );

  return (
    <div style={{ padding: "10px 14px", background: "#f8f8f6", border: "1px solid #ddd", borderRadius: 4 }}>
      <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, color: "#333" }}>
        Faixa Ornamental — Selecionar Modelo
      </div>
      {Object.entries(grouped).map(([cat, models]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 6, letterSpacing: 1.5, textTransform: "uppercase",
            color: "#777", fontWeight: 600, marginBottom: 6,
            borderBottom: "0.5px solid #e0e0de", paddingBottom: 3,
          }}>
            {CATEGORY_LABELS[cat as ArabesqueModel["category"]]}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {models.map(m => (
              <ModelCard
                key={m.id}
                m={m}
                selected={value === m.id}
                onSelect={() => onChange(m.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
