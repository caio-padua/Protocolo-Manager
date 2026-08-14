/**
 * telegram-inbox-multitenant-isolation.test.ts
 *
 * Valida o isolamento multi-tenant das rotas de inbox Telegram.
 *
 * Cenário principal: colaborador da empresa_id=7 tenta acessar mensagens
 * de um cliente que pertence à empresa_id=5. O filtro triplo
 * (clienteId + empresaId) deve bloquear qualquer vazamento.
 *
 * Cobre:
 *  - listarInbox  → nao_encontrado quando empresaId não bate
 *  - obterBadge   → 0 quando não há mensagens do tenant consultado
 *  - marcarLidas  → nao_encontrado e updateLidas nunca chamado
 *  - Fluxo encadeado: mensagens gravadas para empresa_id=5 são invisíveis
 *    para empresa_id=7 em todas as etapas
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  obterBadge,
  listarInbox,
  marcarLidas,
  type BadgeDeps,
  type ListarInboxDeps,
  type MarcarLidasDeps,
  type MensagemInbox,
} from "../lib/telegram-inbox-flow";

// ── Constantes ────────────────────────────────────────────────────────────────

const EMPRESA_DONA     = 5;  // empresa que realmente possui o cliente
const EMPRESA_INVASORA = 7;  // colaborador de outra clínica tentando acesso

const CLIENTE_ID = 42;
const CHAT_ID    = "987654321";
const TEXTO      = "mensagem do paciente da empresa 5";

function makeMsgFixture(overrides: Partial<MensagemInbox> = {}): MensagemInbox {
  return {
    id: 1001,
    clienteId: CLIENTE_ID,
    empresaId: EMPRESA_DONA,
    chatId: CHAT_ID,
    texto: TEXTO,
    recebidaEm: new Date("2026-08-10T10:00:00Z"),
    lidaEm: null,
    ...overrides,
  };
}

// ── Badge — isolamento ────────────────────────────────────────────────────────

describe("Badge — isolamento multi-tenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 0 para empresa_id=7 mesmo quando há mensagens da empresa_id=5 no banco", async () => {
    // O banco real filtraria por empresaId; aqui simulamos esse comportamento.
    const banco = [makeMsgFixture()]; // 1 msg da empresa 5

    const deps: BadgeDeps = {
      contarNaoLidas: vi.fn().mockImplementation(async (empresaId: number) =>
        banco.filter((m) => m.empresaId === empresaId && m.lidaEm == null).length,
      ),
    };

    const resultInvasora = await obterBadge({ empresaId: EMPRESA_INVASORA }, deps);
    expect(resultInvasora.naoLidas).toBe(0);
  });

  it("contarNaoLidas é chamado com o empresaId da sessão, não com o empresaId do banco", async () => {
    const deps: BadgeDeps = {
      contarNaoLidas: vi.fn().mockResolvedValue(0),
    };

    await obterBadge({ empresaId: EMPRESA_INVASORA }, deps);
    expect(deps.contarNaoLidas).toHaveBeenCalledWith(EMPRESA_INVASORA);
    expect(deps.contarNaoLidas).not.toHaveBeenCalledWith(EMPRESA_DONA);
  });

  it("empresa dona vê as suas próprias mensagens normalmente", async () => {
    const deps: BadgeDeps = {
      contarNaoLidas: vi.fn().mockResolvedValue(3),
    };

    const result = await obterBadge({ empresaId: EMPRESA_DONA }, deps);
    expect(result.naoLidas).toBe(3);
  });
});

// ── listarInbox — isolamento ──────────────────────────────────────────────────

describe("listarInbox — isolamento multi-tenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna nao_encontrado quando empresa_id=7 tenta listar inbox do cliente da empresa_id=5", async () => {
    // findClienteNoTenant retorna null: clienteId=42 não pertence à empresa 7
    const deps: ListarInboxDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
      listMensagens:       vi.fn().mockResolvedValue([makeMsgFixture()]),
      marcarComoLidas:     vi.fn().mockResolvedValue(undefined),
    };

    const result = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA },
      deps,
    );

    expect(result.kind).toBe("nao_encontrado");
  });

  it("listMensagens NÃO é chamado quando o cliente não pertence ao tenant invasor", async () => {
    const deps: ListarInboxDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
      listMensagens:       vi.fn().mockResolvedValue([makeMsgFixture()]),
      marcarComoLidas:     vi.fn().mockResolvedValue(undefined),
    };

    await listarInbox({ clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA }, deps);

    expect(deps.listMensagens).not.toHaveBeenCalled();
  });

  it("marcarComoLidas NÃO é chamado após cross-tenant bloqueado (mesmo com marcarLidas=true)", async () => {
    const deps: ListarInboxDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
      listMensagens:       vi.fn().mockResolvedValue([makeMsgFixture()]),
      marcarComoLidas:     vi.fn().mockResolvedValue(undefined),
    };

    await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA, marcarLidas: true },
      deps,
    );

    expect(deps.marcarComoLidas).not.toHaveBeenCalled();
  });

  it("findClienteNoTenant é chamado com o empresaId da sessão invasora, não com o da dona", async () => {
    const deps: ListarInboxDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
      listMensagens:       vi.fn().mockResolvedValue([]),
      marcarComoLidas:     vi.fn().mockResolvedValue(undefined),
    };

    await listarInbox({ clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA }, deps);

    expect(deps.findClienteNoTenant).toHaveBeenCalledWith(CLIENTE_ID, EMPRESA_INVASORA);
    expect(deps.findClienteNoTenant).not.toHaveBeenCalledWith(CLIENTE_ID, EMPRESA_DONA);
  });

  it("empresa dona acessa normalmente as suas mensagens", async () => {
    const deps: ListarInboxDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue({ id: CLIENTE_ID }),
      listMensagens:       vi.fn().mockResolvedValue([makeMsgFixture()]),
      marcarComoLidas:     vi.fn().mockResolvedValue(undefined),
    };

    const result = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_DONA },
      deps,
    );

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.mensagens).toHaveLength(1);
    expect(result.mensagens[0].texto).toBe(TEXTO);
  });
});

// ── marcarLidas — isolamento ──────────────────────────────────────────────────

describe("marcarLidas — isolamento multi-tenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna nao_encontrado quando empresa_id=7 tenta marcar lidas do cliente da empresa_id=5", async () => {
    const deps: MarcarLidasDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
      updateLidas:         vi.fn().mockResolvedValue(0),
    };

    const result = await marcarLidas(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA },
      deps,
    );

    expect(result.kind).toBe("nao_encontrado");
  });

  it("updateLidas NÃO é chamado quando o tenant não bate", async () => {
    const deps: MarcarLidasDeps = {
      findClienteNoTenant: vi.fn().mockResolvedValue(null),
      updateLidas:         vi.fn().mockResolvedValue(0),
    };

    await marcarLidas({ clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA }, deps);

    expect(deps.updateLidas).not.toHaveBeenCalled();
  });
});

// ── Fluxo encadeado: empresa_id=7 não vê nada da empresa_id=5 ─────────────────

describe("Fluxo encadeado — mensagens da empresa_id=5 invisíveis para empresa_id=7", () => {
  it("badge=0, listarInbox=nao_encontrado, marcarLidas=nao_encontrado para o invasor", async () => {
    // Banco em memória com mensagens da empresa 5
    const banco: MensagemInbox[] = [makeMsgFixture(), makeMsgFixture({ id: 1002 })];

    // ── Badge ──────────────────────────────────────────────────────────────────
    const badgeDeps: BadgeDeps = {
      contarNaoLidas: vi.fn().mockImplementation(async (empresaId: number) =>
        banco.filter((m) => m.empresaId === empresaId && m.lidaEm == null).length,
      ),
    };

    const badge = await obterBadge({ empresaId: EMPRESA_INVASORA }, badgeDeps);
    expect(badge.naoLidas).toBe(0);   // empresa 7 não enxerga nada

    // Confirma que empresa 5 enxerga suas mensagens
    const badgeDona = await obterBadge({ empresaId: EMPRESA_DONA }, badgeDeps);
    expect(badgeDona.naoLidas).toBe(2);

    // ── listarInbox ────────────────────────────────────────────────────────────
    const listarDeps: ListarInboxDeps = {
      // cliente 42 não pertence à empresa 7 → null
      findClienteNoTenant: vi.fn().mockImplementation(
        async (clienteId: number, empresaId: number) =>
          clienteId === CLIENTE_ID && empresaId === EMPRESA_DONA
            ? { id: CLIENTE_ID }
            : null,
      ),
      listMensagens: vi.fn().mockImplementation(
        async (clienteId: number, empresaId: number) =>
          banco.filter((m) => m.clienteId === clienteId && m.empresaId === empresaId),
      ),
      marcarComoLidas: vi.fn().mockResolvedValue(undefined),
    };

    const listarInvasora = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA },
      listarDeps,
    );
    expect(listarInvasora.kind).toBe("nao_encontrado");
    expect(listarDeps.listMensagens).not.toHaveBeenCalled();

    const listarDona = await listarInbox(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_DONA },
      listarDeps,
    );
    expect(listarDona.kind).toBe("ok");
    if (listarDona.kind === "ok") {
      expect(listarDona.mensagens).toHaveLength(2);
      expect(listarDona.naoLidas).toBe(2);
    }

    // ── marcarLidas ────────────────────────────────────────────────────────────
    const marcarDeps: MarcarLidasDeps = {
      findClienteNoTenant: vi.fn().mockImplementation(
        async (clienteId: number, empresaId: number) =>
          clienteId === CLIENTE_ID && empresaId === EMPRESA_DONA
            ? { id: CLIENTE_ID }
            : null,
      ),
      updateLidas: vi.fn().mockImplementation(
        async (clienteId: number, empresaId: number) => {
          let count = 0;
          banco.forEach((m) => {
            if (m.clienteId === clienteId && m.empresaId === empresaId && m.lidaEm == null) {
              m.lidaEm = new Date();
              count++;
            }
          });
          return count;
        },
      ),
    };

    const marcarInvasora = await marcarLidas(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_INVASORA },
      marcarDeps,
    );
    expect(marcarInvasora.kind).toBe("nao_encontrado");
    expect(marcarDeps.updateLidas).not.toHaveBeenCalled();

    // Mensagens ainda não lidas (empresa invasora não conseguiu marcar)
    expect(banco.every((m) => m.lidaEm == null)).toBe(true);

    // Empresa dona ainda consegue marcar normalmente
    const marcarDona = await marcarLidas(
      { clienteId: CLIENTE_ID, empresaId: EMPRESA_DONA },
      marcarDeps,
    );
    expect(marcarDona.kind).toBe("ok");
    if (marcarDona.kind === "ok") {
      expect(marcarDona.marcadas).toBe(2);
    }

    // Badge zera para a empresa dona
    const badgeFinal = await obterBadge({ empresaId: EMPRESA_DONA }, badgeDeps);
    expect(badgeFinal.naoLidas).toBe(0);
  });
});
