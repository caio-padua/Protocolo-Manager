// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO CONFIG v2 — Configuração completa do receituário médico
// Persistida em localStorage("paxter:receituario-config")
// Spec: specs/receituario-designer-v2.md  —  20/07/2026
// P1 update: selectedClinicaId + selectedMedicoId (20/07/2026)
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_LS_KEY = "paxter:receituario-config";

/** Faixa customizada enviada pelo usuário via upload */
export type CustomBand = {
  id: string;
  name: string;
  dataUrl: string;
  fileSizeKb: number;
  widthPx: number;
  heightPx: number;
  addedAt: string;
};

/** Configuração completa v2 */
export type ReceituarioConfig = {
  // ── Seletor de entidade emissora (P1) ──────────────────────────────────────
  selectedClinicaId?: number;               // id da location selecionada (empresa emissora)
  selectedMedicoId?: number;                // id do professional selecionado (médico prescritor)

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  cabecalhoLogoDataUrl?: string;            // logo da clínica (base64)
  cabecalhoNomeModo: "texto" | "imagem";    // P6: modo de entrada do nome
  cabecalhoNomeImagemDataUrl?: string;      // wordmark da clínica (base64, P6)
  cabecalhoNome: string;                    // texto do nome da clínica
  cabecalhoTitulo: string;                  // subtítulo linha 1
  cabecalhoSubtitulo: string;               // subtítulo linha 2 (opcional)
  cabecalhoRceNumero: string;               // ex: "RCE: 2024"
  cabecalhoVias: string;                    // ex: "1ª via Farmácia — 2ª via Paciente"

  // ── Título do documento ────────────────────────────────────────────────────
  tituloDocumento: string;                  // "RECEITUÁRIO DE CONTROLE ESPECIAL"
  tituloSubtitulo: string;                  // "MODELO DEMONSTRATIVO - SEM VALIDADE"
  linhaEstiloCabecalho: "simples" | "dupla" | "ornamentada"; // KC

  // ── Tipo padrão da receita ─────────────────────────────────────────────────
  tipoReceitaPadrao: "especial" | "simples";

  // ── Boxes das faixas ───────────────────────────────────────────────────────
  boxPacienteTitulo: string;
  boxMedicoTitulo: string;
  boxCompradorTitulo: string;
  boxFarmaciaTitulo: string;
  boxSplitRatio: "50/50" | "40/60" | "60/40";
  boxLeftWidthPercent: number;  // largura do box esquerdo em % (0–100); 50 = igual
  boxWidthPct: number;          // % da coluna que cada box ocupa (30–100); <100 expõe arabesque
  boxBorderWidth: number;
  boxSuperiorMinHeight: number; // altura mínima boxes 1+2 (px) — P6
  boxMinHeight: number;         // altura mínima boxes 3+4 (px) — P7
  boxInferiorBottom: number;    // distância mm do fundo da página aos boxes 3+4 — P3
  boxBandGap: number;     // distância entre os 2 boxes dentro de cada faixa (mm)
  boxInnerPaddingX: number; // padding horizontal interno de cada box (mm)
  boxFaixinhaEsquerda: boolean;
  boxFaixinhaCor: string;

  // ── Corpo / Fórmulas (P9, P10) ────────────────────────────────────────────
  corpoFonteTitulo: string;
  corpoFonteCorpo: string;

  // ── Assinatura (P11) ───────────────────────────────────────────────────────
  assinaturaDataUrl?: string;
  assinaturaModo: "databind" | "imagem";
  assinaturaTextoFallback: string;

  // ── Certificado digital (P12) ─────────────────────────────────────────────
  certificadoMostrar: boolean;
  certificadoQrDataUrl?: string;
  certificadoLogoDataUrl?: string;

  // ── Rodapé direito — sistema (P1, P5) ─────────────────────────────────────
  rodapeSistemaModo: "texto" | "imagem";
  rodapeSistemaImagemDataUrl?: string;
  rodapeSistemaLogoDataUrl?: string;
  rodapePaxterNome: string;
  rodapePaxterSubtitulo: string;

  // ── Rodapé esquerdo (P3) ─────────────────────────────────────────────────
  rodapeEndereco: string;
  rodapeDados: string;
  rodapeDados2: string;
  rodapeDados3: string;

  // ── Faixas customizadas (P-upload) ─────────────────────────────────────────
  customBands: CustomBand[];
};

