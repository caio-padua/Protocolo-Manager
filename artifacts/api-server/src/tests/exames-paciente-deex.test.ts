/** DEEx na Área do Cliente: identidade só pelo token, só conferidos, sem prévia. Dados sintéticos; tudo simulado. */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../lib/exam-progresso-resultados", () => ({ resumirDocumentos: vi.fn() }));
vi.mock("../lib/exam-marcos", () => ({ montarMarcosEnvio: vi.fn() }));
vi.mock("../lib/exam-extraction/identity-display", () => ({ buildPortalIdentityIssue: vi.fn() }));
vi.mock("../lib/exam-preliminary-visibility", () => ({ lerVisibilidadePreliminarExames: vi.fn(async () => false) }));
vi.mock("../lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("../lib/portal-token", () => ({ verifyPortalToken: (t: string) => (t === "tok-7" ? 7 : t === "tok-8" ? 8 : null) }));
const mockEvo = vi.fn();
const mockDrive = vi.fn();
vi.mock("../lib/evolucao-exames-drive", async (orig) => ({ ...(await orig<typeof import("../lib/evolucao-exames-drive")>()), arquivarDeexNoDrive: (...a: unknown[]) => mockDrive(...a) }));
vi.mock("../routes/exames-lab", () => ({ handleEvolucao: vi.fn(), startExamIngestion: vi.fn(), montarEvolucao: (...a: unknown[]) => mockEvo(...a) }));
vi.mock("../lib/documentos/paxmed-2b-identidade-clinica", async () => {
  class IdentidadeEmpresa2bError extends Error { constructor(public status: 422 | 503, m: string) { super(m); } }
  return {
    IdentidadeEmpresa2bError,
    carregarIdentidadeClinica2b: vi.fn(async (empresaId: number) => {
      if (empresaId === 99) throw new IdentidadeEmpresa2bError(422, "detalhe interno da clínica");
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      return { empresaId, textos: { nomeCabecalho: "Clínica Sintética", rodapeLinha1: "Clínica Sintética", rodapeLinha2: "Rua Teste, 1", rodapeLinha3: "CEP 00000-000" },
        simboloDourado: readFileSync(resolve(import.meta.dirname, "../../assets/paxmed-modelo-2b/paxmed-simbolo-ouro-transparente.png")) };
    }),
  };
});
// cliente 7 = clínica 5 ativo; cliente 8 = clínica 99 ativo; 9 = inativo
let ultimoId = 0;
vi.mock("drizzle-orm", () => ({
  and: vi.fn(), desc: vi.fn(), eq: (_c: unknown, v: number) => { ultimoId = v; return v; },
  sql: Object.assign(() => ({}), { join: () => ({}) }),
}));
vi.mock("@workspace/db", () => {
  const c: Record<string, unknown> = {
    from: () => c, where: () => c,
    limit: async () => {
      if (ultimoId === 7) return [{ id: 7, empresaId: 5, status: "active", name: "Paciente Sintético", birth: "1980-01-02" }];
      if (ultimoId === 8) return [{ id: 8, empresaId: 99, status: "active", name: "Outro", birth: null }];
      if (ultimoId === 9) return [{ id: 9, empresaId: 5, status: "inactive", name: "Inativo", birth: null }];
      return [];
    },
  };
  return { db: { select: () => c }, clientsTable: { id: {}, empresaId: {}, status: {}, name: {}, birthDate: {} }, examDocumentsTable: {} };
});

import router from "../routes/exames-paciente";

const app = () => { const a = express(); a.use(router); return a; };
const evo = (conf: "c2" | "ia") => ({
  columns: [{ key: "2025-01-10|L", date: "2025-01-10", lab: "L", confLevel: conf, conferenteName: null, conferenteCargo: null, isHistory: false }],
  analytes: [{ key: "A", name: "Exame A", unit: "mg/dL", refLow: "1", refHigh: "2", zones: null, cells: { "2025-01-10|L": { value: "1,5", valueNum: 1.5, unit: "mg/dL", unitConverted: false, unitRaw: "mg/dL", refLow: "1", refHigh: "2", status: null, documentId: 1, zone: null } } }],
});
const get = (url: string, token?: string) => {
  const r = request(app()).get(url);
  return (token ? r.set("Authorization", `Bearer ${token}`) : r).buffer().parse((res, cb) => { const d: Buffer[] = []; res.on("data", (x) => d.push(x)); res.on("end", () => cb(null, Buffer.concat(d))); });
};
beforeEach(() => { vi.clearAllMocks(); mockEvo.mockResolvedValue(evo("c2")); mockDrive.mockResolvedValue({ estado: "salvo", nome: "26.11.17 - DEEx - DESCRITIVO EVOLUCAO EXAMES - PACIENTE SINTETICO.pdf" }); });

describe("DEEx do próprio cliente", () => {
  it("sem token: 401 e nada é lido", async () => {
    expect((await get("/area-paciente/exames/evolucao/pdf")).status).toBe(401);
    expect(mockEvo).not.toHaveBeenCalled();
  });
  it("token válido: PDF sem cache; evolução lida em modo estrito do portal, sem toggle de profissional", async () => {
    const r = await get("/area-paciente/exames/evolucao/pdf?modo=completo", "tok-7");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/pdf");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(mockEvo).toHaveBeenCalledWith(7, { portalEmpresaId: 5 });
  });
  it("copia na pasta EXAMES do próprio paciente, com a empresa dele", async () => {
    const r = await get("/area-paciente/exames/evolucao/pdf", "tok-7");
    expect(mockDrive.mock.calls[0]![0]).toMatchObject({ empresaId: 5, nomePaciente: "Paciente Sintético" });
    expect(r.headers["x-deex-drive"]).toBe("salvo");
    expect(r.headers["content-disposition"]).toContain("DEEx - DESCRITIVO EVOLUCAO EXAMES - PACIENTE SINTETICO");
  });
  it("falha no Drive: o paciente ainda recebe o PDF", async () => {
    mockDrive.mockResolvedValue({ estado: "falhou", nome: null });
    const r = await get("/area-paciente/exames/evolucao/pdf", "tok-7");
    expect(r.status).toBe(200);
    expect(r.headers["x-deex-drive"]).toBe("falhou");
  });
  it("recusa por não conferido não copia nada para o Drive", async () => {
    mockEvo.mockResolvedValue(evo("ia"));
    await get("/area-paciente/exames/evolucao/pdf", "tok-7");
    expect(mockDrive).not.toHaveBeenCalled();
  });
  it("clientId na URL é ignorado (identidade só pelo token)", async () => {
    await get("/area-paciente/exames/evolucao/pdf?clientId=8&previa=1", "tok-7");
    expect(mockEvo).toHaveBeenCalledWith(7, { portalEmpresaId: 5 });
  });
  it("modo inválido: 400", async () => {
    expect((await get("/area-paciente/exames/evolucao/pdf?modo=tudo", "tok-7")).status).toBe(400);
  });
  it("sem resultados conferidos: 404", async () => {
    mockEvo.mockResolvedValue({ columns: [], analytes: [] });
    expect((await get("/area-paciente/exames/evolucao/pdf", "tok-7")).status).toBe(404);
  });
  it("se vier algo não conferido: 409 e nenhum PDF, mesmo com previa=1", async () => {
    mockEvo.mockResolvedValue(evo("ia"));
    const r = await get("/area-paciente/exames/evolucao/pdf?previa=1", "tok-7");
    expect(r.status).toBe(409);
    expect(r.headers["content-type"]).not.toContain("application/pdf");
  });
  it("clínica sem identidade validada: 422 sem expor o detalhe interno", async () => {
    const r = await get("/area-paciente/exames/evolucao/pdf", "tok-8");
    expect(r.status).toBe(422);
    expect(String((r.body as Buffer).toString())).not.toContain("detalhe interno");
  });
});
