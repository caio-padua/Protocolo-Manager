import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  rows: [] as any[][],
  updates: [] as Record<string, unknown>[],
  updateReturnsRow: true,
  tenantCompanyId: 21,
}));

vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.rows.shift() ?? [],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return {
          where: () => ({
            returning: async () => state.updateReturnsRow ? [{ id: 501 }] : [],
          }),
        };
      },
    }),
  },
}));

import { createCollaboratorToken } from "../lib/collaborator-auth.js";
import examConferenceRouter from "../routes/exam-conference.js";

const professional = {
  id: 41,
  name: "Médico Sintético",
  role: "executor",
  category: "medico",
  professionalType: "medico",
  active: true,
  credentialVersion: 0,
  crm: "CRM/SP 12345",
  registrationNumber: null,
  registrationCouncil: "CRM",
};
const client = { id: 71, name: "Cliente Sintético", status: "active", empresaId: 21, locationId: 31 };
const location = { id: 31, name: "Clínica Sintética", empresaId: 21, active: "true" };
const document = { id: 501, clientId: 71, empresaId: 21, status: "recebido" };
const token = () => createCollaboratorToken({ professionalId: 41, role: "executor" });

const app = express()
  .use(express.json())
  .use((req: any, _res, next) => {
    req.tenantContext = {
      authenticated: true,
      professionalId: 41,
      empresaId: state.tenantCompanyId,
      isPlatformOwner: false,
    };
    next();
  })
  .use(examConferenceRouter);

function rowsForReview(
  phase: 1 | 2,
  options: { reviewer?: any; clientRow?: any; linked?: boolean; status?: string } = {},
) {
  state.rows = [
    [{ id: professional.id, role: professional.role, active: true, credentialVersion: 0 }],
    [{ ...document, status: options.status ?? (phase === 1 ? "recebido" : "conferido_1") }],
    [options.clientRow ?? client],
    [options.reviewer ?? professional],
    ...(phase === 2
      ? [
          [options.reviewer ?? professional],
          [options.clientRow ?? client],
          [location],
          [options.linked === false ? [] : [{ id: 1 }]].flat(),
        ]
      : []),
  ];
}

beforeEach(() => {
  state.rows = [];
  state.updates = [];
  state.updateReturnsRow = true;
  state.tenantCompanyId = 21;
});

describe("conferência de exames vinculada à identidade autenticada", () => {
  it("recusa uma sessão anônima antes de consultar ou alterar o documento", async () => {
    const response = await request(app).patch("/exames-lab/documentos/501/conferir").send({ fase: 1 });
    expect(response.status).toBe(401);
    expect(state.updates).toHaveLength(0);
  });

  it("usa a sessão e recusa um identificador de outra pessoa enviado no corpo", async () => {
    rowsForReview(1);
    const response = await request(app)
      .patch("/exames-lab/documentos/501/conferir")
      .set("Authorization", `Bearer ${token()}`)
      .send({ fase: 1, professionalId: 42 });
    expect(response.status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });

  it("mantém a conferência operacional na ordem atual e grava o profissional autenticado", async () => {
    rowsForReview(1, { reviewer: { ...professional, professionalType: "nao_medico", category: "administrativo" } });
    const response = await request(app)
      .patch("/exames-lab/documentos/501/conferir")
      .set("Authorization", `Bearer ${token()}`)
      .send({ fase: 1 });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("conferido_1");
    expect(state.updates[0]).toMatchObject({ conf1ProfessionalId: 41, status: "conferido_1" });
  });

  it("permite a conferência clínica somente para médico com CRM e vínculo da unidade", async () => {
    rowsForReview(2);
    const response = await request(app)
      .patch("/exames-lab/documentos/501/conferir")
      .set("Authorization", `Bearer ${token()}`)
      .send({ fase: 2 });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("conferido");
    expect(state.updates[0]).toMatchObject({ conf2ProfessionalId: 41, status: "conferido" });
  });

  it.each([
    ["profissional sem registro médico", { ...professional, professionalType: "nao_medico", category: "medico" }, true, 403],
    ["categoria não médica", { ...professional, category: "administrativo" }, true, 403],
    ["registro ausente", { ...professional, crm: null, registrationCouncil: null }, true, 422],
    ["sem vínculo à unidade", professional, false, 403],
  ])("recusa conferência clínica: %s", async (_label, reviewer, linked, expectedStatus) => {
    rowsForReview(2, { reviewer, linked });
    const response = await request(app)
      .patch("/exames-lab/documentos/501/conferir")
      .set("Authorization", `Bearer ${token()}`)
      .send({ fase: 2 });
    expect(response.status).toBe(expectedStatus);
    expect(state.updates).toHaveLength(0);
  });

  it("recusa empresa divergente e impede duas conferências concorrentes", async () => {
    rowsForReview(1);
    state.tenantCompanyId = 22;
    const wrongCompany = await request(app)
      .patch("/exames-lab/documentos/501/conferir")
      .set("Authorization", `Bearer ${token()}`)
      .send({ fase: 1 });
    expect(wrongCompany.status).toBe(403);
    expect(state.updates).toHaveLength(0);

    state.tenantCompanyId = 21;
    rowsForReview(1);
    state.updateReturnsRow = false;
    const raced = await request(app)
      .patch("/exames-lab/documentos/501/conferir")
      .set("Authorization", `Bearer ${token()}`)
      .send({ fase: 1 });
    expect(raced.status).toBe(409);
  });

  it("não permite pular a conferência operacional", async () => {
    rowsForReview(2, { status: "recebido" });
    const response = await request(app)
      .patch("/exames-lab/documentos/501/conferir")
      .set("Authorization", `Bearer ${token()}`)
      .send({ fase: 2 });
    expect(response.status).toBe(409);
    expect(state.updates).toHaveLength(0);
  });
});
