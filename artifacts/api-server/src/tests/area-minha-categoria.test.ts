/**
 * Área do Cliente > Minha Categoria (rota real com sessão do portal; banco simulado, dados sintéticos).
 * Prova: só Bearer vale, cliente só do token, resposta mínima {nivel}, nível fora dos quatro vira null.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const estado = vi.hoisted(() => ({
  linha: null as null | { plano: string },
  selecionado: null as unknown,
  eqArgs: [] as unknown[][],
  falha: false,
}));

vi.mock("../lib/pre-cadastro", async (orig) => ({ ...(await orig<typeof import("../lib/pre-cadastro")>()), lerEstadoPreCadastro: async () => ({ completo: true, pendentes: [], valores: {} }) }));
vi.mock("@workspace/db", () => {
  const chain = () => {
    const c: Record<string, unknown> = {
      from: () => c, where: () => c,
      limit: async () => { if (estado.falha) throw new Error("banco indisponivel"); return estado.linha ? [estado.linha] : []; },
    };
    return c;
  };
  const nomes = ["protocolsTable","protocolItemsTable","substancesTable","sessionsTable","substanceApplicationsTable","paymentsTable","rasTable","examRequestPdfsTable","professionalsTable","validationCodesTable","agendaResourcesTable"];
  return {
    db: { select: (cols: unknown) => { estado.selecionado = cols; return chain(); } },
    clientsTable: { id: "clients.id", plano: "clients.plano" },
    ...Object.fromEntries(nomes.map((n) => [n, {}])),
  };
});
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: unknown[]) => { estado.eqArgs.push(a); return {}; }),
  and: vi.fn(), gte: vi.fn(), lte: vi.fn(), asc: vi.fn(), desc: vi.fn(),
  sql: Object.assign(vi.fn(() => ({})), { raw: vi.fn() }),
}));
vi.mock("../lib/agenda-booking", () => ({ computeResourceSlots: vi.fn(), bookSession: vi.fn(), rescheduleSession: vi.fn() }));
vi.mock("../lib/session-google-sync", () => ({ refreshAfterReschedule: vi.fn() }));
vi.mock("../lib/messaging/index.js", () => ({ enviarMensagemPaxter: vi.fn() }));
vi.mock("../lib/protocol-dose-presentation", () => ({ dosePrescritaParaDocumento: vi.fn(), nomeSubstanciaNoProtocolo: vi.fn() }));
vi.mock("../lib/telegram-contato", () => ({ contarCadastrosComCodigo: vi.fn(async () => 0) }));
vi.mock("../lib/telegram-magic-link", async (orig) => ({ ...(await orig<typeof import("../lib/telegram-magic-link")>()) }));

import express from "express";
import request from "supertest";
import router from "../routes/area-paciente";
import { createPortalToken } from "../lib/portal-token";

const app = () => { const a = express(); a.use(express.json()); a.use((q, _s, n) => { (q as any).log = { error: vi.fn() }; n(); }); a.use(router); return a; };
const auth = (id = 11) => ({ Authorization: `Bearer ${createPortalToken(id)}` });

beforeEach(() => { estado.linha = { plano: "ouro" }; estado.selecionado = null; estado.eqArgs = []; estado.falha = false; });

describe("Área do Cliente > Minha Categoria", () => {
  it("sem sessão: 401", async () => {
    expect((await request(app()).get("/area-paciente/minha-categoria")).status).toBe(401);
  });

  it("token na URL é recusado (só cabeçalho Authorization vale)", async () => {
    const r = await request(app()).get(`/area-paciente/minha-categoria?token=${createPortalToken(11)}`);
    expect(r.status).toBe(401);
  });

  it("token inválido: 401", async () => {
    const r = await request(app()).get("/area-paciente/minha-categoria").set("Authorization", "Bearer lixo");
    expect(r.status).toBe(401);
  });

  for (const n of ["prata", "ouro", "platinum", "diamond"]) {
    it(`devolve o nível ${n} e somente ele`, async () => {
      estado.linha = { plano: n };
      const r = await request(app()).get("/area-paciente/minha-categoria").set(auth());
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ nivel: n });
      expect(r.headers["cache-control"]).toContain("no-store");
    });
  }

  it("lê só a coluna plano e filtra pelo id do TOKEN", async () => {
    await request(app()).get("/area-paciente/minha-categoria").set(auth(77)).query({ clientId: 5, id: 6 });
    expect(estado.selecionado).toEqual({ plano: "clients.plano" });
    expect(estado.eqArgs).toEqual([["clients.id", 77]]);
  });

  for (const valor of ["legado:ouro", "black", "bronze", ""]) {
    it(`valor "${valor}" não vira nível: nivel null`, async () => {
      estado.linha = { plano: valor };
      const r = await request(app()).get("/area-paciente/minha-categoria").set(auth());
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ nivel: null });
    });
  }

  it("cliente inexistente: 404", async () => {
    estado.linha = null;
    expect((await request(app()).get("/area-paciente/minha-categoria").set(auth())).status).toBe(404);
  });

  it("o Grupo VIP não lê nível: a antiga rota /club-vip não existe mais (404, mesmo com sessão válida)", async () => {
    const r = await request(app()).get("/area-paciente/club-vip").set(auth());
    expect(r.status).toBe(404);
    expect(estado.selecionado).toBeNull();
  });

  it("falha de banco: 500 sem vazar detalhe", async () => {
    estado.falha = true;
    const r = await request(app()).get("/area-paciente/minha-categoria").set(auth());
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("banco indisponivel");
  });
});
