// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO DE FAIXAS ORNAMENTAIS DO RECEITUÁRIO
// Rota: /configuracoes/receituario
// Permite ao operador selecionar e testar as faixas ornamentais
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { LayoutTemplate, Save, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ARABESQUE_MODELS, CATEGORY_LABELS, getSavedBandModel, saveBandModel,
  DEFAULT_BAND_MODEL,
  type ArabesqueModelId, type ArabesqueModel,
} from "@/lib/arabesques/models";
import { getTileForModel } from "@/lib/arabesques/InlinePatterns";
import { ArabesqueBand, InfoCard } from "@/lib/arabesques/ArabesqueBand";
import React, { useId } from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Dados de exemplo para o preview ─────────────────────────────────────────
const PREV_PAC: [string, string][] = [
  ["Nome",      "Maria Fernanda Souza Almeida"],
  ["CPF",       "123.456.789-00"],
  ["Nasc.",     "15/03/1988"],
  ["Cidade/UF", "São Paulo / SP"],
];
const PREV_MED: [string, string][] = [
  ["Nome",   "Dr. Caio H. F. Pádua"],
  ["CRM",    "SP 123.456   RQE: 56.789"],
  ["Espec.", "Medicina Integrativa"],
  ["Fone",   "(11) 3090-0010"],
];
const PREV_COMP: [string, string][] = [
  ["Nome",   "Maria Fernanda Souza Almeida"],
  ["End.",   "Rua das Acácias, 250 — Apto. 42"],
  ["Cidade", "São Paulo / SP"],
];
const PREV_FARM: [string, string][] = [
  ["Farmácia", "Santé Manipulação"],
  ["CNPJ",     "12.345.678/0001-90"],
  ["Assinatura", "________________  Data: ___/___"],
];

// ─── Miniatura de modelo ──────────────────────────────────────────────────────
function SvgThumb({ m, w = 160, h = 48 }: { m: ArabesqueModel; w?: number; h?: number }) {
  const uid = useId();
  const pid = `cfg-${uid}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, "_");
  const tileW = m.tileW ?? 60, tileH = m.tileH ?? 60;
  const stroke = m.strokeColor ?? "#8a8a86", border = m.borderColor ?? stroke;
  const sw = m.strokeWidth ?? 1.2, op = m.strokeOpacity ?? 0.9;
  const scale = m.scaleToHeight ? h / tileH : 1;
  const scaledW = tileW * scale, scaledH = tileH * scale;
  return (
    <svg width={w} height={h} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <pattern id={pid} x="0" y="0" width={scaledW} height={scaledH} patternUnits="userSpaceOnUse">
          <rect width={scaledW} height={scaledH} fill={m.bgColor ?? "#f3f3f0"}/>
          <g transform={scale !== 1 ? `scale(${scale})` : undefined}>
            {getTileForModel(m.id, stroke, sw, op)}
          </g>
        </pattern>
      </defs>
      <line x1="0" y1="0.5" x2={w} y2="0.5" stroke={border} strokeWidth="0.8"/>
      <line x1="0" y1={h - 0.5} x2={w} y2={h - 0.5} stroke={border} strokeWidth="0.8"/>
      <rect x="0" y="1" width={w} height={h - 2} fill={`url(#${pid})`}/>
    </svg>
  );
}

