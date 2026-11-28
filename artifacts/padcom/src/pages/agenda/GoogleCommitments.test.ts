import { describe, expect, it } from "vitest";
import type { GoogleAgendaCommitment } from "@workspace/api-client-react";
import {
  SELECAO_TODAS, SELECAO_NENHUMA, countSelected, filterCommitments,
  onlyAgenda, resolveViewState, toggleAgenda,
} from "./GoogleCommitments";

const events: GoogleAgendaCommitment[] = [
  { id: "a", titulo: "Consulta", inicio: "2026-11-08T13:00:00Z", fim: "2026-11-08T14:00:00Z",
    data: "2026-11-08", horario: "10:00", diaInteiro: false, agenda: "Mesmo nome", agendaId: 1, cor: "#123456", recorrente: false },
  { id: "b", titulo: "Retorno", inicio: "2026-11-08T14:00:00Z", fim: "2026-11-08T15:00:00Z",
    data: "2026-11-08", horario: "11:00", diaInteiro: false, agenda: "Mesmo nome", agendaId: 2, cor: "#123456", recorrente: false },
];

describe("seleção de agendas", () => {
  it("distingue agendas de mesmo nome pelo identificador", () => {
    expect(filterCommitments(events, onlyAgenda(2), "").map((e) => e.id)).toEqual(["b"]);
  });
  it("combina várias agendas, seleção vazia e busca", () => {
    const first = toggleAgenda(SELECAO_NENHUMA, 1, [1, 2, 3]);
    const both = toggleAgenda(first, 2, [1, 2, 3]);
    expect(filterCommitments(events, both, "").length).toBe(2);
    expect(filterCommitments(events, both, "retorno").map((e) => e.id)).toEqual(["b"]);
    expect(filterCommitments(events, SELECAO_NENHUMA, "")).toEqual([]);
  });
  it("o modo todas inclui agenda nova e permite retirar apenas uma", () => {
    expect(countSelected(SELECAO_TODAS, [1, 2, 3])).toBe(3);
    expect(filterCommitments(events, toggleAgenda(SELECAO_TODAS, 1, [1, 2, 3]), "").map((e) => e.id)).toEqual(["b"]);
  });
  it("distingue carregamento, erro, falta de cadastro e filtro vazio", () => {
    const base = { pending: false, error: false, agendas: 1, selected: 1, results: 0 };
    expect(resolveViewState({ ...base, pending: true })).toBe("carregando");
    expect(resolveViewState({ ...base, error: true })).toBe("erro");
    expect(resolveViewState({ ...base, agendas: 0 })).toBe("sem-cadastro");
    expect(resolveViewState({ ...base, selected: 0 })).toBe("nenhum-selecionado");
    expect(resolveViewState(base)).toBe("sem-resultado");
  });
});
