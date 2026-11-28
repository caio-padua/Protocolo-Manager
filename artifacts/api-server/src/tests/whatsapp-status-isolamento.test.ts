import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({ wheres: [] as unknown[] }));
vi.mock("../routes/collaborator", () => ({ requireCollaborator: (req: any, res: any, next: any) => req.headers["x-sem-sessao"] ? res.status(401).json({ error: "x" }) : next() }));
vi.mock("@workspace/db", () => {
  const q: any = { from: () => q, leftJoin: () => q, where: (w: unknown) => { h.wheres.push(w); return q; }, orderBy: () => q, groupBy: () => q, limit: async () => [], then: (r: any) => r([]) };
  return { db: { select: () => q }, whatsappMensagensLogTable: new Proxy({}, { get: () => ({}) }), lembreteEnviosTable: new Proxy({}, { get: () => ({}) }), lembretesPrescricaoTable: new Proxy({}, { get: () => ({}) }), clientsTable: {} };
});
vi.mock("../lib/lembrete-periodo", () => ({ executarLembretesPeriodo: vi.fn() }));
import router from "../routes/whatsapp-status";

const app = (empresa: number | null) => { const a = express(); a.use((req: any, _r, n) => { req.tenantContext = empresa ? { authenticated: true, empresaId: empresa } : { authenticated: false }; n(); }); a.use("/api", router); return a; };

describe("isolamento multiclínica das rotas de WhatsApp e lembretes", () => {
  it.each(["/api/whatsapp/messages", "/api/whatsapp/stats", "/api/lembretes/failures", "/api/lembretes/prescricoes"])("%s recusa sessão sem clínica", async (u) => {
    expect((await request(app(null)).get(u)).status).toBe(401);
  });
  it.each(["/api/whatsapp/messages", "/api/whatsapp/stats", "/api/lembretes/failures", "/api/lembretes/prescricoes"])("%s filtra pela clínica da sessão", async (u) => {
    h.wheres.length = 0;
    expect((await request(app(7)).get(u)).status).toBe(200);
    expect(h.wheres.length).toBe(1);
  });
  it("exige colaborador autenticado", async () => {
    expect((await request(app(7)).get("/api/whatsapp/stats").set("x-sem-sessao", "1")).status).toBe(401);
  });
});
