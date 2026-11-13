import { describe, expect, it } from "vitest";
import {
  agendamentosPorExtenso, alternarAgenda, alternarGrupo, CATEGORIA_SO_GOOGLE, numeroPorExtenso, chaveDoCompromisso, montarGrupos, ocultarTodas, quantasOcultas,
  soEstaAgenda, todasAsChaves,
} from "./filtro-agendas";

const grupos = () => montarGrupos({
  agendas: [
    { id: 22, name: "MEDICO - CAIO - SEDE", modality: "local", categoryName: "Medicina", color: "#3f8fd2" },
    { id: 24, name: "MEDICO - CAIO - ON LINE", modality: "online", categoryName: "Medicina" },
    { id: 29, name: "MEDICO - CAIO - HOME CARE", modality: "home_care", categoryName: "Medicina" },
    { id: 23, name: "ENFERMAGEM - SEDE", modality: "local", categoryName: "Enfermagem" },
    { id: 99, name: "INATIVA", active: false, categoryName: "Medicina" },
  ],
  sessoes: [{ resourceId: 22 }, { resourceId: 22 }, { resourceId: 23 }, { resourceId: null, agendaNome: null }],
  calendarios: [{ id: 35, agendaRecursoId: 22, nome: "SEDE", cor: "#000" }, { id: 30, agendaRecursoId: null, nome: "AGENDA GERAL", cor: "#ccc" }],
  compromissos: [{ agendaId: 35, agendaRecursoId: 22 }, { agendaId: 30, agendaRecursoId: null }, { agendaId: 30, agendaRecursoId: null }],
});

describe("montarGrupos", () => {
  it("agrupa por categoria e mostra TODA agenda ativa, mesmo sem nada no período (Home Care e On line incluídas)", () => {
    const g = grupos();
    expect(g.map((x) => x.categoria)).toEqual(["Enfermagem", "Medicina", "Sem categoria", CATEGORIA_SO_GOOGLE]);
    const medicina = g.find((x) => x.categoria === "Medicina")!;
    expect(medicina.agendas.map((a) => a.chave).sort()).toEqual(["r22", "r24", "r29"]);
    expect(medicina.agendas.find((a) => a.chave === "r29")).toMatchObject({ sessoes: 0, google: 0, forma: "home_care" });
    expect(todasAsChaves(g)).not.toContain("r99");
  });
  it("sessão e compromisso do Google da MESMA agenda compartilham a chave (um filtro vale para os dois)", () => {
    const sede = grupos().flatMap((x) => x.agendas).find((a) => a.chave === "r22")!;
    expect(sede).toMatchObject({ sessoes: 2, google: 1, somenteGoogle: false });
    expect(chaveDoCompromisso({ agendaId: 35, agendaRecursoId: 22 })).toBe("r22");
  });
  it("calendário só do Google fica à parte, sessão sem agenda não some", () => {
    const todas = grupos().flatMap((x) => x.agendas);
    expect(todas.find((a) => a.chave === "g30")).toMatchObject({ somenteGoogle: true, google: 2, categoria: CATEGORIA_SO_GOOGLE });
    expect(todas.find((a) => a.chave === "r-sem")).toMatchObject({ sessoes: 1, nome: "Sem agenda ligada" });
  });
});

describe("filtros", () => {
  const todas = ["r22", "r24", "r29", "r23", "g30"];
  it("só esta oculta as outras; clicar de novo devolve todas", () => {
    const a = soEstaAgenda(new Set(), "r24", todas);
    expect([...a].sort()).toEqual(["g30", "r22", "r23", "r29"]);
    expect(soEstaAgenda(a, "r24", todas).size).toBe(0);
  });
  it("só esta, partindo de outra seleção, passa a mostrar apenas a escolhida", () => {
    const a = soEstaAgenda(new Set(["r24"]), "r24", todas);
    expect(a.has("r24")).toBe(false);
    expect(a.size).toBe(4);
  });
  it("multisseleção livre e grupo inteiro", () => {
    let o = alternarAgenda(new Set(), "r22");
    o = alternarAgenda(o, "r24");
    expect(quantasOcultas(o, todas)).toBe(2);
    o = alternarAgenda(o, "r22");
    expect(o.has("r22")).toBe(false);
    const g = alternarGrupo(new Set(), ["r22", "r24", "r29"]);
    expect(quantasOcultas(g, todas)).toBe(3);
    expect(alternarGrupo(g, ["r22", "r24", "r29"]).size).toBe(0);
    expect(alternarGrupo(new Set(["r22"]), ["r22", "r24"]).size).toBe(0); // grupo parcial: mostra todo o grupo
  });
  it("ocultar todas e contar ignora chaves desconhecidas", () => {
    expect(quantasOcultas(ocultarTodas(todas), todas)).toBe(5);
    expect(quantasOcultas(new Set(["x1"]), todas)).toBe(0);
  });
});

describe("por extenso", () => {
  it("escreve números em português", () => {
    expect(numeroPorExtenso(0)).toBe("zero");
    expect(numeroPorExtenso(5)).toBe("cinco");
    expect(numeroPorExtenso(21)).toBe("vinte e um");
    expect(numeroPorExtenso(100)).toBe("cem");
    expect(numeroPorExtenso(115)).toBe("cento e quinze");
    expect(numeroPorExtenso(342)).toBe("trezentos e quarenta e dois");
    expect(numeroPorExtenso(1200)).toBe("1200");
  });
  it("concorda o plural e trata zero", () => {
    expect(agendamentosPorExtenso(0)).toBe("Nenhum agendamento");
    expect(agendamentosPorExtenso(1)).toBe("Um agendamento");
    expect(agendamentosPorExtenso(5)).toBe("Cinco agendamentos");
    expect(agendamentosPorExtenso(3, ["compromisso do Google", "compromissos do Google"])).toBe("Três compromissos do Google");
  });
});
