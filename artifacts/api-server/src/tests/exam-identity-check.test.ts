/** Motor de identidade do laudo: dados 100% sintéticos (CPFs gerados por cálculo, nomes fictícios). */
import { describe, expect, it } from "vitest";
import { assessIdentity, isValidCpf, maskCpf, normalizeCpf, normalizeName, parseBirthDate } from "../lib/exam-extraction/identity-check";

// CPFs sintéticos com dígitos verificadores válidos (não pertencem a ninguém conhecido).
const CPF_A = "529.982.247-25";
const CPF_B = "111.444.777-35";
const reg = { name: "Maria Aparecida de Souza Lima", cpf: CPF_A, birthDate: "1980-03-15" };

describe("CPF", () => {
  it("valida dígitos verificadores e rejeita sequências repetidas", () => {
    expect(isValidCpf(CPF_A)).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf(null)).toBe(false);
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
  });
  it("mascara sem vazar o número completo", () => {
    expect(maskCpf(CPF_A)).toBe("***.***.***-25");
    expect(maskCpf("x")).toBeNull();
  });
});

describe("nome e nascimento", () => {
  it("normaliza acento, caixa, pontuação e partículas", () => {
    expect(normalizeName("  José  D'Ávila-da Silva ")).toEqual(["JOSE", "D", "AVILA", "SILVA"]);
    expect(normalizeName("MARIA DE SOUZA")).toEqual(["MARIA", "SOUZA"]);
  });
  it("aceita os três formatos de data e recusa data impossível ou futura", () => {
    expect(parseBirthDate("15/03/1980")).toBe("1980-03-15");
    expect(parseBirthDate("15-03-1980")).toBe("1980-03-15");
    expect(parseBirthDate("1980-03-15")).toBe("1980-03-15");
    expect(parseBirthDate("31/02/1980")).toBeNull();
    expect(parseBirthDate("15/03/2999")).toBeNull();
    expect(parseBirthDate("15/03/80")).toBeNull();
  });
});

describe("veredito de identidade", () => {
  it("CPF igual confirma, mesmo com formatação diferente", () => {
    const r = assessIdentity({ cpf: "52998224725" }, reg);
    expect(r.verdict).toBe("confirmada");
    expect(r.fields.cpf).toBe("igual");
  });
  it("CPF válido e diferente é contradição, mesmo com nome e nascimento iguais (homônimo)", () => {
    const r = assessIdentity({ name: reg.name, cpf: CPF_B, birthDate: "15/03/1980" }, reg);
    expect(r.verdict).toBe("contradicao");
  });
  it("nome + nascimento iguais confirmam sem CPF no laudo", () => {
    const r = assessIdentity({ name: "MARIA APARECIDA DE SOUZA LIMA", birthDate: "15/03/1980" }, reg);
    expect(r.verdict).toBe("confirmada");
  });
  it("sem CPF no laudo, variante de grafia NÃO entra no prontuário: vira análise preliminar (mudança de 16/11/2026)", () => {
    for (const name of ["Maria A. Souza Lima", "Maria Aparecida Souza Lyma"]) {
      const r = assessIdentity({ name, birthDate: "15/03/1980" }, reg);
      expect(r.verdict).toBe("revisao");
      expect(r.decision).toBe("preliminar");
    }
  });
  it("com CPF igual, as mesmas variantes entram e registram apelido", () => {
    for (const name of ["Maria A. Souza Lima", "Maria Aparecida Souza Lyma"]) {
      const r = assessIdentity({ name, cpf: CPF_A }, reg);
      expect(r.verdict).toBe("confirmada");
      expect(r.decision).toBe("incorporar_com_alias");
      expect(r.aliasToRecord).toBeTruthy();
    }
  });
  it("nome sozinho nunca confirma", () => {
    const r = assessIdentity({ name: reg.name }, reg);
    expect(r.verdict).toBe("revisao");
    expect(r.reasons.join(" ")).toMatch(/nome sozinho/i);
  });
  it("dado ausente jamais confirma: laudo sem nada impresso", () => {
    expect(assessIdentity({}, reg).verdict).toBe("revisao");
    expect(assessIdentity({ name: null, cpf: null, birthDate: null }, reg).fields).toEqual({ cpf: "ausente", name: "ausente", birthDate: "ausente" });
  });
  it("cadastro sem CPF e sem nascimento não permite confirmar", () => {
    const semDados = { name: reg.name, cpf: null, birthDate: null };
    expect(assessIdentity({ name: reg.name, cpf: CPF_A, birthDate: "15/03/1980" }, semDados).verdict).toBe("revisao");
  });
  it("CPF com dígito errado (leitura ruim) vira revisão, não contradição nem confirmação", () => {
    const r = assessIdentity({ name: reg.name, cpf: "529.982.247-26" }, reg);
    expect(r.fields.cpf).toBe("invalido");
    expect(r.verdict).toBe("revisao");
  });
  it("CPF igual com nome totalmente diferente exige revisão", () => {
    const r = assessIdentity({ name: "Carlos Roberto Pereira", cpf: CPF_A }, reg);
    expect(r.verdict).toBe("revisao");
  });
  it("CPF igual com nascimento diferente exige revisão (possível erro de leitura)", () => {
    const r = assessIdentity({ cpf: CPF_A, birthDate: "16/03/1980" }, reg);
    expect(r.verdict).toBe("revisao");
  });
  it("nascimento diferente com nome compatível e sem CPF é contradição (provável homônimo)", () => {
    const r = assessIdentity({ name: reg.name, birthDate: "02/07/1975" }, reg);
    expect(r.verdict).toBe("contradicao");
  });
  it("nome e nascimento ambos divergentes é contradição", () => {
    const r = assessIdentity({ name: "Carlos Roberto Pereira", birthDate: "02/07/1975" }, reg);
    expect(r.verdict).toBe("contradicao");
  });
  it("nome diferente com mesmo nascimento é contradição", () => {
    const r = assessIdentity({ name: "Carlos Roberto Pereira", birthDate: "15/03/1980" }, reg);
    expect(r.verdict).toBe("contradicao");
  });
  it("nome completamente diferente sem outro dado vai para revisão (não afirma contradição sem base)", () => {
    expect(assessIdentity({ name: "Carlos Roberto Pereira" }, reg).verdict).toBe("revisao");
  });
  it("homônimo parcial (mesmo primeiro e último nome, meio diferente) não confirma", () => {
    const base = { name: "José Carlos Silva", cpf: null, birthDate: "01/01/1990" };
    const r = assessIdentity({ name: "José Antonio Silva", birthDate: "01/01/1990" }, base);
    expect(r.fields.name).toBe("parcial");
    expect(r.verdict).toBe("revisao");
  });
  it("nascimento diferente sem nome disponível não afirma contradição", () => {
    expect(assessIdentity({ birthDate: "02/07/1975" }, reg).verdict).toBe("revisao");
  });
  it("aceita nascimento cadastrado em formato ISO e impresso em formato brasileiro", () => {
    expect(assessIdentity({ name: reg.name, birthDate: "15/03/1980" }, { ...reg, birthDate: "15/03/1980" }).verdict).toBe("confirmada");
  });
  it("toda saída traz ao menos um motivo", () => {
    for (const e of [{}, { cpf: CPF_B }, { name: reg.name }, { cpf: CPF_A }]) {
      expect(assessIdentity(e, reg).reasons.length).toBeGreaterThan(0);
    }
  });
});
