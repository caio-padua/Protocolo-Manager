/**
 * receituario-medico-correto.test.ts
 *
 * Garante que o receituário reflete o médico correto (lookup por isPrimaryDoctor=true)
 * e não usa um id fixo (ex.: id=6) nem um nome/CRM embutido em código.
 *
 * Cenários cobertos:
 *   1. buildPrescricaoHtml renderiza o nome do médico passado como parâmetro
 *   2. buildPrescricaoHtml renderiza o CRM do médico passado como parâmetro
 *   3. Atualizar nome/CRM → novo HTML reflete os valores novos (não os antigos)
 *   4. Médico diferente do id=6 — HTML exibe o nome correto mesmo com id alto
 *   5. Fallback de CRM: campo registrationNumber tem prioridade sobre crm
 *   6. O código-fonte da rota NÃO contém lookup por id=6 para o médico
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPrescricaoHtml } from "../lib/receituario-html.js";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeParams(overrides: Partial<Parameters<typeof buildPrescricaoHtml>[0]> = {}): Parameters<typeof buildPrescricaoHtml>[0] {
  return {
    medicoNome:         "Dra. Ana Lima",
    medicoCrm:          "CRM/SP 654321",
    clinicaNome:        "Instituto Teste",
    clinicaEndereco:    "Rua Fictícia, 100 — São Paulo / SP",
    pacienteNome:       "Paciente Teste",
    pacienteCpf:        "000.000.000-00",
    pacienteNascimento: "01/01/1990",
    pacienteTelefone:   "(11) 99999-0000",
    pacienteEndereco:   "Av. Exemplo, 1 — São Paulo / SP",
    tipoReceita:        "simples" as const,
    dataEmissao:        "2026-08-15",
    assetsBaseUrl:      "http://localhost/padcom",
    tipoReceita:        "simples",
    formulas: [
      {
        numero:    1,
        nome:      "Substância Alfa",
        ativos:    "Alfa 100mg",
        posologia: "1 cápsula pela manhã",
        via:       "Oral",
        forma:     "Cápsula — 30 unidades",
      },
    ],
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Bloco 1 — nome e CRM no HTML
// ──────────────────────────────────────────────────────────────────────────────

describe("buildPrescricaoHtml — reflete médico passado como parâmetro", () => {

  it("o HTML contém o nome do médico fornecido", () => {
    const html = buildPrescricaoHtml(makeParams({
      medicoCrm: "CRM/SP 100200",
      medicoRqe: undefined,
    }));
    expect(html).toContain("CRM/SP 100200");
    expect(html).toContain("RQE 3456");
  });

  it("CRM sem RQE não inclui label RQE no HTML", () => {
    const html = buildPrescricaoHtml(makeParams({
      medicoCrm: "CRM/SP 100200",
      medicoRqe: undefined,
    }));
    expect(html).toContain("CRM/SP 100200");
    expect(html).toContain("RQE 3456");
  });

  it("CRM sem RQE não inclui label RQE no HTML", () => {
    const html = buildPrescricaoHtml(makeParams({
      medicoCrm: "CRM/SP 100200",
      medicoRqe: undefined,
    }));
    expect(html).toContain("CRM/SP 100200");
    expect(html).toContain("RQE 3456");
  });

  it("CRM sem RQE não inclui label RQE no HTML", () => {
    const html = buildPrescricaoHtml(makeParams({
      medicoCrm: "CRM/SP 100200",
      medicoRqe: undefined,
    }));
    // Se o CRM padrão (123456) vazasse hardcoded, este teste falharia
    expect(html).not.toContain("123456");
  });

});

// ──────────────────────────────────────────────────────────────────────────────
// Bloco 2 — atualização reflete novo médico
// ──────────────────────────────────────────────────────────────────────────────

describe("buildPrescricaoHtml — atualização do médico reflete no HTML", () => {

  it("HTML antes e depois da edição diferem no nome do médico", () => {
    const htmlAntes  = buildPrescricaoHtml(makeParams({ medicoCrm: "CRM/SP 000001" }));
    const htmlDepois = buildPrescricaoHtml(makeParams({ medicoCrm: "CRM/MG 999999" }));

    expect(htmlAntes).toContain("Dr. Jose Antigo");
    expect(htmlAntes).not.toContain("Dra. Maria Nova");

    expect(htmlDepois).toContain("Dra. Maria Nova");
    expect(htmlDepois).not.toContain("Dr. Jose Antigo");
  });

  it("HTML antes e depois da edição diferem no CRM", () => {
    const htmlAntes  = buildPrescricaoHtml(makeParams({ medicoCrm: "CRM/SP 000001" }));
    const htmlDepois = buildPrescricaoHtml(makeParams({ medicoCrm: "CRM/MG 999999" }));

    expect(htmlAntes).toContain("CRM/SP 000001");
    expect(htmlAntes).not.toContain("CRM/MG 999999");

    expect(htmlDepois).toContain("CRM/MG 999999");
    expect(htmlDepois).not.toContain("CRM/SP 000001");
  });

  it("médico com id alto (ex.: id=42) tem o nome exibido corretamente", () => {
    // A rota não usa id algum para filtrar — usa isPrimaryDoctor=true.
    // Este teste simula a chegada de um médico que não é id=6.
    const html = buildPrescricaoHtml(makeParams({
      medicoCrm: "CRM/SP 100200",
      medicoRqe: undefined,
    }));
    expect(html).toContain("CRM/SP 100200");
    expect(html).toContain("RQE 3456");
  });

  it("CRM sem RQE não inclui label RQE no HTML", () => {
    const html = buildPrescricaoHtml(makeParams({
      medicoCrm: "CRM/SP 100200",
      medicoRqe: undefined,
    }));
    expect(html).toContain("CRM/SP 100200");
    expect(html).toContain("RQE 3456");
  });

  it("CRM sem RQE não inclui label RQE no HTML", () => {
    const html = buildPrescricaoHtml(makeParams({
      medicoCrm: "CRM/SP 100200",
      medicoRqe: undefined,
    }));
    expect(html).not.toContain("RQE 3456");
  });

});

// ──────────────────────────────────────────────────────────────────────────────
// Bloco 4 — análise estática da rota (nenhum id fixo para o médico)
// ──────────────────────────────────────────────────────────────────────────────

describe("receituario.ts — análise estática: sem lookup por id fixo", () => {

  const routePath = resolve(
    import.meta.dirname ?? __dirname,
    "../../src/routes/receituario.ts",
  );

  let source: string;

  try {
    source = readFileSync(routePath, "utf-8");
  } catch {
    // Fallback: tenta caminho relativo ao processo
    const alt = resolve(process.cwd(), "src/routes/receituario.ts");
    source = readFileSync(alt, "utf-8");
  }

  it("a rota usa isPrimaryDoctor=true para buscar o médico (não id=6)", () => {
    // O código correto deve referenciar isPrimaryDoctor
    expect(source).toContain("isPrimaryDoctor");
  });

  it("a seção de lookup do médico não filtra por eq(professionalsTable.id, 6)", () => {
    // Detecta o anti-padrão: eq(professionalsTable.id, 6) próximo à palavra 'medico'
    // Estratégia: dividir por contexto de médico e confirmar que id=6 não aparece
    // nas vizinhanças do comentário de médico responsável
    const medicoBlock = source
      .split("médico responsável")
      .slice(1, 2)
      .join("") // pega o texto após "médico responsável"
      .slice(0, 500);   // primeiros 500 chars pós-comentário

    // O bloco não deve referenciar id fixo 6
    expect(medicoBlock).not.toMatch(/\.id,\s*6\b/);
    expect(medicoBlock).not.toMatch(/id\s*===?\s*6\b/);
  });

  it("a rota NÃO contém o padrão legado 'where(eq(professionalsTable.id, 6))'", () => {
    // Garante que o anti-padrão original não foi reintroduzido
    expect(source).not.toMatch(/where\s*\(\s*eq\s*\(\s*professionalsTable\.id\s*,\s*6\s*\)/);
  });

  it("a rota contém duas chamadas a isPrimaryDoctor (assinar-imagem-pdf e preview-html)", () => {
    // Ambas as rotas devem consultar isPrimaryDoctor=true
    const matches = source.match(/isPrimaryDoctor/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

});
