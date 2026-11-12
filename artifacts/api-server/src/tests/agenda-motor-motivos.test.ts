import { describe, expect, it } from "vitest";
import { computeAgendaSlots } from "../lib/agenda-motor";

/**
 * Reproduz, com dados sintéticos, o que o motor devolveu para a agenda de enfermagem da Sede em 12/11/2026:
 * janelas 09-13 e 14-16, períodos de 20 min, blocos de 120 min, liberação em 60 % e antecedência de 24 h.
 * Nada aqui toca banco, Google ou agenda real.
 */
const base = {
  windows: [{ startTime: "09:00", endTime: "13:00" }, { startTime: "14:00", endTime: "16:00" }],
  slotMinutes: 20,
  settings: { blockMinutes: 120, triggerPercent: 60, minLeadHours: 24 },
  isException: false,
};
const brt = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`);
const porHora = (r: ReturnType<typeof computeAgendaSlots>) => new Map(r.slots.map((s) => [s.time, s]));

describe("motor — motivo de cada período bloqueado", () => {
  it("no próprio dia, o que já começou é 'passado' e o futuro dentro de 24 h é 'antecedencia'", () => {
    // Agora = 11:00 de 12/11; 11:20 em diante ainda não começou mas está dentro de 24 h.
    const r = computeAgendaSlots({ ...base, date: "2026-11-12", now: brt("2026-11-12", "11:00"), occupiedTimes: new Set() });
    const s = porHora(r);
    expect(s.get("09:20")).toMatchObject({ state: "bloqueado", reason: "passado" });
    expect(s.get("10:40")).toMatchObject({ state: "bloqueado", reason: "passado" });
    expect(s.get("11:20")).toMatchObject({ state: "bloqueado", reason: "antecedencia" });
    expect(s.get("15:40")).toMatchObject({ state: "bloqueado", reason: "antecedencia" });
    expect(r.slots.every((x) => x.state !== "aberto")).toBe(true);
  });

  it("no dia seguinte, tudo antes de (agora + 24 h) é antecedência, nunca 'passado'", () => {
    const r = computeAgendaSlots({ ...base, date: "2026-11-13", now: brt("2026-11-12", "17:15"), occupiedTimes: new Set() });
    expect(r.slots.every((x) => x.state === "bloqueado" && x.reason === "antecedencia")).toBe(true);
  });

  it("depois do prazo, o primeiro bloco abre e os seguintes dependem da cadeia", () => {
    const r = computeAgendaSlots({ ...base, date: "2026-11-16", now: brt("2026-11-12", "17:15"),
      occupiedTimes: new Set(["09:00", "09:20", "09:40", "10:00"]) });
    const s = porHora(r);
    expect(s.get("09:00")).toMatchObject({ state: "ocupado", reason: null });
    expect(s.get("10:20")).toMatchObject({ state: "aberto", reason: null });
    // 4 de 6 = 67 % (>= 60 %): o segundo bloco abre. O terceiro (14h) depende do segundo, que está em 0 %.
    expect(s.get("11:00")).toMatchObject({ state: "aberto" });
    expect(s.get("14:00")).toMatchObject({ state: "bloqueado", reason: "cadeia" });
    expect(r.subBlocks.map((b) => b.released)).toEqual([true, true, false]);
  });

  it("primeiro bloco com ocupação abaixo de 60 % segura os seguintes (cadeia)", () => {
    const r = computeAgendaSlots({ ...base, date: "2026-11-16", now: brt("2026-11-12", "17:15"), occupiedTimes: new Set(["09:00"]) });
    const s = porHora(r);
    expect(s.get("09:20")).toMatchObject({ state: "aberto" });
    expect(s.get("11:00")).toMatchObject({ state: "bloqueado", reason: "cadeia" });
    expect(r.subBlocks[0]).toMatchObject({ occupied: 1, total: 6, occupancy: 17, released: true });
    expect(r.subBlocks[1]!.released).toBe(false);
  });

  it("compromisso tem prioridade sobre passado e antecedência; ocupado tem prioridade sobre tudo", () => {
    const r = computeAgendaSlots({ ...base, date: "2026-11-12", now: brt("2026-11-12", "17:15"),
      occupiedTimes: new Set(["09:00"]), blockedRanges: [{ start: 14 * 60, end: 14 * 60 + 15 }] });
    const s = porHora(r);
    expect(s.get("09:00")).toMatchObject({ state: "ocupado", reason: null });
    expect(s.get("14:00")).toMatchObject({ state: "bloqueado", reason: "compromisso" });
    expect(s.get("14:20")).toMatchObject({ state: "bloqueado", reason: "passado" });
  });

  it("antecedência zero (encaixe presencial) não libera o que já passou", () => {
    const r = computeAgendaSlots({ ...base, settings: { ...base.settings, minLeadHours: 0 }, date: "2026-11-12",
      now: brt("2026-11-12", "10:30"), occupiedTimes: new Set() });
    const s = porHora(r);
    expect(s.get("10:20")).toMatchObject({ state: "bloqueado", reason: "passado" });
    expect(s.get("10:40")).toMatchObject({ state: "aberto" });
  });
});
