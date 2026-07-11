// Motor de variáveis dos documentos clínicos (Arsenal Clínico) — lado servidor.
// Espelha artifacts/padcom/src/lib/doc-variaveis.ts: o corpo de um atestado ou
// encaminhamento pode conter marcadores {{chave}} que são substituídos pelos
// valores reais no momento da emissão. Aplicar no servidor é a rede de segurança
// (R1.3): se a API for chamada fora das telas, nenhum {{...}} vaza para o PDF.
// A operação é idempotente — corpo já substituído (sem {{}}) passa intacto.

// Data de hoje no padrão do Brasil (dd/mm/aaaa), fuso de São Paulo.
export function dataHojeBR(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Substitui todos os {{chave}} do corpo pelos valores informados.
// Chave ausente/valor vazio -> string vazia. Aceita espaços: {{ cliente.nome }}.
export function aplicarVariaveis(
  corpo: string,
  valores: Record<string, string | number | null | undefined>,
): string {
  if (!corpo) return "";
  return corpo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, chave: string) => {
    const v = valores[chave];
    return v === null || v === undefined ? "" : String(v);
  });
}

// Campos comuns de atestado/encaminhamento usados para montar o mapa de valores.
export interface DadosDocumento {
  clientName?: string | null;
  clientCpf?: string | null;
  professionalName?: string | null;
  professionalCrm?: string | null;
  professionalUf?: string | null;
  dias?: number | null;
  cid?: string | null;
  finalidade?: string | null;
  especialidadeDestino?: string | null;
  motivo?: string | null;
}

// Monta o mapa de valores a partir dos campos persistidos do registro.
export function montarValoresDoc(d: DadosDocumento): Record<string, string | number | null | undefined> {
  return {
    "cliente.nome": d.clientName ?? "",
    "cliente.cpf": d.clientCpf ?? "",
    "profissional.nome": d.professionalName ?? "",
    "profissional.crm": d.professionalCrm ?? "",
    "profissional.uf": d.professionalUf ?? "",
    "data.hoje": dataHojeBR(),
    dias: d.dias ?? "",
    cid: d.cid ?? "",
    finalidade: d.finalidade ?? "",
    especialidade: d.especialidadeDestino ?? "",
    motivo: d.motivo ?? "",
  };
}
