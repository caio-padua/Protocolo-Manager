/** Kaizen P0 — PUT /settings/exames só CEO; toggle de validação não vale para o paciente. Nível MOCK, dados sintéticos. */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

let sessao: {
  authenticated: boolean;
  isPlatformOwner: boolean;
  empresaId?: number;
  professionalId?: number;
} | null = null;
vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (q: any, s: any, n: () => void) => {
    if (!sessao) { s.status(401).json({ error: "Faça login" }); return; }
    q.tenantContext = sessao; n();
  },
}));
const gravados: Record<string, string> = {};
const preliminaresPorEmpresa: Record<number, boolean> = {};
const salvarPreliminares = vi.fn(async (input: { empresaId: number; habilitado: boolean; professionalId: number }) => {
  preliminaresPorEmpresa[input.empresaId] = input.habilitado;
  return { valorAnterior: null };
});
vi.mock("../lib/secure-settings", async (orig) => ({
  ...(await orig<object>()),
  getSetting: vi.fn(async (k: string) => gravados[k] ?? null),
  setSetting: vi.fn(async (k: string, v: string) => { gravados[k] = v; }),
}));
vi.mock("../lib/exam-preliminary-visibility", () => ({
  lerVisibilidadePreliminarExames: vi.fn(async (empresaId: number | null) =>
    empresaId == null ? false : (preliminaresPorEmpresa[empresaId] ?? false),
  ),
  salvarVisibilidadePreliminarExames: (...args: Parameters<typeof salvarPreliminares>) => salvarPreliminares(...args),
}));
import settingsRouter from "../routes/settings";

const app = () => { const a = express(); a.use(express.json()); a.use(settingsRouter); return a; };
beforeEach(() => {
  for (const k of Object.keys(gravados)) delete gravados[k];
  for (const k of Object.keys(preliminaresPorEmpresa)) delete preliminaresPorEmpresa[Number(k)];
  salvarPreliminares.mockClear();
  sessao = null;
});

describe("PUT /settings/exames — autorização no servidor", () => {
  it("sem sessão: 401 e nada gravado", async () => {
    const r = await request(app()).put("/settings/exames").send({ exigirValidacaoHumana: false });
    expect(r.status).toBe(401); expect(gravados).toEqual({});
  });
  it("colaborador comum: 403 e nada gravado", async () => {
    sessao = { authenticated: true, isPlatformOwner: false };
    const r = await request(app()).put("/settings/exames").send({ exigirValidacaoHumana: false });
    expect(r.status).toBe(403); expect(gravados).toEqual({});
  });
  it("CEO: 200 e grava", async () => {
    sessao = { authenticated: true, isPlatformOwner: true };
    const r = await request(app()).put("/settings/exames").send({ exigirValidacaoHumana: false });
    expect(r.status).toBe(200); expect(gravados["exames.exigirValidacaoHumana"]).toBe("false");
  });
  it("GET continua aberto ao colaborador autenticado", async () => {
    sessao = { authenticated: true, isPlatformOwner: false, empresaId: 5, professionalId: 102 };
    const r = await request(app()).get("/settings/exames");
    expect(r.status).toBe(200); expect(r.body.exigirValidacaoHumana).toBe(true);
    expect(r.body.exibirResultadosPreliminaresAreaCliente).toBe(false);
  });
  it("novo valor é independente por clínica e não confia no empresaId do corpo", async () => {
    sessao = { authenticated: true, isPlatformOwner: true, empresaId: 5, professionalId: 101 };
    const r = await request(app()).put("/settings/exames")
      .send({ exibirResultadosPreliminaresAreaCliente: true, empresaId: 6 });
    expect(r.status).toBe(200);
    expect(salvarPreliminares).toHaveBeenCalledWith({
      empresaId: 5,
      habilitado: true,
      professionalId: 101,
    });
    expect(preliminaresPorEmpresa[5]).toBe(true);
    expect(preliminaresPorEmpresa[6]).toBeUndefined();
    sessao = { authenticated: true, isPlatformOwner: false, empresaId: 6, professionalId: 201 };
    const outraClinica = await request(app()).get("/settings/exames");
    expect(outraClinica.body.exibirResultadosPreliminaresAreaCliente).toBe(false);
  });
  it("novo valor exige autenticação, papel de proprietário e valor booleano", async () => {
    const semSessao = await request(app()).put("/settings/exames")
      .send({ exibirResultadosPreliminaresAreaCliente: true });
    expect(semSessao.status).toBe(401);
    sessao = { authenticated: true, isPlatformOwner: false, empresaId: 5, professionalId: 102 };
    const semPermissao = await request(app()).put("/settings/exames")
      .send({ exibirResultadosPreliminaresAreaCliente: true });
    expect(semPermissao.status).toBe(403);
    expect(salvarPreliminares).not.toHaveBeenCalled();
    sessao = { authenticated: true, isPlatformOwner: true, empresaId: 5, professionalId: 101 };
    const valorInvalido = await request(app()).put("/settings/exames")
      .send({ exibirResultadosPreliminaresAreaCliente: "true" });
    expect(valorInvalido.status).toBe(400);
    expect(salvarPreliminares).not.toHaveBeenCalled();
  });
});
