import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { lerCatalogosTranscritos } from "../lib/catalogo-transcricao";

const arquivo = new URL("../../../../attached_assets/Pasted-DADOS-EXTRA-DOS-E-CONFERIDOS-DAS-TABELAS-PEDIDAS-Use-es_1794384373497.txt", import.meta.url);

describe("leitura rastreável das tabelas de fornecedores", () => {
  it("preserva as quatro partes e confirma a aritmética informada", async () => {
    const dados = lerCatalogosTranscritos(await readFile(arquivo, "utf8"));
    expect(dados.filter((x) => x.origem === "farmatec")).toHaveLength(158);
    expect(dados.filter((x) => x.origem === "bio-meds")).toHaveLength(19);
    expect(dados.filter((x) => x.origem === "formedica-implantes")).toHaveLength(29);
    expect(dados.filter((x) => x.origem === "formedica-precos")).toHaveLength(36);
    expect(dados.every((x) => x.paraConferencia && x.hashTexto.length === 64)).toBe(true);
    const farmatec = dados.find((x) => x.chaveFonte === "farmatec:1:5");
    expect(farmatec).toMatchObject({ custoUnitarioCentavos: 500, custoEmbalagemCentavos: 5000,
      quantidadeEmbalagem: 10, dataFonte: "2025-09-29" });
    const tirzepatida = dados.find((x) => x.origem === "bio-meds" && x.campos[1] === "TIRZEPATIDA");
    expect(tirzepatida).toMatchObject({ quantidadeEmbalagem: 1, custoEmbalagemCentavos: 229400, custoUnitarioCentavos: null,
      dataDocumento: "2026-07-16", dataFonte: null });
    expect(dados.find((x) => x.chaveFonte === "formedica-precos:18960")?.textoOriginal).toContain("DIVERGÊNCIA");
    expect(dados.find((x) => x.chaveFonte === "formedica-precos:18960")?.dataFonte).toBe("2022-05");
  });
  it("recusa valores incoerentes e linhas repetidas", () => {
    const header = "FARMATEC:\n";
    const linha = "1 | 1 | Produto | 10 mg | 2 ml | IM | 10 ampolas | R$5,00 | R$50,00";
    expect(() => lerCatalogosTranscritos(header + linha + "\n" + linha)).toThrow("repetida");
    expect(() => lerCatalogosTranscritos(header + linha.replace("R$50,00", "R$51,00"))).toThrow("divergentes");
    expect(() => lerCatalogosTranscritos(header + "1 | 1 | incompleta")).toThrow("inválida");
  });
});
