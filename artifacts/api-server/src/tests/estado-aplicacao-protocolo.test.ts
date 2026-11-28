import { describe, expect, it } from "vitest";
import { estadoAplicacao } from "../lib/estado-aplicacao-protocolo";
import { buildDescriptionBody, getSessionStatusLine, type CalendarEventData } from "../lib/google-calendar";

describe("Estado real de aplicações e descrição da agenda", () => {
  it("distingue aplicação, não realização, próxima e dado contraditório", () => {
    expect(estadoAplicacao({ status: "applied", availability: "disp", appliedAt: "2030-01-07T12:00:00Z" })).toBe("applied");
    expect(estadoAplicacao({ status: "missed", availability: "disp", appliedAt: null })).toBe("notPerformed");
    expect(estadoAplicacao({ status: "pending", availability: "prox", appliedAt: null })).toBe("prox");
    expect(estadoAplicacao({ status: "pending", availability: "disp", appliedAt: "2030-01-07T12:00:00Z" })).toBe("review");
    expect(estadoAplicacao({ status: "applied", availability: "prox", appliedAt: "2030-01-07T12:00:00Z" })).toBe("review");
  });

  it("não transforma sessão encerrada com ausência em aplicação realizada", () => {
    const item = { name: "Substância sintética", dose: "Dose sintética", sessionNumber: 1, totalSessions: 2 };
    expect(getSessionStatusLine({ sessionStatus: "completed", substances: [{ ...item, status: "notPerformed" }] }))
      .toContain("Nenhuma Aplicação Registrada como Realizada");
    expect(getSessionStatusLine({ sessionStatus: "completed", substances: [{ ...item, status: "applied" }, { ...item, status: "notPerformed" }] }))
      .toContain("Parcialmente Realizadas");
    expect(getSessionStatusLine({ sessionStatus: "completed", substances: [{ ...item, status: "applied" }, { ...item, status: "prox", sessionNumber: 2 }] }))
      .toContain("Aplicações Realizadas");
    expect(getSessionStatusLine({ sessionStatus: "missed", substances: [] })).toContain("Cliente Faltou");
    expect(getSessionStatusLine({ sessionStatus: "cancelled", substances: [] })).toContain("Cancelada");
    expect(getSessionStatusLine({ sessionStatus: "scheduled", rescheduleCount: 1, substances: [] })).toContain("Remarcada");
  });

  it("mantém os estados e a legenda na descrição de exemplo sintético", () => {
    const data: CalendarEventData = {
      sessionId: 1, clientName: "Cliente sintético", scheduledDate: "2030-01-07", scheduledTime: "09:00",
      durationMinutes: 20, weekNumber: 1, unit: "Unidade sintética", procedureLabel: "Aplicação",
      activeProcedureTypes: ["im"], sessionStatus: "completed", substances: [
        { name: "Substância A", dose: "Dose A", sessionNumber: 1, totalSessions: 2, status: "applied" },
        { name: "Substância B", dose: "Dose B", sessionNumber: 1, totalSessions: 2, status: "notPerformed" },
        { name: "Substância C", dose: "Dose C", sessionNumber: 0, totalSessions: 2, status: "prox" },
      ],
    };
    const description = buildDescriptionBody(data);
    expect(description).toContain("Substância A Dose A [APLI]");
    expect(description).toContain("Substância B Dose B [NREA]");
    expect(description).toContain("Substância C Dose C [PROX]");
    expect(description).toContain("Parcialmente Realizadas");
    expect(description).not.toContain("CONTATO:");
  });
});
