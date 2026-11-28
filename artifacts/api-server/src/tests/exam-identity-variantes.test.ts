/**
 * Regras de identidade com variantes, homônimos e conflitos. Dados 100% sintéticos, sem banco e sem rede.
 * Foco: pequena divergência de grafia com CPF igual não bloqueia; nada substitui o CPF.
 */
import { describe, expect, it } from "vitest";
import { assessIdentity, phoneticKey } from "../lib/exam-extraction/identity-check";
import { DEFAULT_RULES, STRICTEST_RULES, normalizeRuleConfig } from "../lib/exam-extraction/identity-rules";
import { detectEvidenceConflicts, findCpfsInText } from "../lib/exam-extraction/identity-evidence";

const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";
const DAYANA = { name: "Dayana de Sousa Ferreira", cpf: CPF_A, birthDate: "1990-07-21" };

describe("variantes com CPF igual: aceitar, registrar apelido e trilha", () => {
  const casos: Array<[string, string, string]> = [
    ["Dai ana (nome separado em duas palavras)", "Dai ana Sousa Ferreira", "token_dividido"],
    ["Souza no lugar de Sousa", "Dayana de Souza Ferreira", "fonetica"],
    ["Daiana (y por i)", "Daiana Sousa Ferreira", "fonetica"],
    ["abreviação com ponto", "Dayana S. Ferreira", "inicial"],
    ["nome do meio omitido", "Dayana Ferreira", "subconjunto"],
    ["ordem Sobrenome, Nome", "FERREIRA, Dayana Sousa", "ordem"],
    ["acento e caixa", "DÁYANA DE SOUSA FERREIRA", ""],
    ["letra dobrada", "Dayanna Sousa Ferreira", "fonetica"],
    ["Ferreyra (y por i)", "Dayana Sousa Ferreyra", "fonetica"],
  ];
  it.each(casos)("%s", (_titulo, impresso, tipo) => {
    const r = assessIdentity({ name: impresso, cpf: CPF_A, birthDate: "21/07/1990" }, DAYANA);
    expect(r.verdict).toBe("confirmada");
    if (tipo === "") {
      expect(r.decision).toBe("incorporar");
      expect(r.aliasToRecord).toBeNull();
    } else {
      expect(r.decision).toBe("incorporar_com_alias");
      expect(r.nameVariants).toContain(tipo);
      expect(r.aliasToRecord).toBeTruthy();
    }
    expect(r.trail.join(" ")).toMatch(/Decisão:/);
    // a trilha nunca expõe o CPF completo
    expect(r.trail.join(" ")).not.toContain("52998224725");
    expect(r.trail.join(" ")).not.toContain("529.982");
  });
  it("sem data de nascimento no laudo, CPF igual com variante continua aceito (ausente não contradiz)", () => {
    expect(assessIdentity({ name: "Dai ana Sousa Ferreira", cpf: CPF_A }, DAYANA).decision).toBe("incorporar_com_alias");
  });
});

describe("limites que nada substitui", () => {
  it("homônimo com CPF diferente: contradição, mesmo com nome idêntico e nascimento igual", () => {
    const r = assessIdentity({ name: DAYANA.name, cpf: CPF_B, birthDate: "21/07/1990" }, DAYANA);
    expect(r.decision).toBe("quarentena");
    expect(r.verdict).toBe("contradicao");
  });
  it("variante com CPF igual mas nascimento explicitamente diferente: quarentena", () => {
    const r = assessIdentity({ name: "Dai ana Sousa Ferreira", cpf: CPF_A, birthDate: "22/07/1990" }, DAYANA);
    expect(r.decision).toBe("quarentena");
  });
  it("CPF inválido no laudo: quarentena, mesmo com nome e nascimento exatos", () => {
    const r = assessIdentity({ name: DAYANA.name, cpf: "529.982.247-26", birthDate: "21/07/1990" }, DAYANA);
    expect(r.decision).toBe("quarentena");
    expect(r.fields.cpf).toBe("invalido");
  });
  it("CPF igual com nome sem nenhuma palavra em comum: quarentena", () => {
    expect(assessIdentity({ name: "Carlos Roberto Pereira", cpf: CPF_A }, DAYANA).decision).toBe("quarentena");
  });
  it("nome do meio diferente (homônimo parcial) com CPF igual e nascimento igual: aceito pela regra padrão, com apelido", () => {
    const r = assessIdentity({ name: "Dayana Cristina Ferreira", cpf: CPF_A, birthDate: "21/07/1990" }, DAYANA);
    expect(r.fields.name).toBe("parcial");
    expect(r.decision).toBe("incorporar_com_alias");
  });
  it("nome parcial com CPF igual e SEM nascimento: quarentena pela regra padrão", () => {
    expect(assessIdentity({ name: "Dayana Cristina Ferreira", cpf: CPF_A }, DAYANA).decision).toBe("quarentena");
  });
  it("sem CPF: nome exato + nascimento igual entra; variante vira preliminar; só nome nunca entra", () => {
    expect(assessIdentity({ name: DAYANA.name, birthDate: "21/07/1990" }, DAYANA).decision).toBe("incorporar");
    expect(assessIdentity({ name: "Dai ana Sousa Ferreira", birthDate: "21/07/1990" }, DAYANA).decision).toBe("preliminar");
    expect(assessIdentity({ name: DAYANA.name }, DAYANA).decision).toBe("quarentena");
    expect(assessIdentity({ name: "Dai ana Sousa Ferreira" }, DAYANA).decision).toBe("quarentena");
  });
  it("sem CPF: variante com nascimento diferente é contradição (nunca preliminar)", () => {
    const r = assessIdentity({ name: "Dai ana Sousa Ferreira", birthDate: "01/01/1991" }, DAYANA);
    expect(r.decision).toBe("quarentena");
    expect(r.verdict).toBe("contradicao");
  });
  it("homônimo próximo (Mario x Maria) sem CPF jamais entra automaticamente", () => {
    const base = { name: "Maria Silva Santos", cpf: CPF_A, birthDate: "1980-01-01" };
    expect(assessIdentity({ name: "Mario Silva Santos", birthDate: "01/01/1980" }, base).decision).toBe("preliminar");
  });
  it("laudo com nome completamente diferente e sem outros dados não é contradição afirmada", () => {
    expect(assessIdentity({ name: "Carlos Roberto Pereira" }, DAYANA).verdict).toBe("revisao");
  });
});

