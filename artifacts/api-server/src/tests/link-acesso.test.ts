import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
const q = vi.hoisted(() => ({ rows: [] as unknown[][] }));
vi.mock("@workspace/db", () => ({ pool: { query: async (_s: string, p?: unknown[]) => { if (p) q.rows.push(p); return { rows: [] }; } } }));
vi.mock("../lib/logger.js", () => ({ logger: { error: () => {} } }));
import { lerTokenDeLink, protegerRespostaLink, auditarAcessoLink, excedeuLimiteLink } from "../lib/link-acesso";
import { createRegistrationToken, verifyRegistrationToken, verifyPhotoToken, createPhotoToken } from "../lib/portal-token";

const app = express();
app.use(express.json());
app.get("/x", async (req, res) => {
  protegerRespostaLink(res);
  const { token, via } = lerTokenDeLink(req);
  const id = verifyRegistrationToken(token);
  await auditarAcessoLink(req, "cadastro", via, id ? "aceito" : "recusado", id);
  res.status(id ? 200 : 401).json({ id, via });
});
describe("links temporários", () => {
  it("cabeçalho funciona, URL antiga continua valendo e é marcada; sem cache nem Referer", async () => {
    const t = createRegistrationToken(5);
    const a = await request(app).get("/x").set("X-Link-Token", t);
    expect(a.status).toBe(200); expect(a.body.via).toBe("cabecalho");
    expect(a.headers["cache-control"]).toMatch(/no-store/); expect(a.headers["referrer-policy"]).toBe("no-referrer");
    const b = await request(app).get(`/x?token=${t}`);
    expect(b.status).toBe(200); expect(b.body.via).toBe("url");
  });
  it("token errado, de outro escopo ou adulterado é recusado; auditoria não guarda o token", async () => {
    const t = createRegistrationToken(5);
    expect((await request(app).get("/x").set("X-Link-Token", createPhotoToken(5))).status).toBe(401);
    expect((await request(app).get("/x").set("X-Link-Token", t.slice(0, -3) + "abc")).status).toBe(401);
    expect((await request(app).get("/x")).status).toBe(401);
    expect(verifyPhotoToken(t)).toBeNull();
    expect(JSON.stringify(q.rows)).not.toContain(t);
    expect(q.rows.some((r) => r[3] === "recusado")).toBe(true);
  });
  it("expirado é recusado", () => {
    vi.useFakeTimers(); const t = createRegistrationToken(9);
    vi.setSystemTime(Date.now() + 8 * 24 * 3600 * 1000);
    expect(verifyRegistrationToken(t)).toBeNull(); vi.useRealTimers();
  });
  it("limite por minuto", () => {
    const r = { ip: "9.9.9.9" } as any; let bloq = false;
    for (let i = 0; i < 61; i++) bloq = excedeuLimiteLink(r, "foto");
    expect(bloq).toBe(true);
  });
});
