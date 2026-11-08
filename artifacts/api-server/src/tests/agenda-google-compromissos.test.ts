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
  recorrencia: null, agenda: "Agenda sintética", agendaId: 42, cor: "#123456", papel: "pessoal",
};
describe("consulta autenticada de compromissos importados", () => {
  beforeEach(() => {
    mocks.empresa = 5;
    mocks.owner = false;
    mocks.execute.mockReset()
      .mockResolvedValueOnce({ rows: [event] })
      .mockResolvedValueOnce({ rows: [{ id: 42, nome: "Agenda sintética", cor: "#123456" }] });
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
    expect(response.body.eventos[0].agendaId).toBe(42);
    expect(response.body.agendas[0].id).toBe(42);
    expect(JSON.stringify(response.body)).not.toContain(event.titulo);
    const { PgDialect } = await import("drizzle-orm/pg-core");
    for (const call of mocks.execute.mock.calls) {
      const compiled = new PgDialect().sqlToQuery(call[0]);
      expect(compiled.sql).toContain("CASE WHEN l.agenda_papel = 'pessoal'");
      expect(compiled.params).toContain(false);
      expect(compiled.params).toContain(5);
    }
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
    mocks.execute.mockReset().mockRejectedValue(new Error("Falha sintética"));
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("eventos");
  });
  it("falha ao listar agendas também é erro explícito", async () => {
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [event] }).mockRejectedValueOnce(new Error("Falha sintética"));
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("eventos");
  });
  it("mantém agendas distintas com nomes iguais e agendas sem eventos", async () => {
    mocks.execute.mockReset()
      .mockResolvedValueOnce({ rows: [{ ...event, papel: "local" }] })
      .mockResolvedValueOnce({ rows: [
        { id: 42, nome: "Agenda sintética", cor: "#123456" },
        { id: 43, nome: "Agenda sintética", cor: "#123456" },
      ] });
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.status).toBe(200);
    expect(response.body.agendas.map((a: { id: number }) => a.id)).toEqual([42, 43]);
    expect(response.body.eventos[0].agendaId).toBe(42);
  });
});
