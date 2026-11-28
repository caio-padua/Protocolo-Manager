import { describe, expect, it } from "vitest";
import { anonimizarParaGlobal } from "../lib/global-anonimizador";

const ctx = { nomesPessoas: ["Dayana Ludman", "Carlúcia Santos Fernandes"], nomesClinicas: ["Instituto Pádua"], substancias: ["Tirzepatida"] };

describe("filtro de anonimização do cérebro global", () => {
  it("frase suja: barra por termo clínico e mostra o que foi removido e convertido", () => {
    const r = anonimizarParaGlobal("A paciente Dayana Ludman CPF 123.456.789-00 quer saber se o Dr. Caio cobra R$ 750 para tratar hipotireoidismo com tirzepatida", ctx);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("termo_clinico");
    expect(r.parcial).not.toMatch(/Dayana|Ludman|123\.456|\d{3}-\d{2}/);
    expect(r.parcial).toContain("{Medico}");
    expect(r.parcial).toContain("{Valor}");
    expect(r.trocas).toEqual(expect.arrayContaining(["cpf_removido", "medico_para_variavel", "valor_para_variavel"]));
  });
  it.each([
    ["meu cpf é 123.456.789-00 e quero saber o horário", "cpf"],
    ["me liga no 11 91319-7163 para falar de horário", "telefone"],
    ["Dayana Ludman quer saber sobre horário de atendimento", "nome"],
    ["quero saber se a consulta ajuda na tontura forte", "clinico"],
    ["o Dr. Caio atende para hipertireoidismo", "clinico"],
  ])("nunca promove dado sensível: %s", (texto) => {
    const r = anonimizarParaGlobal(texto, ctx);
    const saida = r.ok ? r.texto : r.parcial;
    expect(saida).not.toMatch(/123\.456|91319|7163|Dayana|Ludman/);
    if (/tontura|hipertireoidismo/.test(texto)) expect(r.ok).toBe(false);
  });
  it("pergunta limpa vira variáveis e é aceita", () => {
    const r = anonimizarParaGlobal("O Dr. Caio atende no Instituto Pádua por R$ 750 aos sábados?", ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("O {Medico} atende no {Clinica} por {Valor} aos sábados?");
  });
});
