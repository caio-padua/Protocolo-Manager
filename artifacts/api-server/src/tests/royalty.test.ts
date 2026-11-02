import { describe, expect, it } from "vitest";
import {
  calcularRoyalty,
  medirProfundidade,
  RoyaltiesDesativadosError,
  verificarCadeia,
  type EmpresaRoyaltyInfo,
} from "../lib/royalty";

const CLINICA: EmpresaRoyaltyInfo = {
  id: 5,
  nome: "Instituto Padua — simulação",
  empresaMaeId: 6,
  royaltyPercent: "30.00",
  isPlatformOwner: false,
};

describe("compatibilidade legada de royalties", () => {
  it("bloqueia qualquer validação de empresa-mãe", () => {
    const resultado = verificarCadeia(6, [CLINICA]);
    expect(resultado.ok).toBe(false);
    expect(resultado.motivo).toMatch(/empresas são independentes/i);
  });

  it("não calcula nem retorna valor de royalty", () => {
    expect(() => calcularRoyalty({
      empresaId: CLINICA.id,
      valorBaseCentavos: 100_00,
      empresas: [CLINICA],
    })).toThrow(RoyaltiesDesativadosError);
  });

  it("não calcula profundidade empresarial", () => {
    expect(() => medirProfundidade(CLINICA.id, [CLINICA])).toThrow(RoyaltiesDesativadosError);
  });

  it("continua informando explicitamente se a empresa não existe", () => {
    expect(() => calcularRoyalty({
      empresaId: 999,
      valorBaseCentavos: 100_00,
      empresas: [CLINICA],
    })).toThrow(/999/);
  });
});
