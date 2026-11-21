import { describe, expect, it } from "vitest";
import { ParteInput, avaliarConformidade, type ParteReg } from "../pax-finance/conformidade-calc";

const parte = (o: Partial<ParteReg>): ParteReg => ({ id: 1, tipo: "beneficiario_final", nome: "Dayana", tipoPessoa: "fisica", cnpj: null, participacaoBp: null, via: "direta", fonteDocumento: "Contrato social", observacao: null, statusValidacao: "validado", encerradaEm: null, ...o });
const socios = [{ nome: "Dayana", papel: "socio_administrador", participacaoBp: 10000 }];

describe("conformidade societária", () => {
  it("sem beneficiário final bloqueia o Roteador", () => {
    const r = avaliarConformidade(socios, []);
    expect(r.bloqueiaRoteador).toBe(true); expect(r.achados.some((a) => a.codigo === "bf_ausente")).toBe(true);
    expect(r.motivoBloqueio).toMatch(/pendência/);
  });
  it("beneficiário final validado e participações em 100% liberam", () => {
    const r = avaliarConformidade(socios, [parte({})]);
    expect(r.bloqueiaRoteador).toBe(false); expect(r.motivoBloqueio).toBeNull(); expect(r.totais.beneficiariosFinais).toBe(1);
  });
  it("rascunho de beneficiário final ainda bloqueia", () => {
    expect(avaliarConformidade(socios, [parte({ statusValidacao: "rascunho" })]).bloqueiaRoteador).toBe(true);
  });
  it("participações que não somam 100% são pendência", () => {
    const r = avaliarConformidade([{ nome: "Dayana", papel: "socio", participacaoBp: 6000 }], [parte({})]);
    expect(r.achados.some((a) => a.codigo === "soma_participacao")).toBe(true); expect(r.bloqueiaRoteador).toBe(true);
  });
  it("registro encerrado não conta", () => {
    expect(avaliarConformidade(socios, [parte({ encerradaEm: "2026-01-01T00:00:00Z" })]).totais.beneficiariosFinais).toBe(0);
  });
  it("empresa relacionada gera alerta, nunca recomendação de dividir", () => {
    const r = avaliarConformidade(socios, [parte({}), parte({ id: 2, tipo: "parte_relacionada", tipoPessoa: "juridica", nome: "Outra Ltda", cnpj: "11222333000181" })]);
    const a = r.achados.find((x) => x.codigo === "relacionada_2")!;
    expect(a.gravidade).toBe("alerta"); expect(a.detalhe).toMatch(/não indica divisão/i);
    expect(JSON.stringify(r)).not.toMatch(/dividir (a )?receita para|pulveriz|titularidade nominal/i);
  });
  it("controle sem registro societário gera alerta", () => {
    const r = avaliarConformidade(socios, [parte({}), parte({ id: 3, tipo: "controle_efetivo", nome: "Fulano", via: "administrador_de_fato" })]);
    expect(r.achados.some((x) => x.codigo === "controle_fora_contrato_3")).toBe(true);
  });
  it("validação de entrada: CPF no nome, PJ como beneficiário e CNPJ inválido são recusados", () => {
    const base = { tipo: "parte_relacionada", nome: "Maria", tipoPessoa: "fisica", via: "familiar" } as const;
    expect(ParteInput.safeParse(base).success).toBe(true);
    expect(ParteInput.safeParse({ ...base, nome: "Maria 123.456.789-09" }).success).toBe(false);
    expect(ParteInput.safeParse({ ...base, tipo: "beneficiario_final", tipoPessoa: "juridica", cnpj: "11222333000181" }).success).toBe(false);
    expect(ParteInput.safeParse({ ...base, tipoPessoa: "juridica", cnpj: "11111111111111" }).success).toBe(false);
    expect(ParteInput.safeParse({ ...base, tipoPessoa: "juridica" }).success).toBe(false);
  });
});
