// ============================================================================
// GOVERNANCA — Fonte unica de permissoes por papel (Quem pode o que).
//
// Um so lugar define: os PAPEIS (colunas), as FERRAMENTAS agrupadas (linhas),
// os DEFAULTS plausiveis e os helpers de leitura. O front (tela da matriz + o
// menu que obedece) e o back (rotas de settings) importam daqui — sem copia.
//
// Papel = coluna `category` da tabela `professionals`. O proprietário global
// (isPlatformOwner)
// nunca e uma coluna editavel: ele ve e faz tudo, e e o unico que altera a
// matriz. Ferramentas com `soCeo` sao reservadas ao CEO (cadeado, nunca chave).
// ============================================================================

export type PapelId =
  | "medico"
  | "enfermagem"
  | "recepcao"
  | "administrativo"
  | "financeiro";

export interface Papel {
  id: PapelId;
  nome: string;
}

// As colunas da matriz. O CEO nao entra aqui (e o dono, nao um papel comum).
export const PAPEIS: Papel[] = [
  { id: "medico", nome: "Médico" },
  { id: "enfermagem", nome: "Enfermagem" },
  { id: "recepcao", nome: "Recepção" },
  { id: "administrativo", nome: "Administrativo" },
  { id: "financeiro", nome: "Financeiro" },
];

export interface Ferramenta {
  id: string;
  nome: string;
  /** reservada ao CEO: renderiza cadeado no lugar da chave, sempre bloqueada */
  soCeo?: boolean;
  /** rota da tela desta ferramenta (usada pelo menu que obedece a matriz) */
  href?: string;
}

export interface GrupoFerramentas {
  grupo: string;
  itens: Ferramenta[];
}

// As linhas da matriz, agrupadas. Os `id` sao estaveis e batem com as telas.
export const GRUPOS: GrupoFerramentas[] = [
  {
    grupo: "Exames",
    itens: [
      { id: "exames_importar", nome: "Importar Exames" },
      { id: "exames_triagem", nome: "Sala de Triagem" },
      { id: "exames_config", nome: "Configuração de Exames", soCeo: true, href: "/cadastros/config-exames" },
      { id: "exames_faixas", nome: "Curadoria de Faixas / Console" },
      { id: "exames_mesa", nome: "Mesa de Validação (C1/C2)" },
    ],
  },
  {
    grupo: "Documentos",
    itens: [
      { id: "prescricao", nome: "Prescrição" },
      { id: "pedido_exames", nome: "Pedido de exames" },
      { id: "aprovacoes_clinicas", nome: "Fila de aprovações clínicas", href: "/cadastros/governanca/aprovacoes" },
      { id: "atestado", nome: "Atestado" },
      { id: "encaminhamento", nome: "Encaminhamento" },
      { id: "laudo_saude", nome: "Laudo · Estado de Saúde" },
      { id: "laudo_inss", nome: "Laudo · Afastamento INSS" },
      { id: "laudo_insumo", nome: "Laudo · Requisição de Insumo" },
    ],
  },
  {
    grupo: "Clínico",
    itens: [
      { id: "protocolo", nome: "Lançar Protocolo" },
      { id: "ras", nome: "RAS / Aplicação" },
      { id: "anamnese", nome: "Anamnese" },
      { id: "agenda", nome: "Agenda" },
    ],
  },
  {
    grupo: "Gestão",
    itens: [
      { id: "financeiro", nome: "Financeiro" },
      { id: "estoque", nome: "Estoque" },
      { id: "corpo_clinico", nome: "Corpo Clínico" },
      { id: "gerenciar_liberacoes_clinicas", nome: "Gerenciar liberações clínicas" },
      { id: "governanca", nome: "Governança", soCeo: true, href: "/cadastros/governanca" },
    ],
  },
];

/** Matriz de permissoes: { [ferramentaId]: { [papelId]: boolean } }. */
export type Matriz = Record<string, Record<string, boolean>>;

// Papeis liberados por padrao em cada ferramenta (tabela de defaults da spec).
// Ferramentas soCeo ficam OFF para todos (o CEO passa por fora da matriz).
const DEFAULT_ON: Record<string, PapelId[]> = {
  // A matriz define a função; a concessão individual por unidade ainda é exigida.
  prescricao: ["medico", "enfermagem"],
  pedido_exames: ["medico", "enfermagem"],
  aprovacoes_clinicas: ["medico", "enfermagem"],
  gerenciar_liberacoes_clinicas: ["administrativo"],
  exames_importar: ["medico", "enfermagem", "recepcao"],
  exames_triagem: ["medico", "enfermagem"],
  exames_faixas: ["medico"],
  exames_mesa: ["medico", "enfermagem"],
  atestado: ["medico"],
  encaminhamento: ["medico"],
  laudo_saude: ["medico"],
  laudo_inss: ["medico"],
  laudo_insumo: ["medico"],
  protocolo: ["medico"],
  ras: ["medico", "enfermagem"],
  anamnese: ["medico", "enfermagem"],
  agenda: ["medico", "enfermagem"],
  financeiro: ["administrativo", "financeiro"],
  estoque: ["enfermagem", "administrativo"],
  corpo_clinico: ["administrativo"],
};

/** Lista achatada de todas as ferramentas (fora dos grupos). */
export function todasFerramentas(): Ferramenta[] {
  return GRUPOS.flatMap((g) => g.itens);
}

/** Matriz padrao completa (semeada no primeiro acesso, nao destrutiva). */
export function permissoesDefault(): Matriz {
  const m: Matriz = {};
  for (const it of todasFerramentas()) {
    m[it.id] = {};
    const on = DEFAULT_ON[it.id] ?? [];
    for (const p of PAPEIS) {
      m[it.id][p.id] = it.soCeo ? false : on.includes(p.id);
    }
  }
  return m;
}

/**
 * Reconcilia uma matriz guardada com o modelo atual: comeca do default e, para
 * cada ferramenta x papel conhecidos, adota o booleano guardado quando existir.
 * Descarta chaves desconhecidas e preenche as que faltarem (robusto a evolucao
 * do catalogo de ferramentas). soCeo permanece sempre falso.
 */
export function normalizeMatriz(stored: unknown): Matriz {
  const base = permissoesDefault();
  if (!stored || typeof stored !== "object") return base;
  const raw = stored as Record<string, unknown>;
  for (const it of todasFerramentas()) {
    if (it.soCeo) continue; // reservada ao CEO: nunca liberavel por papel
    const row = raw[it.id];
    if (!row || typeof row !== "object") continue;
    const rrow = row as Record<string, unknown>;
    for (const p of PAPEIS) {
      if (typeof rrow[p.id] === "boolean") base[it.id][p.id] = rrow[p.id] as boolean;
    }
  }
  return base;
}

/** O papel pode usar a ferramenta? Leitura pura, usada pela tela e pelo menu. */
export function podeUsar(
  m: Matriz | null | undefined,
  ferramentaId: string,
  papelId: string,
): boolean {
  return Boolean(m?.[ferramentaId]?.[papelId]);
}
