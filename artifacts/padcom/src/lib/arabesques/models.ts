// ─────────────────────────────────────────────────────────────────────────────
// ARABESQUE MODELS — Catálogo central de faixas ornamentais do padcom
// 5 modelos inline-SVG + 11 modelos raster-strip (PNG do PADUA Designer)
// Persistência da seleção: localStorage("paxter:band-model-id")
// ─────────────────────────────────────────────────────────────────────────────

export type RenderMode = "inline-svg" | "raster-strip";

export type ArabesqueModel = {
  id: ArabesqueModelId;
  name: string;
  category: "vetorial-organico" | "vetorial-geometrico" | "imagem-raster";
  renderMode: RenderMode;
  bandHeightPx: number;
  description: string;
  // inline-svg
  tileW?: number;
  tileH?: number;
  scaleToHeight?: boolean;
  bgColor?: string;
  strokeColor?: string;
  borderColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  // raster-strip (filename only — componente prepende BASE_URL + "assets/arabesques/")
  assetFile?: string;
};

export const ARABESQUE_MODEL_IDS = [
  // ── Vetorial ──────────────────────────────────────────────────────────────
  "rinceaux-acanto",
  "islamic-circles",
  "islamic-8star",
  "islamic-6star",
  "islamic-diamonds",
  "islamic-quatrefoil",
  // ── Raster (PADUA Designer) ───────────────────────────────────────────────
  "padua-01-floral-islamico",
  "padua-02-floral-simetrico",
  "padua-03-rinceau-flamingo",
  "padua-04-acanto-florentino",
  "padua-05-ogival-moghul",
  "padua-06-rinceau-mandala",
  "padua-07-acanto-barroco",
  "padua-08-acanto-renascentista",
  "padua-09-rinceau-fino",
  "padua-10-acanto-floral",
  "padua-11-acanto-romantico",
] as const;

export type ArabesqueModelId = typeof ARABESQUE_MODEL_IDS[number];

// Default = primeiro PNG do PADUA (mais rico visualmente)
export const DEFAULT_BAND_MODEL: ArabesqueModelId = "padua-01-floral-islamico";
export const BAND_LS_KEY = "paxter:band-model-id";

export function getSavedBandModel(): ArabesqueModelId {
  const saved = localStorage.getItem(BAND_LS_KEY);
  if (saved && ARABESQUE_MODEL_IDS.includes(saved as ArabesqueModelId)) {
    return saved as ArabesqueModelId;
  }
  return DEFAULT_BAND_MODEL;
}

export function saveBandModel(id: ArabesqueModelId) {
  localStorage.setItem(BAND_LS_KEY, id);
}

