import { describe, expect, it } from "vitest";
import {
  datesBetween, loadProtocolSlots, periodSlotsFromEngine, type ProtocolSlotSourceDeps, type SlotSnapshot,
} from "../lib/protocol-slot-source";
import { MAX_PLANNING_SLOTS, planProtocolWithAvailableSlots } from "../lib/protocol-exact-schedule";

// Dados 100% sintéticos: nenhuma agenda, cliente ou protocolo real.
const open = (...times: string[]): SlotSnapshot[] => times.map(time => ({ time, state: "aberto" as const }));
const state = (time: string, s: SlotSnapshot["state"]): SlotSnapshot => ({ time, state: s });

describe("Fonte de vagas do planejador: períodos de enfermagem", () => {
  it("cada horário livre informa quantos períodos consecutivos tem a partir dele", () => {
    const slots = periodSlotsFromEngine({ date: "2030-03-04", nursing: open("09:00", "09:20", "09:40", "10:00") });
    expect(slots.map(s => [s.time, s.capacityPeriods])).toEqual([
      ["09:00", 4], ["09:20", 3], ["09:40", 2], ["10:00", 1],
    ]);
    expect(slots.every(s => s.date === "2030-03-04" && s.doctorCapacityPeriods === undefined)).toBe(true);
    expect(slots[0].maxApplications).toBe(4 * 900);
  });

  it("horário ocupado, bloqueado ou ainda não liberado interrompe a sequência", () => {
    const slots = periodSlotsFromEngine({
      date: "2030-03-04",
      nursing: [state("09:00", "aberto"), state("09:20", "aberto"), state("09:40", "ocupado"),
        state("10:00", "aberto"), state("10:20", "bloqueado"), state("10:40", "aberto")],
    });
    // períodos adjacentes antes do horário ocupado continuam utilizáveis
    expect(slots.map(s => [s.time, s.capacityPeriods])).toEqual([
      ["09:00", 2], ["09:20", 1], ["10:00", 1], ["10:40", 1],
    ]);
  });

  it("o intervalo do almoço (sem horários de 20 minutos) não conta como período adjacente", () => {
    const slots = periodSlotsFromEngine({
      date: "2030-03-04", nursing: open("12:20", "12:40", "14:00", "14:20"),
    });
    expect(slots.map(s => [s.time, s.capacityPeriods])).toEqual([
      ["12:20", 2], ["12:40", 1], ["14:00", 2], ["14:20", 1],
    ]);
  });

  it("não depende da ordem em que o motor entrega os horários", () => {
    const sorted = periodSlotsFromEngine({ date: "2030-03-04", nursing: open("09:00", "09:20", "09:40") });
    const shuffled = periodSlotsFromEngine({ date: "2030-03-04", nursing: open("09:40", "09:00", "09:20") });
    expect(shuffled).toEqual(sorted);
  });

  it("dia sem nenhum horário aberto não gera vaga", () => {
    expect(periodSlotsFromEngine({
      date: "2030-03-04", nursing: [state("09:00", "ocupado"), state("09:20", "bloqueado")],
    })).toEqual([]);
    expect(periodSlotsFromEngine({ date: "2030-03-04", nursing: [] })).toEqual([]);
  });

  it("recusa horário malformado, duplicado ou data inválida em vez de adivinhar", () => {
    expect(() => periodSlotsFromEngine({ date: "2030-03-04", nursing: open("9:00") })).toThrow("Horário de vaga inválido");
    expect(() => periodSlotsFromEngine({ date: "2030-03-04", nursing: open("09:00", "09:00") }))
      .toThrow("Horário duplicado");
    expect(() => periodSlotsFromEngine({ date: "04/03/2030", nursing: open("09:00") })).toThrow("Data de vaga inválida");
  });
});

