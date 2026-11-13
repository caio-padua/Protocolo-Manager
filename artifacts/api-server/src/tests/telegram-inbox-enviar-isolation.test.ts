/**
 * Rotas reais + autenticação real do colaborador + middleware real de clínica
 * (tenantContext, com credentialVersion e vínculos) + consulta real de autorização.
 * Só o banco e os provedores externos são substituídos; nenhum middleware simulado.
 *
 * Contrato atualizado em 13/11/2026: desde a refatoração de 31/10/2026 (commit 8a8b1540)
 * a identidade do colaborador é conferida no banco a cada requisição (profissional ativo +
 * credentialVersion) e o middleware de clínica recusa, ANTES da rota, seleção de clínica sem
 * vínculo (403) ou inconsistente entre cabeçalho e query (400). O banco simulado abaixo
 * responde por tabela, como o código real consulta. Nenhuma expectativa de bloqueio foi
 * removida: as recusas passaram a acontecer mais cedo e a consulta de cliente continua
 * proibida em todos os caminhos negados (mocks.clients).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), where: vi.fn(), clients: vi.fn(), identity: vi.fn(),
  execute: vi.fn().mockResolvedValue({ rows: [] }),
  insert: vi.fn(), send: vi.fn(), whatsapp: vi.fn(), log: vi.fn(),
}));
vi.mock("@workspace/db", async () => ({
  ...await import("@workspace/db/schema"),
  db: { select: mocks.select, execute: mocks.execute, insert: mocks.insert },
}));
vi.mock("../lib/telegram", () => ({ sendTelegram: mocks.send }));
vi.mock("../lib/whatsapp", () => ({
  sendWhatsapp: mocks.whatsapp, registrarLogMensagem: mocks.log,
}));
vi.mock("../lib/motor-anamnese", () => ({ computeMotor: vi.fn(), gatilhoBate: vi.fn() }));
vi.mock("../lib/lembrete-periodo", () => ({
  sincronizarLembretePrescricao: vi.fn(), executarLembretesPeriodo: vi.fn(),
}));
vi.mock("../lib/formula-manipulada", () => ({ enriquecerItemFormula: vi.fn() }));
vi.mock("../lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("../lib/telegram-config", () => ({
  resolverChatAlerta: vi.fn().mockResolvedValue({ chatId: "test-alert", fonte: "cofre", motivo: null }),
}));

import cockpitRouter from "../routes/cockpit";
import assinaturasRouter from "../routes/assinaturas";
import { onboardingRouter } from "../routes/onboarding";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { tenantContextMiddleware } from "../middleware/tenantContext";
import {
  clientsTable, professionalsTable, professionalEmpresasTable, locationProfessionalsTable, empresasTable,
} from "@workspace/db";

const dialect = new PgDialect();
const CLIENTS = [
  { id: 42, empresaId: 5, name: "Cliente Teste", telegramChatId: "test-chat-42", phone: "test-phone-42" },
  { id: 43, empresaId: 7, name: "Cliente Teste", telegramChatId: "test-chat-43", phone: "test-phone-43" },
];
type Grant = {
  empresaId: number; active: boolean; professionalActive: boolean; empresaActive: boolean; status: string;
  isPlatformOwner?: boolean;
};
let grants: Map<number, Grant>;
let databaseFailure = false;
let vinculosDoChat: Array<{ id: number; empresa_id: number }> | null = null;

function token(professionalId: number, role = "medico") {
  return createCollaboratorToken({ professionalId, role });
}
function app() {
  const server = express();
  server.use(express.json());
  // This is the real middleware: deliberately preserves the dangerous legacy
  // platform-owner context to prove it cannot grant access to external sends.
  server.use(tenantContextMiddleware);
  server.use("/onboarding", onboardingRouter);
  server.use(cockpitRouter);
  server.use(assinaturasRouter);
  return server;
}
const server = app();

function writeQueries() {
  return mocks.execute.mock.calls
    .map(([sql]) => dialect.sqlToQuery(sql as SQL))
    .filter(({ sql }) => !sql.trimStart().startsWith("SELECT"));
}
function noSideEffects() {
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.whatsapp).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.log).not.toHaveBeenCalled();
  expect(writeQueries()).toEqual([]);
}

// Let the existing onboarding boot migrations finish before clearing spies.
beforeAll(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); });
afterEach(() => { vi.restoreAllMocks(); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  databaseFailure = false;
  vinculosDoChat = null;
  grants = new Map([
    [500, { empresaId: 5, active: true, professionalActive: true, empresaActive: true, status: "ATIVO" }],
    [700, { empresaId: 7, active: true, professionalActive: true, empresaActive: true, status: "ATIVO" }],
  ]);
  mocks.send.mockResolvedValue({ sent: true, mock: false });
  mocks.whatsapp.mockResolvedValue({ sent: true });
  mocks.log.mockResolvedValue(undefined);
  mocks.execute.mockImplementation(async (condition: SQL) => {
    const query = dialect.sqlToQuery(condition);
    if (query.sql.includes("FROM professionals p")) {
      if (databaseFailure) throw new Error("database unavailable");
      // Protect the identity binding and all revocation/inactive predicates.
      expect(query.sql).toContain("e.id = p.empresa_id");
      expect(query.sql).toContain("p.id = $1 AND p.active = true");
      expect(query.sql).toContain("e.ativa = true AND e.status = 'ATIVO'");
      expect(query.sql).toContain("p.credential_version = $2");
      expect(query.params).toHaveLength(2);
      const grant = grants.get(query.params[0] as number);
      if (query.params[1] !== 0) return { rows: [] }; // credentialVersion do banco é 0 no cenário
      return { rows: grant?.active && grant.professionalActive && grant.empresaActive && grant.status === "ATIVO"
        ? [{ id: grant.empresaId, nome: "Clínica Teste", slug: grant.empresaId === 5 ? null : "clinica-7" }] : [] };
    }
    if (query.sql.includes("INSERT INTO onboarding_quota")) {
      return { rows: [{ dia_brt: "2026-10-29" }] };
    }
    if (query.sql.includes("INSERT INTO telegram_inbox_messages")) return { rows: [{ id: 900 }] };
    if (query.sql.includes("INSERT INTO telegram_repasse_ceo")) return { rows: [{ id: 901 }] };
    if (query.sql.includes("WHERE telegram_chat_id =")) {
      return { rows: vinculosDoChat ?? CLIENTS.filter(c => c.telegramChatId === query.params[0])
        .map(c => ({ id: c.id, empresa_id: c.empresaId })) };
    }
    return { rows: [] };
  });
  mocks.where.mockImplementation((condition: SQL) => {
    const query = dialect.sqlToQuery(condition);
    expect(query.sql).toBe('("clients"."id" = $1 and "clients"."empresa_id" = $2)');
    const [clientId, empresaId] = query.params;
    return { limit: vi.fn().mockResolvedValue(
      CLIENTS.filter((client) => client.id === clientId && client.empresaId === empresaId),
    ) };
  });
  const professionalRow = (id: number) => {
    const grant = grants.get(id);
    return grant ? [{
      id, role: "medico", category: "medico", empresaId: grant.empresaId, credentialVersion: 0,
      active: grant.active && grant.professionalActive, isPlatformOwner: grant.isPlatformOwner === true,
    }] : [];
  };
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => {
      if (table === professionalsTable) {
        return { where: (cond: SQL) => ({ limit: async () => {
          mocks.identity();
          if (databaseFailure) throw new Error("database unavailable");
          return professionalRow(dialect.sqlToQuery(cond).params[0] as number);
        } }) };
      }
      if (table === locationProfessionalsTable) return { innerJoin: () => ({ where: async () => [] }) };
      if (table === professionalEmpresasTable) return { where: async () => [] };
      if (table === empresasTable) {
        return { where: (cond: SQL) => ({ limit: async () => {
          const id = dialect.sqlToQuery(cond).params[0] as number;
          const ok = [...grants.values()].some((g) => g.empresaId === id && g.empresaActive && g.status === "ATIVO");
          return ok ? [{ id }] : [];
        } }) };
      }
      expect(table).toBe(clientsTable);
      mocks.clients();
      return { where: mocks.where };
    },
  }));
});

for (const route of ["telegram", "guia"] as const) {
  describe(`${route}: autorização real de clínica antes de enviar`, () => {
    // empresaHeader: clínica "selecionada" pelo navegador. Padrão 5 = cabeçalho hostil/legado
    // (usado para provar que a seleção do navegador nunca concede acesso); null = sem seleção.
    function send(
      professionalId: number | null, clientId = 42, query = "", role = "medico", rawToken?: string,
      empresaHeader: number | null = 5,
    ) {
      const path = route === "telegram"
        ? `/cockpit/${clientId}/telegram-inbox/enviar` : "/onboarding/enviar-guia";
      const req = request(server).post(path + query);
      if (empresaHeader !== null) req.set("X-Empresa-Id", String(empresaHeader)).set("X-Tenant-Id", String(empresaHeader));
      if (professionalId !== null) req.set("Authorization", `Bearer ${rawToken ?? token(professionalId, role)}`);
      return req.send({
        texto: "Mensagem de teste", clientId, canais: ["WHATSAPP", "TELEGRAM"],
        guiaUrl: "https://example.test/guia", empresaId: 5, tenant: "padua", isPlatformOwner: true,
      });
    }

    // Segue o contrato atual: a recusa de identidade acontece em camadas diferentes por rota.
    //  - telegram: requireCollaborator confere o profissional no banco => 401 se inativo/inexistente.
    //  - guia: a consulta de autorização da clínica => 403 se não há vínculo ativo.
    const semIdentidade = route === "telegram" ? 401 : 403;
    const naoEncontrado = route === "telegram"
      ? { error: "cliente nao encontrado" } : { ok: false, error: "Cliente não encontrado." };

    it.each(["", "?empresaId=5"])("clínica 7 selecionando a clínica 5 é barrada antes de qualquer consulta de cliente (%s)", async (query) => {
      const response = await send(700, 42, query); // cabeçalho X-Empresa-Id: 5 (clínica alheia)
      expect(response.status).toBe(403);
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("sem seleção de clínica: profissional da clínica 7 pede o cliente 42 (clínica 5) e recebe 404 restrito à própria clínica", async () => {
      const response = await send(700, 42, "", "medico", undefined, null);
      expect(response.status).toBe(404);
      expect(response.body).toEqual(naoEncontrado);
      expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([42, 7]);
      noSideEffects();
    });

    it("cabeçalho e query com clínicas diferentes são recusados como seleção inválida (400)", async () => {
      expect((await send(500, 43, "?empresaId=7")).status).toBe(400);
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("proprietário da plataforma escolhendo a clínica 7 ainda NÃO envia ao cliente 43: a consulta usa a clínica do vínculo do profissional", async () => {
      grants.get(500)!.isPlatformOwner = true;
      const response = await send(500, 43, "?empresaId=7", "platform_owner", undefined, 7);
      expect(response.status).toBe(404);
      expect(response.body).toEqual(naoEncontrado);
      expect(dialect.sqlToQuery(mocks.where.mock.calls[0][0]).params).toEqual([43, 5]);
      noSideEffects();
    });

    it("sem token não há envio nem consulta ao banco (401)", async () => {
      expect((await send(null)).status).toBe(401);
      expect(mocks.identity).not.toHaveBeenCalled();
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("profissional sem vínculo (inexistente) não envia", async () => {
      expect((await send(999)).status).toBe(semIdentidade);
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    if (route === "telegram") {
      it.each([
        ["revogado", []],
        ["transferido para outro cliente", [{ id: 43, empresa_id: 5 }]],
        ["empresa alterada", [{ id: 42, empresa_id: 7 }]],
        ["duplicado entre empresas", [{ id: 42, empresa_id: 5 }, { id: 43, empresa_id: 7 }]],
      ] as const)("chat %s: recusa antes do transporte", async (_caso, linhas) => {
        vinculosDoChat = [...linhas];
        const response = await send(500);
        expect(response.status).toBe(409);
        noSideEffects();
      });
    }

    it("token adulterado é recusado antes de consultar o banco", async () => {
      expect((await send(700, 42, "", "medico", "invalid")).status).toBe(401);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.identity).not.toHaveBeenCalled();
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("token expirado é recusado antes de consultar o banco", async () => {
      const now = Date.now();
      const spy = vi.spyOn(Date, "now").mockReturnValue(now - 13 * 60 * 60 * 1000);
      const expired = token(500);
      spy.mockRestore();
      expect((await send(500, 42, "", "medico", expired)).status).toBe(401);
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.identity).not.toHaveBeenCalled();
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("senha trocada/credencial revogada: token com credentialVersion antiga é recusado", async () => {
      const antigo = createCollaboratorToken({ professionalId: 500, role: "medico", credentialVersion: 3 });
      expect((await send(500, 42, "", "medico", antigo, 5)).status).toBe(semIdentidade);
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it.each(["active", "professionalActive"] as const)(
      "vínculo/profissional desativado não envia (%s)", async (field) => {
        grants.get(500)![field] = false;
        expect((await send(500)).status).toBe(semIdentidade);
        expect(mocks.clients).not.toHaveBeenCalled();
        noSideEffects();
      },
    );

    it.each(["empresaActive", "status"] as const)(
      "clínica desativada ou suspensa não envia (%s)", async (field) => {
        const grant = grants.get(500)!;
        if (field === "status") grant.status = "SUSPENSO";
        else grant.empresaActive = false;
        expect((await send(500)).status).toBe(403);
        expect(mocks.clients).not.toHaveBeenCalled();
        noSideEffects();
      },
    );

    it("falha ao carregar autorização bloqueia sem efeitos colaterais", async () => {
      databaseFailure = true;
      expect((await send(500)).status).toBe(500);
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("cliente inexistente recebe o mesmo 404 sem enviar", async () => {
      const response = await send(500, 4042);
      expect(response.status).toBe(404);
      expect(response.body).toEqual(naoEncontrado);
      noSideEffects();
    });

    it("trocar clienteId, chatId ou destinatário no corpo não contorna: o destino vem sempre do cadastro da clínica do token", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1_900_000_000_000);
      const forjado = request(server)
        .post(route === "telegram" ? "/cockpit/42/telegram-inbox/enviar" : "/onboarding/enviar-guia")
        .set("X-Empresa-Id", "5")
        .set("Authorization", `Bearer ${token(500)}`)
        .send({
          texto: "Mensagem de teste", clientId: 42, canais: ["TELEGRAM"], guiaUrl: "https://example.test/guia",
          chatId: "chat-do-atacante", telegramChatId: "chat-do-atacante", destinatario: "chat-do-atacante",
          to: "chat-do-atacante", clienteId: 43, empresaId: 7,
        });
      expect((await forjado).status).toBe(200);
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.send.mock.calls[0][0]).toBe("test-chat-42");
      vi.restoreAllMocks();
    });

    it.each([[500, 42, 5], [700, 43, 7]])("caminho autorizado: colaborador %s envia ao cliente %s", async (actor, clientId, empresa) => {
      // Onboarding holds cooldown in memory; advance only Date.now, never I/O timers.
      vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000 + clientId * 100_000);
      const response = await send(actor, clientId, "", "medico", undefined, empresa);
      expect(response.status).toBe(200);
      const client = CLIENTS.find((row) => row.id === clientId)!;
      expect(mocks.send).toHaveBeenCalledTimes(1);
      expect(mocks.send.mock.calls[0][0]).toBe(client.telegramChatId);
      if (route === "telegram") {
        expect(mocks.send).toHaveBeenCalledWith(client.telegramChatId, "Mensagem de teste");
        const writes = writeQueries().filter(({ sql }) => sql.includes("INSERT INTO telegram_inbox_messages"));
        expect(writes).toHaveLength(1);
        expect(writes[0].params).toEqual([client.empresaId, clientId, client.telegramChatId, "Mensagem de teste"]);
        expect(mocks.log).toHaveBeenCalledTimes(1);
      } else {
        expect(mocks.whatsapp.mock.calls[0][0]).toBe(client.phone);
        expect(writeQueries().filter(({ sql }) => sql.includes("INSERT INTO onboarding_quota"))).toHaveLength(2);
      }
      vi.restoreAllMocks();
    });

    it("revogação é observada pelo mesmo token sem reiniciar", async () => {
      // Primeiro pedido: vínculo válido lido do banco, barrado só pela posse do cliente (404).
      // Depois da revogação nenhuma consulta de cliente é permitida com o mesmo token.
      const signedToken = token(700);
      expect((await send(700, 42, "", "medico", signedToken, 7)).status).toBe(404);
      grants.get(700)!.active = false;
      mocks.clients.mockClear();
      expect((await send(700, 43, "", "medico", signedToken, 7)).status).toBe(semIdentidade);
      expect(mocks.clients).not.toHaveBeenCalled();
      noSideEffects();
    });

    it("tentativa proibida não ocupa o cooldown/limite do cliente", async () => {
      vi.spyOn(Date, "now").mockReturnValue(3_000_000_000_000);
      expect((await send(700, 42, "", "medico", undefined, 7)).status).toBe(404);
      noSideEffects();
      expect((await send(500)).status).toBe(200);
      expect(mocks.send).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    });
  });
}

describe("ferramenta test-inbox: cadeia real de autorização e fila", () => {
  function enfileirar(professionalId: number | null, clienteId = 42, empresa = 5) {
    const req = request(server).post("/telegram/test-inbox").set("X-Empresa-Id", String(empresa));
    if (professionalId !== null) req.set("Authorization", `Bearer ${token(professionalId)}`);
    return req.send({ clienteId, texto: "Teste técnico sintético" });
  }
  it("sem identidade não consulta cliente nem envia", async () => {
    expect((await enfileirar(null)).status).toBe(401);
    expect(mocks.clients).not.toHaveBeenCalled();
    noSideEffects();
  });
  it("clínica selecionada alheia é recusada antes de consultar cliente", async () => {
    expect((await enfileirar(700)).status).toBe(403);
    expect(mocks.clients).not.toHaveBeenCalled();
    noSideEffects();
  });
  it("cliente alheio recebe 404 mesmo com identidade válida", async () => {
    expect((await enfileirar(500, 43)).status).toBe(404);
    noSideEffects();
  });
  it("chat duplicado em outra empresa não é enfileirado", async () => {
    vinculosDoChat = [{ id: 42, empresa_id: 5 }, { id: 43, empresa_id: 7 }];
    expect((await enfileirar(500)).status).toBe(409);
    noSideEffects();
  });
  it("credencial revogada bloqueia a ferramenta", async () => {
    grants.get(500)!.active = false;
    expect((await enfileirar(500)).status).toBe(401);
    noSideEffects();
  });
  it("autorizado grava inbox e outbox da própria clínica sem enviar diretamente", async () => {
    const r = await enfileirar(500);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ ok: true, enfileirado: true, telegramEntregue: false, repasseId: 901 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(writeQueries().map(q => q.sql).filter(q => q.includes("INSERT INTO telegram_"))).toHaveLength(2);
    expect(writeQueries().find(q => q.sql.includes("INSERT INTO telegram_inbox_messages"))?.params)
      .toEqual([5, 42, "test-chat-42", "Teste técnico sintético"]);
    expect(JSON.stringify(r.body)).not.toContain("test-chat-42");
  });
});
