import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), empresa: 5, owner: false }));
vi.mock("@workspace/db", () => ({ db: { execute: mocks.execute } }));
// Identidade sintética limitada ao teste; a aplicação conserva sua autenticação real.
vi.mock("../routes/collaborator", () => ({
  requireCollaborator(req: any, res: any, next: any) {
    if (!req.headers["x-test-access"]) return res.status(401).json({ error: "Não autenticado" });
    req.tenantContext = { empresaId: mocks.empresa, isPlatformOwner: mocks.owner };
    next();
  },
}));
import router from "../routes/agenda-google-compromissos";

const app = express();
app.use(router);
const event = {
  id: 1, titulo: "Título sintético privado", inicio: "2026-09-02T13:00:00Z",
  fim: "2026-09-02T14:00:00Z", diaInteiro: false, origem: "google",
  recorrencia: null, agenda: "Agenda sintética", cor: "#123456", papel: "pessoal",
};
describe("consulta autenticada de compromissos importados", () => {
  beforeEach(() => {
    mocks.empresa = 5;
    mocks.owner = false;
    mocks.execute.mockReset().mockResolvedValue({ rows: [event] });
  });
  it("recusa leitura sem autenticação", async () => {
    expect((await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30")).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("recusa data inexistente e período excessivo", async () => {
    for (const query of ["de=2026-02-30&ate=2026-03-01", "de=2026-01-01&ate=2026-12-31"]) {
      expect((await request(app).get(`/agenda/google-compromissos?${query}`).set("x-test-access", "1")).status).toBe(400);
    }
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("oculta título pessoal para colaborador comum", async () => {
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.status).toBe(200);
    expect(response.body.eventos[0].titulo).toBe("Ocupado — compromisso pessoal");
    expect(JSON.stringify(response.body)).not.toContain(event.titulo);
  });
  it("proprietário pode consultar título, mas consulta continua escopada pela empresa", async () => {
    mocks.owner = true;
    mocks.empresa = 12345;
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.body.eventos[0].titulo).toBe(event.titulo);
    const { sql, params } = (await import("drizzle-orm/pg-core")).PgDialect.prototype.sqlToQuery.call(
      new (await import("drizzle-orm/pg-core")).PgDialect(), mocks.execute.mock.calls[0][0],
    );
    expect(sql).toContain("l.empresa_id");
    expect(sql).toContain("l.active = 'true'");
    expect(params).toContain(12345);
  });
  it("falha de banco é erro explícito, nunca lista vazia", async () => {
    mocks.execute.mockRejectedValue(new Error("Falha sintética"));
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("eventos");
  });
});
