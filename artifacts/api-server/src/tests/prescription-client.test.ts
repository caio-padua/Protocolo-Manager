import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ rows: [] as { id: number; cpf?: string | null; email?: string | null; phone?: string | null; name?: string }[], where: vi.fn() }));
vi.mock("@workspace/db", async () => {
  const { clientsTable } = await import("../../../../lib/db/src/schema/clients");
  return { clientsTable, db: { select: () => ({ from: () => ({
    where: (condition: unknown) => {
      mocks.where(condition);
      return { limit: async () => mocks.rows };
    },
  }) }) } };
});
import { clientsTable } from "@workspace/db";
import { resolvePrescriptionClient } from "../lib/prescription-client";

describe("vínculo de prescrição", () => {
  beforeEach(() => { mocks.rows = []; mocks.where.mockClear(); });
  it("valida ID e empresa no banco sem resgatar ID inválido por email", async () => {
    expect(await resolvePrescriptionClient({ clientId: 44, clientEmail: "a@b.test" }, 5)).toBeNull();
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual([5, 44]);
    expect(query.sql).toContain("empresa_id");
    expect(getTableConfig(clientsTable).name).toBe("clients");
  });
  it.each([0, -1, 1.5, NaN])("rejeita ID inválido %s", async (clientId) => {
    expect(await resolvePrescriptionClient({ clientId }, 5)).toBeNull();
    expect(mocks.where).not.toHaveBeenCalled();
  });
  it("mantém ID explícito válido", async () => {
    mocks.rows = [{ id: 44 }];
    expect(await resolvePrescriptionClient({ clientId: 44 }, 5)).toBe(44);
  });
  it("recusa CPF divergente do ID selecionado", async () => {
    mocks.rows = [{ id: 44, cpf: "11122233344" }];
    expect(await resolvePrescriptionClient({ clientId: 44, clientCpf: "99988877766" }, 5)).toBeNull();
  });
  it("normaliza CPF, e-mail e limita o resgate à empresa", async () => {
    mocks.rows = [{ id: 44, cpf: "11122233344", email: "a@b.test" }];
    expect(await resolvePrescriptionClient({ clientCpf: "111.222.333-44", clientEmail: " A@B.TEST " }, 5)).toBe(44);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual([5, "11122233344", "a@b.test"]);
  });
  it("aceita email único sem CPF", async () => {
    mocks.rows = [{ id: 44, email: "a@b.test" }];
    expect(await resolvePrescriptionClient({ clientEmail: "a@b.test" }, 5)).toBe(44);
  });
  it("não resolve CPF/email que apontam a pacientes distintos", async () => {
    mocks.rows = [{ id: 44 }, { id: 45 }];
    expect(await resolvePrescriptionClient({ clientCpf: "11122233344", clientEmail: "a@b.test" }, 5)).toBeNull();
  });
  it("email não sobrepõe CPF divergente", async () => {
    mocks.rows = [{ id: 44, cpf: "99988877766" }];
    expect(await resolvePrescriptionClient({ clientCpf: "11122233344", clientEmail: "a@b.test" }, 5)).toBeNull();
  });
  it("dados vazios não consultam nem vinculam", async () => {
    expect(await resolvePrescriptionClient({ clientCpf: "...", clientEmail: " " }, 5)).toBeNull();
    expect(mocks.where).not.toHaveBeenCalled();
  });
  it.each([
    { clientEmail: "other@test" },
    { clientPhone: "11999999999" },
    { clientName: "Outro paciente" },
    { clientCpf: "11122233344" },
  ])("recusa dados divergentes mesmo sem CPF cadastrado: %j", async (input) => {
    mocks.rows = [{ id: 44, cpf: null, email: "one@test", phone: "11888888888", name: "Paciente teste" }];
    expect(await resolvePrescriptionClient({ clientId: 44, ...input }, 5)).toBeNull();
  });
  it("contato ausente no cadastro não autoriza endereço fornecido", async () => {
    mocks.rows = [{ id: 44 }];
    expect(await resolvePrescriptionClient({ clientId: 44, clientEmail: "one@test" }, 5)).toBeNull();
  });
  it("normaliza DDI, nome e email sem alterar identidade", async () => {
    mocks.rows = [{ id: 44, name: "João Teste", phone: "11999999999", email: "ONE@test" }];
    expect(await resolvePrescriptionClient({ clientId: 44, clientName: " JOAO TESTE ", clientPhone: "+55 (11) 99999-9999", clientEmail: "one@test" }, 5)).toBe(44);
  });
});
