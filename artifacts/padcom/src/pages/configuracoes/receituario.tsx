// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURAÇÃO COMPLETA DO RECEITUÁRIO v2 — /configuracoes/receituario
// Spec: specs/receituario-designer-v2.md  —  20/07/2026
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from "react";
import React from "react";
import {
  LayoutTemplate, Save, Upload, Trash2, CheckCircle2, ChevronDown, ChevronRight,
  ImageIcon, Building2, AlignLeft, Layers, Footprints, Zap, Eye, EyeOff,
  AlertCircle, Info, Printer, Type, Palette, PenLine, Shield, GripVertical,
  SplitSquareVertical, Rows,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ARABESQUE_MODELS, CATEGORY_LABELS, getSavedBandModel, saveBandModel,
  type ArabesqueModelId, type ArabesqueModel,
} from "@/lib/arabesques/models";
import {
  loadReceituarioConfig, saveReceituarioConfig, genBandId,
  UPLOAD_RULES, FONTE_OPTIONS, DEFAULT_CONFIG,
  type ReceituarioConfig, type CustomBand,
} from "@/lib/arabesques/receituario-config";
import { getTileForModel } from "@/lib/arabesques/InlinePatterns";
import { ReceituarioPreview } from "@/components/receituario/ReceituarioPreview";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ══════════════════════════════════════════════════════════════════════════════
// THUMB DO SELETOR DE FAIXA
// ══════════════════════════════════════════════════════════════════════════════
function SvgThumb({ m }: { m: ArabesqueModel }) {
  const w = 168, h = 46;
  const pid = `th-${m.id}`.replace(/[^a-zA-Z0-9-]/g, "_");
  const stroke = m.strokeColor ?? "#8a8a86", border = m.borderColor ?? stroke;
  const sw = m.strokeWidth ?? 1.2, op = m.strokeOpacity ?? 0.9;
  const tileW = m.tileW ?? 60, tileH = m.tileH ?? 60;
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

function ModelCard({ m, src, selected, isSaved, onSelect }: {
  m?: ArabesqueModel; src?: string; selected: boolean; isSaved: boolean; onSelect: () => void;
}) {
  const thumb = m
    ? (m.renderMode === "inline-svg"
        ? <SvgThumb m={m}/>
        : <img src={`${BASE}/assets/arabesques/${m.assetFile ?? ""}`} alt=""
            style={{ width: 168, height: 46, objectFit: "cover" }}/>)
    : <img src={src ?? ""} alt="" style={{ width: 168, height: 46, objectFit: "cover" }}/>;
  const label = m?.name ?? "Faixa personalizada";

  return (
    <button onClick={onSelect} style={{
      display: "flex", flexDirection: "column", cursor: "pointer", padding: 0,
      border: selected ? "2.5px solid #45B8CC" : isSaved ? "2px solid #3D7A7A" : "1.5px solid #d0d0cc",
      borderRadius: 4, background: selected ? "#eef9fb" : isSaved ? "#edf4f4" : "#fafaf8",
      boxShadow: selected ? "0 0 0 4px rgba(69,184,204,0.18)" : "none",
      width: 172, overflow: "hidden", transition: "all 0.14s",
    }}>
      <div style={{ width: 172, height: 50, background: "#ececea", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center" }}>{thumb}</div>
      <div style={{ padding: "5px 8px", borderTop: `1px solid ${selected ? "#b0e8ee" : "#e8e8e6"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 7, fontWeight: selected ? 700 : 600, color: selected ? "#1a7a8a" : "#2a2a2a" }}>
          {label}
        </span>
        {isSaved && !selected && <span style={{ fontSize: 5.5, color: "#3D7A7A", background: "#d4eded",
          padding: "1px 4px", borderRadius: 2 }}>ATIVO</span>}
        {selected && <span style={{ fontSize: 5.5, color: "#1a7a8a", background: "#c0eef5",
          padding: "1px 4px", borderRadius: 2 }}>PREVIEW</span>}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ACCORDION SECTION
// ══════════════════════════════════════════════════════════════════════════════
function Section({ icon, label, badge, defaultOpen = false, children }: {
  icon: React.ReactNode; label: string; badge?: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
        <span className="text-teal-600 shrink-0">{icon}</span>
        <span className="font-bold text-sm text-gray-800 flex-1">{label}</span>
        {badge && <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-semibold mr-1">{badge}</span>}
        {open ? <ChevronDown className="w-4 h-4 text-gray-400"/> : <ChevronRight className="w-4 h-4 text-gray-400"/>}
      </button>
      {open && <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-3">{children}</div>}
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// Toggle modo imagem/texto
function ModoToggle({ valor, onChange }: {
  valor: "texto" | "imagem"; onChange: (v: "texto" | "imagem") => void;
}) {
  return (
    <div className="flex border border-gray-300 rounded overflow-hidden text-xs w-fit">
      {(["texto", "imagem"] as const).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={`px-3 py-1 font-semibold capitalize transition-colors
            ${valor === m ? "bg-teal-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
          {m === "texto" ? "Texto" : "Imagem (upload)"}
        </button>
      ))}
    </div>
  );
}

// Botão de upload genérico
function UploadBtn({ accept, onFile, label }: {
  accept: string; onFile: (f: File) => void; label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}/>
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()}
        className="text-xs h-7">
        <Upload className="w-3 h-3 mr-1.5"/>{label}
      </Button>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function ConfigReceituario() {
  const { toast } = useToast();
  const bandFileRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [cfg, setCfg]         = useState<ReceituarioConfig>(loadReceituarioConfig);
  const [bandModel, setBandModel] = useState<string>(getSavedBandModel);
  const [previewBand, setPreviewBand] = useState<string>(bandModel);
  const [previewCustomUrl, setPreviewCustomUrl] = useState<string | undefined>();
  const [showPreview, setShowPreview] = useState(true);
  const [saved, setSaved]     = useState(false);
  const [dragging, setDragging] = useState(false);

  // Data-bind em tempo real — qualquer mudança no cfg reflete no preview imediatamente
  const patch = useCallback((partial: Partial<ReceituarioConfig>) => {
    setCfg(prev => ({ ...prev, ...partial }));
    setSaved(false);
  }, []);

  // ── Salvar ──────────────────────────────────────────────────────────────────
  function handleSave() {
    saveReceituarioConfig(cfg);
    saveBandModel(previewBand as ArabesqueModelId);
    setBandModel(previewBand);
    setSaved(true);
    toast({ title: "Configuração salva!", description: "Gravada no navegador deste dispositivo." });
  }

  // ── Imprimir / PDF (P8) ─────────────────────────────────────────────────────
  function handlePrint() {
    const el = printRef.current;
    if (!el) return;
    const html = el.innerHTML;
    const win = window.open("", "_blank");
    if (!win) { toast({ title: "Pop-up bloqueado. Libere pop-ups para este site.", variant: "destructive" }); return; }
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Receituário</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 210mm; min-height: 297mm; background: #fff; font-family: Georgia, serif; }
</style></head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); win.close(); }, 400);
  }

  // ── Upload de faixa ornamental ──────────────────────────────────────────────
  function processaBandFile(file: File) {
    if (!UPLOAD_RULES.acceptedTypes.includes(file.type as never)) {
      toast({ title: `Formato não aceito`, description: `Use: ${UPLOAD_RULES.formatosTxt}`, variant: "destructive" }); return;
    }
    if (file.size > UPLOAD_RULES.maxSizeBytes) {
      toast({ title: `Arquivo muito grande`, description: `Máximo: ${UPLOAD_RULES.maxSizeMb} MB`, variant: "destructive" }); return;
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
        setPreviewBand(band.id);
        setPreviewCustomUrl(dataUrl);
        toast({ title: `Faixa "${band.name}" adicionada!` });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // ── Upload de imagem genérica (logos, assinatura, QR) ─────────────────────
  // allowedTypes: lista de MIME types aceitos; padrão = PNG + JPG + SVG
  function makeImgUploader(
    field: keyof ReceituarioConfig,
    maxMb = 2,
    hint = "",
    allowedTypes: string[] = ["image/png", "image/jpeg", "image/svg+xml"]
  ) {
    const typesLabel = allowedTypes.includes("image/jpeg")
      ? "PNG, JPG ou SVG"
      : allowedTypes.includes("image/svg+xml") ? "PNG ou SVG" : "PNG";
    return (file: File) => {
      if (!allowedTypes.includes(file.type)) {
        toast({ title: `Formato não aceito — use ${typesLabel}${hint ? ` (${hint})` : ""}`, variant: "destructive" }); return;
      }
      if (file.size > maxMb * 1024 * 1024) {
        toast({ title: `Arquivo muito grande — máximo ${maxMb} MB`, variant: "destructive" }); return;
      }
      const reader = new FileReader();
      reader.onload = () => patch({ [field]: reader.result as string } as Partial<ReceituarioConfig>);
      reader.readAsDataURL(file);
    };
  }

  // ── Grupos de modelos do catálogo ──────────────────────────────────────────
  const grouped = Object.values(ARABESQUE_MODELS).reduce<Record<string, ArabesqueModel[]>>(
    (acc, m) => { if (!acc[m.category]) acc[m.category] = []; acc[m.category].push(m); return acc; }, {}
  );

  // ── Preview de impressão: HTML do preview completo em escala 1:1 ──────────
  // Mantido em um div oculto no DOM para o window.print funcionar
  const printContent = (
    <div ref={printRef} style={{ display: "none" }}>
      <ReceituarioPreview cfg={cfg} bandModelId={previewBand} customBandDataUrl={previewCustomUrl}/>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-100">
      {printContent}

      {/* ── HEADER DA TELA ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 max-w-screen-2xl mx-auto">
          <LayoutTemplate className="w-5 h-5 text-teal-600"/>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-800 tracking-wide">Designer do Receituário</h1>
            <p className="text-xs text-gray-500">
              Faixa ornamental · Cabeçalho · Boxes · Assinatura · Certificado · Rodapé · Preview ao vivo · PDF
            </p>
          </div>
          <Button onClick={handlePrint} variant="outline" className="text-sm border-gray-300">
            <Printer className="w-4 h-4 mr-2"/> Imprimir / PDF
          </Button>
          <Button onClick={handleSave}
            className={`${saved ? "bg-green-600 hover:bg-green-700" : "bg-teal-600 hover:bg-teal-700"} text-white text-sm`}>
            {saved ? <CheckCircle2 className="w-4 h-4 mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
            {saved ? "Salvo" : "Salvar tudo"}
          </Button>
        </div>
      </div>

      <div className="p-6 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-[1fr_580px] gap-6 items-start">

          {/* ══════════════════════════════════════════════════════════════════
              COLUNA ESQUERDA — Configuração (15 pedidos + Kaizen)
          ══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-3">

            {/* ── P3/P1: Upload de Faixas ─────────────────────────────────── */}
            <Section icon={<Upload className="w-4 h-4"/>}
              label="Upload de Faixa Ornamental Personalizada" badge="P3" defaultOpen>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5"/> Especificações de arquivo
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-blue-900">
                  {[
                    ["Formatos aceitos", UPLOAD_RULES.formatosTxt],
                    ["Tamanho máximo", `${UPLOAD_RULES.maxSizeMb} MB`],
                    ["Dimensões ideais", `${UPLOAD_RULES.recWidth} × ${UPLOAD_RULES.recHeight} px`],
                    ["Orientação", "Horizontal (strip para faixa)"],
                    ["Fundo recomendado", "Branco ou transparente (PNG)"],
                    ["Armazenamento", "LocalStorage do navegador"],
                  ].map(([k, v]) => (
                    <React.Fragment key={k}>
                      <span className="font-semibold text-blue-700">{k}:</span>
                      <span>{v}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processaBandFile(f); }}
                onClick={() => bandFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
                  ${dragging ? "border-teal-400 bg-teal-50" : "border-gray-300 bg-gray-50 hover:border-teal-300 hover:bg-teal-50"}`}>
                <input ref={bandFileRef} type="file" accept={UPLOAD_RULES.acceptedExts}
                  className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processaBandFile(f); e.target.value = ""; }}/>
                <Upload className="w-7 h-7 text-gray-400 mx-auto mb-2"/>
                <p className="text-sm font-semibold text-gray-600">Solte aqui ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">{UPLOAD_RULES.formatosTxt} · máx. {UPLOAD_RULES.maxSizeMb} MB</p>
              </div>

              {cfg.customBands.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    Faixas enviadas ({cfg.customBands.length})
                  </div>
                  {cfg.customBands.map(b => (
                    <div key={b.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-2">
                      <div className="w-20 h-8 overflow-hidden rounded border border-gray-100 shrink-0">
                        <img src={b.dataUrl} alt={b.name} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-700 truncate">{b.name}</div>
                        <div className="text-xs text-gray-400">{b.widthPx}×{b.heightPx}px · {b.fileSizeKb} KB</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => { setPreviewBand(b.id); setPreviewCustomUrl(b.dataUrl); }}
                        className="text-xs px-2 h-7 border-teal-300 text-teal-700">Preview</Button>
                      <button onClick={() => {
                        patch({ customBands: cfg.customBands.filter(x => x.id !== b.id) });
                        if (previewBand === b.id) { setPreviewBand(bandModel); setPreviewCustomUrl(undefined); }
                      }} className="p-1.5 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── Seletor de faixa ativa (catálogo) ──────────────────────── */}
            <Section icon={<LayoutTemplate className="w-4 h-4"/>}
              label="Faixa Ornamental Ativa"
              badge={`${Object.keys(ARABESQUE_MODELS).length + cfg.customBands.length} modelos`}>

              <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0"/>
                <span className="text-xs text-teal-800">
                  <b>Ativo:</b> {
                    bandModel.startsWith("custom-")
                      ? (cfg.customBands.find(b => b.id === bandModel)?.name ?? bandModel)
                      : (ARABESQUE_MODELS[bandModel as ArabesqueModelId]?.name ?? bandModel)
                  }
                </span>
              </div>

              {cfg.customBands.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Personalizadas ({cfg.customBands.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cfg.customBands.map(b => (
                      <ModelCard key={b.id} src={b.dataUrl}
                        selected={previewBand === b.id} isSaved={bandModel === b.id}
                        onSelect={() => { setPreviewBand(b.id); setPreviewCustomUrl(b.dataUrl); }}/>
                    ))}
                  </div>
                </div>
              )}

              {Object.entries(grouped).map(([cat, models]) => (
                <div key={cat} className="mb-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 border-b pb-1">
                    {CATEGORY_LABELS[cat as ArabesqueModel["category"]]} ({models.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {models.map(m => (
                      <ModelCard key={m.id} m={m}
                        selected={previewBand === m.id} isSaved={bandModel === m.id}
                        onSelect={() => { setPreviewBand(m.id); setPreviewCustomUrl(undefined); }}/>
                    ))}
                  </div>
                </div>
              ))}
            </Section>

            {/* ── P5 + P6: Cabeçalho (nome da clínica + logo + título) ────── */}
            <Section icon={<Building2 className="w-4 h-4"/>}
              label="Cabeçalho da Receita — Identidade da Clínica" badge="P4–P6">

              {/* Logo da clínica (P4) */}
              <FieldRow label="Logo da Clínica (P4)" hint="PNG/JPG · máx 2 MB · fundo transparente recomendado">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-12 border border-dashed border-gray-300 rounded bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                    {cfg.cabecalhoLogoDataUrl
                      ? <img src={cfg.cabecalhoLogoDataUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }}/>
                      : <ImageIcon className="w-5 h-5 text-gray-300"/>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <UploadBtn accept=".png,.jpg,.jpeg,.svg" label="Enviar logo"
                      onFile={makeImgUploader("cabecalhoLogoDataUrl", 2, "Logo da clínica")}/>
                    {cfg.cabecalhoLogoDataUrl && (
                      <Button size="sm" variant="ghost" onClick={() => patch({ cabecalhoLogoDataUrl: undefined })}
                        className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50 justify-start">
                        <Trash2 className="w-3 h-3 mr-1"/> Remover
                      </Button>
                    )}
                  </div>
                </div>
              </FieldRow>

              {/* Nome da clínica: imagem ou texto (P6) */}
              <FieldRow label="Nome / Wordmark da Clínica (P6)">
                <ModoToggle valor={cfg.cabecalhoNomeModo} onChange={v => patch({ cabecalhoNomeModo: v })}/>
              </FieldRow>

              {cfg.cabecalhoNomeModo === "imagem" ? (
                <FieldRow label="Imagem do nome (wordmark)" hint="PNG/SVG com fundo transparente · max 2 MB">
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-10 border border-dashed border-gray-300 rounded bg-gray-50 overflow-hidden flex items-center justify-center">
                      {cfg.cabecalhoNomeImagemDataUrl
                        ? <img src={cfg.cabecalhoNomeImagemDataUrl} alt="Nome" style={{ maxHeight: "100%", objectFit: "contain" }}/>
                        : <span className="text-xs text-gray-300">wordmark</span>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <UploadBtn accept=".png,.jpg,.jpeg,.svg" label="Enviar wordmark"
                        onFile={makeImgUploader("cabecalhoNomeImagemDataUrl", 2)}/>
                      {cfg.cabecalhoNomeImagemDataUrl && (
                        <Button size="sm" variant="ghost" onClick={() => patch({ cabecalhoNomeImagemDataUrl: undefined })}
                          className="text-xs h-7 text-red-500 hover:bg-red-50 justify-start">
                          <Trash2 className="w-3 h-3 mr-1"/> Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </FieldRow>
              ) : (
                <FieldRow label="Texto do nome da clínica" hint="Ex: Clínica Padua — Dr. Caio H. F. Pádua">
                  <Input value={cfg.cabecalhoNome} onChange={e => patch({ cabecalhoNome: e.target.value })}
                    placeholder={DEFAULT_CONFIG.cabecalhoNome} className="text-sm"/>
                </FieldRow>
              )}

              <FieldRow label="Subtítulo linha 1" hint="Ex: Medicina Integrativa e Longevidade">
                <Input value={cfg.cabecalhoTitulo} onChange={e => patch({ cabecalhoTitulo: e.target.value })}
                  placeholder={DEFAULT_CONFIG.cabecalhoTitulo} className="text-sm"/>
              </FieldRow>

              <FieldRow label="Subtítulo linha 2 (opcional)">
                <Input value={cfg.cabecalhoSubtitulo} onChange={e => patch({ cabecalhoSubtitulo: e.target.value })}
                  placeholder="Ex: CRM SP 123.456 — RQE 56.789" className="text-sm"/>
              </FieldRow>

              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Número RCE" hint="Ex: RCE: 2025">
                  <Input value={cfg.cabecalhoRceNumero} onChange={e => patch({ cabecalhoRceNumero: e.target.value })}
                    placeholder="RCE: 2025" className="text-sm"/>
                </FieldRow>
                <FieldRow label="Vias" hint="Ex: 1ª via Farmácia — 2ª via Paciente">
                  <Input value={cfg.cabecalhoVias} onChange={e => patch({ cabecalhoVias: e.target.value })}
                    placeholder={DEFAULT_CONFIG.cabecalhoVias} className="text-sm"/>
                </FieldRow>
              </div>

              <FieldRow label="Título do documento" hint="Ex: RECEITUÁRIO DE CONTROLE ESPECIAL">
                <Input value={cfg.tituloDocumento} onChange={e => patch({ tituloDocumento: e.target.value })}
                  placeholder={DEFAULT_CONFIG.tituloDocumento} className="text-sm font-semibold"/>
              </FieldRow>

              <FieldRow label="Subtítulo do documento (opcional)" hint="Ex: MODELO DEMONSTRATIVO - SEM VALIDADE">
                <Input value={cfg.tituloSubtitulo} onChange={e => patch({ tituloSubtitulo: e.target.value })}
                  placeholder={DEFAULT_CONFIG.tituloSubtitulo} className="text-sm"/>
              </FieldRow>

              {/* Kaizen C: linha estilizada */}
              <FieldRow label="Kaizen C — Estilo da linha decorativa entre seções">
                <div className="flex gap-2">
                  {(["simples", "dupla", "ornamentada"] as const).map(s => (
                    <button key={s} onClick={() => patch({ linhaEstiloCabecalho: s })}
                      className={`px-3 py-1 text-xs rounded border font-semibold capitalize transition-colors
                        ${cfg.linhaEstiloCabecalho === s ? "bg-teal-600 text-white border-teal-600" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </FieldRow>
            </Section>

            {/* ── P2: Campos dos Boxes ─────────────────────────────────────── */}
            <Section icon={<Layers className="w-4 h-4"/>}
              label="Campos Internos dos Boxes das Faixas" badge="P2">

              <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded p-2">
                Defina o <b>título</b> de cada cartão e os <b>campos</b> (separados por vírgula, na ordem de exibição).
                No preview, cada campo aparece com uma linha pontilhada de preenchimento.
              </p>

              {[
                { lbl: "Box 1 — Emitente / Médico (faixa superior, esquerda)", tk: "boxMedicoTitulo", ck: "boxMedicoCampos" },
                { lbl: "Box 2 — Paciente (faixa superior, direita)", tk: "boxPacienteTitulo", ck: "boxPacienteCampos" },
                { lbl: "Box 3 — Comprador (faixa inferior, esquerda — Controle Especial)", tk: "boxCompradorTitulo", ck: "boxCompradorCampos" },
                { lbl: "Box 4 — Fornecedor / Farmácia (faixa inferior, direita)", tk: "boxFarmaciaTitulo", ck: "boxFarmaciaCampos" },
              ].map(({ lbl, tk, ck }) => (
                <div key={tk} className="border border-gray-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">{lbl}</div>
                  <FieldRow label="Título do cartão">
                    <Input value={(cfg as Record<string, string>)[tk]}
                      onChange={e => patch({ [tk]: e.target.value } as Partial<ReceituarioConfig>)}
                      placeholder={(DEFAULT_CONFIG as Record<string, string>)[tk]} className="text-sm"/>
                  </FieldRow>
                  <FieldRow label="Campos (separados por vírgula — a ordem é a exibição)"
                    hint='Ex: "Nome Completo, CPF, Data de Nascimento, Endereço"'>
                    <Input value={(cfg as Record<string, string>)[ck]}
                      onChange={e => patch({ [ck]: e.target.value } as Partial<ReceituarioConfig>)}
                      placeholder={(DEFAULT_CONFIG as Record<string, string>)[ck]} className="text-sm"/>
                  </FieldRow>
                </div>
              ))}

              {/* Kaizen A: Split ratio + borderWidth */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50">
                <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Kaizen A — Proporção e Estilo dos Boxes
                </div>
                <FieldRow label="Proporção dos 2 boxes (esq / dir)">
                  <div className="flex gap-2">
                    {(["50/50", "40/60", "60/40"] as const).map(r => (
                      <button key={r} onClick={() => patch({ boxSplitRatio: r })}
                        className={`px-3 py-1 text-xs rounded border font-semibold transition-colors
                          ${cfg.boxSplitRatio === r ? "bg-teal-600 text-white border-teal-600" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                </FieldRow>
                <FieldRow label={`Espessura da borda do box: ${cfg.boxBorderWidth} px`}>
                  <input type="range" min={1} max={3} step={1} value={cfg.boxBorderWidth}
                    onChange={e => patch({ boxBorderWidth: Number(e.target.value) })}
                    className="w-full accent-teal-600"/>
                </FieldRow>
              </div>

              {/* Kaizen B: faixinha esquerda */}
              <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Kaizen B — Faixinha Decorativa Esquerda dos Boxes
                  </div>
                  <button onClick={() => patch({ boxFaixinhaEsquerda: !cfg.boxFaixinhaEsquerda })}
                    className={`px-3 py-1 text-xs rounded-full font-bold border transition-colors
                      ${cfg.boxFaixinhaEsquerda ? "bg-teal-600 text-white border-teal-600" : "border-gray-300 text-gray-500"}`}>
                    {cfg.boxFaixinhaEsquerda ? "Ativada" : "Desativada"}
                  </button>
                </div>
                {cfg.boxFaixinhaEsquerda && (
                  <FieldRow label="Cor da faixinha">
                    <div className="flex items-center gap-2">
                      <input type="color" value={cfg.boxFaixinhaCor}
                        onChange={e => patch({ boxFaixinhaCor: e.target.value })}
                        className="w-8 h-8 rounded border border-gray-200 cursor-pointer"/>
                      <span className="text-xs text-gray-500">{cfg.boxFaixinhaCor}</span>
                    </div>
                  </FieldRow>
                )}
              </div>
            </Section>

            {/* ── P9 + P10: Fontes do corpo ──────────────────────────────── */}
            <Section icon={<Type className="w-4 h-4"/>}
              label="Fontes do Corpo do Receituário — Fórmulas" badge="P9–P10">

              <p className="text-xs text-gray-500">
                As fórmulas são numeradas automaticamente (01, 02, 03...) conforme o <b>Pedido 10</b>.
                Escolha as fontes do título (nome do medicamento) e do corpo (posologia, campos).
                Todas as fontes abaixo são nativas do sistema — sem dependência de internet.
              </p>

              <FieldRow label="Fonte do título da fórmula (nome do medicamento)">
                <select value={cfg.corpoFonteTitulo}
                  onChange={e => patch({ corpoFonteTitulo: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white">
                  {FONTE_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <div style={{ fontFamily: cfg.corpoFonteTitulo, marginTop: 6 }}
                  className="text-sm text-gray-700 border border-dashed border-gray-200 rounded px-3 py-2 bg-gray-50">
                  01  Pré-visualização do nome do medicamento
                </div>
              </FieldRow>

              <FieldRow label="Fonte do corpo (posologia e campos de detalhe)">
                <select value={cfg.corpoFonteCorpo}
                  onChange={e => patch({ corpoFonteCorpo: e.target.value })}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white">
                  {FONTE_OPTIONS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <div style={{ fontFamily: cfg.corpoFonteCorpo, marginTop: 6 }}
                  className="text-sm text-gray-500 border border-dashed border-gray-200 rounded px-3 py-2 bg-gray-50">
                  Posologia: Orientação demonstrativa a ser validada pelo prescritor.
                </div>
              </FieldRow>
            </Section>

            {/* ── P11: Assinatura ────────────────────────────────────────── */}
            <Section icon={<PenLine className="w-4 h-4"/>}
              label="Assinatura do Médico" badge="P11">

              <p className="text-xs text-gray-500">
                A assinatura aparece após as fórmulas, à esquerda. Escolha entre importar uma imagem
                ou usar o texto cursivo como placeholder (o valor real vem do cadastro do médico em produção).
              </p>

              <FieldRow label="Modo da assinatura">
                <ModoToggle
                  valor={cfg.assinaturaModo === "imagem" ? "imagem" : "texto"}
                  onChange={v => patch({ assinaturaModo: v === "imagem" ? "imagem" : "databind" })}/>
              </FieldRow>

              {cfg.assinaturaModo === "imagem" ? (
                <FieldRow label="Imagem da assinatura" hint="PNG com fundo transparente · máx 2 MB">
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-14 border border-dashed border-gray-300 rounded bg-gray-50 overflow-hidden flex items-center justify-center">
                      {cfg.assinaturaDataUrl
                        ? <img src={cfg.assinaturaDataUrl} alt="Assinatura" style={{ maxHeight: "100%", objectFit: "contain" }}/>
                        : <PenLine className="w-6 h-6 text-gray-300"/>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <UploadBtn accept=".png,.jpg,.jpeg" label="Enviar assinatura"
                        onFile={makeImgUploader("assinaturaDataUrl", 2, "Assinatura cursiva")}/>
                      {cfg.assinaturaDataUrl && (
                        <Button size="sm" variant="ghost" onClick={() => patch({ assinaturaDataUrl: undefined })}
                          className="text-xs h-7 text-red-500 hover:bg-red-50 justify-start">
                          <Trash2 className="w-3 h-3 mr-1"/> Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </FieldRow>
              ) : (
                <FieldRow label="Texto cursivo (placeholder quando sem imagem)"
                  hint="Aparece em itálico no preview">
                  <Input value={cfg.assinaturaTextoFallback}
                    onChange={e => patch({ assinaturaTextoFallback: e.target.value })}
                    placeholder="Ex: Dr. Caio H. Pádua" className="text-sm italic"/>
                </FieldRow>
              )}
            </Section>

            {/* ── P12: Certificado digital ───────────────────────────────── */}
            <Section icon={<Shield className="w-4 h-4"/>}
              label="Bloco do Certificado Digital" badge="P12">

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Aparece à direita da assinatura. Exibe os dados do certificado ICP-Brasil e QR de verificação.
                </p>
                <button onClick={() => patch({ certificadoMostrar: !cfg.certificadoMostrar })}
                  className={`px-3 py-1 text-xs rounded-full font-bold border shrink-0 ml-3 transition-colors
                    ${cfg.certificadoMostrar ? "bg-teal-600 text-white border-teal-600" : "border-gray-300 text-gray-500"}`}>
                  {cfg.certificadoMostrar ? "Visível" : "Oculto"}
                </button>
              </div>

              {cfg.certificadoMostrar && (
                <>
                  <FieldRow label="QR Code do certificado" hint="PNG · máx 1 MB">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 border border-dashed border-gray-300 rounded bg-gray-50 overflow-hidden flex items-center justify-center">
                        {cfg.certificadoQrDataUrl
                          ? <img src={cfg.certificadoQrDataUrl} alt="QR" style={{ width: "100%", objectFit: "contain" }}/>
                          : <span className="text-xs text-gray-300">QR</span>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <UploadBtn accept=".png,.jpg,.jpeg" label="Enviar QR"
                          onFile={makeImgUploader("certificadoQrDataUrl", 1)}/>
                        {cfg.certificadoQrDataUrl && (
                          <Button size="sm" variant="ghost" onClick={() => patch({ certificadoQrDataUrl: undefined })}
                            className="text-xs h-7 text-red-500 hover:bg-red-50 justify-start">
                            <Trash2 className="w-3 h-3 mr-1"/> Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  </FieldRow>

                  <FieldRow label="Logo do certificador (à direita do QR)" hint="PNG · máx 1 MB">
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-10 border border-dashed border-gray-300 rounded bg-gray-50 overflow-hidden flex items-center justify-center">
                        {cfg.certificadoLogoDataUrl
                          ? <img src={cfg.certificadoLogoDataUrl} alt="Cert logo" style={{ maxHeight: "100%", objectFit: "contain" }}/>
                          : <ImageIcon className="w-5 h-5 text-gray-300"/>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <UploadBtn accept=".png,.jpg,.jpeg,.svg" label="Enviar logo cert."
                          onFile={makeImgUploader("certificadoLogoDataUrl", 1)}/>
                        {cfg.certificadoLogoDataUrl && (
                          <Button size="sm" variant="ghost" onClick={() => patch({ certificadoLogoDataUrl: undefined })}
                            className="text-xs h-7 text-red-500 hover:bg-red-50 justify-start">
                            <Trash2 className="w-3 h-3 mr-1"/> Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  </FieldRow>
                </>
              )}
            </Section>

            {/* ── P3: Rodapé esquerdo ────────────────────────────────────── */}
            <Section icon={<AlignLeft className="w-4 h-4"/>}
              label="Rodapé — Dados da Clínica (esquerda)" badge="P3">
              <p className="text-xs text-gray-500">Aparece no canto inferior esquerdo, abaixo da faixa de Comprador / Fornecedor.</p>
              <FieldRow label="Endereço (linha 1)" hint="Ex: Av. Brigadeiro Faria Lima, 3000 — São Paulo / SP">
                <Input value={cfg.rodapeEndereco} onChange={e => patch({ rodapeEndereco: e.target.value })}
                  placeholder={DEFAULT_CONFIG.rodapeEndereco} className="text-sm"/>
              </FieldRow>
              <FieldRow label="Dados adicionais — linha 2" hint="Ex: (11) 3090-0010  |  contato@clinica.com.br">
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

            {/* ── P1 + P5: Rodapé direito — sistema ─────────────────────── */}
            <Section icon={<Zap className="w-4 h-4"/>}
              label="Rodapé — Marca do Sistema PARXIS / PAXTER (direita)" badge="P1–P5">

              {/* Preview do bloco */}
              <div className="flex items-center gap-3 bg-slate-800 rounded-lg px-4 py-3 mb-1">
                {cfg.rodapeSistemaLogoDataUrl
                  ? <img src={cfg.rodapeSistemaLogoDataUrl} alt="Logo sistema" className="h-8 w-8 object-contain shrink-0"/>
                  : <img src={`${BASE}/brand/paxter-symbol.png`} alt="Símbolo" className="h-8 w-8 object-contain shrink-0 opacity-80"/>
                }
                <div>
                  {cfg.rodapeSistemaModo === "imagem" && cfg.rodapeSistemaImagemDataUrl
                    ? <img src={cfg.rodapeSistemaImagemDataUrl} alt="wordmark" className="h-4 object-contain"/>
                    : <div className="text-xs font-black tracking-widest text-amber-400 uppercase">
                        {cfg.rodapePaxterNome || "PARXIS"}
                      </div>
                  }
                  <div className="text-xs text-gray-400">{cfg.rodapePaxterSubtitulo || "Clinical Intelligence System"}</div>
                </div>
              </div>

              {/* P1: Upload do ícone do sistema */}
              <FieldRow label="Ícone / Símbolo do sistema (P1)" hint="PNG com fundo transparente · máx 1 MB · substitui o ícone padrão">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 border border-dashed border-gray-300 rounded bg-gray-50 overflow-hidden flex items-center justify-center">
                    {cfg.rodapeSistemaLogoDataUrl
                      ? <img src={cfg.rodapeSistemaLogoDataUrl} alt="Logo" style={{ width: "100%", objectFit: "contain" }}/>
                      : <img src={`${BASE}/brand/paxter-symbol.png`} alt="padrão" className="opacity-40 w-6 h-6 object-contain"/>}
                  </div>
                  <div className="flex flex-col gap-1">
                    <UploadBtn accept=".png,.svg" label="Enviar ícone (PNG/SVG)"
                      onFile={makeImgUploader("rodapeSistemaLogoDataUrl", 2, "Ícone do sistema", ["image/png", "image/svg+xml"])}/>
                    {cfg.rodapeSistemaLogoDataUrl && (
                      <Button size="sm" variant="ghost" onClick={() => patch({ rodapeSistemaLogoDataUrl: undefined })}
                        className="text-xs h-7 text-red-500 hover:bg-red-50 justify-start">
                        <Trash2 className="w-3 h-3 mr-1"/> Voltar ao padrão
                      </Button>
                    )}
                  </div>
                </div>
              </FieldRow>

              {/* P5: Wordmark imagem ou texto */}
              <FieldRow label="Wordmark do sistema — modo (P5)">
                <ModoToggle valor={cfg.rodapeSistemaModo} onChange={v => patch({ rodapeSistemaModo: v })}/>
              </FieldRow>

              {cfg.rodapeSistemaModo === "imagem" ? (
                <FieldRow label="Imagem da wordmark (nome do sistema)"
                  hint="PNG/SVG com fundo transparente · máx 2 MB — ex: arte PARXIS ou PAXTER">
                  <div className="flex items-center gap-3">
                    <div className="w-28 h-10 border border-dashed border-gray-300 rounded bg-slate-800 overflow-hidden flex items-center justify-center">
                      {cfg.rodapeSistemaImagemDataUrl
                        ? <img src={cfg.rodapeSistemaImagemDataUrl} alt="wordmark" style={{ maxHeight: "100%", objectFit: "contain" }}/>
                        : <span className="text-xs text-gray-500">wordmark</span>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <UploadBtn accept=".png,.jpg,.jpeg,.svg" label="Enviar wordmark"
                        onFile={makeImgUploader("rodapeSistemaImagemDataUrl", 2)}/>
                      {cfg.rodapeSistemaImagemDataUrl && (
                        <Button size="sm" variant="ghost" onClick={() => patch({ rodapeSistemaImagemDataUrl: undefined })}
                          className="text-xs h-7 text-red-500 hover:bg-red-50 justify-start">
                          <Trash2 className="w-3 h-3 mr-1"/> Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </FieldRow>
              ) : (
                <>
                  <FieldRow label="Nome do sistema em texto (P5)" hint="Ex: PARXIS — amanhã pode virar PAXTER ou outro">
                    <Input value={cfg.rodapePaxterNome} onChange={e => patch({ rodapePaxterNome: e.target.value })}
                      placeholder="PARXIS" className="text-sm font-bold tracking-widest uppercase"/>
                  </FieldRow>
                </>
              )}

              <FieldRow label="Subtítulo do sistema (P5c)" hint="Ex: Clinical Intelligence System">
                <Input value={cfg.rodapePaxterSubtitulo} onChange={e => patch({ rodapePaxterSubtitulo: e.target.value })}
                  placeholder="Clinical Intelligence System" className="text-sm"/>
              </FieldRow>
            </Section>

          </div>{/* fim coluna esquerda */}

          {/* ══════════════════════════════════════════════════════════════════
              COLUNA DIREITA — Preview ao vivo (P7) + controles
          ══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-3 sticky top-20">

            {/* Controles do preview */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Preview ao vivo — escala ~55% do A4
              </div>
              <div className="flex items-center gap-2">
                <div className="flex border border-gray-300 rounded overflow-hidden text-xs">
                  {(["especial", "simples"] as const).map(t => (
                    <button key={t} onClick={() => patch({ tipoReceitaPadrao: t })}
                      className={`px-3 py-1 font-semibold transition-colors
                        ${cfg.tipoReceitaPadrao === t ? "bg-slate-700 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}>
                      {t === "especial" ? "Controle Especial" : "Simples"}
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowPreview(v => !v)}
                  className="p-1.5 border border-gray-200 rounded text-gray-400 hover:text-gray-600">
                  {showPreview ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
                </button>
              </div>
            </div>

            {/* Preview escalado (P7) */}
            {showPreview && (
              <div className="bg-gray-300 rounded-xl p-3 overflow-auto"
                style={{ maxHeight: "calc(100vh - 200px)" }}>
                <div style={{
                  transform: "scale(0.55)",
                  transformOrigin: "top left",
                  width: "calc(794px)",
                  pointerEvents: "none",
                }}>
                  <ReceituarioPreview
                    cfg={cfg}
                    bandModelId={previewBand}
                    customBandDataUrl={previewCustomUrl}/>
                </div>
                {/* Espaçador para que o container respeite a altura escalada */}
                <div style={{ height: `calc(1123px * 0.55)` }}/>
              </div>
            )}

            {/* Info + botões */}
            <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
              {[
                ["Tipo", cfg.tipoReceitaPadrao === "especial" ? "Controle Especial (4 boxes)" : "Simples (2 boxes)"],
                ["Faixa ativa", bandModel.startsWith("custom-")
                  ? cfg.customBands.find(b => b.id === bandModel)?.name ?? "personalizada"
                  : (ARABESQUE_MODELS[bandModel as ArabesqueModelId]?.name ?? bandModel)],
                ["Certificado", cfg.certificadoMostrar ? "Visível" : "Oculto"],
                ["Assinatura", cfg.assinaturaModo === "imagem" ? "Imagem enviada" : "Texto / data bind"],
                ["Sistema (rodapé)", cfg.rodapeSistemaModo === "imagem" ? "Wordmark imagem" : `Texto: ${cfg.rodapePaxterNome}`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-400 shrink-0 w-28">{k}:</span>
                  <span className="text-gray-700 font-medium truncate">{v}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handlePrint} variant="outline" className="w-full text-sm border-gray-300">
                <Printer className="w-4 h-4 mr-2"/> Imprimir / Baixar PDF
              </Button>
              <p className="text-xs text-gray-400 text-center">
                No diálogo do navegador, escolha <b>"Salvar como PDF"</b> para gerar o arquivo.
              </p>
              <Button onClick={handleSave}
                className={`w-full text-sm ${saved ? "bg-green-600 hover:bg-green-700" : "bg-teal-600 hover:bg-teal-700"} text-white`}>
                {saved ? <CheckCircle2 className="w-4 h-4 mr-2"/> : <Save className="w-4 h-4 mr-2"/>}
                {saved ? "Configuração salva" : "Salvar toda a configuração"}
              </Button>
            </div>
          </div>

        </div>{/* fim grid */}
      </div>
    </div>
  );
}
