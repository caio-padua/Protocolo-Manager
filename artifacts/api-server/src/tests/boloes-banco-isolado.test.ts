/**
 * Meus Boloes em PostgreSQL descartavel: autenticacao, estado vazio, anti-IDOR, isolamento por clinica,
 * status honesto (sem comprovante nao ha registro), integridade, tipo falso e trilha de auditoria.
 * Todos os dados sao sinteticos; o armazenamento e simulado em memoria; nenhuma integracao externa.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({ owner: true, professionalId: 7 as number | null }));
vi.mock("../lib/clinical-access", () => ({ isPlatformOwner: vi.fn(async () => auth.owner) }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (auth.professionalId === null) return res.status(401).json({ error: "login" });
    req.collaborator = { professionalId: auth.professionalId };
    next();
  },
}));
const mem = vi.hoisted(() => ({ files: new Map<string, Buffer>() }));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    async savePrivateObject(k: string, b: Buffer) { mem.files.set(k, b); return k; }
    async readPrivateObject(k: string) { const b = mem.files.get(k); if (!b) throw new Error("ausente"); return b; }
    async deletePrivateObject(k: string) { mem.files.delete(k); }
  },
}));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any; let tok: (id: number) => string;

const PDF = Buffer.from("%PDF-1.4\n% recibo sintetico de teste\n%%EOF\n");
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const H = (id: number) => ({ Authorization: `Bearer ${tok(id)}` });
const count = async (q: string) => Number((await pool.query(q)).rows[0].n);

beforeAll(async () => {
  const db = await import("@workspace/db");
  pool = db.pool;
  await pool.query(`CREATE TABLE empresas (id serial primary key, nome text)`);
  await pool.query(`INSERT INTO empresas (nome) VALUES ('Clinica A'),('Clinica B')`);
  await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int, deleted_at timestamptz)`);
  // 1 e 2 na clinica A; 3 na clinica B; 4 sem participacao nenhuma
  await pool.query(`INSERT INTO clients (name, empresa_id) VALUES ('Sintetico 1',1),('Sintetico 2',1),('Sintetico 3',2),('Sintetico 4',1)`);
  await (await import("../lib/boloes")).ensureBoloesTables();
  await (await import("../lib/boloes")).ensureBoloesTables(); // idempotente
  tok = (await import("../lib/portal-token")).createPortalToken;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  app.use("/api", (await import("../routes/boloes")).default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

describe("meus boloes", () => {
  it("nasce vazio: nenhuma linha em nenhuma tabela e lista vazia honesta", async () => {
    for (const t of ["boloes_campanhas", "boloes_participacoes", "boloes_comprovantes", "boloes_auditoria"])
      expect(await count(`SELECT COUNT(*) n FROM ${t}`)).toBe(0);
    const r = await request(app).get("/api/area-paciente/boloes").set(H(4));
    expect(r.status).toBe(200);
    expect(r.body.participacoes).toEqual([]);
    expect(r.headers["cache-control"]).toMatch(/no-store/);
  });

  it("exige sessao do cliente; token na URL nao vale", async () => {
    expect((await request(app).get("/api/area-paciente/boloes")).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/boloes/comprovantes/1/download")).status).toBe(401);
    expect((await request(app).get(`/api/area-paciente/boloes?token=${tok(1)}`)).status).toBe(401);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/1/download?token=${tok(1)}`)).status).toBe(401);
    expect((await request(app).get("/api/area-paciente/boloes").set({ Authorization: "Bearer lixo" })).status).toBe(401);
  });

  let campA = 0; let campB = 0; let part1 = 0; let part2 = 0; let part3 = 0; let comp1 = 0;

  it("cadastro minimo e so do titular e valida a entrada", async () => {
    auth.professionalId = null;
    expect((await request(app).post("/api/boloes/campanhas").send({ empresaId: 1, nome: "X" })).status).toBe(401);
    auth.professionalId = 7; auth.owner = false;
    expect((await request(app).post("/api/boloes/campanhas").send({ empresaId: 1, nome: "X" })).status).toBe(403);
    auth.owner = true;
    expect((await request(app).post("/api/boloes/campanhas").send({ empresaId: 1, nome: "" })).status).toBe(400);
    expect((await request(app).post("/api/boloes/campanhas").send({ empresaId: 1, nome: "X", extra: 1 })).status).toBe(400);
    expect((await request(app).post("/api/boloes/campanhas").send({ empresaId: 99, nome: "X" })).status).toBe(404);
    campA = (await request(app).post("/api/boloes/campanhas").send({ empresaId: 1, nome: "Campanha sintetica A", concurso: "0001" })).body.id;
    campB = (await request(app).post("/api/boloes/campanhas").send({ empresaId: 2, nome: "Campanha sintetica B" })).body.id;
    expect(campA).toBeGreaterThan(0);
    // nao cruza clinica: cliente 3 (clinica B) na campanha A
    expect((await request(app).post("/api/boloes/participacoes").send({ campanhaId: campA, clientId: 3, cotas: 1 })).status).toBe(409);
    expect((await request(app).post("/api/boloes/participacoes").send({ campanhaId: campA, clientId: 1, cotas: 0 })).status).toBe(400);
    part1 = (await request(app).post("/api/boloes/participacoes").send({ campanhaId: campA, clientId: 1, cotas: 3 })).body.id;
    part2 = (await request(app).post("/api/boloes/participacoes").send({ campanhaId: campA, clientId: 2, cotas: 2 })).body.id;
    part3 = (await request(app).post("/api/boloes/participacoes").send({ campanhaId: campB, clientId: 3, cotas: 1 })).body.id;
    expect((await request(app).post("/api/boloes/participacoes").send({ campanhaId: campA, clientId: 1, cotas: 1 })).status).toBe(409);
  });

  it("sem comprovante NAO ha registro: status pendente e sem arquivo", async () => {
    // mesmo que a coluna diga 'registrada', sem comprovante ativo o cliente nao ve registro
    await pool.query(`UPDATE boloes_participacoes SET status='registrada', registrada_em=NOW() WHERE id=${part1}`);
    const r = await request(app).get("/api/area-paciente/boloes").set(H(1));
    expect(r.body.participacoes).toHaveLength(1);
    expect(r.body.participacoes[0]).toMatchObject({ cotas: 3, status: "pendente_registro", comprovante: null, registradaEm: null });
    await pool.query(`UPDATE boloes_participacoes SET status='pendente_registro', registrada_em=NULL WHERE id=${part1}`);
  });

  it("anexo exige confirmacao, conteudo real e tipo conferido pelos bytes", async () => {
    const url = `/api/boloes/participacoes/${part1}/comprovante`;
    expect((await request(app).post(url).attach("file", PDF, "r.pdf")).status).toBe(400); // sem confirmacao
    expect((await request(app).post(url).field("confirmoReciboCaixaReal", "true")).status).toBe(400); // sem arquivo
    expect((await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", Buffer.alloc(0), "v.pdf")).status).toBe(400);
    // HTML disfarcado de PDF
    expect((await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", HTML, { filename: "r.pdf", contentType: "application/pdf" })).status).toBe(422);
    auth.owner = false;
    expect((await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", PDF, "r.pdf")).status).toBe(403);
    auth.owner = true;
    expect(mem.files.size).toBe(0); // nada foi armazenado pelas recusas
    const ok = await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", PDF, "r.pdf");
    expect(ok.status).toBe(201);
    comp1 = ok.body.id;
    expect([...mem.files.keys()][0]).toMatch(/^boloes-comprovantes\/1\/[0-9a-f-]{36}$/);
    // segundo comprovante ativo nao duplica e nao deixa arquivo orfao
    const dup = await request(app).post(url).field("confirmoReciboCaixaReal", "true").attach("file", PDF, "r2.pdf");
    expect(dup.status).toBe(409);
    expect(mem.files.size).toBe(1);
  });

  it("cliente titular ve registro com comprovante; nada interno vaza", async () => {
    const r = await request(app).get("/api/area-paciente/boloes").set(H(1));
    const p = r.body.participacoes[0];
    expect(p.status).toBe("registrada");
    expect(p.comprovante).toMatchObject({ id: comp1, tipo: "pdf" });
    const txt = JSON.stringify(r.body);
    for (const proibido of ["storage_key", "storageKey", "sha256", "empresa", "boloes-comprovantes", "validado_por"]) expect(txt).not.toContain(proibido);
  });

  it("download autorizado entrega o arquivo real, sem cache e com auditoria", async () => {
    const r = await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1)).buffer(true).parse((res, cb) => {
      const c: Buffer[] = []; res.on("data", (d: Buffer) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c)));
    });
    expect(r.status).toBe(200);
    expect(Buffer.compare(r.body as Buffer, PDF)).toBe(0);
    expect(r.headers["content-type"]).toBe("application/pdf");
    expect(r.headers["content-disposition"]).toMatch(/^attachment; filename="comprovante-caixa-\d+\.pdf"$/);
    expect(r.headers["cache-control"]).toMatch(/no-store/);
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='download' AND resultado='ok' AND client_id=1 AND comprovante_id=${comp1}`)).toBe(1);
  });

  it("anti-IDOR: outro cliente (mesma clinica), cliente de outra clinica e id inventado recebem o mesmo 404", async () => {
    const corpos: unknown[] = [];
    for (const [cli, id] of [[2, comp1], [3, comp1], [4, comp1], [1, 99999], [1, "abc"], [1, "-1"], [1, "1e3"]] as const) {
      const r = await request(app).get(`/api/area-paciente/boloes/comprovantes/${id}/download`).set(H(cli));
      expect(r.status).toBe(404);
      corpos.push(r.body);
    }
    expect(new Set(corpos.map((c) => JSON.stringify(c))).size).toBe(1);
    // nenhum desses acessos entregou bytes e todos ficaram na trilha como negados
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='download' AND resultado='negado'`)).toBe(7);
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='download' AND resultado='negado' AND client_id=2 AND comprovante_id=${comp1}`)).toBe(1);
    // listas tambem nao cruzam
    expect((await request(app).get("/api/area-paciente/boloes").set(H(2))).body.participacoes.map((p: any) => p.id)).toEqual([part2]);
    expect((await request(app).get("/api/area-paciente/boloes").set(H(2))).body.participacoes[0].comprovante).toBeNull();
    expect((await request(app).get("/api/area-paciente/boloes").set(H(3))).body.participacoes.map((p: any) => p.id)).toEqual([part3]);
  });

  it("isolamento por clinica: cliente que mudou de clinica perde a visao e o download", async () => {
    await pool.query(`UPDATE clients SET empresa_id = 2 WHERE id = 1`);
    expect((await request(app).get("/api/area-paciente/boloes").set(H(1))).body.participacoes).toEqual([]);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1))).status).toBe(404);
    await pool.query(`UPDATE clients SET empresa_id = 1 WHERE id = 1`);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1))).status).toBe(200);
  });

  it("participacao cancelada e cliente excluido nao baixam", async () => {
    await pool.query(`UPDATE boloes_participacoes SET status='cancelada' WHERE id=${part1}`);
    const lista = (await request(app).get("/api/area-paciente/boloes").set(H(1))).body.participacoes[0];
    expect(lista).toMatchObject({ status: "cancelada", comprovante: null });
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1))).status).toBe(404);
    await pool.query(`UPDATE boloes_participacoes SET status='registrada' WHERE id=${part1}`);
    await pool.query(`UPDATE clients SET deleted_at = NOW() WHERE id = 1`);
    expect((await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1))).status).toBe(404);
    await pool.query(`UPDATE clients SET deleted_at = NULL WHERE id = 1`);
  });

  it("integridade: arquivo adulterado no armazenamento e recusado e auditado", async () => {
    const key = [...mem.files.keys()][0];
    const original = mem.files.get(key)!;
    mem.files.set(key, Buffer.from("%PDF-1.4\nADULTERADO\n"));
    const r = await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1));
    expect(r.status).toBe(409);
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='download' AND resultado='erro'`)).toBe(1);
    mem.files.set(key, original);
  });

  it("falha na trilha bloqueia a entrega (nao entrega sem registrar)", async () => {
    await pool.query(`ALTER TABLE boloes_auditoria RENAME TO boloes_auditoria_off`);
    const r = await request(app).get(`/api/area-paciente/boloes/comprovantes/${comp1}/download`).set(H(1));
    expect(r.status).toBe(500);
    expect(r.headers["content-type"]).toMatch(/json/);
    await pool.query(`ALTER TABLE boloes_auditoria_off RENAME TO boloes_auditoria`);
  });

  it("cadastros do titular tambem ficam na trilha", async () => {
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='campanha_criada'`)).toBe(2);
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='participacao_criada'`)).toBe(3);
    expect(await count(`SELECT COUNT(*) n FROM boloes_auditoria WHERE acao='comprovante_anexado' AND participacao_id=${part1}`)).toBe(1);
  });
});
