/**
 * Compatibilidade temporária com chamadas legadas.
 *
 * A aplicação não mantém hierarquia empresarial nem calcula royalties.
 * Os campos antigos continuam no banco como histórico, mas qualquer tentativa
 * de usar este módulo falha explicitamente para impedir cobrança silenciosa.
 */

export interface EmpresaRoyaltyInfo {
  id: number;
  nome: string;
  empresaMaeId: number | null;
  royaltyPercent: string | null;
  isPlatformOwner: boolean;
}

export interface RoyaltyResult {
  beneficiarioId: number;
  beneficiarioNome: string;
  percentual: number;
  valorCentavos: number;
}

export class RoyaltiesDesativadosError extends Error {
  constructor() {
    super("Cálculo de royalties desativado: empresas são independentes.");
    this.name = "RoyaltiesDesativadosError";
  }
}

/** Mantida apenas para compatibilidade com consumidores antigos. */
export class RoyaltyCadeiaProibidaError extends Error {
  readonly empresaId: number;
  readonly profundidade: number;
  readonly cadeia: number[];

  constructor(empresaId: number, cadeia: number[] = []) {
    super(`Hierarquia empresarial desativada para a empresa ${empresaId}.`);
    this.name = "RoyaltyCadeiaProibidaError";
    this.empresaId = empresaId;
    this.profundidade = cadeia.length;
    this.cadeia = cadeia;
  }
}

export function verificarCadeia(
  _empresaMaeId: number,
  _empresas: EmpresaRoyaltyInfo[],
): { ok: false; motivo: string } {
  return {
    ok: false,
    motivo: "Vínculos de empresa-mãe estão desativados; empresas são independentes.",
  };
}

export function medirProfundidade(
  empresaId: number,
  empresas: EmpresaRoyaltyInfo[],
): number {
  if (!empresas.some((empresa) => empresa.id === empresaId)) {
    throw new Error(`Empresa ID ${empresaId} não encontrada.`);
  }
  throw new RoyaltiesDesativadosError();
}

export function calcularRoyalty(input: {
  empresaId: number;
  valorBaseCentavos: number;
  empresas: EmpresaRoyaltyInfo[];
}): RoyaltyResult | null {
  if (!input.empresas.some((empresa) => empresa.id === input.empresaId)) {
    throw new Error(`Empresa ID ${input.empresaId} não encontrada.`);
  }
  throw new RoyaltiesDesativadosError();
}
