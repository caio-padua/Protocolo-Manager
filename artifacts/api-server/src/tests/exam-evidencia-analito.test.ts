/** Evidência de identidade do analito: vitamina D 25-OH x 1,25-(OH)2. Puro, sem banco, sem IA. */
import { describe, expect, it } from "vitest";
import { avaliarEvidenciaAnalito, contextoTecnicoParaIA, podeConverterUnidade, validarPropostaIA, type EntradaCatalogo } from "../lib/exam-extraction/evidencia-analito";
import { classifyRawName, type CatalogEntryFull } from "../lib/exam-extraction/triagem";
import { normalizeAnalyteName, } from "../lib/exam-extraction/persist";
import { chaveVariante, VARIANTE_MIN } from "../lib/exam-extraction/zones";

const defs = [
  { code: "d25", displayName: "Vitamina D (25-OH)", syn: ["VITAMINA D", "VITAMINA D 25 OH", "25 HIDROXI-VITAMINA D", "Calcidiol", "Calcifediol"] },
  { code: "d125", displayName: "1,25 dihidroxi vitamina d", syn: ["1,25 DIHIDROXI VITAMINA D", "CALCITRIOL", "VITAMINA D 1,25 (OH)2"] },
  { code: "ferro", displayName: "Ferro", syn: [] },
];
const mk = (d: (typeof defs)[number]): CatalogEntryFull => {
  const keys = new Set([d.displayName, ...d.syn].map(normalizeAnalyteName));
  const compact = new Set([...keys].map(chaveVariante).filter((k) => k.length >= VARIANTE_MIN));
  return { code: d.code, displayName: d.displayName, keys, compact, tokens: new Set(normalizeAnalyteName(d.displayName).split(" ").filter((t) => t.length >= 3)) };
};
const cat = defs.map(mk);
const ent: EntradaCatalogo[] = cat.map((e) => ({ code: e.code, displayName: e.displayName, keys: e.keys }));
const av = (nome: string, unidade?: string, extra: object = {}) => avaliarEvidenciaAnalito({ nome, unidade, ...extra }, ent);

describe("identidade por evidência (vitamina D)", () => {
  it("'Vitamina D (25-OH)' -> 25-OH confirmado", () => {
    expect(av("Vitamina D (25-OH)", "ng/mL")).toMatchObject({ veredito: "confirmado", forma: "25oh", code: "d25", naoFundirCom: ["d125"] });
  });
  it("'Calcitriol' -> 1,25 confirmado, nunca 25-OH", () => {
    const r = av("Calcitriol", "pg/mL");
    expect(r).toMatchObject({ veredito: "confirmado", forma: "1,25oh2", code: "d125", naoFundirCom: ["d25"] });
  });
  it("'1,25 dihidroxi' (grafia nova) -> forma 1,25, candidato, jamais código 25-OH", () => {
    const r = av("1,25 dihidroxi", "pg/mL");
    expect(r.forma).toBe("1,25oh2");
    expect(r.code).toBe("d125");
    expect(r.veredito).toBe("candidato");
  });
  it("'Vitamina D' sem qualificador -> pendente, mesmo com unidade de 25-OH", () => {
    for (const u of ["ng/mL", "nmol/L", "pg/mL", undefined]) {
      const r = av("Vitamina D", u);
      expect(r).toMatchObject({ veredito: "pendente", forma: null, code: null, unidadeBastaParaFundir: false });
    }
  });
  it("'Vit D' em pg/mL sem método -> pendente, sem código e sem fusão", () => {
    const r = av("Vit D", "pg/mL");
    expect(r).toMatchObject({ veredito: "pendente", code: null });
    expect(r.evidencias.some((e) => e.tipo === "unidade")).toBe(true);
  });
  it("'vit d 25(oh) est.' sem método -> candidato de 25-OH, não autoconfirmado", () => {
    const r = av("vit d 25(oh) est.", "ng/mL");
    expect(r).toMatchObject({ veredito: "candidato", forma: "25oh", code: "d25" });
  });
  it("nome de 25-OH com unidade típica de calcitriol -> pendente (nome x unidade divergem)", () => {
    expect(av("Vitamina D (25-OH)", "pg/mL")).toMatchObject({ veredito: "pendente", code: null });
  });
  it("nome de calcitriol com ng/mL -> pendente", () => {
    expect(av("Calcitriol", "ng/mL")).toMatchObject({ veredito: "pendente", code: null });
  });
  it("nome misturando 1,25 e calcidiol -> pendente (conflito)", () => {
    expect(av("1,25 calcidiol", "pg/mL")).toMatchObject({ veredito: "pendente", forma: null });
  });
  it("LOINC divergente do catálogo -> pendente", () => {
    const e2 = ent.map((e) => (e.code === "d25" ? { ...e, loinc: "1111-1" } : e));
    expect(avaliarEvidenciaAnalito({ nome: "Vitamina D (25-OH)", unidade: "ng/mL", loinc: "2222-2" }, e2).veredito).toBe("pendente");
    expect(avaliarEvidenciaAnalito({ nome: "Vitamina D (25-OH)", unidade: "ng/mL", loinc: "1111-1" }, e2).veredito).toBe("confirmado");
  });
  it("outro analito -> fora da família (não interfere)", () => {
    expect(av("Ferro", "ug/dL").veredito).toBe("fora_da_familia");
  });
});