export const ARABESQUE_MODELS: Record<ArabesqueModelId, ArabesqueModel> = {
  // ── Vetorial — Orgânico ───────────────────────────────────────────────────
  "rinceaux-acanto": {
    id: "rinceaux-acanto",
    name: "Rinceaux de Acanto",
    category: "vetorial-organico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Rolo orgânico de folhas de acanto — SVG gerado pelo PADUA Designer",
    tileW: 320, tileH: 120, scaleToHeight: true,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b",
    strokeWidth: 1, strokeOpacity: 1,
  },
  // ── Vetorial — Geométrico Islâmico ────────────────────────────────────────
  "islamic-circles": {
    id: "islamic-circles",
    name: "Círculos Islâmicos",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Círculos sobrepostos em grade — padrão árabe clássico",
    tileW: 56, tileH: 56, scaleToHeight: false,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b",
    strokeWidth: 1.2, strokeOpacity: 0.9,
  },
  "islamic-8star": {
    id: "islamic-8star",
    name: "Estrela de 8 Pontas",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Estrela islâmica de 8 pontas em grade quadrada — Zellige marroquino",
    tileW: 72, tileH: 72, scaleToHeight: false,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b",
    strokeWidth: 1.2, strokeOpacity: 0.9,
  },
  "islamic-6star": {
    id: "islamic-6star",
    name: "Estrela de 6 Pontas",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Hexagrama em grade hexagonal — mosaico andaluz",
    tileW: 80, tileH: 92, scaleToHeight: false,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b",
    strokeWidth: 1.2, strokeOpacity: 0.9,
  },
  "islamic-diamonds": {
    id: "islamic-diamonds",
    name: "Losangos Entrelaçados",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Losangos sobrepostos com detalhes internos — geometria persa",
    tileW: 60, tileH: 60, scaleToHeight: false,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b",
    strokeWidth: 1.2, strokeOpacity: 0.9,
  },
  "islamic-quatrefoil": {
    id: "islamic-quatrefoil",
    name: "Quatrefoil (Trevo)",
    category: "vetorial-geometrico",
    renderMode: "inline-svg",
    bandHeightPx: 88,
    description: "Quatro círculos sobrepostos formando flor — mosaico mourisco",
    tileW: 60, tileH: 60, scaleToHeight: false,
    bgColor: "#f3f3f0", strokeColor: "#8a8a86", borderColor: "#8f8f8b",
    strokeWidth: 1.2, strokeOpacity: 0.9,
  },
  // ── Imagem PADUA Designer ─────────────────────────────────────────────────
  "padua-01-floral-islamico": {
    id: "padua-01-floral-islamico",
    name: "Floral Islâmico",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Ornamento floral simétrico com medalhões — PADUA Designer #1",
    assetFile: "padua-01-floral-islamico.png",
  },
  "padua-02-floral-simetrico": {
    id: "padua-02-floral-simetrico",
    name: "Floral Simétrico",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Faixa floral simétrica em tom prata — PADUA Designer #2",
    assetFile: "padua-02-floral-simetrico.png",
  },
  "padua-03-rinceau-flamingo": {
    id: "padua-03-rinceau-flamingo",
    name: "Rinceaux Flamingo",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Rinceaux leve com fleur-de-lis — PADUA Designer #3",
    assetFile: "padua-03-rinceau-flamingo.png",
  },
  "padua-04-acanto-florentino": {
    id: "padua-04-acanto-florentino",
    name: "Acanto Florentino",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Acanto florentino com flores e ogivas — PADUA Designer #4",
    assetFile: "padua-04-acanto-florentino.png",
  },
  "padua-05-ogival-moghul": {
    id: "padua-05-ogival-moghul",
    name: "Ogival Moghul",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Ogivas trefladas preenchidas com arabescos — PADUA Designer #5",
    assetFile: "padua-05-ogival-moghul.png",
  },
  "padua-06-rinceau-mandala": {
    id: "padua-06-rinceau-mandala",
    name: "Rinceaux com Mandala",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Rinceau com medalhão central em forma de mandala — PADUA Designer #6",
    assetFile: "padua-06-rinceau-mandala.png",
  },
  "padua-07-acanto-barroco": {
    id: "padua-07-acanto-barroco",
    name: "Acanto Barroco",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Acanto barroco exuberante com volutas — PADUA Designer #7",
    assetFile: "padua-07-acanto-barroco.png",
  },
  "padua-08-acanto-renascentista": {
    id: "padua-08-acanto-renascentista",
    name: "Acanto Renascentista",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Acanto renascentista simétrico com leque central — PADUA Designer #8",
    assetFile: "padua-08-acanto-renascentista.png",
  },
  "padua-09-rinceau-fino": {
    id: "padua-09-rinceau-fino",
    name: "Rinceaux Fino",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Rinceau fino com traços leves e flores — PADUA Designer #9",
    assetFile: "padua-09-rinceau-fino.png",
  },
  "padua-10-acanto-floral": {
    id: "padua-10-acanto-floral",
    name: "Acanto com Flores",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Acanto com rosas e detalhes florais — PADUA Designer #10",
    assetFile: "padua-10-acanto-floral.png",
  },
  "padua-11-acanto-romantico": {
    id: "padua-11-acanto-romantico",
    name: "Acanto Romântico",
    category: "imagem-raster",
    renderMode: "raster-strip",
    bandHeightPx: 88,
    description: "Acanto romântico com ornamentos delicados — PADUA Designer #11",
    assetFile: "padua-11-acanto-romantico.png",
  },
};

export const CATEGORY_LABELS: Record<ArabesqueModel["category"], string> = {
  "vetorial-organico": "Vetorial — Orgânico (SVG)",
  "vetorial-geometrico": "Vetorial — Geométrico Islâmico (SVG)",
  "imagem-raster": "Imagem PNG — PADUA Designer",
};
