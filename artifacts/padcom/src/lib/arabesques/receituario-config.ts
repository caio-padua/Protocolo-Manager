// ─────────────────────────────────────────────────────────────────────────────
// RECEITUÁRIO CONFIG — Configuração completa da receita médica
// Persistida em localStorage("paxter:receituario-config")
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_LS_KEY = "paxter:receituario-config";

/** Faixa customizada enviada pelo usuário via upload */
export type CustomBand = {
  id: string;           // uuid gerado no upload
  name: string;         // nome dado pelo usuário
  dataUrl: string;      // data:image/png;base64,... (armazenado no localStorage)
  fileSizeKb: number;   // tamanho em KB para exibição
  widthPx: number;      // dimensões originais
  heightPx: number;
  addedAt: string;      // ISO string
};

/** Configuração completa do cabeçalho + boxes + rodapé da receita */
export type ReceituarioConfig = {
  // ── Cabeçalho (Pedidos 5a / 5b / 5c) ──────────────────────────────────────
  cabecalhoLogoDataUrl?: string;     // base64 da logo da clínica (upload)
  cabecalhoNome: string;             // "Clínica Padua — Dr. Caio H. F. Pádua"
  cabecalhoTitulo: string;           // "Medicina Integrativa e Longevidade"
  cabecalhoSubtitulo: string;        // segunda linha opcional

  // ── Tipo padrão da receita ─────────────────────────────────────────────────
  tipoReceitaPadrao: "especial" | "simples";

  // ── Boxes das faixas (Pedido 4) ────────────────────────────────────────────
  boxPacienteTitulo: string;         // "Identificação do Paciente"
  boxPacienteCampos: string;         // campos exibidos, separados por vírgula
  boxMedicoTitulo: string;           // "Identificação do Emitente"
  boxMedicoCampos: string;
  boxCompradorTitulo: string;        // "Identificação do Comprador"
  boxCompradorCampos: string;
  boxFarmaciaTitulo: string;         // "Identificação do Fornecedor / Farmácia"
  boxFarmaciaCampos: string;

  // ── Rodapé esquerdo (Pedidos 6a / 6b) ─────────────────────────────────────
  rodapeEndereco: string;            // "Av. Brigadeiro Faria Lima, 3000 — São Paulo/SP"
  rodapeDados: string;               // linha 2+: telefone, e-mail, CNPJ etc. (separar por "|")
  rodapeDados2: string;              // linha 3 opcional
  rodapeDados3: string;              // linha 4 opcional

  // ── Rodapé direito — Paxter branding (Pedidos 7b / 7c) ────────────────────
  rodapePaxterNome: string;          // "PAXTER" (editável)
  rodapePaxterSubtitulo: string;     // "Clinical Intelligence System" (editável)

  // ── Faixas customizadas (Pedido 3) ─────────────────────────────────────────
  customBands: CustomBand[];
};

/** Valores padrão da clínica — aparecem quando nenhuma config foi salva ainda */
export const DEFAULT_CONFIG: ReceituarioConfig = {
  cabecalhoNome:      "Clínica Padua — Dr. Caio H. F. Pádua",
  cabecalhoTitulo:    "Medicina Integrativa e Longevidade",
  cabecalhoSubtitulo: "",
  tipoReceitaPadrao:  "especial",

  boxPacienteTitulo:   "Identificação do Paciente",
  boxPacienteCampos:   "Nome, CPF, Data de Nascimento, Cidade / UF",
  boxMedicoTitulo:     "Identificação do Emitente",
  boxMedicoCampos:     "Nome, CRM / RQE, Especialidade, Telefone",
  boxCompradorTitulo:  "Identificação do Comprador",
  boxCompradorCampos:  "Nome, Endereço, Cidade / UF",
  boxFarmaciaTitulo:   "Identificação do Fornecedor / Farmácia",
  boxFarmaciaCampos:   "Farmácia, CNPJ, Assinatura, Data",

  rodapeEndereco: "Av. Brigadeiro Faria Lima, 3000 — São Paulo / SP",
  rodapeDados:    "(11) 3090-0010  |  contato@padua.med.br",
  rodapeDados2:   "",
  rodapeDados3:   "",

  rodapePaxterNome:      "PAXTER",
  rodapePaxterSubtitulo: "Clinical Intelligence System",

  customBands: [],
};

/** Carrega a configuração do localStorage; retorna o default se não houver nada */
export function loadReceituarioConfig(): ReceituarioConfig {
  try {
    const raw = localStorage.getItem(CONFIG_LS_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ReceituarioConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Salva a configuração inteira no localStorage */
export function saveReceituarioConfig(cfg: ReceituarioConfig): void {
  localStorage.setItem(CONFIG_LS_KEY, JSON.stringify(cfg));
}

/** Gera um ID simples para faixas customizadas */
export function genBandId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Regras de upload aceitas pela tela (Pedido 3) */
export const UPLOAD_RULES = {
  maxSizeMb: 5,
  maxSizeBytes: 5 * 1024 * 1024,
  acceptedTypes: ["image/png", "image/jpeg", "image/svg+xml"],
  acceptedExts: ".png, .jpg, .jpeg, .svg",
  recWidth: 1600,
  recHeight: 100,
  minAspect: 4,        // proporção mínima largura:altura (strip horizontal)
  formatosTxt: "PNG, JPG / JPEG, SVG",
} as const;