/** Valores padrão */
export const DEFAULT_CONFIG: ReceituarioConfig = {
  selectedClinicaId: 8,   // Instituto Padua
  selectedMedicoId: 6,    // Dr. Caio

  cabecalhoNomeModo: "texto",
  cabecalhoNome:      "Clínica Padua — Dr. Caio H. F. Pádua",
  cabecalhoTitulo:    "Medicina Integrativa e Longevidade",
  cabecalhoSubtitulo: "",
  cabecalhoRceNumero: "RCE: 2025",
  cabecalhoVias:      "1ª via Farmácia — 2ª via Paciente",
  tituloDocumento:    "RECEITUÁRIO DE CONTROLE ESPECIAL",
  tituloSubtitulo:    "",
  linhaEstiloCabecalho: "simples",
  tipoReceitaPadrao:  "especial",

  boxPacienteTitulo:   "Identificação do Paciente",
  boxMedicoTitulo:     "Identificação do Emitente",
  boxCompradorTitulo:  "Identificação do Comprador",
  boxFarmaciaTitulo:   "Identificação do Fornecedor / Farmácia",
  boxSplitRatio:       "50/50",
  boxLeftWidthPercent: 50,
  boxWidthPct:         100,
  boxBorderWidth:      1,
  boxSuperiorMinHeight: 120,
  boxMinHeight:        150,
  boxInferiorBottom:   8,
  boxBandGap:          4,
  boxInnerPaddingX:    4,
  boxFaixinhaEsquerda: false,
  boxFaixinhaCor:      "#45B8CC",

  corpoFonteTitulo: "Georgia, serif",
  corpoFonteCorpo:  "Arial, sans-serif",

  assinaturaModo:          "databind",
  assinaturaTextoFallback: "Caio H. Pádua",

  certificadoMostrar: true,

  rodapeSistemaModo: "imagem",
  rodapePaxterNome:      "PARXIS",
  rodapePaxterSubtitulo: "Clinical Intelligence System",

  rodapeEndereco: "Av. Brigadeiro Faria Lima, 3000 — São Paulo / SP",
  rodapeDados:    "(11) 3090-0010  |  contato@padua.med.br",
  rodapeDados2:   "",
  rodapeDados3:   "",

  customBands: [],
};

export function loadReceituarioConfig(): ReceituarioConfig {
  try {
    const raw = localStorage.getItem(CONFIG_LS_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const stored = JSON.parse(raw) as Partial<ReceituarioConfig>;
    // migração: valores abaixo de 100 (antigo default 90) sobem para 150; valores no antigo default (180) descem para 150
    if ((stored.boxMinHeight ?? 0) < 100 || (stored.boxMinHeight ?? 0) >= 175) stored.boxMinHeight = DEFAULT_CONFIG.boxMinHeight;
    // migração: boxInferiorBottom antigo (18 ou 30) estava alto demais — rebaixa para 8
    if ((stored.boxInferiorBottom ?? 0) >= 14) stored.boxInferiorBottom = DEFAULT_CONFIG.boxInferiorBottom;
    return { ...DEFAULT_CONFIG, ...stored };
  } catch { return { ...DEFAULT_CONFIG }; }
}

export function saveReceituarioConfig(cfg: ReceituarioConfig): void {
  localStorage.setItem(CONFIG_LS_KEY, JSON.stringify(cfg));
}

export function genBandId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const UPLOAD_RULES = {
  maxSizeMb: 5,
  maxSizeBytes: 5 * 1024 * 1024,
  acceptedTypes: ["image/png", "image/jpeg", "image/svg+xml"],
  acceptedExts: ".png, .jpg, .jpeg, .svg",
  recWidth: 1600,
  recHeight: 100,
  formatosTxt: "PNG, JPG / JPEG, SVG",
} as const;

export const FONTE_OPTIONS = [
  { value: "Georgia, serif",                       label: "Georgia (serifada clássica)" },
  { value: "'Times New Roman', Times, serif",      label: "Times New Roman" },
  { value: "Garamond, 'EB Garamond', serif",       label: "Garamond" },
  { value: "Arial, Helvetica, sans-serif",          label: "Arial (sem serifa)" },
  { value: "Inter, system-ui, sans-serif",          label: "Inter (moderna)" },
];
