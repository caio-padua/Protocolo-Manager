/**
 * Fuso de Brasília (UTC-3, sem horário de verão desde 2019) e janelas de adesão 7/15/30.
 * Funções puras, dados sintéticos; nenhum banco, serviço ou mensagem.
 * Fusos NÃO suportados: o sistema usa SÓ America/Sao_Paulo; não há fuso por cliente.
 */
import { describe, it, expect } from "vitest";
import { brtISODate } from "../lib/brt";
import { montarAdesao } from "../lib/cliente-medicacao-adesao";

describe("meia-noite de Brasília", () => {
  it("02:59:59Z ainda é o dia anterior; 03:00:00Z já é o dia novo", () => {
    expect(brtISODate(new Date("2026-11-27T02:59:59Z"))).toBe("2026-11-26");
    expect(brtISODate(new Date("2026-11-27T03:00:00Z"))).toBe("2026-11-27");
  });
  it("virada de mês e de ano usam o calendário de Brasília", () => {
    expect(brtISODate(new Date("2026-12-01T02:59:59Z"))).toBe("2026-11-30");
    expect(brtISODate(new Date("2027-01-01T03:00:00Z"))).toBe("2027-01-01");
    expect(brtISODate(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });
  it("29/02 de ano bissexto", () => {
    expect(brtISODate(new Date("2028-02-29T12:00:00Z"))).toBe("2028-02-29");
  });
  it("o fuso do servidor não muda o resultado", () => {
    const antes = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    try { expect(brtISODate(new Date("2026-11-27T02:59:59Z"))).toBe("2026-11-26"); } finally { process.env.TZ = antes; }
  });
});

const H = [{ origem: "propria" as const, nomeChave: "vit", sigla: "IM" }];
const dia = (d: string) => new Map([[d, [{ origem: "propria" as const, nomeChave: "vit", sigla: "IM" }]]]);

describe("janelas 7, 15 e 30 dias", () => {
  const hoje = "2026-11-27";
  const diasSeq = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 27 - i)).toISOString().slice(0, 10));

  it("sem histórico: percentual nulo (nunca zero) e dias sem histórico contados", () => {
    const r = montarAdesao(hoje, H, [], new Map()).propria;
    for (const j of r.janelas) { expect(j.percentual).toBeNull(); expect(j.esperado).toBe(0); expect(j.diasSemHistorico).toBe(j.dias); }
    expect(r.janelas.map((j) => j.dias)).toEqual([7, 15, 30]);
  });

  it("sem resposta: dia esperado sem marcação conta como sem registro, não como esquecido", () => {
    const r = montarAdesao(hoje, H, [], dia(hoje)).propria;
    expect(r.janelas[0]).toMatchObject({ esperado: 1, tomei: 0, esqueci: 0, semRegistro: 1, percentual: 0 });
  });

  it("histórico parcial: cada janela só mede os dias que existem", () => {
    const agenda = new Map(diasSeq(10).map((d) => [d, [{ origem: "propria" as const, nomeChave: "vit", sigla: "IM" }]]));
    const tomadas = diasSeq(10).slice(0, 5).map((d) => ({ origem: "propria" as const, nomeChave: "vit", sigla: "IM", data: d, status: "tomei" as const }));
    const [j7, j15, j30] = montarAdesao(hoje, H, tomadas, agenda).propria.janelas;
    expect(j7).toMatchObject({ esperado: 7, tomei: 5, diasComHistorico: 7 });
    expect(j15).toMatchObject({ esperado: 10, tomei: 5, diasComHistorico: 10, diasSemHistorico: 5 });
    expect(j30).toMatchObject({ esperado: 10, diasSemHistorico: 20 });
  });

  it("pausa: dia suspenso não entra no esperado nem derruba a adesão; retomada volta a contar", () => {
    const [d0, d1, d2] = diasSeq(3);
    const agenda = new Map([
      [d2, [{ origem: "propria" as const, nomeChave: "vit", sigla: "IM", situacao: "ativo" as const }]],
      [d1, [{ origem: "propria" as const, nomeChave: "vit", sigla: "IM", situacao: "suspenso" as const }]],
      [d0, [{ origem: "propria" as const, nomeChave: "vit", sigla: "IM", situacao: "ativo" as const }]],
    ]);
    const tomadas = [d2, d0].map((d) => ({ origem: "propria" as const, nomeChave: "vit", sigla: "IM", data: d, status: "tomei" as const }));
    const j7 = montarAdesao(hoje, H, tomadas, agenda).propria.janelas[0];
    expect(j7).toMatchObject({ esperado: 2, tomei: 2, suspenso: 1, diasSuspensos: 1, percentual: 100 });
  });

  it("tomada gravada em dia sem esse horário na agenda não infla a adesão", () => {
    const tomadas = [{ origem: "propria" as const, nomeChave: "outro", sigla: "IM", data: hoje, status: "tomei" as const }];
    const j7 = montarAdesao(hoje, H, tomadas, dia(hoje)).propria.janelas[0];
    expect(j7.tomei).toBe(0);
  });
});
