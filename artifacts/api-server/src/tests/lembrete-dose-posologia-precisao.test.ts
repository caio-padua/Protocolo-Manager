/**
 * Precisão do lembrete: dose das substâncias, posologia, alinhamento e trava de dúvida.
 * Regra: o que não for lido com certeza NÃO vira dose na mensagem e bloqueia o envio.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rows: [] as any[], claims: new Set<number>(), updates: [] as any[],
  tg: vi.fn(), wa: vi.fn(), log: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  clientsTable: {}, lembretesPrescricaoTable: {}, lembreteEnviosTable: {},
  db: {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: async () => m.rows }) }) }),
    insert: () => ({ values: (v: any) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if (m.claims.has(v.lembreteId)) return [];
      m.claims.add(v.lembreteId); return [{ id: v.lembreteId }];
    } }) }) }),
    update: () => ({ set: (v: any) => ({ where: async () => { m.updates.push(v); } }) }),
  },
}));
vi.mock("../lib/secure-settings", () => ({ getSetting: async () => null }));
vi.mock("../lib/telegram", () => ({ sendTelegram: (...a: unknown[]) => m.tg(...a) }));
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: (...a: unknown[]) => m.wa(...a), registrarLogMensagem: (...a: unknown[]) => m.log(...a) }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { interpretarSubstancia, colarUnidades, limparTextoMensagem } from "../lib/dose-substancia";
import { linhaPosologia, momentoDaPosologia, periodoDaPosologia, quantidadeDaPosologia } from "../lib/posologia-lembrete";
import { blocoPrescricaoPeriodos, linhasSubstancias, linhasPosologia } from "../lib/lembrete-templates";
import { formatarParaTelegram } from "../lib/lembrete-telegram";
import { executarLembretesPeriodo } from "../lib/lembrete-periodo";

describe("dose da substância: convenção brasileira, número colado na unidade", () => {
  const ok: [string, string, string][] = [
    ["MAGNESIO 200 MG", "MAGNESIO", "200mg"],
    ["SELENIO 100 MCG", "SELENIO", "100mcg"],
    ["GLUTAMINA 5 G", "GLUTAMINA", "5g"],
    ["METILCOBALAMINA 5.000 MCG", "METILCOBALAMINA", "5.000mcg"], // cinco mil, nunca "5,000"
    ["VITAMINA D3 10.000 UI", "VITAMINA D3", "10.000ui"],
    ["MAGNESIO 1.500 MG", "MAGNESIO", "1.500mg"],
    ["VITAMINA D 2.000UI", "VITAMINA D", "2.000ui"],
    ["VITAMINA C 1000 MG", "VITAMINA C", "1.000mg"],
    ["IODO 0,5 MG", "IODO", "0,5mg"],
    ["MELATONINA 0.21 MG", "MELATONINA", "0,21mg"],
    ["MELATONINA 0.500 MG", "MELATONINA", "0,500mg"], // zero a esquerda = decimal, não milhar
    ["TIROXINA 0,05MG", "TIROXINA", "0,05mg"],
    ["VIT B12 1000 µG", "VIT B12", "1.000mcg"],
    ["VIT B12 1000 μg", "VIT B12", "1.000mcg"],
    ["VIT B12 500 UG", "VIT B12", "500mcg"],
    ["VITAMINA A 5000 IU", "VITAMINA A", "5.000ui"],
    ["SELENIO 100 MCG/ML", "SELENIO", "100mcg/ml"],
    ["COENZIMA Q10 100 MG", "COENZIMA Q10", "100mg"],
    ["OMEGA 3 1 G", "OMEGA 3", "1g"],
    ["CURCUMINA 95% 500 MG", "CURCUMINA 95%", "500mg"],
    ["L-CARNITINA 500 MG", "L-CARNITINA", "500mg"],
    ["ACIDO ALFA-LIPOICO 300 MG", "ACIDO ALFA-LIPOICO", "300mg"],
    ["NAC (N-ACETILCISTEINA) 600 MG", "NAC (N-ACETILCISTEINA)", "600mg"],
    ["ZINCO QUELADO $ 15 MG", "ZINCO QUELADO $", "15mg"],
    ["ZINCO - 15 MG", "ZINCO", "15mg"],
    ["COLINA 250 mg*", "COLINA *", "250mg"],
    ["MAGNESIO 1.500,5 MG", "MAGNESIO", "1.500,5mg"],
    ["CREATINA 5.000 MG", "CREATINA", "5.000mg"],
  ];
  it.each(ok)("%s", (raw, nome, dose) => {
    const r = interpretarSubstancia(raw);
    expect(r.alerta).toBeUndefined();
    expect(r.nomeBruto).toBe(nome);
    expect(r.dose).toBe(dose);
    expect(r.dose).not.toMatch(/\s/); // nunca espaço entre número e unidade
  });

  const duvida: [string, RegExp][] = [
    ["VITAMINA C 1 000 MG", /numero solto/],
    ["OMEGA 3 500 MG", /numero solto/],
    ["DHEA 25 MG + PREGNENOLONA 10 MG", /mais de uma dose/],
    ["ZINCO 15 MG E MAGNESIO 200 MG", /mais de uma dose/],
    ["ZINCO 15-30 MG", /faixa/],
    ["ZINCO 15 A 30 MG", /faixa/],
    ["CREATINA 5.000 G", /milhar ou decimal/],
    ["CREATINA 1.500 G", /milhar ou decimal/],
    ["MAGNESIO 2,500 MG", /decimal \(virgula\) ou milhar/],
    ["MAGNESIO 1,500.5 MG", /ambiguo/],
    ["MAGNESIO 1.5.5 MG", /ambiguo/],
    ["MAGNESIO 007 MG", /zero a esquerda/],
    ["MAGNESIO 000 MG", /zero a esquerda/],
    ["MAGNESIO 0 MG", /zero/],
    ["PROBIOTICO 10 CFU", /nao reconhecida/],
    ["PROBIOTICO 10 BILHOES", /nao reconhecida/],
    ["500 MG", /sem nome/],
  ];
  it.each(duvida)("dúvida: %s", (raw, motivo) => {
    const r = interpretarSubstancia(raw);
    expect(r.alerta).toBeDefined();
    expect(r.alerta).toMatch(motivo);
    expect(r.dose).toBeUndefined(); // dúvida nunca devolve dose
  });

  it("substância sem dose no catálogo não inventa dose nem alerta", () => {
    expect(interpretarSubstancia("COLINA")).toEqual({ nomeBruto: "COLINA" });
  });

  it("dose longa demais para a coluna vira dúvida", () => {
    expect(interpretarSubstancia("X 1.000.000.000 MCG").alerta).toMatch(/longa|milhar/);
  });

  it("texto livre: cola unidade ao número sem mexer no número", () => {
    expect(colarUnidades("Tomar 500 mg e 2 g, 10.000 UI")).toBe("Tomar 500mg e 2g, 10.000ui");
    expect(colarUnidades("Dose 5 gotas")).toBe("Dose 5 gotas"); // "gotas" não é unidade
  });

  it("remove só os caracteres de formatação da mensageria", () => {
    expect(limparTextoMensagem("A*B_C~D`E 5% + 3 - 2 $ & < > / ( )")).toBe("ABCDE 5% + 3 - 2 $ & < > / ( )");
  });
});

describe("posologia: quantidade, via, momento e período", () => {
  const casos: [string, string, string][] = [
    ["UMA DOSE NO ALMOCO", "ORAL", "1 dose, via oral, no almoco"],
    ["UMA DOSE NO JANTAR", "ORAL", "1 dose, via oral, no jantar"],
    ["UMA DOSE ANTES DO JANTAR", "ORAL", "1 dose, via oral, antes do jantar"],
    ["UMA DOSE ANTES DO CAFE DA MANHA", "ORAL", "1 dose, via oral, antes do cafe da manha"],
    ["UMA DOSE APOS O ALMOCO", "ORAL", "1 dose, via oral, apos o almoco"],
    ["UMA DOSE DEPOIS DO JANTAR", "ORAL", "1 dose, via oral, apos o jantar"],
    ["UMA DOSE PELA MANHA", "ORAL", "1 dose, via oral, pela manha"],
    ["UMA DOSE ANTES DO TREINO", "ORAL", "1 dose, via oral, antes do treino"],
    ["UMA DOSE 30 MINUTOS ANTES DO TREINO", "ORAL", "1 dose, via oral, 30 minutos antes do treino"],
    ["UMA DOSE 1 HORA ANTES DO ALMOCO", "ORAL", "1 dose, via oral, 1 hora antes do almoco"],
    ["UMA DOSE AO DIA ANTES DO CAFE DA MANHA", "ORAL", "1 dose, via oral, antes do cafe da manha"],
    ["DUAS DOSES NO JANTAR", "ORAL", "2 doses, via oral, no jantar"],
    ["2 DOSES NO ALMOCO", "ORAL", "2 doses, via oral, no almoco"],
    ["TOMAR DUAS DOSES NO JANTAR", "ORAL", "2 doses, via oral, no jantar"],
    ["MEIA DOSE NO ALMOCO", "ORAL", "0,5 dose, via oral, no almoco"],
    ["1,5 DOSE NO JANTAR", "ORAL", "1,5 doses, via oral, no jantar"],
    ["UMA DOSE EM JEJUM", "ORAL", "1 dose, via oral, em jejum"],
    ["UMA DOSE AO ACORDAR", "ORAL", "1 dose, via oral, ao acordar"],
    ["UMA DOSE ANTES DE DORMIR", "ORAL", "1 dose, via oral, antes de dormir"],
    ["UMA DOSE COM O ALMOCO", "ORAL", "1 dose, via oral, com o almoco"],
    ["UMA DOSE DURANTE A CEIA", "ORAL", "1 dose, via oral, durante a ceia"],
    ["UMA DOSE NA CEIA", "ORAL", "1 dose, via oral, na ceia"],
    ["UMA DOSE A TARDE", "ORAL", "1 dose, via oral, a tarde"],
    ["UMA DOSE A NOITE", "ORAL", "1 dose, via oral, a noite"],
    ["UMA DOSE AO MEIO-DIA", "ORAL", "1 dose, via oral, ao meio-dia"],
    ["UMA DOSE NO JANTAR", "SUBLINGUAL", "1 dose, via sublingual, no jantar"],
  ];
  it.each(casos)("%s (%s)", (poso, via, esperado) => {
    const r = linhaPosologia(poso, via);
    expect(r.alertas).toEqual([]);
    expect(r.linha).toBe(esperado);
  });

  it("nunca assume 1 dose quando a quantidade não foi lida", () => {
    const r = linhaPosologia("NO ALMOCO", "ORAL");
    expect(r.alertas).toContain("quantidade da posologia nao lida");
    expect(r.linha).not.toMatch(/^1 dose/);
  });

  it("tempo não é lido como quantidade", () => {
    expect(quantidadeDaPosologia("30 MINUTOS ANTES DO TREINO UMA DOSE")).toBe(1);
    expect(quantidadeDaPosologia("30 MINUTOS ANTES DO TREINO")).toBeUndefined();
  });

  it.each([
    ["UMA DOSE A CADA 8 HORAS"],
    ["UMA DOSE 2X AO DIA"],
    ["UMA DOSE DUAS VEZES AO DIA"],
    ["UMA DOSE DIAS ALTERNADOS"],
    ["UMA DOSE UMA VEZ POR SEMANA"],
  ])("frequência que a mensagem não representa bloqueia: %s", (poso) => {
    expect(linhaPosologia(poso, "ORAL").alertas.join()).toMatch(/frequencia/);
  });

  it("via informada e não reconhecida bloqueia", () => {
    expect(linhaPosologia("UMA DOSE NO JANTAR", "XYZ").alertas.join()).toMatch(/via/);
  });

  it("antes/após sem refeição reconhecida bloqueia", () => {
    expect(momentoDaPosologia("UMA DOSE ANTES DE SAIR").alertas.join()).toMatch(/relativo/);
  });

  it.each([
    ["UMA DOSE EM JEJUM", "jejum"], ["UMA DOSE AO ACORDAR", "jejum"],
    ["UMA DOSE ANTES DO CAFE DA MANHA", "manha"], ["UMA DOSE PELA MANHA", "manha"],
    ["UMA DOSE NO ALMOCO", "almoco"], ["UMA DOSE A TARDE", "tarde"],
    ["UMA DOSE NO JANTAR", "noite"], ["UMA DOSE 30 MINUTOS ANTES DO TREINO", "noite"],
    ["UMA DOSE NA CEIA", "ceia"], ["UMA DOSE ANTES DE DORMIR", "final_noite"],
  ])("período: %s -> %s", (poso, per) => expect(periodoDaPosologia(poso)).toBe(per));
});

describe("alinhamento em colunas fixas (WhatsApp e Telegram)", () => {
  const casos: { rotulo: string; nome: string; dose?: string }[][] = [
    [{ rotulo: "1/4", nome: "Magnesio", dose: "200mg" }, { rotulo: "2/4", nome: "Zinco", dose: "15mg" }, { rotulo: "3/4", nome: "Selenio", dose: "100mcg" }],
    [{ rotulo: "1/4", nome: "Cha Verde Extrato", dose: "300mg" }, { rotulo: "2/4", nome: "Cafeina", dose: "100mg" }, { rotulo: "3/4", nome: "Carnitina", dose: "500mg" }],
    [{ rotulo: "1/12", nome: "Metilcobalamina", dose: "5.000mcg" }, { rotulo: "2/12", nome: "Colecalciferol", dose: "10.000ui" }, { rotulo: "3/12", nome: "Selenio", dose: "100mcg/ml" }],
    [{ rotulo: "1/3", nome: "Substancia Com Nome Enorme Mesmo", dose: "1.000mg" }, { rotulo: "2/3", nome: "X" }, { rotulo: "3/3", nome: "Zinco", dose: "0,5mg" }],
  ];
  it.each(casos.map((c, i) => [i, c] as const))("bloco %i: todas as linhas com a mesma largura e dose à direita", (_i, subs) => {
    const linhas = linhasSubstancias(subs);
    const larguras = new Set(linhas.map((l) => l.length));
    expect(larguras.size).toBe(1);
    expect([...larguras][0]).toBeLessThanOrEqual(27); // 32 de largura menos a margem de 5
    // nome começa na mesma coluna em todas as linhas
    const colNome = new Set(linhas.map((l, i) => l.indexOf(subs[i].nome.slice(0, 3))));
    expect(colNome.size).toBe(1);
    // dose termina na última coluna
    linhas.forEach((l, i) => { if (subs[i].dose) expect(l.endsWith(subs[i].dose!)).toBe(true); });
  });

  it("nome longo usa todo o espaço até a dose: três pontinhos, UM espaço, dose", () => {
    const l = linhasSubstancias([
      { rotulo: "1/12", nome: "L-carnitina Tartarato", dose: "1.500mg" },
      { rotulo: "2/12", nome: "Coenzima Q10 Ubiquinol", dose: "100mg" },
    ]);
    expect(l[0]).toBe("1/12 L-carnitina... 1.500mg");
    expect(l[1]).toBe("2/12 Coenzima Q10...  100mg"); // corte no espaço: sobra 1 a mais
    expect(l.every((x) => x.length === 27)).toBe(true);
    const cortado = linhasSubstancias([{ rotulo: "1/4", nome: "Substanciaextremamentelonga", dose: "5g" }])[0];
    expect(cortado).toMatch(/\.\.\. 5g$/); // exatamente um espaço entre "..." e a dose
  });

  it("nome que cabe inteiro não é cortado", () => {
    expect(linhasSubstancias([{ rotulo: "3/4", nome: "Cha Verde Extrato", dose: "300mg" }])[0]).toBe("3/4 Cha Verde Extrato 300mg");
  });

  it("posologia em andares de no máximo 27 caracteres, sem perder nenhuma palavra", () => {
    expect(linhasPosologia("1 dose, via oral, antes do jantar")).toEqual(["1 dose, via oral", "antes do jantar"]);
    expect(linhasPosologia("1 dose, via oral")).toEqual(["1 dose, via oral"]);
    expect(linhasPosologia("1 dose, via sublingual, 30 minutos antes do cafe da manha"))
      .toEqual(["1 dose, via sublingual", "30 minutos antes", "do cafe da manha"]);
    for (const t of ["2 doses, via sublingual, 30 minutos antes do cafe da manha", "0,5 dose, via oral, ao meio-dia", "1 hora antes do almoco, via oral, 1,5 doses"]) {
      const l = linhasPosologia(t);
      expect(l.every((x) => x.length <= 27)).toBe(true);
      expect(l.join(" ").split(/,?\s+/)).toEqual(t.split(/,?\s+/));
    }
  });

  it("um único bloco de código por fórmula (sem vão entre substâncias e posologia)", () => {
    const msg = blocoPrescricaoPeriodos([{ sigla: "NO", nome: "Noite", tipo: "tomar", formulas: [{
      nome: "F", substancias: [{ rotulo: "1/1", nome: "Zinco", dose: "15mg" }], horario: "18h00", posologia: "1 dose, via oral, antes do jantar",
    }] }]);
    expect((msg.match(/```/g) ?? []).length).toBe(2);
    expect(msg).toContain("Horario: 18h00\nPosologia:\n1 dose, via oral\nantes do jantar\n```");
  });

  it("layout aprovado pelo CEO se mantém para os casos reais do catálogo", () => {
    expect(linhasSubstancias(casos[0]).join("\n")).toBe(
      "1/4 Magnesio          200mg\n2/4 Zinco              15mg\n3/4 Selenio          100mcg",
    );
  });
});

describe("mensagem renderizada com caracteres difíceis", () => {
  const periodo = {
    sigla: "NO", nome: "Noite", tipo: "tomar" as const,
    formulas: [{
      nome: "Formula *Teste* _x_ ~y~ `z` 5% & <b> $",
      substancias: [
        { rotulo: "1/3", nome: "L-Carnitina + Acetil (A/B) #1", dose: "5.000mcg" },
        { rotulo: "2/3", nome: "Zinco <&>", dose: "0,5mg" },
        { rotulo: "3/3", nome: "Selenio $ % @ !", dose: "100mcg/ml" },
      ],
      horario: "18h00", posologia: "1 dose, via oral, antes do jantar",
      observacaoRefeicao: "Ajustar 500mg se necessario",
    }],
  };
  const msg = blocoPrescricaoPeriodos([periodo]);

  it("WhatsApp: título sem marcas de formatação soltas e doses intactas", () => {
    expect(msg).toContain("5.000mcg");
    expect(msg).toContain("0,5mg");
    expect(msg).toContain("100mcg/ml");
    expect(msg).not.toContain("5,000");
    expect(msg).toContain("*Formula Teste x y z 5% & <b> $*");
  });

  it("blocos de código sempre em número par (nada de crase solta)", () => {
    expect((msg.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it("Telegram: converte para pre, escapa símbolos e mantém as doses", () => {
    const html = formatarParaTelegram(msg, "bloco");
    expect(html).toContain("<pre>");
    expect(html).toContain("5.000mcg");
    expect(formatarParaTelegram(msg)).toContain("<code>"); // padrão discreto: código por linha, sem caixa
    expect(formatarParaTelegram(msg)).not.toContain("<pre>");
    expect(html).toContain("Zinco &lt;&amp;&gt;");
    expect(html).not.toMatch(/<pre>[^]*<b>[^]*<\/pre>/);
    expect(html).not.toContain("```");
    expect((html.match(/<pre>/g) ?? []).length).toBe((html.match(/<\/pre>/g) ?? []).length);
  });
});

describe("trava de dúvida no motor: nada é enviado", () => {
  beforeEach(() => { m.rows = []; m.claims.clear(); m.updates = []; m.tg.mockReset(); m.wa.mockReset(); m.log.mockReset(); });

  const agora = new Date("2026-11-25T21:00:00.000Z"); // 18:00 em Sao Paulo

  function lembrete(formula: Record<string, unknown>) {
    m.rows = [{ id: 1, clienteId: 44, clienteNome: "Caio Teste", clienteTelefone: "11999999999",
      telegramChatId: null, empresaId: 5, horariosEnvio: ["18:00"],
      periodos: [{ sigla: "NO", nome: "Noite", tipo: "tomar", formulas: [formula] }] }];
  }

  it("fórmula com alerta: não envia por nenhum canal e registra o motivo", async () => {
    lembrete({ nome: "Formula A", alertas: ['SUBS 01 "X 1 000 MG": numero solto antes da dose'] });
    const r = await executarLembretesPeriodo({ now: agora });
    expect(m.wa).not.toHaveBeenCalled();
    expect(m.tg).not.toHaveBeenCalled();
    expect(r.enviados).toBe(0);
    expect(r.falhas).toBe(1);
    expect(r.detalhes[0].erro).toMatch(/^dose_nao_confirmada: Formula A/);
    expect(m.updates.some((u) => u.status === "FALHOU" && /dose_nao_confirmada/.test(u.erro))).toBe(true);
  });

  it("fórmula sem alerta segue o fluxo normal de envio", async () => {
    m.wa.mockResolvedValue({ sent: true, via: "evolution", logId: 9 });
    lembrete({ nome: "Formula B", dose: "1", ativoPrincipal: "x" });
    const r = await executarLembretesPeriodo({ now: agora });
    expect(m.wa).toHaveBeenCalled();
    expect(r.enviados).toBe(1);
  });
});
