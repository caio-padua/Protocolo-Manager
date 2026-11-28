import { describe, expect, it } from "vitest";
import { contarAplicacoesRealizadas } from "../lib/contagem-aplicacoes-realizadas";
import { buildCartaTratamentoDto } from "../lib/pdf-carta-tratamento";

describe("Contagem de aplicações realizadas no protocolo", () => {
  it("conta aplicação comprovada, não conta ausência, pendência ou outra sessão", () => {
    const apps = [
      { sessionId: 1, substanceId: 10, sessionNumber: 1, availability: "disp", status: "applied", appliedAt: "2030-01-07T12:00:00Z" },
      { sessionId: 1, substanceId: 11, sessionNumber: 1, availability: "disp", status: "missed", appliedAt: null },
      { sessionId: 2, substanceId: 10, sessionNumber: 2, availability: "disp", status: "pending", appliedAt: null },
      { sessionId: 3, substanceId: 10, sessionNumber: 2, availability: "disp", status: "applied", appliedAt: "2030-01-14T12:00:00Z" },
      { sessionId: 4, substanceId: 10, sessionNumber: 2, availability: "disp", status: "applied", appliedAt: "2030-01-14T12:00:00Z" },
      { sessionId: 5, substanceId: 12, sessionNumber: 1, availability: "disp", status: "applied", appliedAt: null },
    ];
    const result = contarAplicacoesRealizadas([1, 2, 3, 4, 5], apps);
    expect(result.bySubstance.get(10)).toBe(2);
    expect(result.bySubstance.has(11)).toBe(false);
    expect(result.bySubstance.has(12)).toBe(false);
    expect([...result.visits]).toEqual([1, 3, 4]);
    const dto = buildCartaTratamentoDto({
      protocolId: 1, protocolTitle: "Sintético", clientName: "Cliente sintético",
      professionalName: "Profissional sintético", unit: "Local sintético", startDate: "2030-01-07",
      substances: [{ name: "Substância", dose: "Dose", color: "blue", totalSessions: 3,
        intervalDays: 7, procedureType: "im", completedSessions: result.bySubstance.get(10) }],
      sessions: [{ status: "completed", hasRecordedApplication: false },
        { status: "completed", hasRecordedApplication: true }],
    });
    expect(dto.completedSessions).toBe(1);
    expect(dto.substances[0].completedSessions).toBe(2);
  });
});
