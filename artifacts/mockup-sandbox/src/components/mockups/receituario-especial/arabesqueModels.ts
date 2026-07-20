// ─────────────────────────────────────────────────────────────────────────────
// ARABESQUE MODELS — Catálogo central de faixas ornamentais
// Conforme briefing do ChatGPT PADUA DESIGNER
// ─────────────────────────────────────────────────────────────────────────────

export type RenderMode = "inline-svg" | "raster-strip";

export type ArabesqueModel = {
  id: ArabesqueModelId;
  name: string;
  category: "vetorial-organico" | "vetorial-geometrico" | "imagem-raster";
  renderMode: RenderMode;
  bandHeightPx: number;        // altura da faixa em pixels (88px ≈ 23mm a 96dpi)
  description: string;
  // inline-svg only
  tileW?: number;              // largura do tile em px
  tileH?: number;              // altura do tile em px (para escalonamento)
  scaleToHeight?: boolean;     // true = escala o tile para preencher a altura da faixa
  bgColor?: string;
  strokeColor?: string;
  borderColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  // raster-strip only
  assetUrl?: string;
};

export const ARABESQUE_MODEL_IDS = [
  "rinceaux-acanto",
  "islamic-circles",
  "islamic-8star",
  "islamic-6star",
  "islamic-diamonds",
  "islamic-quatrefoil",
  "raster-placeholder",
] as const;

export type ArabesqueModelId = typeof ARABESQUE_MODEL_IDS[number];

export const DEFAULT_MODEL_ID: ArabesqueModelId = "rinceaux-acanto";

// ─── Catálogo (editável pelo operador no submenu de configuração) ─────────────
export const ARABESQUE_MODELS: Record<ArabesqueModelId, ArabesqueModel> = {

  // ── VETORIAL ORGÂNICO (ChatGPT PADUA) ─────────────────────────────────────
  "rinceaux-acanto": {
    id: "rinceaux-acanto",
    name: "Rinceaux de Acanto",
    category: "vetorial-organico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Rolo orgânico de folhas de acanto — SVG do PADUA Designer",
    tileW: 320, tileH: 120,
    scaleToHeight: true,
    bgColor: "#f3f3f0",
    strokeColor: "#8a8a86",
    borderColor: "#8f8f8b",
    strokeWidth: 1,
    strokeOpacity: 1,
  },

  // ── VETORIAL GEOMÉTRICO ISLÂMICO ───────────────────────────────────────────
  "islamic-circles": {
    id: "islamic-circles",
    name: "Círculos Islâmicos",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Círculos sobrepostos em grade — padrão árabe clássico",
    tileW: 56, tileH: 56,
    scaleToHeight: false,
    bgColor: "#f3f3f0",
    strokeColor: "#8a8a86",
    borderColor: "#8f8f8b",
    strokeWidth: 1.2,
    strokeOpacity: 0.9,
  },

  "islamic-8star": {
    id: "islamic-8star",
    name: "Estrela de 8 Pontas",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Estrela islâmica de 8 pontas em grade quadrada — Zellige marroquino",
    tileW: 72, tileH: 72,
    scaleToHeight: false,
    bgColor: "#f3f3f0",
    strokeColor: "#8a8a86",
    borderColor: "#8f8f8b",
    strokeWidth: 1.2,
    strokeOpacity: 0.9,
  },

  "islamic-6star": {
    id: "islamic-6star",
    name: "Estrela de 6 Pontas",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Hexagrama em grade hexagonal — mosaico andaluz",
    tileW: 80, tileH: 92,
    scaleToHeight: false,
    bgColor: "#f3f3f0",
    strokeColor: "#8a8a86",
    borderColor: "#8f8f8b",
    strokeWidth: 1.2,
    strokeOpacity: 0.9,
  },

  "islamic-diamonds": {
    id: "islamic-diamonds",
    name: "Losangos Entrelaçados",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Losangos sobrepostos com detalhes internos — geometria persa",
    tileW: 60, tileH: 60,
    scaleToHeight: false,
    bgColor: "#f3f3f0",
    strokeColor: "#8a8a86",
    borderColor: "#8f8f8b",
    strokeWidth: 1.2,
    strokeOpacity: 0.9,
  },

  "islamic-quatrefoil": {
    id: "islamic-quatrefoil",
    name: "Quatrefoil (Trevo)",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Quatro círculos sobrepostos formando flor — mosaico mourisco",
    tileW: 60, tileH: 60,
    scaleToHeight: false,
    bgColor: "#f3f3f0",
    strokeColor: "#8a8a86",
    borderColor: "#8f8f8b",
    strokeWidth: 1.2,
    strokeOpacity: 0.9,
  },

  // ── RASTER (PNG gerado pelo PADUA Designer) ────────────────────────────────
  "raster-placeholder": {
    id: "raster-placeholder",
    name: "Faixa PNG (PADUA)",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Slot para PNG 2325×300px gerado pelo PADUA Designer — máxima qualidade visual",
    assetUrl: "",   // preencher com URL do PNG aprovado
  },
};

// ─── Labels das categorias ────────────────────────────────────────────────────
export const CATEGORY_LABELS: Record<ArabesqueModel["category"], string> = {
  "vetorial-organico": "Vetorial — Orgânico",
  "vetorial-geometrico": "Vetorial — Geométrico Islâmico",
  "imagem-raster": "Imagem PNG (PADUA Designer)",
};
