/** Kaizen P0 — PUT /settings/exames só CEO; toggle de validação não vale para o paciente. Nível MOCK, dados sintéticos. */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

let sessao: { authenticated: boolean; isPlatformOwner: boolean } | null = null;
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (q: any, s: any, n: () => void) => {
    if (!sessao) { s.status(401).json({ error: "Faça login" }); return; }
    q.tenantContext = sessao; n();
  },
}));
const gravados: Record<string, string> = {};
vi.mock("../lib/secure-settings", async (orig) => ({
  ...(await orig<object>()),
  getSetting: vi.fn(async (k: string) => gravados[k] ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { gravados[k] = v; }),
}));
import settingsRouter from "../routes/settings";

const app = () => { const a = express(); a.use(express.json()); a.use(settingsRouter); return a; };
beforeEach(() => { for (const k of Object.keys(gravados)) delete gravados[k]; sessao = null; });

describe("PUT /settings/exames — autorização no servidor", () => {
  it("sem sessão: 401 e nada gravado", async () => {
    const r = await request(app()).put("/settings/exames").send({ exigirValidacaoHumana: false });
    expect(r.status).toBe(401); expect(gravados).toEqual({});
  });
  it("colaborador comum: 403 e nada gravado", async () => {
    sessao = { authenticated: true, isPlatformOwner: false };
    const r = await request(app()).put("/settings/exames").send({ exigirValidacaoHumana: false });
    expect(r.status).toBe(403); expect(gravados).toEqual({});
  });
  it("CEO: 200 e grava", async () => {
    sessao = { authenticated: true, isPlatformOwner: true };
    const r = await request(app()).put("/settings/exames").send({ exigirValidacaoHumana: false });
    expect(r.status).toBe(200); expect(gravados["exames.exigirValidacaoHumana"]).toBe("false");
  });
  it("GET continua aberto ao colaborador autenticado", async () => {
    sessao = { authenticated: true, isPlatformOwner: false };
    const r = await request(app()).get("/settings/exames");
    expect(r.status).toBe(200); expect(r.body.exigirValidacaoHumana).toBe(true);
  });
});
