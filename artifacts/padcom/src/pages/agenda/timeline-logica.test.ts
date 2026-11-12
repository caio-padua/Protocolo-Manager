import { describe, expect, it } from "vitest";
import {
  agoraEmBrasilia, colunarSobrepostos, corSegura, estadoDaAplicacao, faixaDeHoras, faixaDoGoogle,
  fimDesenhado, lerParametrosAgenda, minutosDoHorario, proximidade, textoFaltam,
} from "./timeline-logica";

describe("minutosDoHorario", () => {
  it("lê HH:MM e HH:MM:SS e recusa texto inválido", () => {
    expect(minutosDoHorario("09:30")).toBe(570);
    expect(minutosDoHorario("09:30:00")).toBe(570);
    expect(minutosDoHorario("24:00")).toBeNull();
    expect(minutosDoHorario("Dia inteiro")).toBeNull();
    expect(minutosDoHorario(null)).toBeNull();
  });
});

describe("colunarSobrepostos", () => {
  it("compromissos separados no tempo ficam em coluna única", () => {
    const r = colunarSobrepostos([{ ini: 60, fim: 120 }, { ini: 120, fim: 180 }]);
    expect(r.map((x) => [x.col, x.cols])).toEqual([[0, 1], [0, 1]]);
  });
  it("dois que se sobrepõem dividem a largura; o terceiro, solto, volta a uma coluna", () => {
    const r = colunarSobrepostos([{ ini: 60, fim: 120 }, { ini: 90, fim: 150 }, { ini: 300, fim: 330 }]);
    expect(r.map((x) => [x.col, x.cols])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });
  it("reaproveita a coluna livre dentro do mesmo grupo", () => {
    const r = colunarSobrepostos([{ ini: 0, fim: 100 }, { ini: 10, fim: 50 }, { ini: 60, fim: 90 }]);
    expect(r.map((x) => x.col)).toEqual([0, 1, 1]);
    expect(r.every((x) => x.cols === 2)).toBe(true);
  });
});

describe("faixaDeHoras", () => {
  it("padrão 7h–20h e amplia só quando precisa", () => {
    expect(faixaDeHoras([])).toEqual({ inicio: 7, fim: 20 });
    expect(faixaDeHoras([{ ini: 9 * 60, fim: 10 * 60 }])).toEqual({ inicio: 7, fim: 20 });
    expect(faixaDeHoras([{ ini: 6 * 60 + 30, fim: 7 * 60 }, { ini: 21 * 60, fim: 21 * 60 + 15 }])).toEqual({ inicio: 6, fim: 22 });
  });
});

describe("proximidade", () => {
  const base = { ehHoje: true, ini: 600, fim: 630, status: "scheduled" };
  it("avisa nos 30 minutos antes, não antes disso", () => {
    expect(proximidade({ ...base, agora: 570 })).toBe("proxima");
    expect(proximidade({ ...base, agora: 600 })).toBe("proxima");
    expect(proximidade({ ...base, agora: 569 })).toBe("futura");
  });
  it("em andamento enquanto durar e passada depois", () => {
    expect(proximidade({ ...base, agora: 615 })).toBe("andamento");
    expect(proximidade({ ...base, agora: 630 })).toBe("passada");
  });
  it("concluído, faltou e cancelado nunca chamam atenção; outro dia nunca pisca", () => {
    for (const status of ["completed", "missed", "cancelled"]) expect(proximidade({ ...base, status, agora: 590 })).toBe("encerrada");
    expect(proximidade({ ...base, ehHoje: false, agora: 600 })).toBe("futura");
  });
});

describe("textoFaltam e relógio de Brasília", () => {
  it("escreve o tempo que falta por extenso curto", () => {
    expect(textoFaltam(0)).toBe("agora");
    expect(textoFaltam(12)).toBe("em 12 min");
    expect(textoFaltam(65)).toBe("em 1h05");
  });
  it("usa Brasília mesmo que o navegador esteja em outro fuso", () => {
    expect(agoraEmBrasilia(new Date("2026-11-12T02:30:00Z"))).toEqual({ data: "2026-11-11", minutos: 23 * 60 + 30 });
    expect(agoraEmBrasilia(new Date("2026-11-12T15:05:00Z"))).toEqual({ data: "2026-11-12", minutos: 12 * 60 + 5 });
  });
});

describe("Google, estados e cores", () => {
  it("compromisso do Google: início em Brasília e duração por início/fim; dia inteiro fica fora", () => {
    const e = { diaInteiro: false, horario: "10:00", inicio: "2026-11-12T13:00:00.000Z", fim: "2026-11-12T14:30:00.000Z" };
    expect(faixaDoGoogle(e)).toEqual({ ini: 600, fim: 690 });
    expect(faixaDoGoogle({ ...e, diaInteiro: true })).toBeNull();
    expect(faixaDoGoogle({ ...e, fim: e.inicio })).toBeNull();
  });
  it("estado desconhecido vira Conferir (nunca esconde); cor inválida cai no cinza neutro", () => {
    expect(estadoDaAplicacao("applied")).toBe("applied");
    expect(estadoDaAplicacao(undefined)).toBe("review");
    expect(estadoDaAplicacao("xpto")).toBe("review");
    expect(corSegura("#7cb342")).toBe("#7cb342");
    expect(corSegura("url(x)")).toBe("#64748b");
    expect(corSegura(null)).toBe("#64748b");
  });
  it("duração mínima de desenho", () => {
    expect(fimDesenhado(600, 605)).toBe(625);
    expect(fimDesenhado(600, 700)).toBe(700);
  });
});

describe("lerParametrosAgenda", () => {
  it("aceita data e modo válidos, com ou sem interrogação", () => {
    const r = lerParametrosAgenda("?data=2026-11-12&modo=dia");
    expect(r.modo).toBe("dia");
    expect(r.data?.getFullYear()).toBe(2026);
    expect(r.data?.getMonth()).toBe(10);
    expect(r.data?.getDate()).toBe(12);
    expect(lerParametrosAgenda("data=2026-11-12&modo=mes").modo).toBe("mes");
    expect(lerParametrosAgenda("visao=lista").visao).toBe("lista");
    expect(lerParametrosAgenda("visao=grade").visao).toBeNull();
  });
  it("ignora data inexistente e modo desconhecido, sem adivinhar", () => {
    expect(lerParametrosAgenda("data=2026-02-31&modo=ano")).toEqual({ data: null, modo: null, visao: null });
    expect(lerParametrosAgenda("")).toEqual({ data: null, modo: null, visao: null });
    expect(lerParametrosAgenda("data=12/11/2026").data).toBeNull();
  });
});