describe("Fonte de vagas do planejador: cobertura do médico na grade de 60 minutos", () => {
  const nursing = open("10:00", "10:20", "10:40", "11:00", "11:20", "11:40");

  it("um horário médico aberto de 60 minutos cobre três períodos de enfermagem", () => {
    const slots = periodSlotsFromEngine({
      date: "2030-03-04", nursing, doctor: { slots: open("10:00"), slotMinutes: 60 },
    });
    expect(slots.map(s => [s.time, s.capacityPeriods, s.doctorCapacityPeriods])).toEqual([
      ["10:00", 6, 3], ["10:20", 5, 2], ["10:40", 4, 1],
      ["11:00", 3, 0], ["11:20", 2, 0], ["11:40", 1, 0],
    ]);
  });

  it("dois horários médicos seguidos formam uma cobertura contínua", () => {
    const slots = periodSlotsFromEngine({
      date: "2030-03-04", nursing, doctor: { slots: open("10:00", "11:00"), slotMinutes: 60 },
    });
    expect(slots.find(s => s.time === "10:40")!.doctorCapacityPeriods).toBe(4);
    expect(slots.find(s => s.time === "10:00")!.doctorCapacityPeriods).toBe(6);
  });

  it("período de enfermagem que atravessa a fronteira de dois horários médicos seguidos é coberto", () => {
    // Grade de enfermagem deslocada (expediente começando às 10h50): 10h50-11h10 cruza as 11h00.
    const slots = periodSlotsFromEngine({
      date: "2030-03-04", nursing: open("10:50", "11:10"),
      doctor: { slots: open("10:00", "11:00"), slotMinutes: 60 },
    });
    expect(slots.map(s => [s.time, s.capacityPeriods, s.doctorCapacityPeriods])).toEqual([
      ["10:50", 2, 2], ["11:10", 1, 1],
    ]);
  });

  it("horário médico separado por lacuna não é somado", () => {
    const slots = periodSlotsFromEngine({
      date: "2030-03-04", nursing,
      doctor: { slots: [state("10:00", "aberto"), state("11:00", "ocupado")], slotMinutes: 60 },
    });
    expect(slots.find(s => s.time === "10:40")!.doctorCapacityPeriods).toBe(1);
  });

  it("agenda médica informada mas sem horário aberto dá cobertura zero, nunca ausente", () => {
    const slots = periodSlotsFromEngine({ date: "2030-03-04", nursing, doctor: { slots: [], slotMinutes: 60 } });
    expect(slots.every(s => s.doctorCapacityPeriods === 0)).toBe(true);
  });

  it("cobertura nunca passa da capacidade da enfermagem", () => {
    const slots = periodSlotsFromEngine({
      date: "2030-03-04", nursing: open("10:00", "10:20"), doctor: { slots: open("10:00", "11:00"), slotMinutes: 60 },
    });
    expect(slots.map(s => s.doctorCapacityPeriods)).toEqual([2, 1]);
  });
});

