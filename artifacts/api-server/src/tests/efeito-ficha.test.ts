import { describe, expect, it } from "vitest";
import { classificarGravidade, separarFicha, trechoParaNivel, validarFicha } from "../lib/efeito-ficha";

// Texto 100% sintético. Nenhum dado de paciente.
const FICHA = [
  "Olá! Você relatou dor de cabeça.",
  "PERGUNTAS RÁPIDAS\n• Quando começou?\n• Qual a intensidade de 0 a 10?",
  "SE FOR LEVE\nDescanse e observe a evolução.",
  "SE FOR MODERADO\nEntre em contato com a equipe.\n\nNão aumente, não repita e não suspenda nenhum medicamento por conta própria.",
  "QUANDO REAVALIAR\nEm algumas horas.",
  "PROCURE URGÊNCIA AGORA SE\n• dor no peito\n\nLigue 192 (SAMU).",
].join("\n\n");

describe("ficha de efeito relatado", () => {
  it("separa as cinco seções e a introdução", () => {
    const f = separarFicha(FICHA);
    expect(Object.keys(f.secoes)).toHaveLength(5);
    expect(f.introducao).toContain("dor de cabeça");
  });
  it("ficha completa não tem problema; ficha sem urgência é recusada", () => {
    expect(validarFicha(FICHA)).toEqual([]);
    const sem = FICHA.replace(/PROCURE URGÊNCIA AGORA SE[\s\S]*$/, "");
    expect(validarFicha(sem).map((p) => p.codigo)).toContain("secao_ausente");
  });
  it("recusa texto que orienta dose adicional ou afirma causa", () => {
    expect(validarFicha(FICHA + "\n\nTome uma dose adicional.").map((p) => p.codigo)).toContain("orienta_dose");
    expect(validarFicha(FICHA + "\n\nÉ efeito da medicação com certeza.").map((p) => p.codigo)).toContain("presume_causa");
  });
  it.each([
    ["dor leve e habitual", { intensidade: "leve", habitualEPrevisivel: true }, "autocuidado"],
    ["dor leve, diferente do habitual", { intensidade: "leve", habitualEPrevisivel: false }, "equipe"],
    ["dor moderada", { intensidade: "moderada" }, "equipe"],
    ["dor súbita e intensa", { subitoIntenso: true, intensidade: "leve", habitualEPrevisivel: true }, "urgencia"],
    ["sinal neurológico mesmo com dor leve", { neurologico: true, intensidade: "leve" }, "urgencia"],
    ["dor no peito", { dorNoPeito: true }, "urgencia"],
    ["falta de ar importante", { faltaDeArImportante: true }, "urgencia"],
    ["vômitos sem hidratação", { naoConsegueHidratar: true }, "urgencia"],
    ["intensidade 10", { intensidade: "intensa" }, "urgencia"],
    ["sem respostas", {}, "indefinido"],
  ] as const)("triagem sintética: %s -> %s", (_n, r, nivel) => {
    expect(classificarGravidade(r)).toBe(nivel);
  });
  it("cada nível devolve só o trecho certo; indefinido só pergunta", () => {
    expect(trechoParaNivel(FICHA, "urgencia").texto).toContain("192");
    expect(trechoParaNivel(FICHA, "urgencia").texto).not.toContain("Descanse");
    expect(trechoParaNivel(FICHA, "autocuidado").secoes).toEqual(["SE FOR LEVE", "QUANDO REAVALIAR"]);
    expect(trechoParaNivel(FICHA, "indefinido").secoes).toEqual(["PERGUNTAS RÁPIDAS"]);
  });
});
