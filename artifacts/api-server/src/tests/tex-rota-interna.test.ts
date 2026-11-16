/** TEX fatia 2 — rota interna. Nível MOCK (sessão, banco, evolução e identidade simulados; dados sintéticos). */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../routes/collaborator", () => ({ requireCollaborator: (_q: unknown, _s: unknown, n: () => void) => n() }));
const mockEscopo = vi.fn();
vi.mock("../lib/exam-tenant", () => ({
  requireClientInSession: async (_q: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, id: number) => {
    const e = await mockEscopo(id);
    if (!e) { res.status(404).json({ error: "Cliente não encontrado nesta clínica." }); return null; }
    return e;
  },
}));
const mockEvo = vi.fn();
vi.mock("../routes/exames-lab", () => ({ montarEvolucao: (...a: unknown[]) => mockEvo(...a) }));
vi.mock("../lib/documentos/paxmed-2b-identidade-clinica", async () => {
  class IdentidadeEmpresa2bError extends Error { constructor(public status: 422 | 503, m: string) { super(m); } }
  return {
    IdentidadeEmpresa2bError,
    carregarIdentidadeClinica2b: vi.fn(async (empresaId: number) => {
      if (empresaId === 99) throw new IdentidadeEmpresa2bError(422, "Identidade de documentos não configurada para esta empresa.");
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      return { empresaId, textos: { nomeCabecalho: "Clínica Sintética", rodapeLinha1: "Clínica Sintética", rodapeLinha2: "Rua Teste, 1", rodapeLinha3: "CEP 00000-000" },
        simboloDourado: readFileSync(resolve(import.meta.dirname, "../../assets/paxmed-modelo-2b/paxmed-simbolo-ouro-transparente.png")) };
    }),
  };
});
vi.mock("@workspace/db", () => {
  const c: Record<string, unknown> = { from: () => c, where: () => c, limit: async () => [{ birth: "1980-01-02" }] };
  return { db: { select: () => c }, clientsTable: { birthDate: {}, id: {} } };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import texRouter from "../routes/tex";

const app = () => { const a = express(); a.use((q, _s, n) => { (q as unknown as { log: object }).log = { info: vi.fn(), error: vi.fn() }; n(); }); a.use(texRouter); return a; };
const evo = (conf: "c2" | "ia") => ({
  columns: [{ key: "2025-01-10|L", date: "2025-01-10", lab: "L", confLevel: conf, conferenteName: null, conferenteCargo: null, isHistory: false }],
  analytes: [{ key: "A", name: "Exame A", unit: "mg/dL", refLow: "1", refHigh: "2", zones: null, cells: { "2025-01-10|L": { value: "1,5", valueNum: 1.5, unit: "mg/dL", unitConverted: false, unitRaw: "mg/dL", refLow: "1", refHigh: "2", status: null, documentId: 1, zone: null } } }],
});
beforeEach(() => { vi.clearAllMocks(); mockEscopo.mockImplementation(async (id: number) => (id === 7 ? { id: 7, empresaId: 5, name: "Paciente Sintético" } : id === 8 ? { id: 8, empresaId: 99, name: "Outro" } : null)); mockEvo.mockResolvedValue(evo("c2")); });

describe("TEX rota interna", () => {
  it("cliente conferido: um único PDF, sem cache", async () => {
    const r = await request(app()).get("/tex/cliente/7/pdf?modo=ultimas5").buffer().parse((res, cb) => { const d: Buffer[] = []; res.on("data", (x) => d.push(x)); res.on("end", () => cb(null, Buffer.concat(d))); });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/pdf");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("cliente de outra clínica: 404 e a evolução nem é lida", async () => {
    const r = await request(app()).get("/tex/cliente/123/pdf");
    expect(r.status).toBe(404);
    expect(mockEvo).not.toHaveBeenCalled();
  });
  it("modo inválido: 400", async () => {
    expect((await request(app()).get("/tex/cliente/7/pdf?modo=tudo")).status).toBe(400);
  });
  it("não conferido: 409 sem prévia; 200 com prévia explícita", async () => {
    mockEvo.mockResolvedValue(evo("ia"));
    const r1 = await request(app()).get("/tex/cliente/7/pdf");
    expect(r1.status).toBe(409);
    expect(r1.body.codigo).toBe("TEX_NAO_CONFERIDO");
    expect((await request(app()).get("/tex/cliente/7/pdf?previa=1")).status).toBe(200);
  });
  it("clínica sem identidade validada: 422, nunca cai em modelo genérico", async () => {
    const r = await request(app()).get("/tex/cliente/8/pdf");
    expect(r.status).toBe(422);
  });
  it("sem resultados: 404", async () => {
    mockEvo.mockResolvedValue({ columns: [], analytes: [] });
    expect((await request(app()).get("/tex/cliente/7/pdf")).status).toBe(404);
  });
});
