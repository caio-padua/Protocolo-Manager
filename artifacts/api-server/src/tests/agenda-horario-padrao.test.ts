import { describe, expect, it } from "vitest";
import { horarioPadraoDeJanelas } from "../lib/agenda-horario-padrao";

describe("horário padrão lido do cadastro da Agenda Configuração", () => {
  it("sem expediente cadastrado devolve null, nunca um horário inventado", () => {
    expect(horarioPadraoDeJanelas([])).toBeNull();
  });
  it("a maioria dos dias começa às 09:00: vale 09:00, ignorando a janela da tarde", () => {
    const janelas = [1, 2, 3, 4, 5].flatMap(weekday => [
      { weekday, startTime: "09:00" }, { weekday, startTime: "14:00" },
    ]).concat([{ weekday: 6, startTime: "10:00" }]);
    expect(horarioPadraoDeJanelas(janelas)).toEqual({ time: "09:00", diasComEsseInicio: 5, diasComExpediente: 6 });
  });
  it("se todas as semanas o primeiro horário é 10:00, vale 10:00", () => {
    expect(horarioPadraoDeJanelas([
      { weekday: 1, startTime: "10:00" }, { weekday: 3, startTime: "10:00" }, { weekday: 3, startTime: "15:00" },
    ])).toEqual({ time: "10:00", diasComEsseInicio: 2, diasComExpediente: 2 });
  });
  it("empate escolhe o mais cedo; início mal formatado é ignorado", () => {
    expect(horarioPadraoDeJanelas([
      { weekday: 1, startTime: "11:00" }, { weekday: 2, startTime: "08:30" }, { weekday: 3, startTime: "9h" },
    ])?.time).toBe("08:30");
  });
});
