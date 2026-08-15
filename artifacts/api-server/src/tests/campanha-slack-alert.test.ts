/**
 * campanha-slack-alert.test.ts
 *
 * Confirma que dispararAlertaSeCampanhaRecemConcluida():
 *
 *  1. Chama postAlert exatamente uma vez quando pendentes=0 e erros>0
 *     e concluido_at está dentro da janela de 10 s (campanha recém-concluída).
 *
 *  2. NÃO chama postAlert em ticks subsequentes, quando concluido_at
 *     já passou há mais de 10 s (campanha já conhecida como concluída).
 *
 *  3. NÃO chama postAlert quando a campanha ainda está em andamento
 *     (status !== 'concluida').
 *
 *  4. NÃO chama postAlert quando não há erros (erros = 0).
 *
 *  5. Inclui o campanhaId, canal, totais e taxa de sucesso na mensagem.
 *
 *  6. Inclui a listagem mascarada dos primeiros clientes com falha.
 *
 * Todos os testes usam injeção de dependência — sem banco de dados,
 * sem Slack real e com controle total do relógio via deps.nowMs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dispararAlertaSeCampanhaRecemConcluida,
  type CampanhaAlertaDeps,
  type CampanhaAlertaFalha,
} from "../lib/avatar-campanha-worker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CAMPANHA_ID = "camp-abc-123";
const CANAL       = "VOICE";
const AGORA_MS    = 1_000_000_000_000; // timestamp fixo

/** Monta um row de "campanha recém-concluída com erros". */
function rowConcluida(overrides: Partial<{
  status: string;
  erros: number;
  total: number;
  enviados: number;
  canal: string;
  concluido_at: string | null;
}> = {}) {
  // concluido_at = exatamente agora (dentro da janela de 10 s)
  const concluidoAt = new Date(AGORA_MS - 1_000).toISOString(); // 1 s atrás
  return {
    status:       "concluida",
    erros:        3,
    total:        10,
    enviados:     7,
    canal:        CANAL,
    concluido_at: concluidoAt,
    ...overrides,
  };
}

