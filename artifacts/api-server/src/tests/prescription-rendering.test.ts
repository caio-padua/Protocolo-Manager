import { describe, expect, it } from "vitest";
import { prescriptionItemForDocument } from "../lib/prescription-rendering";

describe("apresentação fiel da prescrição", () => {
  it("não acrescenta a dose de tomada à composição quando há posologia", () => {
    const item = prescriptionItemForDocument({
      name: "FÓRMULA SINTÉTICA",
      ativos: "ATIVO DE TESTE 10 mg",
      posologia: "1 dose VO – Manhã – Sugestão: 08:00",
      dose: "1 (08:00)",
      via: "VO",
      periodo: "Manhã",
    });
    expect(item.ativos).toBe("ATIVO DE TESTE 10 mg");
    expect(item.posologia).toBe("1 dose VO – Manhã – Sugestão: 08:00");
  });

  it("preserva os campos existentes quando o texto de posologia está ausente", () => {
    const item = prescriptionItemForDocument({
      name: "FÓRMULA SINTÉTICA",
      dose: "1 dose",
      via: "VO",
      frequencia: "por dia",
      periodo: "manhã",
    });
    expect(item.ativos).toBeUndefined();
    expect(item.posologia).toBe("1 dose — VO — por dia — manhã");
  });

  it("preserva dose clínica distinta que não está na posologia", () => {
    const item = prescriptionItemForDocument({
      name: "FÓRMULA SINTÉTICA",
      ativos: "CONTEÚDO DE TESTE",
      dose: "10 mg",
      posologia: "1 dose VO pela manhã",
    });
    expect(item.posologia).toBe("1 dose VO pela manhã\nDose informada: 10 mg");
  });

  it("não esconde um horário ausente do texto da posologia", () => {
    const item = prescriptionItemForDocument({
      name: "FÓRMULA SINTÉTICA",
      dose: "1 (08:00)",
      posologia: "1 dose VO",
    });
    expect(item.posologia).toContain("Dose informada: 1 (08:00)");
  });

  it("não confunde um número isolado com parte de outro número", () => {
    const item = prescriptionItemForDocument({
      name: "FÓRMULA SINTÉTICA",
      dose: "1",
      posologia: "10 doses VO",
    });
    expect(item.posologia).toContain("Dose informada: 1");
  });

  it("não cria orientação nem dose quando os campos estão vazios", () => {
    const item = prescriptionItemForDocument({ name: "FÓRMULA SINTÉTICA" });
    expect(item.ativos).toBeUndefined();
    expect(item.posologia).toBeUndefined();
  });
});
