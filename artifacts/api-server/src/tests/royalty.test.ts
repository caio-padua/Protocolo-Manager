/**
 * royalty.test.ts — Testes automatizados da trava anti-pirâmide de royalties.
 *
 * Cobre os 5 cenários obrigatórios:
 *   1. Platform Owner (profundidade 0) → null
 *   2. Empresa de profundidade 1 (filha direta do PO) → RoyaltyResult correto
 *   3. Empresa de profundidade 2 (neta do PO) → RoyaltyCadeiaProibidaError
 *   4. Ciclo acidental → Error de ciclo
 *   5. Empresa sem pai (empresaMaeId null) → null
 */

import { describe, it, expect } from "vitest";
import {
  calcularRoyalty,
  RoyaltyCadeiaProibidaError,
  type EmpresaRoyaltyInfo,
} from "../lib/royalty";

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * PAXTER HQ — Platform Owner (profundidade 0).
 * royaltyPercent aqui é o percentual que o PAXTER COBRA dos seus filhos diretos.
 * A implementação lê pai.royaltyPercent ao calcular o royalty do filho.
 */
const PAXTER: EmpresaRoyaltyInfo = {
  id: 1,
  nome: "PAXTER HQ",
  empresaMaeId: null,
  royaltyPercent: "30.00", // 30% cobrado dos licenciados diretos
  isPlatformOwner: true,
};

/** Licenciado direto do PAXTER (profundidade 1) */
const LICENCIADO_A: EmpresaRoyaltyInfo = {
  id: 2,
  nome: "Clínica A",
  empresaMaeId: 1,       // pai = PAXTER
  royaltyPercent: "20.00", // taxa hipotética que cobraria de sub-licenciados (nunca usada — profundidade 2 é bloqueada)
  isPlatformOwner: false,
};

/** Sub-licenciado (profundidade 2) — deve disparar a trava anti-pirâmide */
const SUB_LICENCIADO_B: EmpresaRoyaltyInfo = {
  id: 3,
  nome: "Clínica B",
  empresaMaeId: 2,       // pai = LICENCIADO_A
  royaltyPercent: "20.00",
  isPlatformOwner: false,
};

/** Empresa independente sem empresaMaeId (sem pai) */
const EMPRESA_ISOLADA: EmpresaRoyaltyInfo = {
  id: 4,
  nome: "Empresa Isolada",
  empresaMaeId: null,
  royaltyPercent: null,
  isPlatformOwner: false,
};

// Hierarquia completa usada na maioria dos testes
const TODAS_EMPRESAS = [PAXTER, LICENCIADO_A, SUB_LICENCIADO_B, EMPRESA_ISOLADA];

// ── Testes ───────────────────────────────────────────────────────────────────