function RasterThumb({ m, w = 160, h = 48 }: { m: ArabesqueModel; w?: number; h?: number }) {
  const src = m.assetFile ? `${BASE}/assets/arabesques/${m.assetFile}` : "";
  return (
    <div style={{ width: w, height: h, background: "#f3f3f0", border: "0.5px solid #aaa",
      overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {src
        ? <img src={src} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
        : <span style={{ fontSize: 7, color: "#bbb" }}>PNG pendente</span>
      }
    </div>
  );
}

// ─── Card de modelo ───────────────────────────────────────────────────────────
function ModelCard({ m, selected, onSelect, isSaved }: {
  m: ArabesqueModel; selected: boolean; onSelect: () => void; isSaved: boolean;
}) {
  return (
    <button onClick={onSelect} style={{
      display: "flex", flexDirection: "column",
      padding: 0, cursor: "pointer", textAlign: "left",
      border: selected ? "2.5px solid #45B8CC" : isSaved ? "2px solid #3D7A7A" : "1.5px solid #d0d0cc",
      borderRadius: 4, background: selected ? "#eef9fb" : isSaved ? "#edf4f4" : "#fafaf8",
      boxShadow: selected ? "0 0 0 4px rgba(69,184,204,0.18)" : "none",
      transition: "all 0.14s", width: 172, overflow: "hidden",
    }}>
      {/* Miniatura */}
      <div style={{ width: 172, height: 52, background: "#ececea", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        {m.renderMode === "inline-svg"
          ? <SvgThumb m={m} w={170} h={50}/>
          : <RasterThumb m={m} w={170} h={50}/>
        }
      </div>
      {/* Label */}
      <div style={{ padding: "5px 8px",
        borderTop: `1px solid ${selected ? "#b0e8ee" : "#e8e8e6"}` }}>
        <div style={{ fontSize: 7, fontWeight: selected ? 700 : 600, color: selected ? "#1a7a8a" : "#2a2a2a",
          letterSpacing: 0.3, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {m.name}
          {isSaved && !selected && (
            <span style={{ fontSize: 5.5, color: "#3D7A7A", background: "#d4eded",
              padding: "1px 4px", borderRadius: 2, letterSpacing: 0.5 }}>ATIVO</span>
          )}
          {selected && (
            <span style={{ fontSize: 5.5, color: "#1a7a8a", background: "#c0eef5",
              padding: "1px 4px", borderRadius: 2, letterSpacing: 0.5 }}>PREVIEW</span>
          )}
        </div>
        <div style={{ fontSize: 5.5, color: "#888", marginTop: 1 }}>
          {m.renderMode === "inline-svg" ? "SVG vetorial" : "PNG — PADUA Designer"}
        </div>
      </div>
    </button>
  );
}

// ─── Preview do receituário ───────────────────────────────────────────────────
function PreviewReceituario({ modelId, tipo }: { modelId: ArabesqueModelId; tipo: "especial" | "simples" }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #bbb",
      boxShadow: "0 4px 20px rgba(0,0,0,0.10)", transformOrigin: "top left" }}>
      {/* Cabeçalho */}
      <div style={{ textAlign: "center", padding: "8mm 0 6mm" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 12, fontWeight: 700, letterSpacing: 1.5 }}>
          Clínica Padua — Dr. Caio H. F. Pádua
        </div>
        <div style={{ fontSize: 6, color: "#555", letterSpacing: 3, marginTop: 2, textTransform: "uppercase" }}>
          Medicina Integrativa e Longevidade
        </div>
        <div style={{ marginTop: 5, fontSize: 8, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase",
          borderTop: "0.5px solid #ccc", borderBottom: "0.5px solid #ccc", padding: "3px 0" }}>
          {tipo === "especial" ? "Receituário de Controle Especial" : "Receituário Simples"}
        </div>
      </div>
      {/* Faixa superior */}
      <ArabesqueBand modelId={modelId}>
        <InfoCard titulo="Identificação do Paciente" rows={PREV_PAC}/>
        <InfoCard titulo="Identificação do Emitente"  rows={PREV_MED}/>
      </ArabesqueBand>
      {/* Corpo */}
      <div style={{ padding: "6mm 12mm", minHeight: "40mm" }}>
        <div style={{ fontSize: 16, fontFamily: "Georgia, serif", fontStyle: "italic", marginBottom: 4 }}>
          R<span style={{ fontSize: 10, verticalAlign: "super" }}>x</span>
        </div>
        {["1. Zolpidem 10 mg — Tomar 1 comprimido à noite.", "2. Clonazepam 0,5 mg — Tomar 1 comprimido à noite."].map(t => (
          <div key={t} style={{ fontSize: 6.5, color: "#333", marginBottom: 5,
            borderBottom: "0.3px dashed #ddd", paddingBottom: 5 }}>{t}</div>
        ))}
        <div style={{ fontSize: 6, color: "#555", marginTop: 6 }}>São Paulo, 20 de julho de 2026.</div>
      </div>
      {/* Faixa inferior (apenas especial) */}
      {tipo === "especial" && (
        <ArabesqueBand modelId={modelId}>
          <InfoCard titulo="Identificação do Comprador" rows={PREV_COMP}/>
          <InfoCard titulo="Identificação do Fornecedor / Farmácia" rows={PREV_FARM}/>
        </ArabesqueBand>
      )}
      {/* Rodapé */}
      <div style={{ padding: "3mm 8mm", fontSize: 5, color: "#aaa",
        borderTop: "0.3px solid #ddd", textAlign: "center" }}>
        Clínica Padua — Av. Brigadeiro Faria Lima, 3000 — São Paulo/SP | (11) 3090-0010
      </div>
    </div>
  );
}

// ─── Tela principal ────────────────────────────────────────────────────────────
export default function ConfigReceituario() {
  const { toast } = useToast();
  const [savedModel, setSavedModel] = useState<ArabesqueModelId>(getSavedBandModel);
  const [previewModel, setPreviewModel] = useState<ArabesqueModelId>(savedModel);
  const [tipoPreview, setTipoPreview] = useState<"especial" | "simples">("especial");
  const [showPreview, setShowPreview] = useState(true);

  // Grupos por categoria
  const grouped = Object.values(ARABESQUE_MODELS).reduce<Record<string, ArabesqueModel[]>>(
    (acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; },
    {}
  );

  function handleSave() {
    saveBandModel(previewModel);
    setSavedModel(previewModel);
    toast({ title: "Faixa salva como padrão!", description: `Modelo "${ARABESQUE_MODELS[previewModel].name}" ativo na clínica.` });
  }

  const changed = previewModel !== savedModel;

  return (
    <div className="min-h-screen bg-stone-100">
      {/* Cabeçalho da tela */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <LayoutTemplate className="w-5 h-5 text-teal-600"/>
          <div>
            <h1 className="text-lg font-bold text-gray-800 tracking-wide">Faixas Ornamentais do Receituário</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Selecione o padrão de faixa que será impresso nas bordas dos receituários especial e simples.
              Modelos SVG são geométricos; modelos PNG são arte do PADUA Designer.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-[1fr_520px] gap-6 items-start">

          {/* COLUNA ESQUERDA — Seletor de modelos */}
          <div className="space-y-5">
            {/* Banner de modelo ativo */}
            <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0"/>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-teal-700 uppercase tracking-widest">Modelo ativo na clínica</div>
                <div className="text-sm font-semibold text-teal-900 truncate">{ARABESQUE_MODELS[savedModel].name}</div>
              </div>
              {changed && (
                <Button onClick={handleSave} size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white text-xs px-3 shrink-0">
                  <Save className="w-3 h-3 mr-1.5"/>Salvar como padrão
                </Button>
              )}
            </div>

            {/* Grupos de modelos */}
            {Object.entries(grouped).map(([cat, models]) => (
              <div key={cat}>
                <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3 pb-1.5"
                  style={{ borderBottom: "1.5px solid #e0e0dc" }}>
                  {CATEGORY_LABELS[cat as ArabesqueModel["category"]]}
                  <span className="ml-2 font-normal normal-case text-gray-400">({models.length} modelos)</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {models.map(m => (
                    <ModelCard key={m.id} m={m}
                      selected={previewModel === m.id}
                      isSaved={savedModel === m.id}
                      onSelect={() => setPreviewModel(m.id)}/>
                  ))}
                </div>
              </div>
            ))}

            {/* Info técnica */}
            <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded p-3 leading-relaxed">
              <strong>Como adicionar novos modelos PNG:</strong>{" "}
              coloque o arquivo em <code>public/assets/arabesques/</code> e registre em{" "}
              <code>src/lib/arabesques/models.ts</code> com <code>renderMode: "raster-strip"</code>.
              O modelo aparece automaticamente no seletor sem reiniciar o servidor.
            </div>
          </div>

          {/* COLUNA DIREITA — Preview ao vivo */}
          <div className="space-y-3 sticky top-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Preview ao vivo
              </div>
              <div className="flex items-center gap-2">
                {/* Toggle tipo */}
                <div className="flex border border-gray-300 rounded overflow-hidden text-xs">
                  {(["especial", "simples"] as const).map(t => (
                    <button key={t} onClick={() => setTipoPreview(t)}
                      className={`px-3 py-1 font-semibold transition-colors ${tipoPreview === t
                        ? "bg-slate-700 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      {t === "especial" ? "Especial (4 boxes)" : "Simples (2 boxes)"}
                    </button>
                  ))}
                </div>
                {/* Toggle preview */}
                <button onClick={() => setShowPreview(v => !v)}
                  className="p-1.5 border border-gray-200 rounded text-gray-400 hover:text-gray-600">
                  {showPreview ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                </button>
              </div>
            </div>

            {showPreview && (
              <div className="bg-gray-300 p-4 rounded-lg overflow-auto">
                <div style={{ transform: "scale(0.85)", transformOrigin: "top left",
                  width: "calc(100% / 0.85)" }}>
                  <PreviewReceituario modelId={previewModel} tipo={tipoPreview}/>
                </div>
              </div>
            )}

            {/* Info do modelo em preview */}
            <div className="bg-white border border-gray-200 rounded p-3 text-xs space-y-1">
              {[
                ["Modelo em preview", ARABESQUE_MODELS[previewModel].name],
                ["Categoria", CATEGORY_LABELS[ARABESQUE_MODELS[previewModel].category]],
                ["Motor de render", ARABESQUE_MODELS[previewModel].renderMode],
                ["Altura da faixa", `${ARABESQUE_MODELS[previewModel].bandHeightPx}px`],
                ["Descrição", ARABESQUE_MODELS[previewModel].description],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-400 shrink-0 w-28">{k}:</span>
                  <span className="text-gray-700 font-medium">{v}</span>
                </div>
              ))}
            </div>

            {changed && (
              <Button onClick={handleSave} className="w-full bg-teal-600 hover:bg-teal-700 text-white">
                <Save className="w-4 h-4 mr-2"/>
                Salvar "{ARABESQUE_MODELS[previewModel].name}" como padrão da clínica
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
