import { describe, expect, it } from "vitest";
import { textoSeguroParaInterpretar } from "../lib/telegram-interprete";

describe("limites de dados do Intérprete e do Conferente", () => {
  it.each([
    "Meu CPF é 123.456.789-09. Quero marcar consulta.",
    "Nasci em 13/06/1990 e quero marcar uma consulta.",
    "Meu telefone é 11987654321 e prefiro de manhã.",
    "Meu e-mail é caio@example.com. Quero atendimento.",
  ])("não envia mensagem com identificador pessoal: %s", (texto) => {
    expect(textoSeguroParaInterpretar(texto)).toBeNull();
  });

  it("remove nome declarado e mantém a intenção não pessoal", () => {
    expect(textoSeguroParaInterpretar("Me chamo Ana Silva, quero marcar consulta."))
      .not.toContain("Ana Silva");
    expect(textoSeguroParaInterpretar("Me chamo Ana Silva, quero marcar consulta."))
      .toContain("quero marcar consulta");
  });
});
