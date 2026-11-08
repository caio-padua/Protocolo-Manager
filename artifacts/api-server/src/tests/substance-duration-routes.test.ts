import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

// Armazenamento sintético em memória: nenhum cadastro ou banco real é usado.
const state = vi.hoisted(() => ({
  row: null as null | Record<string, any>,
}));

vi.mock("../lib/secure-settings", () => ({
  getSetting: vi.fn(async (key: string) => ({
    "agenda.duracao.intramuscular.segundos": "150",
    "agenda.duracao.subcutanea.segundos": "150",
    "agenda.duracao.implante.segundos": "1800",
  } as Record<string, string>)[key] ?? null),
}));

vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.header("x-test-session") !== "active") {
      res.status(401).json({ error: "Acesso restrito" });
      return;
    }
    req.collaborator = { professionalId: 1, role: "synthetic", credentialVersion: 0 };
    next();
  },
}));

vi.mock("@workspace/db", () => {
  const substancesTable = { id: "substance-id" };
  const substanceBlendComponentsTable = { substanceId: "component-substance-id" };
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const result = table === substancesTable && state.row ? [state.row] : [];
        return {
          where: async () => result,
          then: (resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject),
        };
      },
    }),
    insert: () => ({
      values: (data: Record<string, unknown>) => ({
        returning: async () => {
          state.row = {
            id: 1,
            durationMinutes: 30,
            preciseDurationSeconds: null,
            createdAt: new Date("2030-01-01T12:00:00Z"),
            ...data,
          };
          return [state.row];
        },
      }),
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (!state.row) return [];
            Object.assign(state.row, data);
            return [state.row];
          },
        }),
      }),
    }),
  };
  return { db, substancesTable, substanceBlendComponentsTable };
});

import substancesRouter from "../routes/substances";

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.tenantContext = {
    authenticated: req.header("x-test-session") === "active",
    professionalId: 1,
    isPlatformOwner: req.header("x-test-owner") === "yes",
    empresaId: 1,
    perfilPlataforma: "platform_owner",
  };
  next();
});
app.use(substancesRouter);
const base = { name: "Substância sintética", category: "Teste", color: "#123456", stockQuantity: 0 };
const owner = { "x-test-session": "active", "x-test-owner": "yes" };

beforeEach(() => { state.row = null; });

describe("Cadastro de duração com armazenamento sintético", () => {
  it("guarda participação médica explícita, preserva omissão e recusa valores inválidos", async () => {
    const created = await request(app).post("/substances").set(owner).send({
      ...base, durationMinutes: 2.5, doctorParticipation: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.doctorParticipation).toBe(true);
    const omitted = await request(app).put("/substances/1").set(owner).send({ ...base, durationMinutes: 2.5 });
    expect(omitted.body.doctorParticipation).toBe(true);
    const noDoctor = await request(app).patch("/substances/1").set(owner).send({ doctorParticipation: false });
    expect(noDoctor.body.doctorParticipation).toBe(false);
    const invalid = await request(app).patch("/substances/1").set(owner).send({ doctorParticipation: "não" });
    expect(invalid.status).toBe(400);
    expect(state.row?.doctorParticipation).toBe(false);
    const unset = await request(app).put("/substances/1").set(owner).send({
      ...base, durationMinutes: 2.5, doctorParticipation: null,
    });
    expect(unset.body.doctorParticipation).toBeNull();
    const unauthorized = await request(app).patch("/substances/1").send({ doctorParticipation: true });
    expect(unauthorized.status).toBe(401);
    expect(state.row?.doctorParticipation).toBeNull();
  });

  it("cria com padrão configurado e devolve dois minutos e meio na lista", async () => {
    const created = await request(app).post("/substances").set(owner).send({ ...base, procedureType: "im" });
    expect(created.status).toBe(201);
    expect(created.body.durationMinutes).toBe(2.5);
    expect(state.row?.preciseDurationSeconds).toBe(150);
    const list = await request(app).get("/substances");
    expect(list.status).toBe(200);
    expect(list.body[0].durationMinutes).toBe(2.5);
  });

  it("salva a fração na edição e não sobrescreve o campo antigo", async () => {
    await request(app).post("/substances").set(owner).send({ ...base, procedureType: "implant" });
    const updated = await request(app).put("/substances/1").set(owner).send({ ...base, durationMinutes: 2.5 });
    expect(updated.status).toBe(200);
    expect(updated.body.durationMinutes).toBe(2.5);
    expect(state.row?.durationMinutes).toBe(30);
    expect(state.row?.preciseDurationSeconds).toBe(150);
    expect((await request(app).get("/substances")).body[0].durationMinutes).toBe(2.5);
  });

  it("aceita alteração parcial precisa e recusa valores inválidos sem gravar", async () => {
    await request(app).post("/substances").set(owner).send({ ...base, durationMinutes: 30 });
    expect((await request(app).patch("/substances/1").set(owner).send({ durationMinutes: 2.5 })).body.durationMinutes).toBe(2.5);
    for (const invalid of [0, -1, 0.001, "2.5", null]) {
      const response = await request(app).patch("/substances/1").set(owner).send({ durationMinutes: invalid });
      expect(response.status).toBe(400);
      expect(state.row?.preciseDurationSeconds).toBe(150);
    }
  });

  it("recusa alterações sem sessão e sem autoridade global", async () => {
    expect((await request(app).post("/substances").send(base)).status).toBe(401);
    expect((await request(app).post("/substances").set("x-test-session", "active").send(base)).status).toBe(403);
    expect(state.row).toBeNull();
    await request(app).post("/substances").set(owner).send({ ...base, durationMinutes: 30 });
    expect((await request(app).patch("/substances/1").send({ durationMinutes: 2.5 })).status).toBe(401);
    expect((await request(app).patch("/substances/1").set("x-test-session", "active").send({ durationMinutes: 2.5 })).status).toBe(403);
    expect(state.row?.preciseDurationSeconds).toBe(1800);
  });
});
