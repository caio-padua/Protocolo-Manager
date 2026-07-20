// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO COMPLETA DO RECEITUÁRIO — /configuracoes/receituario
// Pedidos 3-8 do CEO Dr. Caio (20/07/2026)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useId } from "react";
import React from "react";
import {
  LayoutTemplate, Save, Upload, Trash2, CheckCircle2, ChevronDown, ChevronRight,
  ImageIcon, Building2, AlignLeft, Layers, Footprints, Zap, Eye, EyeOff,
  AlertCircle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ARABESQUE_MODELS, CATEGORY_LABELS, getSavedBandModel, saveBandModel,
  type ArabesqueModelId, type ArabesqueModel,
} from "@/lib/arabesques/models";
import {
  loadReceituarioConfig, saveReceituarioConfig, genBandId, UPLOAD_RULES,
  DEFAULT_CONFIG, type ReceituarioConfig, type CustomBand,
} from "@/lib/arabesques/receituario-config";
import { getTileForModel } from "@/lib/arabesques/InlinePatterns";
import { ArabesqueBand, InfoCard } from "@/lib/arabesques/ArabesqueBand";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ══════════════════════════════════════════════════════════════════════════════
// MINIATURAS DE MODELOS
// ══════════════════════════════════════════════════════════════════════════════
function SvgThumb({ m, w = 160, h = 48 }: { m: ArabesqueModel; w?: number; h?: number }) {
  const uid = useId();
  const pid = `th-${uid}-${m.id}`.replace(/[^a-zA-Z0-9-]/g, "_");
  const tileW = m.tileW ?? 60, tileH = m.tileH ?? 60;
  const stroke = m.strokeColor ?? "#8a8a86", border = m.borderColor ?? stroke;
  const sw = m.strokeWidth ?? 1.2, op = m.strokeOpacity ?? 0.9;
  const scale = m.scaleToHeight ? h / tileH : 1;
  const scaledW = tileW * scale, scaledH = tileH * scale;
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
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

function RasterThumb({ src, w = 160, h = 48 }: { src: string; w?: number; h?: number }) {
  return (
    <div style={{ width: w, height: h, background: "#f3f3f0", border: "0.5px solid #aaa",
      overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {src
        ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
        : <span style={{ fontSize: 7, color: "#bbb" }}>sem imagem</span>
      }
    </div>
  );
}

function ModelCard({ m, src, selected, onSelect, isSaved }: {
  m?: ArabesqueModel; src?: string; selected: boolean; onSelect: () => void; isSaved: boolean;
}) {
  const thumb = m
    ? (m.renderMode === "inline-svg"
      ? <SvgThumb m={m} w={168} h={46}/>
      : <RasterThumb src={`${BASE}/assets/arabesques/${m.assetFile ?? ""}`} w={168} h={46}/>)
    : <RasterThumb src={src ?? ""} w={168} h={46}/>;
  const label = m?.name ?? "Faixa personalizada";
  const sub   = m?.renderMode === "inline-svg" ? "SVG vetorial" : "PNG — PADUA Designer";

  return (
    <button onClick={onSelect} style={{
      display: "flex", flexDirection: "column", padding: 0, cursor: "pointer",
      border: selected ? "2.5px solid #45B8CC" : isSaved ? "2px solid #3D7A7A" : "1.5px solid #d0d0cc",
      borderRadius: 4, background: selected ? "#eef9fb" : isSaved ? "#edf4f4" : "#fafaf8",
      boxShadow: selected ? "0 0 0 4px rgba(69,184,204,0.18)" : "none",
      transition: "all 0.14s", width: 172, overflow: "hidden",
    }}>
      <div style={{ width: 172, height: 50, background: "#ececea", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center" }}>{thumb}</div>
      <div style={{ padding: "5px 8px", borderTop: `1px solid ${selected ? "#b0e8ee" : "#e8e8e6"}` }}>
        <div style={{ fontSize: 7, fontWeight: selected ? 700 : 600,
          color: selected ? "#1a7a8a" : "#2a2a2a", letterSpacing: 0.3,
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {label}
          {isSaved && !selected && <span style={{ fontSize: 5.5, color: "#3D7A7A", background: "#d4eded", padding: "1px 4px", borderRadius: 2 }}>ATIVO</span>}
          {selected && <span style={{ fontSize: 5.5, color: "#1a7a8a", background: "#c0eef5", padding: "1px 4px", borderRadius: 2 }}>PREVIEW</span>}
        </div>
        {m && <div style={{ fontSize: 5.5, color: "#888", marginTop: 1 }}>{sub}</div>}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW DO RECEITUÁRIO (ao vivo com todos os data-binds)
// ══════════════════════════════════════════════════════════════════════════════
function PreviewReceita({ cfg, bandModel, customBandDataUrl, tipo }: {
  cfg: ReceituarioConfig; bandModel: string; customBandDataUrl?: string; tipo: "especial" | "simples";
}) {
  const parseCampos = (s: string): [string, string][] =>
    s.split(",").map(f => f.trim()).filter(Boolean).map(f => [f, "──────────────"]);

  const band = (
    <ArabesqueBand modelId={bandModel} customDataUrl={customBandDataUrl}>
      <InfoCard titulo={cfg.boxPacienteTitulo || "Paciente"} rows={parseCampos(cfg.boxPacienteCampos)}/>
      <InfoCard titulo={cfg.boxMedicoTitulo   || "Emitente"} rows={parseCampos(cfg.boxMedicoCampos)}/>
    </ArabesqueBand>
  );
  const bandInf = tipo === "especial" ? (
    <ArabesqueBand modelId={bandModel} customDataUrl={customBandDataUrl}>
      <InfoCard titulo={cfg.boxCompradorTitulo || "Comprador"} rows={parseCampos(cfg.boxCompradorCampos)}/>
      <InfoCard titulo={cfg.boxFarmaciaTitulo  || "Farmácia"}  rows={parseCampos(cfg.boxFarmaciaCampos)}/>
    </ArabesqueBand>
  ) : null;

  const rodapeEsq = [cfg.rodapeEndereco, cfg.rodapeDados, cfg.rodapeDados2, cfg.rodapeDados3]
    .filter(Boolean);

  return (
    <div style={{ background: "#fff", border: "0.5px solid #bbb", boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
      fontFamily: "Georgia, serif", minWidth: 560 }}>

      {/* CABEÇALHO (Pedidos 5a / 5b / 5c) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7mm 10mm 5mm", borderBottom: "0.4px solid #ddd", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Pedido 5a — logo */}
          {cfg.cabecalhoLogoDataUrl
            ? <img src={cfg.cabecalhoLogoDataUrl} alt="Logo" style={{ height: 36, maxWidth: 80, objectFit: "contain" }}/>
            : <div style={{ width: 52, height: 36, border: "1px dashed #ccc", borderRadius: 2,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 5.5, color: "#bbb", letterSpacing: 1 }}>LOGO</div>
          }
          <div>
            {/* Pedido 5b — título */}
            <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: 0.8, color: "#1a1a1a" }}>
              {cfg.cabecalhoNome || "Nome da Clínica"}
            </div>
            {/* Pedido 5c — subtítulo */}
            {cfg.cabecalhoTitulo && (
              <div style={{ fontSize: 7, color: "#666", letterSpacing: 2, marginTop: 1 }}>
                {cfg.cabecalhoTitulo}
              </div>
            )}
            {cfg.cabecalhoSubtitulo && (
              <div style={{ fontSize: 6.5, color: "#888", letterSpacing: 1, marginTop: 1 }}>
                {cfg.cabecalhoSubtitulo}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800, fontSize: 8.5, letterSpacing: 2, textTransform: "uppercase",
            border: "0.5px solid #bbb", padding: "3px 8px", color: "#333" }}>
            {tipo === "especial" ? "Receituário de Controle Especial" : "Receituário Simples"}
          </div>
        </div>
      </div>

      {/* Faixa superior */}
      {band}

      {/* Corpo */}
      <div style={{ padding: "5mm 10mm", minHeight: 32 }}>
        <div style={{ fontSize: 14, fontStyle: "italic", marginBottom: 3 }}>
          R<span style={{ fontSize: 9, verticalAlign: "super" }}>x</span>
        </div>
        {["1. Zolpidem 10 mg — Tomar 1 comprimido à noite.",
          "2. Clonazepam 0,5 mg — Tomar 1 comprimido à noite."].map(t => (
          <div key={t} style={{ fontSize: 6.5, color: "#333", marginBottom: 4,
            borderBottom: "0.3px dashed #ddd", paddingBottom: 4 }}>{t}</div>
        ))}
        <div style={{ fontSize: 5.5, color: "#777", marginTop: 5 }}>
          São Paulo, 20 de julho de 2026.
        </div>
      </div>

      {/* Faixa inferior (especial) */}
      {bandInf}

      {/* RODAPÉ (Pedidos 6 e 7) */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        padding: "4mm 8mm", borderTop: "0.3px solid #ddd", background: "#fafaf8", gap: 8 }}>

        {/* Pedido 6a/6b — Rodapé esquerdo */}
        <div style={{ flex: 1 }}>
          {rodapeEsq.length > 0
            ? rodapeEsq.map((line, i) => (
                <div key={i} style={{ fontSize: i === 0 ? 6.5 : 5.5,
                  color: i === 0 ? "#333" : "#888", marginBottom: 1, fontFamily: "inherit" }}>
                  {line}
                </div>
              ))
            : <div style={{ fontSize: 5.5, color: "#ccc", fontStyle: "italic" }}>Endereço da clínica</div>
          }
        </div>

        {/* Pedido 7a/7b/7c — Rodapé direito */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          {/* 7a — símbolo Paxter */}
          <img src={`${BASE}/brand/paxter-symbol.png`} alt="Paxter"
            style={{ height: 20, width: 20, objectFit: "contain", opacity: 0.75 }}/>
          <div>
            {/* 7b — nome editável */}
            <div style={{ fontWeight: 800, fontSize: 7, letterSpacing: 2,
              textTransform: "uppercase", color: "#c9a24e" }}>
              {cfg.rodapePaxterNome || "PAXTER"}
            </div>
            {/* 7c — subtítulo editável */}
            <div style={{ fontSize: 5.5, color: "#999", letterSpacing: 1 }}>
              {cfg.rodapePaxterSubtitulo || "Clinical Intelligence System"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ACCORDION SECTION
// ══════════════════════════════════════════════════════════════════════════════
function Section({ icon, label, children, defaultOpen = false, badge }: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
  defaultOpen?: boolean; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="text-teal-600 shrink-0">{icon}</span>
        <span className="font-bold text-sm text-gray-800 flex-1">{label}</span>
        {badge && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-semibold">{badge}</span>}
        {open ? <ChevronDown className="w-4 h-4 text-gray-400"/> : <ChevronRight className="w-4 h-4 text-gray-400"/>}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">{children}</div>}
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function ConfigReceituario() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [cfg, setCfg] = useState<ReceituarioConfig>(loadReceituarioConfig);
  const [bandModel, setBandModel] = useState<string>(getSavedBandModel);
  const [previewBandModel, setPreviewBandModel] = useState<string>(bandModel);
  const [previewCustomDataUrl, setPreviewCustomDataUrl] = useState<string | undefined>();
  const [tipoPreview, setTipoPreview] = useState<"especial" | "simples">("especial");
  const [showPreview, setShowPreview] = useState(true);
  const [saved, setSaved] = useState(false);
  const [dragging, setDragging] = useState(false);

  // ── helpers ─────────────────────────────────────────────────────────────────
  const patch = useCallback((partial: Partial<ReceituarioConfig>) => {
    setCfg(prev => ({ ...prev, ...partial }));
    setSaved(false);
  }, []);

  function handleSave() {
    saveReceituarioConfig(cfg);
    saveBandModel(previewBandModel as ArabesqueModelId);
    setBandModel(previewBandModel);
    setSaved(true);
    toast({ title: "Configuração salva!", description: "Todas as alterações foram gravadas na clínica." });
  }

  // ── Upload de faixa (Pedido 3) ───────────────────────────────────────────────
  function processFile(file: File) {
    if (!UPLOAD_RULES.acceptedTypes.includes(file.type as never)) {
      toast({ title: `Formato não aceito: ${file.type || "desconhecido"}`,
        description: `Use: ${UPLOAD_RULES.formatosTxt}`, variant: "destructive" }); return;
    }
    if (file.size > UPLOAD_RULES.maxSizeBytes) {
      toast({ title: `Arquivo muito grande (${(file.size/1024/1024).toFixed(1)} MB)`,
        description: `Máximo: ${UPLOAD_RULES.maxSizeMb} MB`, variant: "destructive" }); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const band: CustomBand = {
          id: genBandId(),
          name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
          dataUrl,
          fileSizeKb: Math.round(file.size / 1024),
          widthPx: img.naturalWidth,
          heightPx: img.naturalHeight,
          addedAt: new Date().toISOString(),
        };
        patch({ customBands: [...(cfg.customBands ?? []), band] });
        setPreviewBandModel(band.id);
        setPreviewCustomDataUrl(dataUrl);
        toast({ title: `Faixa "${band.name}" adicionada!`, description: `${band.widthPx}×${band.heightPx}px — ${band.fileSizeKb} KB` });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) processFile(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files?.[0]; if (f) processFile(f);
  }

  function removeCustomBand(id: string) {
    patch({ customBands: cfg.customBands.filter(b => b.id !== id) });
    if (previewBandModel === id) { setPreviewBandModel(bandModel); setPreviewCustomDataUrl(undefined); }
  }

  // ── Upload de logo (Pedido 5a) ───────────────────────────────────────────────
  function processLogo(file: File) {
    if (!["image/png","image/jpeg","image/svg+xml"].includes(file.type)) {
      toast({ title: "Use PNG, JPG ou SVG para a logo", variant: "destructive" }); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Logo muito grande — máximo 2 MB", variant: "destructive" }); return;
    }
    const reader = new FileReader();
    reader.onload = () => patch({ cabecalhoLogoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  // ── grupos do seletor de faixa ────────────────────────────────────────────
  const grouped = Object.values(ARABESQUE_MODELS).reduce<Record<string, ArabesqueModel[]>>(
    (acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; }, {}
  );

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-stone-100">

      {/* CABEÇALHO DA TELA */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 max-w-screen-2xl mx-auto">
          <LayoutTemplate className="w-5 h-5 text-teal-600"/>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800 tracking-wide">Configuração do Receituário</h1>
            <p className="text-xs text-gray-500">Faixa ornamental · Cabeçalho · Boxes · Rodapé · Upload de faixas</p>
          </div>
          <Button onClick={handleSave}
            className={`${saved ? "bg-green-600 hover:bg-green-700" : "bg-teal-600 hover:bg-teal-700"} text-white text-sm`}>
            {saved ? <CheckCircle2 className="w-4 h-4 mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
            {saved ? "Salvo" : "Salvar tudo"}
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-[1fr_500px] gap-6 items-start">

          {/* ════════════════════════════════════════════════════════════════
              COLUNA ESQUERDA — configuração
          ════════════════════════════════════════════════════════════════ */}
          <div className="space-y-3">

            {/* ── PEDIDO 3 — Upload de faixas customizadas ─────────────── */}
            <Section icon={<Upload className="w-4 h-4"/>} label="Upload de Faixa Personalizada"
              defaultOpen badge="NOVO">

              {/* Regras de formato */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-wider">
                  <Info className="w-3.5 h-3.5"/> Especificações do arquivo
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-blue-900">
                  {[
                    ["Formatos aceitos", UPLOAD_RULES.formatosTxt],
                    ["Tamanho máximo", `${UPLOAD_RULES.maxSizeMb} MB`],
                    ["Dimensões recomendadas", `${UPLOAD_RULES.recWidth} × ${UPLOAD_RULES.recHeight} px`],
                    ["Proporção mínima (L:H)", `${UPLOAD_RULES.minAspect}:1 (faixa horizontal)`],
                    ["Fundo recomendado", "Branco ou transparente (PNG)"],
                    ["Orientação", "Horizontal (strip para receituário)"],
                    ["Uso", "Impressão e preview — não enviado ao servidor"],
                    ["Armazenamento", "LocalStorage do navegador (por dispositivo)"],
                  ].map(([k, v]) => (
                    <div key={k} className="contents">
                      <span className="font-semibold text-blue-700">{k}:</span>
                      <span>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Zona de drop */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                  ${dragging ? "border-teal-400 bg-teal-50" : "border-gray-300 bg-gray-50 hover:border-teal-300 hover:bg-teal-50"}`}>
                <input ref={fileInputRef} type="file"
                  accept={UPLOAD_RULES.acceptedExts} className="hidden" onChange={onFileChange}/>
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2"/>
                <p className="text-sm font-semibold text-gray-600">Solte o arquivo aqui ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">{UPLOAD_RULES.formatosTxt} · máx. {UPLOAD_RULES.maxSizeMb} MB · recomendado {UPLOAD_RULES.recWidth}×{UPLOAD_RULES.recHeight}px</p>
              </div>

              {/* Faixas já enviadas */}
              {cfg.customBands.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Faixas enviadas ({cfg.customBands.length})
                  </div>
                  {cfg.customBands.map(b => (
                    <div key={b.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-2">
                      <div className="w-24 h-8 overflow-hidden rounded border border-gray-100 shrink-0">
                        <img src={b.dataUrl} alt={b.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-700 truncate">{b.name}</div>
                        <div className="text-xs text-gray-400">{b.widthPx}×{b.heightPx}px · {b.fileSizeKb} KB</div>
                      </div>
                      <Button size="sm" variant="outline"
                        onClick={() => { setPreviewBandModel(b.id); setPreviewCustomDataUrl(b.dataUrl); }}
                        className="text-xs px-2 py-1 h-7 border-teal-300 text-teal-700">
                        Preview
                      </Button>
                      <button onClick={() => removeCustomBand(b.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── SELETOR DE FAIXA ATIVA (catálogo padrão) ─────────────── */}
            <Section icon={<LayoutTemplate className="w-4 h-4"/>}
              label="Faixa Ornamental Ativa" defaultOpen
              badge={`${Object.keys(ARABESQUE_MODELS).length + cfg.customBands.length} modelos`}>

              <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0"/>
                <span className="text-xs text-teal-800">
                  <b>Ativo:</b> {
                    bandModel.startsWith("custom-")
                      ? cfg.customBands.find(b => b.id === bandModel)?.name ?? bandModel
                      : (ARABESQUE_MODELS[bandModel as ArabesqueModelId]?.name ?? bandModel)
                  }
                </span>
              </div>

              {/* Custom bands no topo (se houver) */}
              {cfg.customBands.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 pb-1 border-b border-gray-200">
                    Faixas Personalizadas ({cfg.customBands.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cfg.customBands.map(b => (
                      <ModelCard key={b.id} src={b.dataUrl}
                        selected={previewBandModel === b.id}
                        isSaved={bandModel === b.id}
                        onSelect={() => { setPreviewBandModel(b.id); setPreviewCustomDataUrl(b.dataUrl); }}/>
                    ))}
                  </div>
                </div>
              )}

              {/* Catálogo padrão */}
              {Object.entries(grouped).map(([cat, models]) => (
                <div key={cat} className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 pb-1 border-b border-gray-200">
                    {CATEGORY_LABELS[cat as ArabesqueModel["category"]]} ({models.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {models.map(m => (
                      <ModelCard key={m.id} m={m}
                        selected={previewBandModel === m.id}
                        isSaved={bandModel === m.id}
                        onSelect={() => { setPreviewBandModel(m.id); setPreviewCustomDataUrl(undefined); }}/>
                    ))}
                  </div>
                </div>
              ))}
            </Section>

            {/* ── PEDIDOS 5a / 5b / 5c — Cabeçalho da clínica ─────────── */}
            <Section icon={<Building2 className="w-4 h-4"/>} label="Cabeçalho da Receita">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/>
                <span>Estes campos aparecem no topo de toda receita gerada. Preencha conforme o papel timbrado da clínica.</span>
              </div>

              {/* 5a — Logo */}
              <FieldRow label="Logo da Clínica (5a)" hint="PNG ou JPG com fundo transparente · máx. 2 MB · altura ideal 60–100 px">
                <div className="flex items-center gap-3">
                  <div className="w-20 h-14 border border-dashed border-gray-300 rounded bg-gray-50 overflow-hidden flex items-center justify-center">
                    {cfg.cabecalhoLogoDataUrl
                      ? <img src={cfg.cabecalhoLogoDataUrl} alt="Logo"
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}/>
                      : <ImageIcon className="w-6 h-6 text-gray-300"/>
                    }
                  </div>
                  <div className="space-y-1.5">
                    <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.svg"
                      className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processLogo(f); e.target.value=""; }}/>
                    <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}
                      className="text-xs h-7">
                      <Upload className="w-3 h-3 mr-1.5"/> Enviar logo
                    </Button>
                    {cfg.cabecalhoLogoDataUrl && (
                      <Button size="sm" variant="ghost" onClick={() => patch({ cabecalhoLogoDataUrl: undefined })}
                        className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-3 h-3 mr-1"/> Remover
                      </Button>
                    )}
                  </div>
                </div>
              </FieldRow>

              {/* 5b — Título (nome da clínica) */}
              <FieldRow label="Nome / Título da Clínica (5b)" hint="Ex: Clínica Padua — Dr. Caio H. F. Pádua">
                <Input value={cfg.cabecalhoNome} onChange={e => patch({ cabecalhoNome: e.target.value })}
                  placeholder={DEFAULT_CONFIG.cabecalhoNome} className="text-sm"/>
              </FieldRow>

              {/* 5c — Subtítulo */}
              <FieldRow label="Subtítulo da Clínica (5c)" hint="Ex: Medicina Integrativa e Longevidade">
                <Input value={cfg.cabecalhoTitulo} onChange={e => patch({ cabecalhoTitulo: e.target.value })}
                  placeholder={DEFAULT_CONFIG.cabecalhoTitulo} className="text-sm"/>
              </FieldRow>

              <FieldRow label="Segunda linha do subtítulo (opcional)">
                <Input value={cfg.cabecalhoSubtitulo} onChange={e => patch({ cabecalhoSubtitulo: e.target.value })}
                  placeholder="Ex: CRM SP 123.456 · RQE 56.789" className="text-sm"/>
              </FieldRow>
            </Section>

            {/* ── PEDIDO 4 — Campos internos dos Boxes ─────────────────── */}
            <Section icon={<Layers className="w-4 h-4"/>} label="Campos dos Boxes das Faixas">
              <p className="text-xs text-gray-500">
                Defina o <b>título</b> e os <b>campos</b> de cada cartão exibido sobre a faixa ornamental.
                Separe os campos por <code className="bg-gray-100 px-1 rounded">,</code> vírgula.
                Os valores reais vêm dos dados do paciente/médico no momento da emissão.
              </p>

              {[
                { lbl: "Box 1 — Paciente (faixa superior, esquerda)", tk: "boxPacienteTitulo", ck: "boxPacienteCampos", td: "boxPacienteTitulo", cd: "boxPacienteCampos" },
                { lbl: "Box 2 — Emitente / Médico (faixa superior, direita)", tk: "boxMedicoTitulo", ck: "boxMedicoCampos", td: "boxMedicoTitulo", cd: "boxMedicoCampos" },
                { lbl: "Box 3 — Comprador (faixa inferior, esquerda — Controle Especial)", tk: "boxCompradorTitulo", ck: "boxCompradorCampos", td: "boxCompradorTitulo", cd: "boxCompradorCampos" },
                { lbl: "Box 4 — Farmácia (faixa inferior, direita — Controle Especial)", tk: "boxFarmaciaTitulo", ck: "boxFarmaciaCampos", td: "boxFarmaciaTitulo", cd: "boxFarmaciaCampos" },
              ].map(({ lbl, tk, ck }) => (
                <div key={tk} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">{lbl}</div>
                  <FieldRow label="Título do cartão">
                    <Input value={(cfg as Record<string,string>)[tk]}
                      onChange={e => patch({ [tk]: e.target.value } as Partial<ReceituarioConfig>)}
                      placeholder={(DEFAULT_CONFIG as Record<string,string>)[tk]} className="text-sm"/>
                  </FieldRow>
                  <FieldRow label="Campos (separados por vírgula)"
                    hint="Ex: Nome, CPF, Data de Nascimento, Cidade / UF">
                    <Input value={(cfg as Record<string,string>)[ck]}
                      onChange={e => patch({ [ck]: e.target.value } as Partial<ReceituarioConfig>)}
                      placeholder={(DEFAULT_CONFIG as Record<string,string>)[ck]} className="text-sm"/>
                  </FieldRow>
                </div>
              ))}
            </Section>

            {/* ── PEDIDOS 6a / 6b — Rodapé esquerdo ───────────────────── */}
            <Section icon={<AlignLeft className="w-4 h-4"/>} label="Rodapé — Dados da Clínica (esquerda)">
              <p className="text-xs text-gray-500">Aparece no canto inferior esquerdo de toda receita.</p>

              <FieldRow label="Endereço (6a)" hint="Linha principal do endereço da clínica">
                <Input value={cfg.rodapeEndereco} onChange={e => patch({ rodapeEndereco: e.target.value })}
                  placeholder={DEFAULT_CONFIG.rodapeEndereco} className="text-sm"/>
              </FieldRow>

              <FieldRow label="Dados adicionais — linha 2 (6b)" hint="Ex: (11) 3090-0010  |  contato@clinica.com.br">
                <Input value={cfg.rodapeDados} onChange={e => patch({ rodapeDados: e.target.value })}
                  placeholder={DEFAULT_CONFIG.rodapeDados} className="text-sm"/>
              </FieldRow>

              <FieldRow label="Dados adicionais — linha 3" hint="Ex: CNPJ 12.345.678/0001-90">
                <Input value={cfg.rodapeDados2} onChange={e => patch({ rodapeDados2: e.target.value })}
                  placeholder="Linha 3 (opcional)" className="text-sm"/>
              </FieldRow>

              <FieldRow label="Dados adicionais — linha 4">
                <Input value={cfg.rodapeDados3} onChange={e => patch({ rodapeDados3: e.target.value })}
                  placeholder="Linha 4 (opcional)" className="text-sm"/>
              </FieldRow>
            </Section>

            {/* ── PEDIDOS 7a / 7b / 7c — Rodapé direito (PAXTER) ──────── */}
            <Section icon={<Zap className="w-4 h-4"/>} label="Rodapé — Marca do Sistema (direita)">
              <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3 mb-2">
                <img src={`${BASE}/brand/paxter-symbol.png`} alt="Símbolo Paxter"
                  className="h-8 w-8 object-contain shrink-0"/>
                <div>
                  <div className="text-xs font-bold tracking-widest text-amber-400 uppercase">
                    {cfg.rodapePaxterNome || "PAXTER"}
                  </div>
                  <div className="text-xs text-gray-400">{cfg.rodapePaxterSubtitulo || "Clinical Intelligence System"}</div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-2">
                O símbolo (7a) é fixo — usa o ícone oficial do sistema. Nome e subtítulo são editáveis.
              </p>

              <FieldRow label="Nome do sistema (7b)" hint="Padrão: PAXTER — pode virar PARXIS ou outro">
                <Input value={cfg.rodapePaxterNome} onChange={e => patch({ rodapePaxterNome: e.target.value })}
                  placeholder="PAXTER" className="text-sm font-bold tracking-widest uppercase"/>
              </FieldRow>

              <FieldRow label="Subtítulo do sistema (7c)" hint="Padrão: Clinical Intelligence System">
                <Input value={cfg.rodapePaxterSubtitulo} onChange={e => patch({ rodapePaxterSubtitulo: e.target.value })}
                  placeholder="Clinical Intelligence System" className="text-sm"/>
              </FieldRow>
            </Section>

          </div>{/* fim coluna esquerda */}

          {/* ════════════════════════════════════════════════════════════════
              COLUNA DIREITA — Preview ao vivo (sticky)
          ════════════════════════════════════════════════════════════════ */}
          <div className="space-y-3 sticky top-20">
            {/* Controles do preview */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">Preview ao vivo</div>
              <div className="flex items-center gap-2">
                <div className="flex border border-gray-300 rounded overflow-hidden text-xs">
                  {(["especial", "simples"] as const).map(t => (
                    <button key={t} onClick={() => setTipoPreview(t)}
                      className={`px-3 py-1 font-semibold transition-colors ${tipoPreview === t
                        ? "bg-slate-700 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      {t === "especial" ? "Especial" : "Simples"}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowPreview(v => !v)}
                  className="p-1.5 border border-gray-200 rounded text-gray-400 hover:text-gray-600">
                  {showPreview ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                </button>
              </div>
            </div>

            {showPreview && (
              <div className="bg-gray-300 p-3 rounded-xl overflow-auto">
                <div style={{ transform: "scale(0.82)", transformOrigin: "top left",
                  width: "calc(100% / 0.82)" }}>
                  <PreviewReceita cfg={cfg} bandModel={previewBandModel}
                    customBandDataUrl={previewCustomDataUrl} tipo={tipoPreview}/>
                </div>
              </div>
            )}

            {/* Info do modelo em preview */}
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
              {[
                ["Faixa ativa", bandModel.startsWith("custom-")
                  ? cfg.customBands.find(b => b.id === bandModel)?.name ?? bandModel
                  : (ARABESQUE_MODELS[bandModel as ArabesqueModelId]?.name ?? bandModel)],
                ["Em preview", previewBandModel.startsWith("custom-")
                  ? cfg.customBands.find(b => b.id === previewBandModel)?.name ?? "Faixa personalizada"
                  : (ARABESQUE_MODELS[previewBandModel as ArabesqueModelId]?.name ?? previewBandModel)],
                ["Tipo de receita", tipoPreview === "especial" ? "Controle Especial (4 boxes)" : "Simples (2 boxes)"],
                ["Faixas customizadas", `${cfg.customBands.length} enviada(s)`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-400 shrink-0 w-32">{k}:</span>
                  <span className="text-gray-700 font-medium truncate">{v}</span>
                </div>
              ))}
            </div>

            <Button onClick={handleSave}
              className={`w-full text-sm ${saved ? "bg-green-600 hover:bg-green-700" : "bg-teal-600 hover:bg-teal-700"} text-white`}>
              {saved ? <CheckCircle2 className="w-4 h-4 mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
              {saved ? "Configuração salva" : "Salvar toda a configuração"}
            </Button>
          </div>

        </div>{/* fim grid */}
      </div>
    </div>
  );
}