describe("calcularRoyalty()", () => {
  // ── Caso 1: Platform Owner → null ─────────────────────────────────────────
  it("retorna null para o Platform Owner (profundidade 0)", () => {
    const resultado = calcularRoyalty({
      empresaId: PAXTER.id,
      valorBaseCentavos: 100_00,
      empresas: TODAS_EMPRESAS,
    });

    expect(resultado).toBeNull();
  });

  // ── Caso 2: Profundidade 1 → RoyaltyResult correto ────────────────────────
  it("calcula royalty corretamente para empresa de profundidade 1", () => {
    const resultado = calcularRoyalty({
      empresaId: LICENCIADO_A.id,
      valorBaseCentavos: 100_00, // R$ 100,00
      empresas: TODAS_EMPRESAS,
    });

    expect(resultado).not.toBeNull();
    expect(resultado!.beneficiarioId).toBe(PAXTER.id);
    expect(resultado!.beneficiarioNome).toBe(PAXTER.nome);
    expect(resultado!.percentual).toBe(30);
    // 30% de 10000 = 3000 centavos (R$ 30,00)
    expect(resultado!.valorCentavos).toBe(3000);
  });

  it("arredonda royalty para baixo (floor) sem cobrar centavo a mais", () => {
    // 30% de 10001 = 3000,3 → deve ser 3000 (floor)
    const resultado = calcularRoyalty({
      empresaId: LICENCIADO_A.id,
      valorBaseCentavos: 10001,
      empresas: TODAS_EMPRESAS,
    });

    expect(resultado).not.toBeNull();
    expect(resultado!.valorCentavos).toBe(3000);
  });

  // ── Caso 3: Profundidade 2 → RoyaltyCadeiaProibidaError ───────────────────
  it("lança RoyaltyCadeiaProibidaError para empresa de profundidade 2", () => {
    expect(() =>
      calcularRoyalty({
        empresaId: SUB_LICENCIADO_B.id,
        valorBaseCentavos: 100_00,
        empresas: TODAS_EMPRESAS,
      })
    ).toThrow(RoyaltyCadeiaProibidaError);
  });

  it("mensagem do RoyaltyCadeiaProibidaError é explícita e contém o ID da empresa", () => {
    let erroCapturado: RoyaltyCadeiaProibidaError | null = null;

    try {
      calcularRoyalty({
        empresaId: SUB_LICENCIADO_B.id,
        valorBaseCentavos: 100_00,
        empresas: TODAS_EMPRESAS,
      });
    } catch (e) {
      erroCapturado = e as RoyaltyCadeiaProibidaError;
    }

    expect(erroCapturado).not.toBeNull();
    expect(erroCapturado!.name).toBe("RoyaltyCadeiaProibidaError");
    expect(erroCapturado!.profundidade).toBe(2);
    expect(erroCapturado!.empresaId).toBe(SUB_LICENCIADO_B.id);
    // A cadeia deve incluir o sub-licenciado, o licenciado e o PO
    expect(erroCapturado!.cadeia).toEqual([
      SUB_LICENCIADO_B.id,
      LICENCIADO_A.id,
      PAXTER.id,
    ]);
    // Mensagem deve ser legível para o CEO
    expect(erroCapturado!.message).toContain("cadeia de pirâmide detectada");
    expect(erroCapturado!.message).toContain("profundidade máxima permitida = 1");
  });

  // ── Caso 4: Ciclo acidental → Error de ciclo ─────────────────────────────
  it("lança Error descritivo quando há ciclo na hierarquia de empresas", () => {
    // A → B → A (ciclo)
    const empresaA: EmpresaRoyaltyInfo = {
      id: 10,
      nome: "Empresa A",
      empresaMaeId: 11, // pai = B
      royaltyPercent: "30.00",
      isPlatformOwner: false,
    };
    const empresaB: EmpresaRoyaltyInfo = {
      id: 11,
      nome: "Empresa B",
      empresaMaeId: 10, // pai = A (ciclo!)
      royaltyPercent: "20.00",
      isPlatformOwner: false,
    };
    const empresasComCiclo = [empresaA, empresaB];

    expect(() =>
      calcularRoyalty({
        empresaId: 10,
        valorBaseCentavos: 100_00,
        empresas: empresasComCiclo,
      })
    ).toThrow(/ciclo detectado/i);
  });

  // ── Caso 5: Empresa sem pai → null ───────────────────────────────────────
  it("retorna null para empresa sem pai (empresaMaeId null)", () => {
    const resultado = calcularRoyalty({
      empresaId: EMPRESA_ISOLADA.id,
      valorBaseCentavos: 100_00,
      empresas: TODAS_EMPRESAS,
    });

    expect(resultado).toBeNull();
  });

  // ── Caso extra: empresa não encontrada → Error ────────────────────────────
  it("lança Error quando empresaId não existe na lista", () => {
    expect(() =>
      calcularRoyalty({
        empresaId: 9999,
        valorBaseCentavos: 100_00,
        empresas: TODAS_EMPRESAS,
      })
    ).toThrow(/9999/);
  });

  // ── Caso extra: percentual zero → null ───────────────────────────────────
  it("retorna null quando o percentual do pai é zero", () => {
    const paxterSemPercent: EmpresaRoyaltyInfo = {
      ...PAXTER,
      royaltyPercent: "0",
    };
    const filhaDireta: EmpresaRoyaltyInfo = {
      id: 20,
      nome: "Filha Direta",
      empresaMaeId: 1,
      royaltyPercent: null,
      isPlatformOwner: false,
    };

    const resultado = calcularRoyalty({
      empresaId: 20,
      valorBaseCentavos: 100_00,
      empresas: [paxterSemPercent, filhaDireta],
    });

    expect(resultado).toBeNull();
  });
});
