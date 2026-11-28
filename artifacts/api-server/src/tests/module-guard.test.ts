import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const h = vi.hoisted(() => ({ linha: [] as unknown[], erro: false }));
vi.mock("@workspace/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => { if (h.erro) throw new Error("db fora"); return h.linha; } }) }) }) },
}));
vi.mock("@workspace/db/schema", () => ({ empresasTable: { modulosAtivos: "m", id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
import { moduleGuard } from "../middleware/moduleGuard";
import { decidirAcesso } from "../lib/papeis-acesso";

function appCom(ctx: Record<string, unknown> | undefined, perfil?: string) {
  const a = express();
  a.use((req, _res, next) => { (req as any).tenantContext = ctx; (req as any).perfil = perfil; (req as any).log = { error: () => {} }; next(); });
  a.get("/exames", moduleGuard("exames_lab"), (_req, res) => res.json({ ok: true }));
  return a;
}
beforeEach(() => { h.linha = []; h.erro = false; });

describe("moduleGuard — acesso direto à API", () => {
  it("clínica SEM licença (módulo false): 403", async () => {
    h.linha = [{ modulosAtivos: { exames_lab: false, agenda: true } }];
    const r = await request(appCom({ empresaId: 2 })).get("/exames");
    expect(r.status).toBe(403); expect(r.body.modulo).toBe("exames_lab");
  });
  it("clínica COM licença: 200", async () => {
    h.linha = [{ modulosAtivos: { exames_lab: true } }];
    expect((await request(appCom({ empresaId: 1 })).get("/exames")).status).toBe(200);
  });
  it("licença de um módulo não abre outro", async () => {
    h.linha = [{ modulosAtivos: { agenda: true, exames_lab: false } }];
    expect((await request(appCom({ empresaId: 1 })).get("/exames")).status).toBe(403);
  });
  it("dono da plataforma nunca é bloqueado", async () => {
    h.linha = [{ modulosAtivos: { exames_lab: false } }];
    expect((await request(appCom({ isPlatformOwner: true })).get("/exames")).status).toBe(200);
  });
  it("sem contexto: 401; empresa inexistente: 403", async () => {
    expect((await request(appCom(undefined)).get("/exames")).status).toBe(401);
    h.linha = [];
    expect((await request(appCom({ empresaId: 99 })).get("/exames")).status).toBe(403);
  });
  it("falha ao ler a licença NÃO libera: 503 (fail-closed)", async () => {
    h.erro = true;
    const r = await request(appCom({ empresaId: 1 })).get("/exames");
    expect(r.status).toBe(503); expect(r.body.ok).toBeUndefined();
  });
  it("clínica legada sem configuração continua liberada (compatibilidade documentada)", async () => {
    h.linha = [{ modulosAtivos: {} }];
    expect((await request(appCom({ empresaId: 3 })).get("/exames")).status).toBe(200);
  });
});

describe("perfil sem permissão: licença não substitui papel", () => {
  const base = { path: "/exames-lab/lista", metodo: "GET", autenticado: true, donoPlataforma: false };
  const papeis = (o: Partial<Record<"admin" | "doctor" | "nurse" | "reception" | "finance", boolean>>) =>
    ({ admin: false, doctor: false, nurse: false, reception: false, finance: false, ...o });
  it("recepção e financeiro são negados (403) em exames, mesmo que a clínica tenha o módulo", () => {
    for (const p of [papeis({ reception: true }), papeis({ finance: true })]) {
      const d = decidirAcesso({ ...base, papeis: p });
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.status).toBe(403);
    }
  });
  it("médico e enfermagem passam pelo papel; sem login é 401", () => {
    expect(decidirAcesso({ ...base, papeis: papeis({ doctor: true }) }).ok).toBe(true);
    expect(decidirAcesso({ ...base, papeis: papeis({ nurse: true }) }).ok).toBe(true);
    const d = decidirAcesso({ ...base, autenticado: false, papeis: null });
    expect(d.ok === false && d.status).toBe(401);
  });
  it("papel e licença são camadas separadas: médico de clínica sem licença é negado pelo módulo", async () => {
    h.linha = [{ modulosAtivos: { exames_lab: false } }];
    expect(decidirAcesso({ ...base, papeis: papeis({ doctor: true }) }).ok).toBe(true); // papel ok
    expect((await request(appCom({ empresaId: 2 })).get("/exames")).status).toBe(403);   // licença nega
  });
});