function makeDeps(falhas: CampanhaAlertaFalha[] = []): CampanhaAlertaDeps {
  return {
    postAlert:   vi.fn().mockResolvedValue(undefined),
    fetchFalhas: vi.fn().mockResolvedValue(falhas),
    nowMs:       vi.fn().mockReturnValue(AGORA_MS),
    log:         vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Bloco 1 — disparo na conclusão com erros (tick de fechamento)
// ---------------------------------------------------------------------------

describe("dispararAlertaSeCampanhaRecemConcluida — conclusão com erros parciais", () => {
  let deps: CampanhaAlertaDeps;
  beforeEach(() => { deps = makeDeps(); });

  it("chama postAlert exatamente uma vez", async () => {
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    expect(deps.postAlert).toHaveBeenCalledOnce();
  });

  it("usa o channelId do env (ou o padrão)", async () => {
    const expected = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    expect((deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(expected);
  });

  it("a mensagem contém o campanhaId", async () => {
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain(CAMPANHA_ID);
  });

  it("a mensagem contém o canal", async () => {
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain(CANAL);
  });

  it("a mensagem contém o total de envios e erros", async () => {
    const row = rowConcluida({ total: 10, enviados: 7, erros: 3 });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain("10");
    expect(text).toContain("7");
    expect(text).toContain("3");
  });

  it("a mensagem inclui a taxa de sucesso calculada corretamente", async () => {
    // 7 de 10 = 70 %
    const row = rowConcluida({ total: 10, enviados: 7, erros: 3 });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain("70%");
  });

  it("chama fetchFalhas com o campanhaId correto", async () => {
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    expect(deps.fetchFalhas).toHaveBeenCalledWith(CAMPANHA_ID);
  });
});

// ---------------------------------------------------------------------------
// Bloco 2 — NÃO dispara em ticks subsequentes (concluido_at > 10 s)
// ---------------------------------------------------------------------------

describe("dispararAlertaSeCampanhaRecemConcluida — tick subsequente (janela expirada)", () => {
  it("NÃO chama postAlert quando concluido_at foi há 11 s", async () => {
    const deps = makeDeps();
    const concluidoAt = new Date(AGORA_MS - 11_000).toISOString(); // 11 s atrás
    const row = rowConcluida({ concluido_at: concluidoAt });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
  });

  it("NÃO chama fetchFalhas quando a janela de 10 s expirou", async () => {
    const deps = makeDeps();
    const concluidoAt = new Date(AGORA_MS - 15_000).toISOString();
    const row = rowConcluida({ concluido_at: concluidoAt });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    expect(deps.fetchFalhas).not.toHaveBeenCalled();
  });

  it("dispara normalmente quando concluido_at foi há exatamente 9 s (dentro da janela)", async () => {
    const deps = makeDeps();
    const concluidoAt = new Date(AGORA_MS - 9_000).toISOString();
    const row = rowConcluida({ concluido_at: concluidoAt });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    expect(deps.postAlert).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Bloco 3 — NÃO dispara quando a campanha ainda está em andamento
// ---------------------------------------------------------------------------

describe("dispararAlertaSeCampanhaRecemConcluida — campanha não concluída", () => {
  it("NÃO chama postAlert quando status = 'em_andamento'", async () => {
    const deps = makeDeps();
    const row = rowConcluida({ status: "em_andamento" });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
  });

  it("NÃO chama postAlert quando concluido_at é null", async () => {
    const deps = makeDeps();
    const row = rowConcluida({ concluido_at: null });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bloco 4 — NÃO dispara quando não há erros (campanha 100 % sucesso)
// ---------------------------------------------------------------------------

describe("dispararAlertaSeCampanhaRecemConcluida — campanha sem erros", () => {
  it("NÃO chama postAlert quando erros = 0", async () => {
    const deps = makeDeps();
    const row = rowConcluida({ erros: 0, enviados: 10, total: 10 });
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, row, deps);
    expect(deps.postAlert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Bloco 5 — conteúdo da listagem de clientes com falha
// ---------------------------------------------------------------------------

describe("dispararAlertaSeCampanhaRecemConcluida — listagem de falhas na mensagem", () => {
  it("inclui o nome do cliente com falha na mensagem", async () => {
    const falhas: CampanhaAlertaFalha[] = [
      { nome: "João Silva", telefone: "11999990000", erro: "Número fora de serviço" },
    ];
    const deps = makeDeps(falhas);
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain("João Silva");
  });

  it("mascara os dígitos do telefone (deixa apenas últimos 4)", async () => {
    const falhas: CampanhaAlertaFalha[] = [
      { nome: "Ana Costa", telefone: "11988887777", erro: "Timeout" },
    ];
    const deps = makeDeps(falhas);
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    // Número original: 11988887777 → masked: *******7777
    expect(text).toContain("7777");
    expect(text).not.toContain("11988887777"); // nunca o número completo
  });

  it("exibe 'sem telefone' quando telefone é null", async () => {
    const falhas: CampanhaAlertaFalha[] = [
      { nome: "Pedro Souza", telefone: null, erro: "E-mail inválido" },
    ];
    const deps = makeDeps(falhas);
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain("sem telefone");
  });

  it("exibe 'motivo desconhecido' quando erro é null", async () => {
    const falhas: CampanhaAlertaFalha[] = [
      { nome: "Lúcia Ferreira", telefone: "11922223333", erro: null },
    ];
    const deps = makeDeps(falhas);
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).toContain("motivo desconhecido");
  });

  it("a seção de falhas não aparece quando fetchFalhas retorna lista vazia", async () => {
    const deps = makeDeps([]); // nenhuma falha retornada pelo mock
    await dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps);
    const text: string = (deps.postAlert as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(text).not.toContain("Primeiros clientes com falha");
  });
});

// ---------------------------------------------------------------------------
// Bloco 6 — robustez: postAlert lança exceção
// ---------------------------------------------------------------------------

describe("dispararAlertaSeCampanhaRecemConcluida — robustez", () => {
  it("propaga a exceção quando postAlert lança (o caller é quem captura com .catch)", async () => {
    const deps = makeDeps();
    (deps.postAlert as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Slack down"));
    await expect(
      dispararAlertaSeCampanhaRecemConcluida(CAMPANHA_ID, rowConcluida(), deps),
    ).rejects.toThrow("Slack down");
  });
});
