import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  matrix: null as unknown,
  matrixError: false,
  handlerCalls: 0,
}));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    select: () => ({ from: () => {
      const rows = state.rows.shift() ?? [];
      const chain = { where: () => chain, limit: async () => rows };
      return chain;
    } }),
  },
}));
vi.mock("../lib/secure-settings", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/secure-settings")>(),
  getJsonSetting: async () => {
    if (state.matrixError) throw new Error("banco indisponível");
    return state.matrix;
  },
}));

import { protectCurationMutation } from "../lib/exam-curation-access";
import { createCollaboratorToken } from "../lib/collaborator-auth";

const app = express().use(protectCurationMutation).use((_req, res) => {
  state.handlerCalls += 1;
  res.status(204).end();
});
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: "falha" });
});
const token = () => createCollaboratorToken({ professionalId: 41, role: "administrador" });
const sessao = { id: 41, role: "medico", active: true, credentialVersion: 0 };
const actor = { active: true, owner: false, category: "medico" };

beforeEach(() => {
  state.rows = [];
  state.matrix = null;
  state.matrixError = false;
  state.handlerCalls = 0;
});

describe("autorização da curadoria de exames", () => {
  it.each([
    ["put", "/exames-lab/faixas"],
    ["put", "/exames-lab/catalogo-faixas"],
    ["put", "/exames-lab/catalogo-faixas/aliases"],
    ["put", "/exames-lab/catalogo-faixas/unidades"],
    ["put", "/exames-lab/catalogo/renomear"],
    ["post", "/exames-lab/triagem/backfill"],
    ["post", "/exames-lab/triagem/curadoria"],
    ["post", "/exames-lab/triagem/4/resolver"],
    ["post", "/exames-lab/exames/a/ignorar"],
    ["post", "/exames-lab/exames/a/restaurar"],
    ["post", "/exames-lab/exames/englobar"],
    ["post", "/exames-lab/exames/transferir"],
    ["post", "/exames-lab/reassignments/4/desfazer"],
  ] as const)("recusa escrita anônima: %s %s", async (method, path) => {
    const response = await request(app)[method](path);
    expect(response.status).toBe(401);
    expect(state.handlerCalls).toBe(0);
  });

  it("autoriza a pessoa proprietária com sessão válida", async () => {
    state.rows = [[sessao], [{ ...actor, owner: true }]];
    expect((await request(app).put("/exames-lab/faixas").set("Authorization", `Bearer ${token()}`)).status).toBe(204);
    expect(state.handlerCalls).toBe(1);
  });

  it("autoriza categoria expressamente habilitada", async () => {
    state.rows = [[sessao], [actor]];
    state.matrix = { exames_faixas: { medico: true } };
    expect((await request(app).put("/exames-lab/faixas").set("Authorization", `Bearer ${token()}`)).status).toBe(204);
  });

  it("não permite elevação por cargo do token nem matriz ausente", async () => {
    state.rows = [[sessao], [{ ...actor, category: "enfermagem" }]];
    state.matrix = { exames_faixas: { enfermagem: false } };
    expect((await request(app).put("/exames-lab/faixas").set("Authorization", `Bearer ${token()}`)).status).toBe(403);
    state.rows = [[sessao], [actor]];
    state.matrix = null;
    expect((await request(app).put("/exames-lab/faixas").set("Authorization", `Bearer ${token()}`)).status).toBe(403);
    expect(state.handlerCalls).toBe(0);
  });

  it("recusa sessão revogada e falha fechada se a matriz falhar", async () => {
    state.rows = [[{ ...sessao, credentialVersion: 1 }]];
    expect((await request(app).put("/exames-lab/faixas").set("Authorization", `Bearer ${token()}`)).status).toBe(401);
    state.rows = [[sessao], [actor]];
    state.matrixError = true;
    expect((await request(app).put("/exames-lab/faixas").set("Authorization", `Bearer ${token()}`)).status).toBe(500);
    expect(state.handlerCalls).toBe(0);
  });

  it("não intercepta leituras nem rotas não pertencentes à curadoria", async () => {
    expect((await request(app).get("/exames-lab/faixas")).status).toBe(204);
    expect((await request(app).post("/exames-lab/documento/1/reextrair")).status).toBe(204);
  });
});
