import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const mock = vi.hoisted(() => ({
  identity: vi.fn(), execute: vi.fn(), catalog: [] as any[], rows: [] as any[], next: 1,
}));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: {
    execute: mock.execute,
    select: () => ({ from: () => ({ where: async () => mock.catalog }) }),
  },
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) =>
    req.get("Authorization") ? next() : res.status(401).json({ error: "Login obrigatório" }),
}));
vi.mock("../lib/clinical-emitter", async importOriginal => ({
  ...await importOriginal<any>(), resolveClinicalEmitter: mock.identity,
}));
import router from "../routes/exam-sets";
import { ClinicalIdentityError } from "../lib/clinical-emitter";
const app = express().use(express.json()).use("/api", router);
const auth = { Authorization: "Bearer synthetic-only" };
const endpoint = "/api/exam-sets/101";
const dialect = new PgDialect();
function identity(professionalId = 20, clinicId = 30, empresaId = 40) {
  mock.identity.mockResolvedValue({ professional: { id: professionalId }, clinic: { id: clinicId, empresaId } });
}
const exam = (id: number, ativo = true) => ({ id, nomeExame: `Exame ${id}`, codigoExame: `COD${id}`, ativo });
beforeEach(() => {
  vi.clearAllMocks(); mock.catalog = [exam(1), exam(2)]; mock.rows = []; mock.next = 1; identity();
  // Interpret parameterized SQL against an isolated in-memory store. Assertions
  // enforce all three owner predicates rather than trusting a mocked repository.
  mock.execute.mockImplementation(async statement => {
    const { sql, params } = dialect.sqlToQuery(statement);
    const owner = (row: any, start: number) => {
      expect(sql).toContain("professional_id =");
      expect(sql).toContain("location_id =");
      expect(sql).toContain("empresa_id =");
      return row.professional === params[start] && row.clinic === params[start + 1] && row.empresa === params[start + 2];
    };
    if (sql.includes("INSERT")) {
      const row = { id: mock.next++, professional: params[0], clinic: params[1], empresa: params[2],
        name: params[3], items: JSON.parse(params[4] as string), archived: false };
      mock.rows.push(row); return { rows: [row] };
    }
    if (sql.includes("UPDATE")) {
      const row = mock.rows.find(row => row.id === params[3] && owner(row, 4) && !row.archived);
      if (!row) return { rows: [] };
      Object.assign(row, { name: params[0], items: JSON.parse(params[1] as string), archived: params[2] });
      return { rows: [row] };
    }
    const detail = sql.includes("WHERE id =");
    return { rows: mock.rows.filter(row => (!detail || row.id === params[0]) && owner(row, detail ? 1 : 0)) };
  });
});
async function create(body = { name: "Cardiologia", examIds: [1, 2] }) {
  return request(app).post(endpoint).set(auth).send(body);
}
it("requires login for list, create, edit and archive", async () => {
  expect((await request(app).get(endpoint)).status).toBe(401);
  expect((await request(app).post(endpoint).send({})).status).toBe(401);
  expect((await request(app).patch(`${endpoint}/1`).send({ archived: true })).status).toBe(401);
  expect(mock.identity).not.toHaveBeenCalled(); expect(mock.execute).not.toHaveBeenCalled();
});
it("creates from catalogue identifiers, renames, edits, archives without deleting", async () => {
  const created = await create();
  expect(created.status).toBe(201);
  expect(created.body.items.map((item: any) => item.id)).toEqual([1, 2]);
  expect((await request(app).patch(`${endpoint}/1`).set(auth).send({ name: "Renomeado" })).body.name).toBe("Renomeado");
  const edited = await request(app).patch(`${endpoint}/1`).set(auth).send({ name: "Novo", examIds: [2] });
  expect(edited.body.items.map((item: any) => item.id)).toEqual([2]);
  expect((await request(app).patch(`${endpoint}/1`).set(auth).send({ archived: true })).body.archived).toBe(true);
  expect(mock.rows).toHaveLength(1);
  expect((await request(app).get(endpoint).set(auth)).body[0].archived).toBe(true);
  expect((await request(app).patch(`${endpoint}/1`).set(auth).send({ name: "Não" })).status).toBe(404);
});
it.each([
  ["professional", 21, 30, 40], ["clinic", 20, 31, 40], ["empresa", 20, 30, 41],
])("isolates listing, rename, edit and archive by %s even with known IDs", async (_, professional, clinic, empresa) => {
  await create();
  identity(professional as number, clinic as number, empresa as number);
  expect((await request(app).get(endpoint).set(auth)).body).toEqual([]);
  for (const payload of [{ name: "Intruso" }, { name: "Intruso", examIds: [2] }, { archived: true }]) {
    expect((await request(app).patch(`${endpoint}/1`).set(auth).send(payload)).status).toBe(404);
  }
  expect(mock.rows[0].name).toBe("Cardiologia"); expect(mock.rows[0].archived).toBe(false);
});
it("revalidates clinic membership and fails closed before touching saved sets", async () => {
  mock.identity.mockRejectedValue(new ClinicalIdentityError(403, "Clínica não autorizada"));
  expect((await request(app).get(endpoint).set(auth)).status).toBe(403);
  expect((await create()).status).toBe(403);
  expect((await request(app).patch(`${endpoint}/1`).set(auth).send({ archived: true })).status).toBe(403);
  expect(mock.execute).not.toHaveBeenCalled();
});
it("shows inactive and removed IDs without equivalence substitution, preserves snapshots on rename/edit", async () => {
  await create();
  mock.catalog = [exam(1, false), { ...exam(99), nomeExame: "Exame 2" }];
  const listed = await request(app).get(endpoint).set(auth);
  expect(listed.body[0].items.map((item: any) => [item.id, item.status, item.exam]))
    .toEqual([[1, "inactive", null], [2, "removed", null]]);
  const edited = await request(app).patch(`${endpoint}/1`).set(auth).send({ name: "Conservado", examIds: [1, 2] });
  expect(edited.status).toBe(200);
  expect(edited.body.items[1].name).toBe("Exame 2");
  expect((await request(app).patch(`${endpoint}/1`).set(auth).send({ name: "Retirado", examIds: [1] })).status).toBe(200);
});
it.each([
  { name: "", examIds: [1] }, { name: "   ", examIds: [1] },
  { name: "a", examIds: [] }, { name: "a", examIds: [1, 1] },
  { name: "a", examIds: [1.5] }, { name: "a", examIds: ["1"] },
  { name: "a", examIds: [1], professionalId: 99 },
  { name: "a", examIds: [1], clinicId: 99 },
  { name: "a", examIds: Array.from({ length: 101 }, (_, i) => i + 1) },
])("rejects invalid or forged input %j", async body => {
  expect((await create(body as any)).status).toBe(400);
  expect(mock.execute).not.toHaveBeenCalled();
});
it("rejects unavailable new IDs but permits removing saved unavailable items", async () => {
  mock.catalog = [exam(1, false)];
  expect((await create()).status).toBe(422);
  mock.catalog = [exam(1), exam(2)];
  await create();
  mock.catalog = [exam(1), exam(3, false)];
  expect((await request(app).patch(`${endpoint}/1`).set(auth).send({ name: "a", examIds: [1, 3] })).status).toBe(422);
  expect((await request(app).patch(`${endpoint}/1`).set(auth).send({ name: "a", examIds: [1] })).status).toBe(200);
});
it.each(["0", "-1", "1.5", "nope"])("rejects invalid path identifiers %s", async value => {
  expect((await request(app).get(`/api/exam-sets/${value}`).set(auth)).status).toBe(400);
  expect((await request(app).patch(`${endpoint}/${value}`).set(auth).send({ archived: true })).status).toBe(400);
});
it("does not touch emitted documents, patients or messaging", async () => {
  await create();
  await request(app).patch(`${endpoint}/1`).set(auth).send({ archived: true });
  const sqls = mock.execute.mock.calls.map(([statement]) => dialect.sqlToQuery(statement).sql);
  expect(sqls.every(statement => statement.includes("personal_exam_sets"))).toBe(true);
  expect(sqls.join(" ")).not.toMatch(/DELETE|exam_request_pdfs|clients|email|whatsapp/i);
});
