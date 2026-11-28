import { beforeEach, describe, expect, it, vi } from "vitest";

// Clínica (empresa) x local da agenda: dados sintéticos, banco simulado por tabela.
const fake = vi.hoisted(() => ({ rowsByTable: new Map<unknown, any[]>() }));
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  const query = (table: unknown) => {
    const q: any = {
      where: () => q, limit: () => q,
      then: (resolve: any, reject: any) => Promise.resolve(fake.rowsByTable.get(table) ?? []).then(resolve, reject),
    };
    return q;
  };
  return { ...actual, db: { select: vi.fn(() => ({ from: (t: unknown) => query(t) })) } };
});

import { empresasTable, locationsTable } from "@workspace/db";
import { comNomeDaClinica, nomeDaClinica, unidadePertenceAClinica } from "../lib/clinic-unit";

beforeEach(() => {
  fake.rowsByTable = new Map<unknown, any[]>([
    [empresasTable, [{ nome: "Instituto Padua" }]],
    [locationsTable, [{ nome: "AGENDA ENFERMAGEM - LOCAL" }, { nome: "AGENDA MÉDICO - LOCAL" }]],
  ]);
});

describe("identidade da clínica nos documentos", () => {
  it("o nome da clínica vem da empresa, não do local da agenda", async () => {
    const m = await comNomeDaClinica({ clinic: { empresaId: 5, name: "AGENDA GERAL" } });
    expect(m.clinic.name).toBe("Instituto Padua");
  });
  it("empresa sem nome: erro explícito, nunca cai no nome da agenda", async () => {
    fake.rowsByTable.set(empresasTable, [{ nome: "  " }]);
    await expect(nomeDaClinica(5)).rejects.toMatchObject({ status: 409 });
    fake.rowsByTable.set(empresasTable, []);
    await expect(nomeDaClinica(5)).rejects.toMatchObject({ status: 409 });
  });
});

describe("unidade do protocolo pertence à clínica", () => {
  it("aceita vazio, nome da clínica (sem acento/caixa) e local cadastrado da mesma empresa", async () => {
    expect(await unidadePertenceAClinica(5, "", "Instituto Padua")).toBe(true);
    expect(await unidadePertenceAClinica(5, null, "Instituto Padua")).toBe(true);
    expect(await unidadePertenceAClinica(5, "instituto pádua", "Instituto Padua")).toBe(true);
    expect(await unidadePertenceAClinica(5, "AGENDA ENFERMAGEM - LOCAL", "Instituto Padua")).toBe(true);
  });
  it("recusa nome que não é da clínica nem de local da empresa (isolamento)", async () => {
    expect(await unidadePertenceAClinica(5, "Clínica Tatuapé", "Instituto Padua")).toBe(false);
  });
});