describe("Fonte de vagas alimentando o planejador (decisão: infusões seguem uma após a outra)", () => {
  const iv = (substanceId: number) => ({
    substanceId, dose: "dose sintética", totalSessions: 1, intervalDays: 7,
    durationSeconds: 1800, requiresDoctor: false,
  });

  it("duas infusões de 30 minutos exigem 4 períodos seguidos e vão para o dia que os tem", () => {
    // segunda: só 3 períodos livres; terça: 4. As duas infusões somam 3600 s = 4 períodos.
    const slots = [
      ...periodSlotsFromEngine({ date: "2030-01-07", nursing: open("09:00", "09:20", "09:40") }),
      ...periodSlotsFromEngine({ date: "2030-01-08", nursing: open("09:00", "09:20", "09:40", "10:00") }),
    ];
    const plan = planProtocolWithAvailableSlots("2030-01-07", [iv(1), iv(2)], slots,
      { toleranceDays: 4, minIntervalReductionDays: 4 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.visits).toHaveLength(1);
    expect(plan.visits[0]).toMatchObject({ date: "2030-01-08", time: "09:00" });
    expect(plan.visits[0].sizing).toMatchObject({ nursingPeriods: 4, requiresDoctor: false });
  });

  it("sem nenhum dia com 4 períodos seguidos, as infusões ficam em dias separados", () => {
    const slots = [
      ...periodSlotsFromEngine({ date: "2030-01-07", nursing: open("09:00", "09:20", "09:40") }),
      ...periodSlotsFromEngine({ date: "2030-01-08", nursing: open("09:00", "09:20", "09:40") }),
    ];
    const plan = planProtocolWithAvailableSlots("2030-01-07", [iv(1), iv(2)], slots,
      { toleranceDays: 4, minIntervalReductionDays: 4 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.visits.map(v => v.date)).toEqual(["2030-01-07", "2030-01-08"]);
    expect(plan.visits.every(v => v.sizing!.nursingPeriods === 2)).toBe(true);
  });

  it("implante sem cobertura médica não encontra plano, mesmo com enfermagem livre", () => {
    const slots = periodSlotsFromEngine({
      date: "2030-01-07", nursing: open("09:00", "09:20", "09:40"), doctor: { slots: [], slotMinutes: 60 },
    });
    const plan = planProtocolWithAvailableSlots("2030-01-07", [{
      substanceId: 9, dose: "dose sintética", totalSessions: 1, intervalDays: 30,
      durationSeconds: 1800, requiresDoctor: true,
    }], slots, { toleranceDays: 4, minIntervalReductionDays: 4 });
    expect(plan).toMatchObject({ ok: false, reason: "nenhum_plano_encontrado" });
  });
});

describe("Leitura do motor de agenda por período", () => {
  const fakeResult = (reason: string | null, slots: SlotSnapshot[]) => ({
    resource: {} as never, result: { subBlocks: [], slots: slots.map(s => ({ ...s, reason: null, subBlockIndex: 0 })), reason },
  }) as never;
  const resources: Record<number, { empresaId: number; kind: string; slotMinutes: number; active: boolean }> = {
    1: { empresaId: 7, kind: "enfermagem", slotMinutes: 20, active: true },
    2: { empresaId: 7, kind: "medico", slotMinutes: 60, active: true },
    3: { empresaId: 8, kind: "enfermagem", slotMinutes: 20, active: true },
    4: { empresaId: 7, kind: "enfermagem", slotMinutes: 30, active: true },
    5: { empresaId: 7, kind: "enfermagem", slotMinutes: 20, active: false },
  };
  const depsFor = (days: Record<string, ReturnType<typeof fakeResult>>, calls: string[] = []): ProtocolSlotSourceDeps => ({
    findResource: async id => resources[id] ?? null,
    computeSlots: (async (resourceId: number, date: string) => {
      calls.push(`${resourceId}@${date}`);
      return days[`${resourceId}@${date}`] ?? null;
    }) as never,
  });
  const base = { empresaId: 7, nursingResourceId: 1, fromDate: "2030-03-04", toDate: "2030-03-08" };

  it("classifica cada dia pelo motivo real e junta só as vagas dos dias legíveis", async () => {
    const calls: string[] = [];
    const result = await loadProtocolSlots({
      ...base, deps: depsFor({
        "1@2030-03-04": fakeResult(null, open("09:00", "09:20")),
        "1@2030-03-05": fakeResult("sem-expediente", []),
        "1@2030-03-06": fakeResult("excecao", []),
        "1@2030-03-07": fakeResult("sincronizacao-pendente", [state("09:00", "bloqueado")]),
        "1@2030-03-08": fakeResult(null, [state("09:00", "ocupado")]),
      }, calls),
    });
    expect(result.slots.map(s => `${s.date} ${s.time} ${s.capacityPeriods}`)).toEqual([
      "2030-03-04 09:00 2", "2030-03-04 09:20 1",
    ]);
    expect(result.diagnostics).toEqual({
      datesRead: 5, nursingDatesWithoutSchedule: ["2030-03-05"], nursingDatesWithException: ["2030-03-06"],
      integrationPendingDates: ["2030-03-07"], nursingDatesWithoutOpenSlot: ["2030-03-08"],
      doctorDatesWithoutSchedule: [], doctorDatesWithException: [], doctorIntegrationPendingDates: [],
      doctorDatesWithoutOpenSlot: [],
    });
    expect(calls).toHaveLength(5);
  });

  it("agenda do Google desatualizada nunca vira vaga nem 'dia sem vaga'", async () => {
    const result = await loadProtocolSlots({
      ...base, toDate: "2030-03-04",
      deps: depsFor({ "1@2030-03-04": fakeResult("sincronizacao-pendente", [state("09:00", "bloqueado")]) }),
    });
    expect(result.slots).toEqual([]);
    expect(result.diagnostics.integrationPendingDates).toEqual(["2030-03-04"]);
    expect(result.diagnostics.nursingDatesWithoutOpenSlot).toEqual([]);
  });

  it("com agenda médica, informa a cobertura e separa cada motivo de cobertura zero", async () => {
    const result = await loadProtocolSlots({
      ...base, doctorResourceId: 2, toDate: "2030-03-08",
      deps: depsFor({
        "1@2030-03-04": fakeResult(null, open("10:00", "10:20", "10:40")),
        "2@2030-03-04": fakeResult(null, open("10:00")),
        "1@2030-03-05": fakeResult(null, open("10:00")),
        "2@2030-03-05": fakeResult("sem-expediente", []),
        "1@2030-03-06": fakeResult(null, open("10:00")),
        "2@2030-03-06": fakeResult("excecao", []),
        "1@2030-03-07": fakeResult(null, open("10:00")),
        "2@2030-03-07": fakeResult("sincronizacao-pendente", [state("10:00", "bloqueado")]),
        "1@2030-03-08": fakeResult(null, open("10:00")),
        "2@2030-03-08": fakeResult(null, [state("10:00", "ocupado")]),
      }),
    });
    expect(result.slots.map(s => `${s.date} ${s.time} ${s.doctorCapacityPeriods}`)).toEqual([
      "2030-03-04 10:00 3", "2030-03-04 10:20 2", "2030-03-04 10:40 1",
      "2030-03-05 10:00 0", "2030-03-06 10:00 0", "2030-03-07 10:00 0", "2030-03-08 10:00 0",
    ]);
    expect(result.diagnostics).toMatchObject({
      doctorDatesWithoutSchedule: ["2030-03-05"], doctorDatesWithException: ["2030-03-06"],
      doctorIntegrationPendingDates: ["2030-03-07"], doctorDatesWithoutOpenSlot: ["2030-03-08"],
      nursingDatesWithoutOpenSlot: [],
    });
  });

  it("motivo desconhecido da agenda médica falha em vez de virar 'sem médico'", async () => {
    await expect(loadProtocolSlots({
      ...base, doctorResourceId: 2, toDate: "2030-03-04",
      deps: depsFor({
        "1@2030-03-04": fakeResult(null, open("10:00")),
        "2@2030-03-04": fakeResult("motivo-novo", []),
      }),
    })).rejects.toThrow("Motivo de agenda médica não reconhecido");
  });

  it("não consulta a agenda médica em dia em que a enfermagem não atende", async () => {
    const calls: string[] = [];
    await loadProtocolSlots({
      ...base, doctorResourceId: 2, toDate: "2030-03-04",
      deps: depsFor({ "1@2030-03-04": fakeResult("sem-expediente", []) }, calls),
    });
    expect(calls).toEqual(["1@2030-03-04"]);
  });

  it("recusa agenda de outra empresa, inexistente ou inativa com a mesma mensagem", async () => {
    for (const nursingResourceId of [3, 99, 5]) {
      await expect(loadProtocolSlots({ ...base, nursingResourceId, deps: depsFor({}) }))
        .rejects.toThrow("Agenda não encontrada ou inativa");
    }
  });

  it("recusa agenda do tipo errado e grade fora de 20 minutos", async () => {
    await expect(loadProtocolSlots({ ...base, nursingResourceId: 2, deps: depsFor({}) }))
      .rejects.toThrow("não é de enfermagem");
    await expect(loadProtocolSlots({ ...base, doctorResourceId: 1, deps: depsFor({}) }))
      .rejects.toThrow("não é médica");
    await expect(loadProtocolSlots({ ...base, nursingResourceId: 4, deps: depsFor({}) }))
      .rejects.toThrow("horários de 20 minutos");
  });

  it("falha explícita quando o motor não consegue ler o dia ou devolve motivo desconhecido", async () => {
    await expect(loadProtocolSlots({ ...base, toDate: "2030-03-04", deps: depsFor({}) }))
      .rejects.toThrow("indisponível para leitura");
    await expect(loadProtocolSlots({
      ...base, toDate: "2030-03-04",
      deps: depsFor({ "1@2030-03-04": fakeResult("motivo-novo", []) }),
    })).rejects.toThrow("Motivo de agenda de enfermagem não reconhecido");
  });

  it("recusa período cujas vagas o planejador não aceitaria, em vez de entregar algo inutilizável", async () => {
    const slotsPerDay = (count: number) => open(...Array.from({ length: count }, (_, i) => {
      const minutes = 6 * 60 + i * 20;
      return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }));
    const days = datesBetween("2030-01-01", "2030-07-19"); // 200 dias
    const depsWith = (count: number) => depsFor(Object.fromEntries(
      days.map(date => [`1@${date}`, fakeResult(null, slotsPerDay(count))])));
    const range = { ...base, fromDate: days[0], toDate: days[days.length - 1] };
    const calls: string[] = [];
    // 25 horários x 200 dias = exatamente 5000: aceito. 26 x 200 = 5200: recusado.
    const ok = await loadProtocolSlots({ ...range, deps: depsWith(25) });
    expect(ok.slots).toHaveLength(MAX_PLANNING_SLOTS);
    const failing = depsWith(26);
    const counting: ProtocolSlotSourceDeps = {
      ...failing, computeSlots: ((id: number, date: string, ...rest: unknown[]) => {
        calls.push(date); return (failing.computeSlots as any)(id, date, ...rest);
      }) as never,
    };
    await expect(loadProtocolSlots({ ...range, deps: counting })).rejects.toThrow("Vagas demais para o planejador");
    // recusa assim que o teto é ultrapassado (dia 193 de 200), sem ler o resto
    expect(calls).toHaveLength(Math.floor(MAX_PLANNING_SLOTS / 26) + 1);
  });

  it("limita o custo em agenda-dias: 200 dias só com enfermagem, 120 com médico", async () => {
    const calls: string[] = [];
    const deps = depsFor({}, calls);
    await expect(loadProtocolSlots({ ...base, fromDate: "2030-01-01", toDate: "2030-05-01", doctorResourceId: 2, deps }))
      .rejects.toThrow("maior que o limite"); // 121 dias x 2 agendas = 242 > 240
    await expect(loadProtocolSlots({ ...base, fromDate: "2030-01-01", toDate: "2030-07-20", deps }))
      .rejects.toThrow("maior que o limite"); // 201 dias
    expect(calls).toEqual([]);
    // 120 dias com médico = 240: dentro do orçamento (falha adiante só porque o dia não existe no fake)
    await expect(loadProtocolSlots({ ...base, fromDate: "2030-01-01", toDate: "2030-04-30", doctorResourceId: 2, deps }))
      .rejects.toThrow("indisponível para leitura");
  });

  it("não consulta o motor quando o período é inválido", async () => {
    const calls: string[] = [];
    await expect(loadProtocolSlots({ ...base, fromDate: "2030-03-09", toDate: "2030-03-04", deps: depsFor({}, calls) }))
      .rejects.toThrow("Período de vagas inválido");
    expect(calls).toEqual([]);
  });
});

describe("Intervalo de datas da leitura", () => {
  it("lista os dias inclusive nas pontas e atravessa fim de mês e ano bissexto", () => {
    expect(datesBetween("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(datesBetween("2030-03-04", "2030-03-04")).toEqual(["2030-03-04"]);
  });
  it("recusa datas impossíveis, ordem invertida e período acima de 200 dias", () => {
    expect(() => datesBetween("2030-02-30", "2030-03-04")).toThrow("Período de vagas inválido");
    expect(() => datesBetween("2030-03-05", "2030-03-04")).toThrow("Período de vagas inválido");
    expect(() => datesBetween("2030-01-01", "2030-07-20")).toThrow("maior que o limite");
    expect(datesBetween("2030-01-01", "2030-07-19")).toHaveLength(200);
  });
});
