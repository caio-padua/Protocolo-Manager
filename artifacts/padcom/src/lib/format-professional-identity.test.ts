import { describe, expect, it } from "vitest";
import {
  formatProfessionalCpf,
  formatProfessionalInitials,
  formatProfessionalName,
  formatProfessionalRole,
} from "./format-professional-identity";

describe("identidade no menu do colaborador", () => {
  it("mostra primeiro nome, iniciais intermediarias e sobrenome sem titulo medico", () => {
    expect(formatProfessionalName("Dr. Caio Henrique Fernandes Padua")).toBe("Caio H. F. Padua");
    expect(formatProfessionalName("Maria Aparecida da Silva")).toBe("Maria A. da Silva");
  });

  it("mantem nome com dois termos e trata cadastro vazio", () => {
    expect(formatProfessionalName("Ana Souza")).toBe("Ana Souza");
    expect(formatProfessionalName("João Pedro da Silva Júnior")).toBe("João P. da Silva Júnior");
    expect(formatProfessionalName("")).toBe("Profissional");
  });

  it("gera iniciais sem usar o titulo profissional", () => {
    expect(formatProfessionalInitials("Dra. Ana Maria Silva")).toBe("AS");
  });

  it("usa cargo especifico e apresenta categoria quando o cargo e generico", () => {
    expect(formatProfessionalRole("Recepcionista", "recepcao")).toBe("Recepcionista");
    expect(formatProfessionalRole("executor", "medico")).toBe("Médico");
  });

  it("mascara o CPF por padrao e revela somente apos acao explicita", () => {
    expect(formatProfessionalCpf("123.456.789-01")).toBe("•••.•••.•••-••");
    expect(formatProfessionalCpf("123.456.789-01", true)).toBe("123.456.789-01");
    expect(formatProfessionalCpf(null)).toBe("—");
    expect(formatProfessionalCpf("123")).toBe("CPF pendente");
  });
});
