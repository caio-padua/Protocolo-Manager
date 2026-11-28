/**
 * SERVIDOR COMPLETO (src/app.ts real, com Basic Auth, CORS, limite de taxa, tenantContext, papéis) sobre PostgreSQL descartável.
 * Investiga o 403 histórico no teste de saúde: cobre as formas como um verificador de disponibilidade chega ao servidor
 * (sem credencial, HEAD, barra final, cabeçalhos de plataforma, Origin, credencial inválida) e prova que a saúde responde
 * simples e que as demais rotas continuam exigindo autenticação.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { subirServidorCompleto, ADMIN_USER, ADMIN_PASS } from "./helpers/servidor-completo";

vi.mock("../lib/sheets-dicionario", () => ({ sincronizarDicionarioSheets: vi.fn(async () => ({})) }));
vi.mock("../lib/seed-avatares", () => ({ runSeedAvatares: vi.fn(async () => ({})) }));

let s: Awaited<ReturnType<typeof subirServidorCompleto>>;
let tokSemClinica = "", tokClinicaA = "";
const SENHA = "Senha-Teste-9a!";
beforeAll(async () => {
  s = await subirServidorCompleto();
  const { hashPassword } = await import("../lib/collaborator-auth.js");
  await s.pool.query(`INSERT INTO empresas (id, nome, ativa, status, tipo) VALUES (5,'Clinica A Sintetica',true,'ATIVO','clinic')`);
  await s.pool.query(`INSERT INTO professionals (id,name,email,password_hash,registration_number,empresa_id) VALUES
    (31,'Sem Clinica','sem-clinica@teste.com',$1,'313131',NULL),(32,'Com Clinica','com-clinica@teste.com',$1,'323232',5)`, [hashPassword(SENHA)]);
  const login = async (email: string) => {
    const r = await request(s.app).post("/api/collaborator/login").send({ identifier: email, password: SENHA });
    if (r.status !== 200) throw new Error(`login ${email} ${r.status}`);
    return r.body.token as string;
  };
  tokSemClinica = await login("sem-clinica@teste.com");
  tokClinicaA = await login("com-clinica@teste.com");
}, 400_000);
afterAll(async () => { await s?.parar(); });

describe("saúde do servidor completo", () => {
  it("GET /api/healthz sem credencial: 200 simples e sem dados internos", async () => {
    const r = await request(s.app).get("/api/healthz");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: "ok" });
  });
  it("HEAD /api/healthz e barra final respondem 200", async () => {
    expect((await request(s.app).head("/api/healthz")).status).toBe(200);
    expect((await request(s.app).get("/api/healthz/")).status).toBe(200);
  });
  it("cabeçalhos típicos de plataforma (Host de verificação, agente) não causam bloqueio", async () => {
    const r = await request(s.app).get("/api/healthz").set("Host", "healthcheck.railway.app").set("User-Agent", "RailwayHealthCheck/1.0");
    expect(r.status).toBe(200);
  });
  it("credencial inválida (Basic ou Bearer) na saúde não vira 401 nem 403", async () => {
    expect((await request(s.app).get("/api/healthz").set("Authorization", "Bearer token-invalido")).status).toBe(200);
    expect((await request(s.app).get("/api/healthz").set("Authorization", "Basic aW52YWxpZG86aW52YWxpZG8=")).status).toBe(200);
  });
  it("CAUSA DO 403: sessão de profissional sem clínica ativa NÃO pode bloquear a verificação de saúde", async () => {
    // Prova de que a sessão é real: a mesma sessão é recusada (403) numa rota protegida.
    expect((await request(s.app).get("/api/clients").set("Authorization", `Bearer ${tokSemClinica}`)).status).toBe(403);
    for (const alvo of ["/api/healthz", "/api/health"]) {
      const r = await request(s.app).get(alvo).set("Authorization", `Bearer ${tokSemClinica}`);
      expect(r.status, alvo).toBe(200);
    }
  });
  it("clínica selecionada sem vínculo (cabeçalho ou query) também não bloqueia a saúde", async () => {
    expect((await request(s.app).get("/api/healthz").set("Authorization", `Bearer ${tokClinicaA}`).set("x-empresa-id", "999")).status).toBe(200);
    expect((await request(s.app).get("/api/healthz?empresaId=999").set("Authorization", `Bearer ${tokClinicaA}`)).status).toBe(200);
    // a mesma seleção continua recusada nas demais rotas
    expect((await request(s.app).get("/api/clients").set("Authorization", `Bearer ${tokClinicaA}`).set("x-empresa-id", "999")).status).toBe(403);
  });
  it("a resposta da saúde com sessão válida segue simples e sem dados internos", async () => {
    const r = await request(s.app).get("/api/healthz").set("Authorization", `Bearer ${tokClinicaA}`);
    expect(r.status).toBe(200); expect(r.body).toEqual({ status: "ok" });
  });
  it("/api/health responde 200 com resumo e sem segredo", async () => {
    const r = await request(s.app).get("/api/health");
    expect(r.status).toBe(200);
    const txt = JSON.stringify(r.body);
    expect(txt).not.toContain(ADMIN_PASS);
    expect(txt).not.toMatch(/postgres(ql)?:\/\//i);
  });
  it("Origin de navegador não permitida: o servidor recusa por CORS (não é o 403 da verificação sem Origin)", async () => {
    const r = await request(s.app).get("/api/healthz").set("Origin", "https://origem-estranha.invalid");
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
  it("a saúde pública NÃO abre as outras rotas: sem credencial 401, com Basic do perímetro passa do perímetro", async () => {
    expect((await request(s.app).get("/api/clients")).status).toBe(401);
    expect((await request(s.app).get("/api/clients").set("Authorization", "Bearer token-invalido")).status).toBe(401);
    const comBasic = await request(s.app).get("/api/clients").auth(ADMIN_USER, ADMIN_PASS);
    expect([401, 403]).toContain(comBasic.status); // perímetro sozinho não basta: precisa do token de colaborador
    expect((await request(s.app).get("/api/clients").auth(ADMIN_USER, "senha-errada")).status).toBe(401);
  });
});
