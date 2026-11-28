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
      .mockResolvedValueOnce({ rows: [] }) // compromissos das agendas sem local
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
    expect(mocks.execute.mock.calls).toHaveLength(3);
    for (const call of [mocks.execute.mock.calls[0], mocks.execute.mock.calls[2]]) {
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
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [event] }).mockResolvedValueOnce({ rows: [] }).mockRejectedValueOnce(new Error("Falha sintética"));
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("eventos");
  });
  it("mantém agendas distintas com nomes iguais e agendas sem eventos", async () => {
    mocks.execute.mockReset()
      .mockResolvedValueOnce({ rows: [{ ...event, papel: "local" }] })
      .mockResolvedValueOnce({ rows: [] })
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

describe("agendas sem local (Home Care, Outro local) na mesma consulta", () => {
  const recurso = {
    id: -9, titulo: "Visita sintética", inicio: "2026-09-02T15:00:00Z", fim: "2026-09-02T16:00:00Z", diaInteiro: false,
    origem: "google", recorrencia: null, agenda: "AGENDA HOME CARE", agendaId: -27, agendaRecursoId: 27, cor: "#7cb342", papel: null,
  };
  beforeEach(() => { mocks.empresa = 5; mocks.owner = false; });
  it("junta compromissos das duas origens com id negativo próprio e informa a agenda de atendimento", async () => {
    mocks.execute.mockReset()
      .mockResolvedValueOnce({ rows: [{ ...event, papel: "local", agendaRecursoId: 22 }] })
      .mockResolvedValueOnce({ rows: [recurso] })
      .mockResolvedValueOnce({ rows: [
        { id: 42, agendaRecursoId: 22, nome: "Agenda sintética", cor: "#123456" },
        { id: -27, agendaRecursoId: 27, nome: "AGENDA HOME CARE", cor: "#7cb342" },
        { id: 30, agendaRecursoId: null, nome: "AGENDA GERAL", cor: "#9aa0a6" },
      ] });
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(response.status).toBe(200);
    expect(response.body.eventos.map((e: { agendaId: number }) => e.agendaId)).toEqual([42, -27]);
    expect(response.body.eventos.map((e: { agendaRecursoId: number | null }) => e.agendaRecursoId)).toEqual([22, 27]);
    expect(response.body.agendas.map((a: { agendaRecursoId: number | null }) => a.agendaRecursoId)).toEqual([22, 27, null]);
    expect(new Set(response.body.eventos.map((e: { id: string }) => e.id)).size).toBe(2);
  });
  it("as três consultas ficam na empresa, descartam o eco do que o sistema enviou e só leem agendas sem local", async () => {
    mocks.execute.mockReset().mockResolvedValue({ rows: [] });
    await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const [locais, recursos, calendarios] = mocks.execute.mock.calls.map((c) => new PgDialect().sqlToQuery(c[0]));
    for (const consulta of [locais, recursos, calendarios]) expect(consulta.params).toContain(5);
    for (const consulta of [locais, recursos]) {
      expect(consulta.sql).toContain("FROM sessions s");
      expect(consulta.sql).toContain("s.google_event_id");
      expect(consulta.sql).toContain("s.google_sync_pending_event_id");
    }
    expect(recursos.sql).toContain("r.location_id IS NULL");
    expect(recursos.sql).toContain("r.active");
    expect(calendarios.sql).toContain("UNION ALL");
  });
});

describe("descrição importada de compromisso selecionado", () => {
  const path = "/agenda/google-compromissos/1/descricao?inicio=2026-09-02T13%3A00%3A00.000Z";
  const withDescription = { ...event, descricao: "Procedimentos:\nAplicação sintética\n[DISP] Substância fictícia" };
  beforeEach(() => {
    mocks.empresa = 5;
    mocks.owner = true;
    mocks.execute.mockReset().mockResolvedValue({ rows: [withDescription] });
  });
  it("nega colaborador sem privilégio antes da consulta", async () => {
    mocks.owner = false;
    expect((await request(app).get(path).set("x-test-access", "1")).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("reusa a descrição exata e limita a consulta à empresa", async () => {
    const response = await request(app).get(path).set("x-test-access", "1");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.descricao).toBe(withDescription.descricao);
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.sql).toContain("l.empresa_id");
    expect(query.sql).toContain("l.active = 'true'");
    expect(query.params).toContain(5);
    expect(query.params).toContain(1);
  });
  it("não expõe texto na listagem, nem quando o banco o retorna", async () => {
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [withDescription] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const response = await request(app).get("/agenda/google-compromissos?de=2026-09-01&ate=2026-09-30").set("x-test-access", "1");
    expect(JSON.stringify(response.body)).not.toContain(withDescription.descricao);
  });
  it("recusa outra ocorrência e data anterior ao corte", async () => {
    for (const inicio of ["2026-09-03T13:00:00.000Z", "2026-08-31T13:00:00.000Z"]) {
      const response = await request(app).get(`/agenda/google-compromissos/1/descricao?inicio=${encodeURIComponent(inicio)}`).set("x-test-access", "1");
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain(withDescription.descricao);
    }
  });
  it("valida a ocorrência de um compromisso recorrente", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ ...withDescription, origem: "google_recorrente",
      recorrencia: JSON.stringify({ version: 1, start: event.inicio, end: event.fim,
        lines: ["RRULE:FREQ=WEEKLY;COUNT=4"], excluded: [] }) }] });
    const response = await request(app).get("/agenda/google-compromissos/1/descricao?inicio=2026-09-09T13%3A00%3A00.000Z").set("x-test-access", "1");
    expect(response.status).toBe(200);
    expect(response.body.descricao).toBe(withDescription.descricao);
  });
  it("não mostra uma ocorrência excluída de uma repetição", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ ...withDescription, origem: "google_recorrente",
      recorrencia: JSON.stringify({ version: 1, start: event.inicio, end: event.fim,
        lines: ["RRULE:FREQ=WEEKLY;COUNT=4"], excluded: ["2026-09-09T13:00:00.000Z"] }) }] });
    const response = await request(app).get("/agenda/google-compromissos/1/descricao?inicio=2026-09-09T13%3A00%3A00.000Z").set("x-test-access", "1");
    expect(response.status).toBe(404);
  });
  it("distingue descrição ausente de erro de banco", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ ...event, descricao: null }] });
    expect((await request(app).get(path).set("x-test-access", "1")).body).toEqual({ descricao: null });
    mocks.execute.mockRejectedValueOnce(new Error("falha sintética"));
    const response = await request(app).get(path).set("x-test-access", "1");
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty("descricao");
  });
});
