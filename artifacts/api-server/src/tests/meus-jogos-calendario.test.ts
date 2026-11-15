import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  avaliarSorteio, conferirProximoComCalendario, fechamentoDoCanal, opcoesDeConcurso,
  somarDias, type CalendarioOficial, type RegrasVerificadas,
} from "../lib/meus-jogos-calendario";
import { parsearPdfCronograma } from "../lib/meus-jogos-calendario-oficial";
import { ehAtualizacaoSemanalDevida, AGENDAMENTO_PADRAO } from "../lib/meus-jogos-calendario-store";

const pdf = async (nome: string) => new Uint8Array(await readFile(fileURLToPath(new URL(`./fixtures/caixa/${nome}`, import.meta.url))));
const REGRAS: RegrasVerificadas = { semanal: true, domingoSabado22h: true, bolao15min: true, umaHoraAntes: true, bolaoSemana1930: true };
const data = (s: string) => new Date(`${s}T12:00:00-03:00`);

describe("calendário oficial CAIXA — parser PDF por posição e prazos BRT", () => {
  it("associa concursos à coluna correta e respeita feriado e domingo", async () => {
    const cal = await parsearPdfCronograma(await pdf("cronograma-2026-11.pdf"), "2026-11", "fixture-caixa", "2026-11-15T12:00:00-03:00", "2026-11-23T12:00:00-03:00");
    expect(cal.sorteios).toContainEqual(expect.objectContaining({ modalidade: "megasena", concurso: 3086, data: "2026-11-15" }));
    expect(cal.sorteios).toContainEqual(expect.objectContaining({ modalidade: "lotomania", concurso: 3000, data: "2026-11-16" }));
    expect(cal.sorteios).toContainEqual(expect.objectContaining({ modalidade: "quina", concurso: 7173, data: "2026-11-29", especial: true }));
    expect(cal.feriados).toContain("2026-11-20");
    expect(cal.sorteios.some((s) => s.data === "2026-11-20" && s.modalidade === "lotofacil")).toBe(false);
  });

  it("lê exceções oficiais de 24/12 e Mega da Virada, sem adivinhar fechamento", async () => {
    const cal = await parsearPdfCronograma(await pdf("cronograma-2026-12.pdf"), "2026-12", "fixture-caixa", "2026-11-15T12:00:00-03:00", "2026-11-23T12:00:00-03:00");
    const lf24 = cal.sorteios.find((s) => s.modalidade === "lotofacil" && s.concurso === 3863);
    expect(lf24).toMatchObject({ data: "2026-12-24", horaSorteio: "17:00", apostasEncerramEm: "2026-12-24T19:00:00.000Z" });
    const mega = cal.sorteios.find((s) => s.modalidade === "megasena" && s.concurso === 3100);
    expect(mega).toMatchObject({ data: "2027-01-01", horaSorteio: "11:00", especial: true, apostasEncerramEm: "2027-01-01T01:00:00.000Z" });
    expect(cal.feriados).toContain("2026-12-25");
  });

  it("calcula domingo por canal diferente, com virada para sábado e margem de quatro horas", async () => {
    const cal = await parsearPdfCronograma(await pdf("cronograma-2026-11.pdf"), "2026-11", "fixture-caixa", "2026-11-15T12:00:00-03:00", "2026-11-23T12:00:00-03:00");
    const domingo = cal.sorteios.find((s) => s.modalidade === "megasena" && s.concurso === 3086)!;
    cal.regras = REGRAS;
    expect(fechamentoDoCanal(domingo, "aposta_simples", REGRAS)?.em).toBe("2026-11-15T01:00:00.000Z"); // sábado 22h BRT
    expect(fechamentoDoCanal(domingo, "bolao_caixa_digital", REGRAS)?.em).toBe("2026-11-15T13:45:00.000Z"); // domingo 10h45 BRT
    const opcoes = opcoesDeConcurso("megasena", cal, data("2026-11-14"), 240, 3);
    expect(opcoes[0]).toMatchObject({ concurso: 3086, canais: { aposta_simples: { internoEm: "2026-11-14T21:00:00.000Z" } } }); // sábado 18h BRT
    expect(somarDias("2026-11-15", -1)).toBe("2026-11-14");
  });

  it("bloqueia datas e fontes divergentes em vez de preencher lacunas", async () => {
    const cal: CalendarioOficial = {
      geradoEm: "2026-11-15T10:00:00-03:00", validoAte: "2026-11-23T10:00:00-03:00",
      regras: REGRAS, meses: ["2026-11"], sorteios: [{
        modalidade: "lotofacil", concurso: 3831, data: "2026-11-16", especial: false,
        apostasEncerramEm: null, horaSorteio: null,
      }], feriados: ["2026-11-20"],
    };
    expect(conferirProximoComCalendario("lotofacil", { concurso: 3831, data: "2026-11-16" }, cal)).toEqual({ ok: true });
    const numeroDivergente = conferirProximoComCalendario("lotofacil", { concurso: 3832, data: "2026-11-16" }, cal);
    const dataDivergente = conferirProximoComCalendario("lotofacil", { concurso: 3832, data: "2026-11-20" }, cal);
    expect("motivo" in numeroDivergente && numeroDivergente.motivo).toBe("dados_divergentes");
    expect("motivo" in dataDivergente && dataDivergente.motivo).toBe("dados_divergentes");
    expect(avaliarSorteio({ ...cal.sorteios[0]!, especial: true }, cal, data("2026-11-15"), 240)?.motivo).toBe("especial_nao_verificado");
  });

  it("não autoriza venda quando regra de fechamento ou dia de sorteio não foi verificado", () => {
    const sorteio = { modalidade: "lotofacil" as const, concurso: 5, data: "2026-11-16", especial: false, apostasEncerramEm: null, horaSorteio: null };
    const faltaRegra = { ...REGRAS, semanal: false, umaHoraAntes: false };
    expect(avaliarSorteio(sorteio, { regras: faltaRegra }, data("2026-11-15"), 240)?.motivo).toBe("regras_semanais_nao_verificadas");
    expect(fechamentoDoCanal(sorteio, "aposta_simples", { ...REGRAS, umaHoraAntes: false })).toBeNull();
  });

  it("executa a atualização na agenda BRT e continua tentando após falha", () => {
    expect(ehAtualizacaoSemanalDevida(new Date("2026-11-16T08:59:00.000Z"), AGENDAMENTO_PADRAO, null)).toBe(false); // segunda 05:59 BRT
    expect(ehAtualizacaoSemanalDevida(new Date("2026-11-16T09:00:00.000Z"), AGENDAMENTO_PADRAO, null)).toBe(true); // segunda 06:00 BRT
    expect(ehAtualizacaoSemanalDevida(new Date("2026-11-17T12:00:00.000Z"), AGENDAMENTO_PADRAO, null)).toBe(true); // repetição após falha
    expect(ehAtualizacaoSemanalDevida(new Date("2026-11-17T12:00:00.000Z"), AGENDAMENTO_PADRAO, "2026-11-16T10:00:00.000Z")).toBe(false);
    expect(ehAtualizacaoSemanalDevida(new Date("2026-11-23T09:00:00.000Z"), AGENDAMENTO_PADRAO, "2026-11-16T10:00:00.000Z")).toBe(true);
  });
});
