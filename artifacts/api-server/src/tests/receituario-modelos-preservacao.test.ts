import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  config: { cor: "dourado" } as Record<string, unknown>,
  update: vi.fn(),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) =>
    req.get("Authorization") === "Bearer sessao-sintetica" ? next() : res.sendStatus(401),
}));
vi.mock("@workspace/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("../lib/receituario-motor.js", () => ({
  garantirTabelaModelos: async () => {},
  listarModelos: async () => [{ id: 3, config: state.config }],
  getModeloAtivo: async () => ({ id: 3, config: state.config }),
  atualizarModelo: async (_id: number, patch: { config?: Record<string, unknown> }) => {
    state.update(_id, patch);
    if (patch.config) state.config = patch.config;
  },
  criarModelo: vi.fn(),
  ativarModelo: vi.fn(),
  emitirReceituarioPdf: vi.fn(),
}));
import router from "../routes/receituario-modelos";
const app = express().use(express.json()).use(router);
const auth = { Authorization: "Bearer sessao-sintetica" };

beforeEach(() => { state.config = { cor: "dourado" }; state.update.mockClear(); });

it("exige acesso para consultar ou alterar as configurações", async () => {
  expect((await request(app).get("/receituario-modelos/ativo")).status).toBe(401);
  expect((await request(app).put("/receituario-modelos/3").send({ config: {} })).status).toBe(401);
  expect((await request(app).post("/receituario-modelos/3/ativar")).status).toBe(401);
  expect((await request(app).delete("/receituario-modelos/3")).status).toBe(401);
  expect(state.update).not.toHaveBeenCalled();
});

it("mantém o editor operacional e não exclui o modelo", async () => {
  const saved = await request(app).put("/receituario-modelos/3").set(auth).send({ config: { cor: "azul" } });
  expect(saved.status).toBe(200);
  expect((await request(app).get("/receituario-modelos/ativo").set(auth)).body.modelo.config).toEqual({ cor: "azul" });
  expect((await request(app).delete("/receituario-modelos/3").set(auth)).status).toBe(403);
  expect((await request(app).get("/receituario-modelos/ativo").set(auth)).body.modelo.config).toEqual({ cor: "azul" });
});
