/**
 * Dados do local efetivamente autorizado para a emissão.
 * Ausência de endereço nunca deve ser preenchida com endereço de outra clínica.
 */
export function identidadeLocalReceituario(
  local: { name?: string | null; nome_fantasia?: string | null; address?: string | null; phone?: string | null },
  nomeAutorizado?: string | null,
) {
  return {
    nome: local.nome_fantasia?.trim() || local.name?.trim() || nomeAutorizado?.trim() || null,
    endereco: local.address?.trim() || "",
    telefone: local.phone?.trim() || undefined,
  };
}
