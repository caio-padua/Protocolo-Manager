import { describe, it, expect } from "vitest";
import { tiposVisiveis, tipoDoArquivo, nomeSeguro, categoriaDoTipo } from "../lib/paxcare";

describe("paxcare", () => {
  it("sem compartilhamento nada e visivel", () => {
    expect(tiposVisiveis({ historico: false, exames: false, documentos: false })).toEqual([]);
  });
  it("so libera a categoria escolhida", () => {
    expect(tiposVisiveis({ historico: false, exames: true, documentos: false })).toEqual(["exame_externo"]);
    expect(tiposVisiveis({ historico: true, exames: false, documentos: true })).toEqual(["historico", "documento"]);
  });
  it("mapeia tipo para categoria", () => {
    expect(categoriaDoTipo("documento")).toBe("documentos");
  });
  it("reconhece arquivo pelos bytes, nao pelo nome", () => {
    expect(tipoDoArquivo(Buffer.from("%PDF-1.4 x"))?.ext).toBe("pdf");
    expect(tipoDoArquivo(Buffer.from("hello world"))).toBeNull();
  });
  it("nome seguro remove caminho", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("....etcpasswd");
    expect(nomeSeguro("")).toBeNull();
  });
});
