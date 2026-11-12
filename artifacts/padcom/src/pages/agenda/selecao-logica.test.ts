import { describe, expect, it } from "vitest";
import {
  agendaReservavel, agruparBloqueios, duracaoValida, ehArraste, explicarDia, explicarPeriodo, rotuloSituacao, intervaloDoArraste, inicioDoClique, jaMarcada, lerDuracao,
  lerFalha, lerRespostaDeSucesso, minutoDoPonteiro, periodoDoInicio, primeiroPeriodoIndisponivel, rotuloLocal, rotuloModalidade,
  rotuloProfissional, textoDuracao, textoIntervalo,
} from "./selecao-logica";

const faixa = { horaIni: 7, horaFim: 20 };

describe("ponteiro para minutos", () => {
  it("converte a posição e segura nos limites da faixa", () => {
    expect(minutoDoPonteiro(76, 76, faixa)).toBe(8 * 60);
    expect(minutoDoPonteiro(-30, 76, faixa)).toBe(7 * 60);
    expect(minutoDoPonteiro(99999, 76, faixa)).toBe(20 * 60);
  });
  it("clique arredonda para baixo de 5 em 5", () => {
    expect(inicioDoClique(9 * 60 + 17)).toBe(9 * 60 + 15);
    expect(inicioDoClique(9 * 60)).toBe(9 * 60);
  });
});

describe("intervalo por arraste", () => {
  it("arrasta para baixo: início para baixo, fim para cima", () => {
    expect(intervaloDoArraste(9 * 60 + 2, 9 * 60 + 41, faixa)).toEqual({ ini: 9 * 60, fim: 9 * 60 + 45 });
  });
  it("arrasta para cima dá o mesmo intervalo", () => {
    expect(intervaloDoArraste(9 * 60 + 41, 9 * 60 + 2, faixa)).toEqual({ ini: 9 * 60, fim: 9 * 60 + 45 });
  });
  it("arraste minúsculo vira 5 minutos, nunca zero", () => {
    expect(intervaloDoArraste(9 * 60 + 1, 9 * 60 + 2, faixa)).toEqual({ ini: 9 * 60, fim: 9 * 60 + 5 });
  });
  it("não sai da faixa exibida", () => {
    expect(intervaloDoArraste(19 * 60 + 58, 20 * 60, faixa).fim).toBe(20 * 60);
    expect(intervaloDoArraste(6 * 60, 7 * 60 + 12, faixa).ini).toBe(7 * 60);
    const colado = intervaloDoArraste(20 * 60, 20 * 60, faixa);
    expect(colado.fim - colado.ini).toBe(5);
    expect(colado.fim).toBe(20 * 60);
  });
  it("só vira arraste depois do limiar", () => {
    expect(ehArraste(2, 2)).toBe(false);
    expect(ehArraste(0, 7)).toBe(true);
  });
});

describe("duração", () => {
  it("aceita 5 a 480 inteiros", () => {
    expect(duracaoValida(5)).toBe(true);
    expect(duracaoValida(480)).toBe(true);
    expect(duracaoValida(4)).toBe(false);
    expect(duracaoValida(481)).toBe(false);
    expect(duracaoValida(20.5)).toBe(false);
  });
  it("lê só inteiro digitado", () => {
    expect(lerDuracao("45")).toBe(45);
    expect(lerDuracao(" 30 ")).toBe(30);
    expect(lerDuracao("")).toBeNull();
    expect(lerDuracao("4,5")).toBeNull();
    expect(lerDuracao("abc")).toBeNull();
    expect(lerDuracao("999")).toBeNull();
  });
  it("escreve por extenso curto", () => {
    expect(textoDuracao(20)).toBe("20 min");
    expect(textoDuracao(60)).toBe("1 h");
    expect(textoDuracao(90)).toBe("1 h 30 min");
    expect(textoIntervalo(9 * 60, 45)).toBe("09:00 às 09:45");
  });
});

