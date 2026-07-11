// Motor de variáveis dos Modelos de Documento (Arsenal Clínico).
// Fonte única usada por Atestados, Encaminhamentos e a tela de Modelos: o corpo
// de um modelo aceita marcadores {{chave}} substituídos pelos valores reais no
// momento da emissão. Variável sem valor vira string vazia — nunca quebra.

export interface VariavelDoc {
  chave: string;
  rotulo: string;
  exemplo: string;
}

// Catálogo de variáveis disponíveis nos modelos (chips clicáveis na tela).
export const VARIAVEIS_DOC: VariavelDoc[] = [
  { chave: "cliente.nome", rotulo: "Nome do cliente", exemplo: "Maria Aparecida de Souza" },
  { chave: "cliente.cpf", rotulo: "CPF do cliente", exemplo: "123.456.789-00" },
  { chave: "profissional.nome", rotulo: "Nome do profissional", exemplo: "Dr. Caio Henrique Fernandes Pádua" },
  { chave: "profissional.crm", rotulo: "CRM", exemplo: "123456" },
  { chave: "profissional.uf", rotulo: "UF do CRM", exemplo: "SP" },
  { chave: "data.hoje", rotulo: "Data de hoje", exemplo: "13/06/2026" },
  { chave: "dias", rotulo: "Dias (afastamento)", exemplo: "3" },
  { chave: "cid", rotulo: "CID", exemplo: "J06.9" },
  { chave: "finalidade", rotulo: "Finalidade", exemplo: "tratamento clínico" },
  { chave: "especialidade", rotulo: "Especialidade de destino", exemplo: "Cardiologia" },
  { chave: "motivo", rotulo: "Motivo / justificativa", exemplo: "avaliação de dor torácica" },
];

// Data de hoje no padrão do Brasil (dd/mm/aaaa).
export function dataHojeBR(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Substitui todos os {{chave}} do corpo pelos valores informados.
// Chave ausente/valor vazio -> string vazia. Aceita espaços: {{ cliente.nome }}.
export function aplicarVariaveis(corpo: string, valores: Record<string, string | number | null | undefined>): string {
  if (!corpo) return "";
  return corpo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, chave: string) => {
    const v = valores[chave];
    return v === null || v === undefined ? "" : String(v);
  });
}

// Monta o mapa de valores a partir dos dados digitados na tela.
export function montarValores(input: {
  cliente?: { nome?: string | null; cpf?: string | null };
  profissional?: { nome?: string | null; crm?: string | null; uf?: string | null };
  extras?: Record<string, string | number | null | undefined>;
}): Record<string, string | number | null | undefined> {
  return {
    "cliente.nome": input.cliente?.nome ?? "",
    "cliente.cpf": input.cliente?.cpf ?? "",
    "profissional.nome": input.profissional?.nome ?? "",
    "profissional.crm": input.profissional?.crm ?? "",
    "profissional.uf": input.profissional?.uf ?? "",
    "data.hoje": dataHojeBR(),
    ...(input.extras ?? {}),
  };
}