describe("apelido já verificado", () => {
  it("apelido conhecido vale como grafia aceita com CPF igual e como preliminar sem CPF", () => {
    const aliases = ["DAIANA SOUSA"];
    const comCpf = assessIdentity({ name: "Daiana Sousa", cpf: CPF_A }, DAYANA, { knownAliases: aliases });
    expect(comCpf.nameVariants).toContain("alias_conhecido");
    expect(comCpf.decision).toBe("incorporar_com_alias");
    const semCpf = assessIdentity({ name: "Daiana Sousa", birthDate: "21/07/1990" }, DAYANA, { knownAliases: aliases });
    expect(semCpf.decision).toBe("preliminar");
  });
});

describe("matriz de regras por clínica", () => {
  it("clínica pode ser mais rígida: variantes desligadas mandam tudo para revisão", () => {
    const r = assessIdentity({ name: "Dai ana Sousa Ferreira", cpf: CPF_A }, DAYANA, { rules: { ...DEFAULT_RULES, variantesComCpf: false } });
    expect(r.decision).toBe("quarentena");
  });
  it("tipos de variante aceitos são respeitados", () => {
    const rules = { ...DEFAULT_RULES, tiposDeVarianteAceitos: ["fonetica" as const] };
    expect(assessIdentity({ name: "Daiana Sousa Ferreira", cpf: CPF_A }, DAYANA, { rules }).decision).toBe("incorporar_com_alias");
    expect(assessIdentity({ name: "Dayana Ferreira", cpf: CPF_A }, DAYANA, { rules }).decision).toBe("quarentena");
  });
  it("exigir nascimento: sem nascimento no laudo a variante vai para revisão", () => {
    const rules = { ...DEFAULT_RULES, exigirNascimentoParaAutoAceite: true };
    expect(assessIdentity({ name: "Dai ana Sousa Ferreira", cpf: CPF_A }, DAYANA, { rules }).decision).toBe("quarentena");
    expect(assessIdentity({ name: "Dai ana Sousa Ferreira", cpf: CPF_A, birthDate: "21/07/1990" }, DAYANA, { rules }).decision).toBe("incorporar_com_alias");
  });
  it("tolerância de edição 0 recusa erro de uma letra que não é fonético", () => {
    const rules = { ...DEFAULT_RULES, distanciaMaximaEdicao: 0 as const };
    expect(assessIdentity({ name: "Dayana Sousa Ferreira", cpf: CPF_A }, { ...DAYANA, name: "Dayana Sousa Ferreiro" }, { rules }).decision).toBe("quarentena");
  });
  it("política do nome parcial: quarentena e aceitar", () => {
    const e = { name: "Dayana Cristina Ferreira", cpf: CPF_A };
    expect(assessIdentity(e, DAYANA, { rules: { ...DEFAULT_RULES, nomeParcialComCpf: "quarentena" } }).decision).toBe("quarentena");
    expect(assessIdentity(e, DAYANA, { rules: { ...DEFAULT_RULES, nomeParcialComCpf: "aceitar" } }).decision).toBe("incorporar_com_alias");
  });
  it("preliminar sem CPF pode ser desligado", () => {
    const r = assessIdentity({ name: "Dai ana Sousa Ferreira", birthDate: "21/07/1990" }, DAYANA, { rules: { ...DEFAULT_RULES, permitirPreliminarSemCpf: false } });
    expect(r.decision).toBe("quarentena");
  });
  it("modo mais rígido não aceita nenhuma variante", () => {
    expect(assessIdentity({ name: "Dai ana Sousa Ferreira", cpf: CPF_A }, DAYANA, { rules: STRICTEST_RULES }).decision).toBe("quarentena");
  });
  it("limites globais: validação recusa valor fora do teto, chave desconhecida e tipo errado (nunca ajusta em silêncio)", () => {
    expect(normalizeRuleConfig({ distanciaMaximaEdicao: 3 }).ok).toBe(false);
    expect(normalizeRuleConfig({ aceitarSemCpf: true }).ok).toBe(false);
    expect(normalizeRuleConfig({ variantesComCpf: "sim" }).ok).toBe(false);
    expect(normalizeRuleConfig({ tiposDeVarianteAceitos: ["telepatia"] }).ok).toBe(false);
    expect(normalizeRuleConfig({ nomeParcialComCpf: "sempre" }).ok).toBe(false);
    expect(normalizeRuleConfig(null).ok).toBe(false);
    expect(normalizeRuleConfig([]).ok).toBe(false);
    const ok = normalizeRuleConfig({ distanciaMaximaEdicao: 1 });
    expect(ok.ok && ok.config.distanciaMaximaEdicao).toBe(1);
    expect(ok.ok && ok.config.variantesComCpf).toBe(true);
  });
});

