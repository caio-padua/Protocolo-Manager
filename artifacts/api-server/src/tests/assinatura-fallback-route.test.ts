import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Sessão sintética, sem gerar tokens nem contornar a autenticação da aplicação.
const state = vi.hoisted(() => ({ authenticated: false, owner: false, reenviar: vi.fn(), saude: vi.fn() }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!state.authenticated) return res.status(401).json({ error: "sessao_necessaria" });
    req.tenantContext = { authenticated: true, isPlatformOwner: state.owner };
    next();
  },
}));
vi.mock("../lib/assinatura/fallback", () => ({ reenviarFallbacks: state.reenviar, saudeFallback: state.saude }));
import router from "../routes/assinaturas-fallback";
const app = express();
app.use(express.json(), (req, _res, next) => { (req as any).log = { error: vi.fn() }; next(); });
app.use(router);
beforeEach(() => {
  state.authenticated = false; state.owner = false;
  state.reenviar.mockReset().mockResolvedValue({ reenviados: 1, falhas: 0, aguardandoReenvioReal: 0, bloqueados: 0 });
  state.saude.mockReset().mockResolvedValue({ aguardandoReenvioReal: 2, bloqueados: 1 });
});
describe("rotas de recuperação exclusivas do CEO", () => {
  it("recusa sessão ausente em leitura e escrita", async () => {
    expect((await request(app).get("/assinaturas/fallback/saude")).status).toBe(401);
    expect((await request(app).post("/assinaturas/fallback/reenviar").send({ confirmar: true })).status).toBe(401);
    expect(state.reenviar).not.toHaveBeenCalled();
  });
  it("colaborador de clínica não vê contagens nem dispara lote", async () => {
    state.authenticated = true;
    expect((await request(app).get("/assinaturas/fallback/saude")).status).toBe(403);
    expect((await request(app).post("/assinaturas/fallback/reenviar").send({ confirmar: true })).status).toBe(403);
    expect(state.saude).not.toHaveBeenCalled();
    expect(state.reenviar).not.toHaveBeenCalled();
  });
  it("CEO precisa confirmar explicitamente", async () => {
    state.authenticated = true; state.owner = true;
    for (const body of [{}, { confirmar: false }, { confirmar: "true" }]) {
      expect((await request(app).post("/assinaturas/fallback/reenviar").send(body)).status).toBe(400);
    }
    expect(state.reenviar).not.toHaveBeenCalled();
    expect((await request(app).post("/assinaturas/fallback/reenviar").send({ confirmar: true })).body.reenviados).toBe(1);
  });
  it("contagem real e falha indisponível, nunca zero inventado", async () => {
    state.authenticated = true; state.owner = true;
    expect((await request(app).get("/assinaturas/fallback/saude")).body).toEqual({ aguardandoReenvioReal: 2, bloqueados: 1 });
    state.saude.mockRejectedValue(new Error("database unavailable"));
    expect((await request(app).get("/assinaturas/fallback/saude")).status).toBe(503);
  });
});
