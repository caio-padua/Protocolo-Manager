import { describe, expect, it } from "vitest";
import { calcularOcupacao } from "../lib/agenda-ocupacao";

// 12/11/2026 é quinta-feira (weekday 4). Janela 09:00-12:00 com vaga de 30 min = 6 vagas por quinta.
const janela = { weekday: 4, startTime: "09:00", endTime: "12:00", repeatWeeks: 1, anchorDate: null };
const base = { de: "2026-11-12", ate: "2026-11-12", slotMinutes: 30, janelas: [janela], datasBloqueadas: new Set<string>() };

describe("calcularOcupacao", () => {
  it("conta vagas previstas pela janela e as ocupadas pelos atendimentos", () => {
    const r = calcularOcupacao({ ...base, atendimentos: [
      { date: "2026-11-12", time: "09:00", durationMinutes: 30 },
      { date: "2026-11-12", time: "10:00", durationMinutes: 60 },
      { date: "2026-11-12", time: "11:30", durationMinutes: null },
    ] });
    expect(r).toEqual({ capacidade: 6, ocupadas: 4 });
  });
  it("exceção do dia zera as vagas e o que ocupava", () => {
    const r = calcularOcupacao({ ...base, datasBloqueadas: new Set(["2026-11-12"]), atendimentos: [{ date: "2026-11-12", time: "09:00", durationMinutes: 30 }] });
    expect(r).toEqual({ capacidade: 0, ocupadas: 0 });
  });
  it("atendimento fora da janela não entra e parte dentro conta só a parte dentro", () => {
    const r = calcularOcupacao({ ...base, atendimentos: [
      { date: "2026-11-12", time: "08:00", durationMinutes: 30 },
      { date: "2026-11-12", time: "11:30", durationMinutes: 60 },
    ] });
    expect(r).toEqual({ capacidade: 6, ocupadas: 1 });
  });
  it("semana inteira soma as quintas e respeita repetição quinzenal", () => {
    const quinzenal = { ...janela, repeatWeeks: 2, anchorDate: "2026-11-05" };
    const r = calcularOcupacao({ ...base, de: "2026-11-02", ate: "2026-11-22", janelas: [quinzenal], atendimentos: [] });
    expect(r.capacidade).toBe(12); // 05/11 e 19/11
  });
  it("nunca passa da capacidade", () => {
    const r = calcularOcupacao({ ...base, atendimentos: Array.from({ length: 9 }, () => ({ date: "2026-11-12", time: "09:00", durationMinutes: 30 })) });
    expect(r).toEqual({ capacidade: 6, ocupadas: 6 });
  });
});
