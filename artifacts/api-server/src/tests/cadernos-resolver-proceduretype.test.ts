/**
 * cadernos-resolver-proceduretype.test.ts
 *
 * Confirma que CIMP (implante) e CINC (GLP-1) são detectados corretamente
 * pelo resolverCodigosCadernos mesmo quando procedureType vem de fallback do
 * banco (campo ausente no body da requisição).
 *
 * Este é o teste de regressão para a Task #193:
 *   - A tela de entrega do protocolo nem sempre envia `procedureType` no body.
 *   - O backend busca o valor do banco e passa como fallback ao resolver.
 *   - Sem o fallback, Testosterona pellet não geraria CIMP e o caderno de
 *     implante ficaria de fora.
 */

import { describe, it, expect } from "vitest";
import { resolverCodigosCadernos } from "../lib/cadernos-resolver";

// ---------------------------------------------------------------------------
// CIMP — Implante / Pellet
// ---------------------------------------------------------------------------

describe("resolverCodigosCadernos — CIMP (implante)", () => {
  it("inclui CIMP quando procedureType='implant' está presente (simulando fallback do banco)", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Testosterona Pellet", procedureType: "implant", via: "SC" },
    ]);
    expect(codigos.has("CIMP")).toBe(true);
  });

  it("inclui CIMP quando a via contém 'pellet' mesmo sem procedureType", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Testosterona Pellet", procedureType: null, via: "Pellet subcutâneo" },
    ]);
    expect(codigos.has("CIMP")).toBe(true);
  });

  it("inclui CIMP quando a via contém 'implant' mesmo sem procedureType", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Testosterona Pellet", procedureType: null, via: "Implante SC" },
    ]);
    expect(codigos.has("CIMP")).toBe(true);
  });

  it("NÃO inclui CIMP quando procedureType está ausente E via é 'SC' simples", () => {
    // Prova que o fallback de banco é necessário para vias que não mencionam 'implant'/'pellet'.
    const { codigos } = resolverCodigosCadernos([
      { nome: "Testosterona Pellet", procedureType: null, via: "SC" },
    ]);
    expect(codigos.has("CIMP")).toBe(false);
  });

  it("inclui CIMP para mistura onde só uma substância é implante", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Vitamina C",          procedureType: "iv",      via: "IV" },
      { nome: "Testosterona Pellet", procedureType: "implant", via: "SC" },
    ]);
    expect(codigos.has("CIMP")).toBe(true);
    expect(codigos.has("CEND")).toBe(true); // IV também detectado
  });
});

// ---------------------------------------------------------------------------
// CINC — GLP-1 / Incretinas
// ---------------------------------------------------------------------------

describe("resolverCodigosCadernos — CINC (GLP-1)", () => {
  it("inclui CINC para Tirzepatida (detecção por nome, sem procedureType)", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Tirzepatida", procedureType: null, via: "SC" },
    ]);
    expect(codigos.has("CINC")).toBe(true);
    expect(codigos.has("CSUB")).toBe(true); // GLP-1 também exige CSUB
  });

  it("inclui CINC para Semaglutida", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Semaglutida 0,5 mg", procedureType: null, via: "SC" },
    ]);
    expect(codigos.has("CINC")).toBe(true);
  });

  it("inclui CINC para Liraglutida", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Liraglutida", procedureType: null, via: "SC" },
    ]);
    expect(codigos.has("CINC")).toBe(true);
  });

  it("NÃO inclui CINC para Coenzima Q10 (substância comum sem GLP-1)", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Coenzima Q10", procedureType: "iv", via: "IV" },
    ]);
    expect(codigos.has("CINC")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Base obrigatória — sempre presente independente do protocolo
// ---------------------------------------------------------------------------

describe("resolverCodigosCadernos — base obrigatória", () => {
  it("inclui CGLO, TCLE, CLGPD, RAS-JUR para qualquer protocolo", () => {
    const { codigos } = resolverCodigosCadernos([
      { nome: "Coenzima Q10", procedureType: "iv", via: "IV" },
    ]);
    expect(codigos.has("CGLO")).toBe(true);
    expect(codigos.has("TCLE")).toBe(true);
    expect(codigos.has("CLGPD")).toBe(true);
    expect(codigos.has("RAS-JUR")).toBe(true);
  });
});
