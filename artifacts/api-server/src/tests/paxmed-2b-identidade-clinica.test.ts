import { describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import { carregarIdentidadeClinica2b } from "../lib/documentos/paxmed-2b-identidade-clinica";

function marca(): Buffer {
  const png = new PNG({ width: 4, height: 4 });
  png.data.fill(0);
  const index = (1 * png.width + 1) * 4;
  png.data[index] = 100;
  png.data[index + 3] = 255;
  return PNG.sync.write(png);
}

function setup(overrides: Record<string, unknown> = {}) {
  const row = {
    empresa_id: 7, nome_cabecalho: "Empresa sintética", rodape_linha1: "Empresa sintética",
    rodape_linha2: "Rua fictícia", rodape_linha3: "Cidade fictícia",
    simbolo_path: "11111111-1111-4111-8111-111111111111",
    simbolo_exemplo: false, dados_exemplo: false, ...overrides,
  };
  const deps = {
    carregarRegistro: vi.fn(async () => row as any),
    carregarSimbolo: vi.fn(async () => marca()),
  };
  return { deps, row };
}

describe("Identidade empresarial para documentos clínicos", () => {
  it("usa os dados da empresa autorizada e conserva a forma do símbolo", async () => {
    const { deps } = setup();
    const result = await carregarIdentidadeClinica2b(7, deps);
    expect(result.empresaId).toBe(7);
    expect(result.textos.nomeCabecalho).toBe("Empresa sintética");
    expect(deps.carregarRegistro).toHaveBeenCalledWith(7);
    const output = PNG.sync.read(Buffer.from(result.simboloDourado));
    expect(output.width).toBe(1);
    expect(output.height).toBe(1);
    expect(output.data[3]).toBe(255);
  });

  it.each([
    [{ empresa_id: 8 }, /não configurada/],
    [{ simbolo_exemplo: true }, /demonstração/],
    [{ dados_exemplo: true }, /demonstração/],
    [{ simbolo_exemplo: undefined }, /demonstração/],
    [{ simbolo_path: "../outra-empresa" }, /símbolo válido/],
    [{ nome_cabecalho: "" }, /preencha/],
  ])("recusa identidade insegura antes de carregar a marca: %o", async (fields, expected) => {
    const { deps } = setup(fields);
    await expect(carregarIdentidadeClinica2b(7, deps)).rejects.toThrow(expected);
    expect(deps.carregarSimbolo).not.toHaveBeenCalled();
  });

  it("recusa ausência de empresa e falha de armazenamento sem retornar marca substituta", async () => {
    const { deps } = setup();
    await expect(carregarIdentidadeClinica2b(0, deps)).rejects.toThrow(/inválida/);
    deps.carregarSimbolo.mockRejectedValueOnce(new Error("armazenamento indisponível"));
    await expect(carregarIdentidadeClinica2b(7, deps)).rejects.toMatchObject({
      status: 503, message: "Não foi possível carregar o símbolo da empresa.",
    });
  });

});
