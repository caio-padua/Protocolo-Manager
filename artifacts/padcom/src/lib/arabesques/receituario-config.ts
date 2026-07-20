// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO CONFIG v2 — Configuração completa do receituário médico
// Persistida em localStorage("paxter:receituario-config")
// Spec: specs/receituario-designer-v2.md  —  20/07/2026
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
  linhaEstiloCabecalho: "simples" | "dupla" | "ornamentada"; // KC: linha entre cabeç. e título

  // ── Tipo padrão da receita ─────────────────────────────────────────────────
  tipoReceitaPadrao: "especial" | "simples";

  // ── Boxes das faixas ───────────────────────────────────────────────────────
  boxPacienteTitulo: string;
  boxPacienteCampos: string;               // vírgula separados, ordem é a exibição
  boxMedicoTitulo: string;
  boxMedicoCampos: string;
  boxCompradorTitulo: string;
  boxCompradorCampos: string;
  boxFarmaciaTitulo: string;
  boxFarmaciaCampos: string;
  boxSplitRatio: "50/50" | "40/60" | "60/40"; // KA: proporção dos boxes
  boxBorderWidth: number;                   // 1–3 px (KA)
  boxFaixinhaEsquerda: boolean;             // KB: borda decorativa esquerda
  boxFaixinhaCor: string;                   // hex da faixinha (KB)

  // ── Corpo / Fórmulas (P9, P10) ────────────────────────────────────────────
  corpoFonteTitulo: string;                 // font-family para nome da fórmula
  corpoFonteCorpo: string;                  // font-family para posologia/campos

  // ── Assinatura (P11) ───────────────────────────────────────────────────────
  assinaturaDataUrl?: string;               // imagem da assinatura (base64)
  assinaturaModo: "databind" | "imagem";
  assinaturaTextoFallback: string;          // nome cursivo texto se sem imagem

  // ── Certificado digital (P12) ─────────────────────────────────────────────
  certificadoMostrar: boolean;
  certificadoQrDataUrl?: string;            // QR code (base64)
  certificadoLogoDataUrl?: string;          // logo do certificador (base64)

  // ── Rodapé direito — sistema (P1, P5) ─────────────────────────────────────
  rodapeSistemaModo: "texto" | "imagem";    // P5: modo de entrada do wordmark
  rodapeSistemaImagemDataUrl?: string;      // wordmark PARXIS (base64)
  rodapeSistemaLogoDataUrl?: string;        // símbolo/ícone (upload, P1)
  rodapePaxterNome: string;                 // texto fallback do nome
  rodapePaxterSubtitulo: string;            // subtítulo do sistema

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
  boxPacienteCampos:   "Nome Completo, CPF, Data de Nascimento, Telefone, Endereço Completo, Cidade / UF",
  boxMedicoTitulo:     "Identificação do Emitente",
  boxMedicoCampos:     "Profissional Prescritor, Conselho, RQE, Telefone, Endereço do Consultório",
  boxCompradorTitulo:  "Identificação do Comprador",
  boxCompradorCampos:  "Nome, Endereço, Cidade, UF, Identidade, Órgão Emissor",
  boxFarmaciaTitulo:   "Identificação do Fornecedor",
  boxFarmaciaCampos:   "Farmácia, Endereço, Cidade / UF, Farmacêutico Responsável, Data",
  boxSplitRatio:       "50/50",
  boxBorderWidth:      1,
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
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) as Partial<ReceituarioConfig> };
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