describe("conversão só com fator validado", () => {
  const fat = [
    { analyteCode: "d25", unit: "ng/mL", factorToCanonical: 1, isCanonical: true, active: true },
    { analyteCode: "d25", unit: "nmol/L", factorToCanonical: 0.4006, isCanonical: false, active: true },
    { analyteCode: "d125", unit: "pg/mL", factorToCanonical: 1, isCanonical: true, active: true },
  ];
  it("25-OH nmol/L -> ng/mL permitido com fator cadastrado", () => {
    const r = podeConverterUnidade("d25", "nmol/L", "ng/mL", fat);
    expect(r.permitido).toBe(true);
    expect(r.fator).toBeCloseTo(0.4006, 4);
  });
  it("sem fator para o par (calcitriol nmol/L) -> proibido", () => {
    expect(podeConverterUnidade("d125", "pmol/L", "pg/mL", fat).permitido).toBe(false);
  });
  it("fator inativo não vale", () => {
    expect(podeConverterUnidade("d25", "nmol/L", "ng/mL", fat.map((f) => ({ ...f, active: false }))).permitido).toBe(false);
  });
  it("nunca converte entre códigos diferentes: 25-OH ng/mL -> calcitriol pg/mL", () => {
    expect(podeConverterUnidade("d25", "ng/mL", "pg/mL", fat).permitido).toBe(false);
  });
});

describe("IA propõe, motor valida", () => {
  const ok = { fontes: ["https://exemplo.org/fonte"], confianca: 0.9 };
  it("proposta coerente com forma confirmada é aceita", () => {
    expect(validarPropostaIA({ code: "d25", forma: "25oh", ...ok }, av("Vitamina D (25-OH)", "ng/mL")).aceita).toBe(true);
  });
  it("IA tentando mapear calcitriol para 25-OH é recusada", () => {
    const r = validarPropostaIA({ code: "d25", forma: "25oh", ...ok }, av("Calcitriol", "pg/mL"));
    expect(r.aceita).toBe(false);
    expect(r.motivos.join()).toMatch(/red-line/);
  });
  it("IA tentando fundir 'Vitamina D' genérica é recusada", () => {
    expect(validarPropostaIA({ code: "d25", forma: "25oh", ...ok }, av("Vitamina D", "ng/mL")).aceita).toBe(false);
  });
  it("sem fonte ou confiança inválida é recusada", () => {
    expect(validarPropostaIA({ code: "d25", forma: "25oh", fontes: [], confianca: 0.9 }, av("Vitamina D (25-OH)", "ng/mL")).aceita).toBe(false);
    expect(validarPropostaIA({ code: "d25", forma: "25oh", fontes: ["x"], confianca: 7 }, av("Vitamina D (25-OH)", "ng/mL")).aceita).toBe(false);
  });
});

describe("contexto técnico para IA sem dado do paciente", () => {
  it("descarta paciente, CPF, valor e demais campos", () => {
    const c = contextoTecnicoParaIA({ nome: "Vit D", unidade: "pg/mL", faixa: "20 a 60", valor: "33", pacienteNome: "Fulano", cpf: "000.000.000-00", pdf: "x" });
    expect(Object.keys(c).sort()).toEqual(["amostra", "faixa", "loinc", "metodo", "nome", "unidade"]);
    expect(JSON.stringify(c)).not.toMatch(/Fulano|000\.000|33/);
  });
  it("recusa nome com CPF ou e-mail", () => {
    expect(() => contextoTecnicoParaIA({ nome: "Vit D 123.456.789-09" })).toThrow();
    expect(() => contextoTecnicoParaIA({ nome: "a@b.com" })).toThrow();
  });
});

describe("integração com o classificador da triagem", () => {
  it("'Vitamina D' (apelido exato) vira ambíguo/pendente, sem código", () => {
    expect(classifyRawName("Vitamina D", cat)).toMatchObject({ kind: "ambiguo", code: null });
  });
  it("'vit d 25(oh) est.' vira ambíguo com candidato 25-OH, não exame novo", () => {
    expect(classifyRawName("vit d 25(oh) est.", cat, { unit: "ng/mL" })).toMatchObject({ kind: "ambiguo", code: "d25" });
  });
  it("'Vit D' pg/mL fica pendente; calcitriol nunca aponta para 25-OH", () => {
    expect(classifyRawName("Vit D", cat, { unit: "pg/mL" }).code).toBeNull();
    expect(classifyRawName("Calcitriol", cat, { unit: "pg/mL" })).toMatchObject({ kind: "apelido", code: "d125" });
  });
  it("exame fora da família continua com o comportamento anterior", () => {
    expect(classifyRawName("Ferro", cat)).toMatchObject({ kind: "apelido", code: "ferro" });
  });
});
