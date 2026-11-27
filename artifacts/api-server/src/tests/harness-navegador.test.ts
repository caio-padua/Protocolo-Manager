/**
 * Servidor de teste para o NAVEGADOR: roteadores REAIS (convite de médico, contatos e convites da vitrine) sobre PostgreSQL
 * descartável com dados sintéticos. Só liga com HARNESS_NAVEGADOR=1; fica de pé até existir /tmp/harness.stop.
 * Credenciais são fabricadas pelo próprio servidor de teste; nenhuma mensagem real é enviada.
 */
import { describe, expect, it, vi } from "vitest";
import express from "express";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { iniciarPgDescartavel } from "./helpers/pg-descartavel";

vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/clinical-access", () => ({ isPlatformOwner: vi.fn(async (id: number) => id === 1) }));
vi.mock("../routes/collaborator", async () => {
  const { verifyCollaboratorToken } = await import("../lib/collaborator-auth.js");
  return {
    requireCollaborator: (req: any, res: any, next: any) => {
      const a = String(req.headers.authorization ?? "");
      const c = a.startsWith("Bearer ") ? verifyCollaboratorToken(a.slice(7)) : null;
      if (!c) { res.status(401).json({ error: "Acesso restrito: faça login de colaborador" }); return; }
      req.collaborator = c; next();
    },
  };
});
vi.mock("../lib/professional-empresas", () => ({
  empresaIdsDoProfissional: vi.fn(async (id: number) => new Set(id === 7 ? [1] : [])),
}));

describe.skipIf(!process.env.HARNESS_NAVEGADOR)("harness navegador", () => {
  it("serve até /tmp/harness.stop", async () => {
    const pg = iniciarPgDescartavel();
    process.env.DATABASE_URL = pg.url;
    process.env.SESSION_SECRET = "x".repeat(32);
    const { pool } = await import("@workspace/db");
    await pool.query(`CREATE TABLE clients (id serial primary key, name text, empresa_id int)`);
    await pool.query(`CREATE TABLE empresas (id serial primary key, nome text, ativa boolean default true, status text default 'ATIVO', tipo text default 'clinic')`);
    await pool.query(`CREATE TABLE professionals (id serial primary key, name text, email text, secondary_email text, registration_number text, crm text)`);
    await pool.query(`CREATE TABLE paxcare_cofre_itens (id serial primary key, client_id int, tipo text, titulo text, data_ref date, notas text, arquivo text, criado_em timestamptz default now(), removido_em timestamptz)`);
    await pool.query(`INSERT INTO clients (name) VALUES ('Ana Sintetica'),('Beto Sintetico')`);
    await pool.query(`INSERT INTO empresas (nome) VALUES ('Clinica Sintetica 1'),('Clinica Sintetica 2')`);
    await pool.query(`INSERT INTO professionals (id,name,email,registration_number) VALUES (1,'CEO Sintetico','ceo@teste.com','111111'),(7,'Dr Sintetico','dr@teste.com','123456'),(8,'Dra Outra','outra@teste.com','999999')`);
    await pool.query(`INSERT INTO paxcare_cofre_itens (client_id,tipo,titulo,notas) VALUES (1,'historico','Historico da Ana','nota A'),(1,'exame_externo','Exame da Ana','nota B'),(1,'documento','Documento da Ana','nota C'),(2,'historico','Historico do Beto','segredo do Beto')`);
    const { createPortalToken } = await import("../lib/portal-token");
    const { createCollaboratorToken } = await import("../lib/collaborator-auth.js");
    const app = express(); app.use(express.json());
    app.use((req: any, _r, n) => { req.log = { error() {}, warn() {}, info() {} }; n(); });
    app.get("/api/__teste/token-paciente/:id", (req, res) => res.json({ token: createPortalToken(Number(req.params.id)) }));
    app.get("/api/__teste/token-colab/:id", (req, res) => res.json({ token: createCollaboratorToken({ professionalId: Number(req.params.id), role: "medico" }) }));
    app.get("/api/__teste/sql", async (req, res) => res.json((await pool.query(String(req.query.q))).rows));
    app.get("/api/collaborator/me", (req, res) => {
      const a = String(req.headers.authorization ?? "");
      res.json({ professional: { id: 0, name: "Sintetico", role: "medico" }, a: a.length > 0 });
    });
    app.use("/api", (await import("../routes/paxcare-convite-medico")).default);
    app.use("/api", (await import("../routes/vitrine-contatos")).default);
    app.use("/api", (await import("../routes/vitrine-convites")).default);
    const srv = app.listen(18999);
    rmSync("/tmp/harness.stop", { force: true });
    writeFileSync("/tmp/harness.ready", "1");
    while (!existsSync("/tmp/harness.stop")) await new Promise((r) => setTimeout(r, 500));
    srv.close(); await pool.end().catch(() => {}); pg.parar();
    expect(true).toBe(true);
  }, 3_600_000);
});
