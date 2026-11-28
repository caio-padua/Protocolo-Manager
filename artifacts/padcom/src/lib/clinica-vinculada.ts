export type ClinicaVinculada = {
  nome: string;
  razaoSocial?: string | null;
  cnpj?: string | null;
};

/** Os dados jurídicos vêm do cadastro; ausência não é substituída por outro valor. */
export function descricaoClinicaVinculada(clinica: ClinicaVinculada): string {
  const nome = clinica.nome.trim() || "Nome não informado";
  const razao = clinica.razaoSocial?.trim() || "Razão social não informada";
  const cnpj = clinica.cnpj === undefined
    ? "CNPJ indisponível"
    : clinica.cnpj?.trim() || "CNPJ não informado";
  return `${nome} (${razao} · ${cnpj})`;
}