describe("evidências do texto do laudo", () => {
  const texto = (...cpfs: string[]) => `Paciente: Fulano\n${cpfs.map((c) => `CPF ${c}`).join("\n")}\nHemoglobina 14`;
  it("só CPF formatado ou rotulado conta; número solto de 11 dígitos é protocolo", () => {
    expect(findCpfsInText("Protocolo 52998224725 coletado")).toEqual([]);
    expect(findCpfsInText("CPF: 52998224725")).toEqual(["52998224725"]);
    expect(findCpfsInText("529.982.247-25 e 529.982.247-26")).toEqual(["52998224725"]);
  });
  it("dois CPFs válidos distintos = sinal de dois pacientes: rebaixa auto-aceite para quarentena", () => {
    const evidence = detectEvidenceConflicts({ text: texto(CPF_A, CPF_B) });
    expect(evidence.findings[0]?.code).toBe("dois_cpfs_no_texto");
    const r = assessIdentity({ name: DAYANA.name, cpf: CPF_A }, DAYANA, { evidence });
    expect(r.decision).toBe("quarentena");
    expect(r.aliasToRecord).toBeNull();
  });
  it("o mesmo CPF repetido não é conflito", () => {
    const evidence = detectEvidenceConflicts({ text: texto(CPF_A, "529.982.247-25") });
    expect(evidence.findings).toEqual([]);
    expect(assessIdentity({ name: DAYANA.name, cpf: CPF_A }, DAYANA, { evidence }).decision).toBe("incorporar");
  });
  it("coleta anterior ao nascimento cadastrado: contradição", () => {
    const evidence = detectEvidenceConflicts({ text: "texto", collectionDate: "01/01/1980", registeredBirthDate: "1990-07-21" });
    expect(evidence.findings[0]?.code).toBe("coleta_antes_do_nascimento");
    expect(assessIdentity({ name: DAYANA.name, cpf: CPF_A }, DAYANA, { evidence }).verdict).toBe("contradicao");
  });
  it("sem texto, a ausência é registrada na trilha e nunca tratada como 'limpo'", () => {
    const evidence = detectEvidenceConflicts({ text: "" });
    expect(evidence.evaluated).toBe(false);
    const r = assessIdentity({ name: DAYANA.name, cpf: CPF_A }, DAYANA, { evidence });
    expect(r.trail.join(" ")).toMatch(/não avaliado/);
  });
});

describe("chave fonética", () => {
  it("grafias que soam igual convergem", () => {
    expect(phoneticKey("SOUZA")).toBe(phoneticKey("SOUSA"));
    expect(phoneticKey("DAYANA")).toBe(phoneticKey("DAIANA"));
    expect(phoneticKey("PHILIPE")).toBe(phoneticKey("FILIPE"));
    expect(phoneticKey("KAROLINA")).toBe(phoneticKey("CAROLINA"));
    expect(phoneticKey("MARIA")).not.toBe(phoneticKey("MARIO"));
  });
});