describe("períodos da agenda", () => {
  const slots = ["09:00", "09:20", "09:40", "10:00"].map((time) => ({ time, state: "aberto" }));
  it("pega o período que contém o minuto escolhido", () => {
    expect(periodoDoInicio(9 * 60 + 25, slots)).toEqual({ time: "09:20", ajustado: true });
    expect(periodoDoInicio(9 * 60 + 40, slots)).toEqual({ time: "09:40", ajustado: false });
  });
  it("antes do primeiro período usa o primeiro e avisa; sem períodos devolve null", () => {
    expect(periodoDoInicio(8 * 60, slots)).toEqual({ time: "09:00", ajustado: true });
    expect(periodoDoInicio(8 * 60, [])).toBeNull();
  });
  it("trecho livre não acusa nada; ocupado, bloqueado e inexistente são apontados", () => {
    expect(primeiroPeriodoIndisponivel("09:00", 40, 20, slots)).toBeNull();
    const comOcupado = slots.map((s) => (s.time === "09:20" ? { ...s, state: "ocupado" } : s));
    expect(primeiroPeriodoIndisponivel("09:00", 40, 20, comOcupado)).toEqual({ time: "09:20", state: "ocupado", reason: null });
    expect(primeiroPeriodoIndisponivel("10:00", 40, 20, slots)).toEqual({ time: "10:20", state: "inexistente", reason: null });
    const bloq = slots.map((s) => (s.time === "09:40" ? { ...s, state: "bloqueado", reason: "antecedencia" } : s));
    expect(explicarPeriodo(primeiroPeriodoIndisponivel("09:40", 20, 20, bloq)!)).toContain("antecedência");
  });
  it("cada motivo de bloqueio tem texto próprio, com a regra da agenda quando existe", () => {
    const regras = { minLeadHours: 24, triggerPercent: 60 };
    expect(explicarPeriodo({ time: "09:20", state: "bloqueado", reason: "passado" }, regras)).toContain("já passou");
    expect(explicarPeriodo({ time: "09:20", state: "bloqueado", reason: "antecedencia" }, regras)).toContain("24 horas");
    expect(explicarPeriodo({ time: "14:00", state: "bloqueado", reason: "compromisso" }, regras)).toContain("outro compromisso");
    expect(explicarPeriodo({ time: "14:00", state: "bloqueado", reason: "cadeia" }, regras)).toContain("em cadeia");
    expect(explicarPeriodo({ time: "14:00", state: "bloqueado", reason: "integracao" }, regras)).toContain("Google Agenda");
    expect(explicarPeriodo({ time: "09:00", state: "ocupado", reason: null }, regras)).toContain("consulta marcada");
    expect(rotuloSituacao("bloqueado", "passado")).toBe(" — já passou");
    expect(rotuloSituacao("bloqueado", "antecedencia")).toBe(" — antecedência mínima");
    expect(rotuloSituacao("aberto", null)).toBe("");
  });
  it("motivo do dia inteiro em português", () => {
    expect(explicarDia("sem-expediente")).toContain("janela de atendimento");
    expect(explicarDia("excecao")).toContain("feriado");
    expect(explicarDia("sincronizacao-pendente")).toContain("5 minutos");
    expect(explicarDia(null)).toBeNull();
  });
  it("agrupa bloqueios por motivo e diz qual bloco segura a cadeia", () => {
    const regras = { minLeadHours: 24, triggerPercent: 60 };
    const blocos = [
      { startTime: "09:00", endTime: "11:00", released: true, total: 6, occupied: 1, occupancy: 17 },
      { startTime: "11:00", endTime: "13:00", released: false, total: 6, occupied: 0, occupancy: 0 },
      { startTime: "14:00", endTime: "16:00", released: false, total: 6, occupied: 0, occupancy: 0 },
    ];
    const lista = [
      { time: "09:00", state: "ocupado", reason: null, subBlockIndex: 0 },
      { time: "09:20", state: "bloqueado", reason: "passado", subBlockIndex: 0 },
      { time: "11:00", state: "bloqueado", reason: "cadeia", subBlockIndex: 1 },
      { time: "14:00", state: "bloqueado", reason: "cadeia", subBlockIndex: 2 },
      { time: "15:00", state: "aberto", reason: null, subBlockIndex: 2 },
    ];
    const g = agruparBloqueios(lista, blocos, regras);
    expect(g.map((x) => x.chave)).toEqual(["ocupado", "passado", "cadeia"]);
    expect(g[2]!.horarios).toEqual(["11:00", "14:00"]);
    expect(g[2]!.explicacoes[0]).toContain("só abre quando o bloco 09:00–11:00 chegar a 60%");
    expect(g[2]!.explicacoes[0]).toContain("hoje está em 17%");
    expect(g[2]!.explicacoes).toHaveLength(2);
    expect(agruparBloqueios([{ time: "10:00", state: "aberto", reason: null }], [], regras)).toEqual([]);
  });
  it("duração que ultrapassa o último período exige o período seguinte", () => {
    expect(primeiroPeriodoIndisponivel("09:00", 21, 20, slots)).toBeNull();
    expect(primeiroPeriodoIndisponivel("10:00", 21, 20, slots)?.state).toBe("inexistente");
  });
});

