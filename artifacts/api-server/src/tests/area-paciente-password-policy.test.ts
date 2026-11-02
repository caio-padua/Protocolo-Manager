import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../lib/patient-auth.js";

const memory = vi.hoisted(() => ({
  client: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@workspace/db", () => {
  const clientsTable = {
    cpf: "cpf",
    id: "id",
    passwordHash: "passwordHash",
    mustChangePassword: "mustChangePassword",
    passwordSetToken: "passwordSetToken",
    passwordSetTokenExpiresAt: "passwordSetTokenExpiresAt",
  };
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => memory.client ? [memory.client] : [],
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => { memory.updates.push(values); },
        }),
      }),
    },
    clientsTable,
    protocolsTable: {},
    protocolItemsTable: {},
    substancesTable: {},
    sessionsTable: {},
    substanceApplicationsTable: {},
    paymentsTable: {},
    rasTable: {},
    examRequestPdfsTable: {},
    professionalsTable: {},
    validationCodesTable: {},
    agendaResourcesTable: {},
  };
});

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  gte: () => ({}),
  lte: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

import areaPacienteRouter from "../routes/area-paciente.js";

const app = express();
app.use(express.json(), areaPacienteRouter);

describe("política de senha nas rotas da área do cliente", () => {
  beforeEach(() => {
    memory.client = {
      id: 73,
      name: "Cliente Sintético",
      cpf: "12345678901",
      passwordHash: hashPassword("Current123!"),
      mustChangePassword: true,
      passwordSetToken: "token-sintetico",
      passwordSetTokenExpiresAt: new Date(Date.now() + 60_000),
    };
    memory.updates = [];
  });

  it("bloqueia senha sem número na troca obrigatória e não grava", async () => {
    const response = await request(app)
      .post("/area-paciente/trocar-senha")
      .send({
        cpf: "12345678901",
        currentPassword: "Current123!",
        newPassword: "Abcdefgh!i",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("número");
    expect(memory.updates).toHaveLength(0);
  });

  it("bloqueia senha sem símbolo no link de definição e não grava", async () => {
    const response = await request(app)
      .post("/area-paciente/definir-senha")
      .send({ token: "token-sintetico", newPassword: "A123456789" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("caractere especial");
    expect(memory.updates).toHaveLength(0);
  });
});
