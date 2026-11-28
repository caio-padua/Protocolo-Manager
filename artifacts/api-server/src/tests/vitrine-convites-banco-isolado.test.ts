/** Pedidos de convite PAXMED em PostgreSQL descartável: protocolo, consulta protegida, decisão só do titular. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const auth = vi.hoisted(() => ({ owner: true, logado: true }));
vi.mock("../lib/clinical-access", () => ({ isPlatformOwner: vi.fn(async () => auth.owner) }));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, res: any, next: any) => {
    if (!auth.logado) { res.status(401).json({ error: "login" }); return; }
    req.collaborator = { professionalId: 7 }; next();
  },
}));
const pg = iniciarPgDescartavel();
process.env.DATABASE_URL = pg.url;
process.env.SESSION_SECRET = "x".repeat(32);
let app: express.Express; let pool: any;

beforeAll(async () => {
  pool = (await import("@workspace/db")).pool;
  app = express(); app.use(express.json());
  app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
  const mod = await import("../routes/vitrine-convites");
  zerar = mod.zerarLimitesConvites;
  app.use("/api", mod.default);
}, 90_000);
afterAll(async () => { try { await pool?.end(); } catch { /* */ } pg.parar(); });

let zerar: () => void;
const valido = { nome: "Maria Sintética Teste", email: "Maria.Teste@Exemplo.invalid", crm: "123456", uf: "sp", especialidade: "Endocrinologia", clinica: "", cidade: "São Paulo", mensagem: "", consentimento: true };

describe("convites PAXMED", () => {
  beforeEach(() => zerar());
  it("grava, devolve protocolo PXM-XXXX-XXXX e normaliza e-mail e UF", async () => {
    const r = await request(app).post("/api/vitrine-convites").send(valido);
    expect(r.status).toBe(201);
    expect(r.body.protocolo).toMatch(/^PXM-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const { rows } = await pool.query("SELECT email, uf, status, clinica FROM vitrine_convites WHERE protocolo=$1", [r.body.protocolo]);
    expect(rows[0]).toEqual({ email: "maria.teste@exemplo.invalid", uf: "SP", status: "recebida", clinica: null });
  });

  it("recusa dados inválidos e falta de consentimento, sem gravar", async () => {
    const antes = (await pool.query("SELECT count(*)::int n FROM vitrine_convites")).rows[0].n;
    for (const mudanca of [{ crm: "12a" }, { crm: "12" }, { uf: "S" }, { email: "x" }, { nome: "ab" }, { cidade: "" }, { especialidade: "" }, { consentimento: false }, { consentimento: "true" }]) {
      zerar();
      const r = await request(app).post("/api/vitrine-convites").send({ ...valido, ...mudanca });
      expect(r.status, JSON.stringify(mudanca)).toBe(400);
    }
    expect((await pool.query("SELECT count(*)::int n FROM vitrine_convites")).rows[0].n).toBe(antes);
  });

  it("consulta exige protocolo E e-mail do mesmo pedido; outro e-mail não revela nada", async () => {
    const c = await request(app).post("/api/vitrine-convites").send({ ...valido, email: "ana@exemplo.invalid" });
    const ok = await request(app).post("/api/vitrine-convites/status").send({ protocolo: c.body.protocolo.toLowerCase(), email: "ANA@exemplo.invalid" });
    expect(ok.body).toMatchObject({ found: true, status: "recebida" });
    expect(Object.keys(ok.body).sort()).toEqual(["atualizadoEm", "criadoEm", "found", "status"]);
    const errado = await request(app).post("/api/vitrine-convites/status").send({ protocolo: c.body.protocolo, email: "outra@exemplo.invalid" });
    expect(errado.body).toEqual({ found: false });
    expect((await request(app).post("/api/vitrine-convites/status").send({ protocolo: "qualquer", email: "ana@exemplo.invalid" })).status).toBe(400);
  });

  it("lista e decisão: exigem login e titular; aprovar só muda o status", async () => {
    auth.logado = false;
    expect((await request(app).get("/api/vitrine-convites")).status).toBe(401);
    auth.logado = true; auth.owner = false;
    expect((await request(app).get("/api/vitrine-convites")).status).toBe(403);
    expect((await request(app).patch("/api/vitrine-convites/1/status").send({ status: "aprovada" })).status).toBe(403);
    auth.owner = true;
    const lista = await request(app).get("/api/vitrine-convites");
    expect(lista.status).toBe(200);
    const alvo = lista.body.convites[0];
    expect((await request(app).patch(`/api/vitrine-convites/${alvo.id}/status`).send({ status: "inventado" })).status).toBe(400);
    expect((await request(app).patch("/api/vitrine-convites/999999/status").send({ status: "aprovada" })).status).toBe(404);
    const tabelasAntes = (await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN ('professionals','payments','asaas_cobrancas')")).rows[0].n;
    expect((await request(app).patch(`/api/vitrine-convites/${alvo.id}/status`).send({ status: "aprovada" })).status).toBe(200);
    const filtrada = await request(app).get("/api/vitrine-convites?status=aprovada");
    expect(filtrada.body.convites.map((c: any) => c.id)).toContain(alvo.id);
    expect((await request(app).get("/api/vitrine-convites?status=xx")).status).toBe(400);
    const consulta = await request(app).post("/api/vitrine-convites/status").send({ protocolo: alvo.protocolo, email: alvo.email });
    expect(consulta.body.status).toBe("aprovada");
    expect((await pool.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN ('professionals','payments','asaas_cobrancas')")).rows[0].n).toBe(tabelasAntes);
  });

  it("limita envios por IP", async () => {
    let ultimo = 0;
    for (let i = 0; i < 8; i++) ultimo = (await request(app).post("/api/vitrine-convites").send({ ...valido, nome: "x" })).status;
    expect(ultimo).toBe(429);
  });
});