describe("resposta do servidor", () => {
  it("evento criado é ok; sem evento ou com aviso é aviso explícito", () => {
    expect(lerRespostaDeSucesso({ googleEventId: "abc" }, true)).toEqual({ tipo: "ok" });
    expect(lerRespostaDeSucesso({ googleEventId: null, googleSyncWarning: "Marcação salva, mas o Google…" }, true))
      .toEqual({ tipo: "google-aviso", aviso: "Marcação salva, mas o Google…" });
    expect(lerRespostaDeSucesso({ googleEventId: null }, true).tipo).toBe("google-aviso");
    expect(lerRespostaDeSucesso({ googleEventId: null }, false)).toEqual({ tipo: "ok" });
  });
  it("4xx com mensagem é recusa clara; sem status ou 5xx é incerto", () => {
    expect(lerFalha({ status: 409, data: { error: "Horário já ocupado" } })).toEqual({ tipo: "recusada", status: 409, mensagem: "Horário já ocupado" });
    expect(lerFalha({ status: 404, data: null })).toMatchObject({ tipo: "recusada", mensagem: expect.stringContaining("não encontrado") });
    expect(lerFalha(new TypeError("Failed to fetch")).tipo).toBe("incerto");
    expect(lerFalha({ status: 502, data: { error: "x" } }).tipo).toBe("incerto");
    expect(lerFalha({ status: 500 }).tipo).toBe("incerto");
  });
  it("conferência do resultado incerto exige mesma agenda, cliente, dia, horário e ausência de protocolo", () => {
    const alvo = { clientId: 7, resourceId: 3, date: "2026-11-12", time: "09:00" };
    const s = { clientId: 7, resourceId: 3, scheduledDate: "2026-11-12", scheduledTime: "09:00", protocolId: null, status: "scheduled" };
    expect(jaMarcada([s], alvo)).toBe(true);
    expect(jaMarcada([{ ...s, scheduledTime: "09:00:00" }], alvo)).toBe(true);
    expect(jaMarcada([{ ...s, resourceId: 4 }], alvo)).toBe(false);
    expect(jaMarcada([{ ...s, protocolId: 9 }], alvo)).toBe(false);
    expect(jaMarcada([{ ...s, status: "cancelled" }], alvo)).toBe(false);
  });
});

describe("cadastro da agenda em campos separados", () => {
  const base = { id: 1, name: "AGENDA SEDE", kind: "medico", modality: "local", slotMinutes: 20 };
  it("só médico e enfermagem ativos são reserváveis", () => {
    expect(agendaReservavel(base)).toBe(true);
    expect(agendaReservavel({ kind: "sala" })).toBe(false);
    expect(agendaReservavel({ kind: "medico", active: false })).toBe(false);
  });
  it("profissional, modalidade e local nunca se misturam nem são inventados", () => {
    expect(rotuloProfissional({ ...base, professionalName: "Dra. Teste" })).toBe("Dra. Teste");
    expect(rotuloProfissional(base)).toContain("compartilhada");
    expect(rotuloModalidade("domiciliar")).toContain("Domiciliar");
    expect(rotuloModalidade("xpto")).toBe("A confirmar");
    expect(rotuloLocal({ ...base, locationName: "Sede Centro" })).toBe("Sede Centro");
    expect(rotuloLocal(base)).toBe("A definir");
    expect(rotuloLocal({ ...base, modality: "online", locationName: "Sede Centro" })).toContain("online");
    expect(rotuloLocal({ ...base, modality: "externo", externalAddressText: "Rua X, 10" })).toBe("Rua X, 10");
  });
});
