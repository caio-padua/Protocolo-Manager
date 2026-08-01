/**
 * llm-monitor-dispatch.test.ts
 *
 * Testes de integração controlada do Monitor Horário de LLMs.
 *
 * Cenários cobertos:
 *  1. Caminho feliz: Slack e Telegram recebem o relatório.
 *  2. Falha do Slack: Telegram ainda recebe (fail-safe independente).
 *  3. Falha do Telegram: Slack não é afetado (fail-safe independente).
 *  4. Falha do buildLlmReport: nenhum canal é acionado.
 *  5. telegramChatId vazio: Telegram ignorado, Slack funciona normalmente.
 *  6. Ambos falham: os dois erros ficam registrados no resultado.
 *  7. Janela de coleta customizada chega ao buildLlmReport.
 *  8. slackFallbackChannelId é repassado ao postTelegramReport.
 *
 * Registro "ambos" — as cláusulas do Art. 70 do Código Paxter (9 a 13):
 *  9. ambosOk = true só quando os DOIS canais entregam.
 * 10. telegramSkipped NÃO é sucesso, e o erro nomeia a variável que falta.
 * 11. O campo de erro resume todos os canais que não entregaram.
 * 12. Sem relatório construído, nada é gravado.
 * 13. Falha ao gravar o histórico não derruba o ciclo — promessa recusada
 *     OU exceção síncrona.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runLlmMonitorJob,
  type LlmMonitorDeps,
  type LlmMonitorConfig,
} from "../lib/llm-monitor-dispatch";
import type { LlmReport } from "../lib/slack-reporter";

// ---------------------------------------------------------------------------
// Relatório mínimo válido para os testes
// ---------------------------------------------------------------------------
function makeReport(overrides: Partial<LlmReport> = {}): LlmReport {
  return {
    geradoEm:           new Date().toISOString(),
    periodo:            "última 1h",
    stats:              [],
    specsAtivas:        [],
    divergencias:       [],
    totalCustoUsd:      0,
    totalChamadas:      0,
    mudancasPlanilha:   [],
    totalItensPlanilha: 0,
    // Obrigatorios em LlmReport. Faltavam aqui, e o helper inteiro deixava de
    // satisfazer o tipo (TS2322) — erro que ja existia antes deste trabalho.
    itensConcluidos:     [],
    ultimoPreenchimento: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Configuração-padrão reutilizada nos testes
// ---------------------------------------------------------------------------
const CONFIG_PADRAO: LlmMonitorConfig = {
  channelId:       "C_SLACK_TESTE",
  telegramChatId:  "123456789",
};

// Logger mudo — não polui a saída dos testes
const LOGGER_MUDO = {
  info:  vi.fn(),
  warn:  vi.fn(),
  error: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helper: monta um conjunto de deps com mocks customizáveis
// ---------------------------------------------------------------------------
function makeDeps(overrides: Partial<LlmMonitorDeps> = {}): LlmMonitorDeps {
  return {
    buildLlmReport:    vi.fn().mockResolvedValue(makeReport()),
    postSlackReport:   vi.fn().mockResolvedValue(undefined),
    postTelegramReport: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------
describe("runLlmMonitorJob — dual-canal fail-safe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Cenário 1: caminho feliz ─────────────────────────────────────────────
  it("chama buildLlmReport, postSlackReport e postTelegramReport com sucesso", async () => {
    const deps = makeDeps();

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(deps.buildLlmReport).toHaveBeenCalledOnce();
    expect(deps.buildLlmReport).toHaveBeenCalledWith(1); // janela padrão de 1h

    expect(deps.postSlackReport).toHaveBeenCalledOnce();
    expect(deps.postSlackReport).toHaveBeenCalledWith(
      CONFIG_PADRAO.channelId,
      expect.objectContaining({ periodo: "última 1h" })
    );

    expect(deps.postTelegramReport).toHaveBeenCalledOnce();
    // 3º argumento = slackFallbackChannelId (undefined quando não configurado no config)
    expect(deps.postTelegramReport).toHaveBeenCalledWith(
      CONFIG_PADRAO.telegramChatId,
      expect.objectContaining({ periodo: "última 1h" }),
      undefined
    );

    expect(result.reportBuilt).toBe(true);
    expect(result.slackOk).toBe(true);
    expect(result.telegramOk).toBe(true);
    expect(result.telegramSkipped).toBe(false);
    expect(result.slackError).toBeUndefined();
    expect(result.telegramError).toBeUndefined();
  });

  // ── Cenário 2: Slack falha — Telegram ainda recebe ───────────────────────
  it("quando Slack lança erro, Telegram ainda recebe a mensagem", async () => {
    const erroSlack = new Error("Slack API timeout");
    const deps = makeDeps({
      postSlackReport: vi.fn().mockRejectedValue(erroSlack),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    // Relatório foi construído
    expect(result.reportBuilt).toBe(true);

    // Slack falhou mas não explodiu o processo
    expect(result.slackOk).toBe(false);
    expect(result.slackError).toBe("Slack API timeout");

    // Telegram ainda foi chamado e funcionou
    expect(deps.postTelegramReport).toHaveBeenCalledOnce();
    expect(result.telegramOk).toBe(true);
    expect(result.telegramError).toBeUndefined();
  });

  // ── Cenário 3: Telegram falha — Slack não é afetado ─────────────────────
  it("quando Telegram lança erro, Slack não é afetado", async () => {
    const erroTelegram = new Error("Telegram bot blocked");
    const deps = makeDeps({
      postTelegramReport: vi.fn().mockRejectedValue(erroTelegram),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    // Relatório foi construído
    expect(result.reportBuilt).toBe(true);

    // Slack funcionou normalmente
    expect(deps.postSlackReport).toHaveBeenCalledOnce();
    expect(result.slackOk).toBe(true);
    expect(result.slackError).toBeUndefined();

    // Telegram falhou mas não derrubou o Slack
    expect(result.telegramOk).toBe(false);
    expect(result.telegramError).toBe("Telegram bot blocked");
  });

  // ── Cenário 4: buildLlmReport falha — nenhum canal é acionado ────────────
  it("quando buildLlmReport falha, nenhum canal é acionado", async () => {
    const deps = makeDeps({
      buildLlmReport: vi.fn().mockRejectedValue(new Error("DB offline")),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(result.reportBuilt).toBe(false);
    expect(deps.postSlackReport).not.toHaveBeenCalled();
    expect(deps.postTelegramReport).not.toHaveBeenCalled();
    expect(result.slackOk).toBe(false);
    expect(result.telegramOk).toBe(false);
  });

  // ── Cenário 5: telegramChatId vazio — Telegram ignorado ──────────────────
  it("quando telegramChatId está vazio, Telegram é ignorado e Slack funciona", async () => {
    const deps = makeDeps();
    const config: LlmMonitorConfig = {
      ...CONFIG_PADRAO,
      telegramChatId: "",
    };

    const result = await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    expect(result.reportBuilt).toBe(true);
    expect(result.slackOk).toBe(true);
    expect(result.telegramSkipped).toBe(true);
    expect(deps.postTelegramReport).not.toHaveBeenCalled();
  });

  // ── Cenário 6: ambos falham — resultado registra os dois erros ───────────
  it("quando ambos os canais falham, ambos os erros são registrados", async () => {
    const deps = makeDeps({
      postSlackReport:   vi.fn().mockRejectedValue(new Error("Slack down")),
      postTelegramReport: vi.fn().mockRejectedValue(new Error("Telegram down")),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(result.reportBuilt).toBe(true);
    expect(result.slackOk).toBe(false);
    expect(result.telegramOk).toBe(false);
    expect(result.slackError).toBe("Slack down");
    expect(result.telegramError).toBe("Telegram down");
  });

  // ── Cenário 7: janela de coleta customizada é repassada ao buildLlmReport ─
  it("respeita horas customizadas na configuração", async () => {
    const deps = makeDeps();
    const config: LlmMonitorConfig = { ...CONFIG_PADRAO, horas: 24 };

    await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    expect(deps.buildLlmReport).toHaveBeenCalledWith(24);
  });

  // ── Cenário 8: slackFallbackChannelId é repassado ao postTelegramReport ──
  // (Task 34 — quando Telegram falha após retentativas, avisa o Slack)
  it("repassa slackFallbackChannelId ao postTelegramReport quando configurado", async () => {
    const deps = makeDeps();
    const config: LlmMonitorConfig = {
      ...CONFIG_PADRAO,
      slackFallbackChannelId: "C_SLACK_FALLBACK",
    };

    await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    expect(deps.postTelegramReport).toHaveBeenCalledWith(
      CONFIG_PADRAO.telegramChatId,
      expect.objectContaining({ periodo: "última 1h" }),
      "C_SLACK_FALLBACK"
    );
  });

  // =========================================================================
  // REGISTRO "AMBOS" — o resumo dual-canal do ciclo (Art. 70)
  // =========================================================================
  // Por que estes cinco testes existem:
  //
  // Os oito cenarios acima nunca injetam `salvarHistorico` no `makeDeps`.
  // Como o campo e opcional, `deps.salvarHistorico` fica `undefined` e o passo
  // 4 do dispatch — o bloco inteiro que grava o registro "ambos" — NAO EXECUTA
  // em nenhum deles.
  //
  // Ou seja: a regra que o revisor reprovou uma vez (tratar telegramSkipped
  // como sucesso), que foi corrigida e virou o Art. 70 do Codigo Paxter, nao
  // tinha nenhum teste segurando. Podia voltar a quebrar em silencio.
  //
  // Cada teste abaixo prende uma clausula do Art. 70.
  // =========================================================================

  // ── Art. 70: ambosOk = canalA E canalB ──────────────────────────────────
  it("grava o registro 'ambos' com ambosOk=true quando os DOIS canais entregam", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ salvarHistorico });

    await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(salvarHistorico).toHaveBeenCalledTimes(1);
    expect(salvarHistorico).toHaveBeenCalledWith(
      expect.objectContaining({ periodo: "última 1h" }),
      "ambos",
      true,
      undefined,          // sem erro: nenhum canal falhou nem foi ignorado
    );
  });

  // ── Art. 70: skip NAO e entrega — o caso que o revisor reprovou ──────────
  it("NAO conta telegramSkipped como sucesso, e nomeia a variavel que falta", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ salvarHistorico });
    const config: LlmMonitorConfig = { ...CONFIG_PADRAO, telegramChatId: "" };

    const result = await runLlmMonitorJob(config, deps, LOGGER_MUDO);

    // O Slack entregou, mas o ciclo dual NAO foi bem-sucedido.
    expect(result.slackOk).toBe(true);
    expect(result.telegramSkipped).toBe(true);

    const [, canal, ambosOk, erro] = salvarHistorico.mock.calls[0]!;
    expect(canal).toBe("ambos");
    expect(ambosOk).toBe(false);
    // O erro precisa DIZER o que falta, senao o CEO nao sabe o que configurar.
    expect(erro).toContain("PADAXOR_TELEGRAM_CHAT_ID");
  });

  // ── Art. 70: o campo `erros` documenta qualquer canal que nao entregou ───
  it("resume no campo de erro os dois canais quando ambos falham", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      salvarHistorico,
      postSlackReport:    vi.fn().mockRejectedValue(new Error("Slack down")),
      postTelegramReport: vi.fn().mockRejectedValue(new Error("Telegram down")),
    });

    await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    const [, , ambosOk, erro] = salvarHistorico.mock.calls[0]!;
    expect(ambosOk).toBe(false);
    expect(erro).toContain("Slack down");
    expect(erro).toContain("Telegram down");
  });

  // ── R2 da spec: sem relatorio nao ha o que resumir ───────────────────────
  it("NAO grava o registro 'ambos' quando o relatorio nem chegou a ser construido", async () => {
    const salvarHistorico = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      salvarHistorico,
      buildLlmReport: vi.fn().mockRejectedValue(new Error("banco fora")),
    });

    const result = await runLlmMonitorJob(CONFIG_PADRAO, deps, LOGGER_MUDO);

    expect(result.reportBuilt).toBe(false);
    expect(salvarHistorico).not.toHaveBeenCalled();
  });

  // ── Contrato do docblock: "Nunca relança exceção" ────────────────────────
  // Falha ao GRAVAR o historico nao pode derrubar o ciclo: o relatorio ja foi
  // entregue aos dois canais, e perder o registro e menos grave que estourar.
  // Cobre as duas formas de falhar — promessa recusada e excecao sincrona.
  it("nao derruba o ciclo quando salvarHistorico falha, das duas formas", async () => {
    const recusaPromessa = vi.fn().mockRejectedValue(new Error("banco fora"));
    await expect(
      runLlmMonitorJob(CONFIG_PADRAO, makeDeps({ salvarHistorico: recusaPromessa }), LOGGER_MUDO),
    ).resolves.toMatchObject({ slackOk: true, telegramOk: true });

    const estouraDireto = vi.fn(() => { throw new Error("estourou antes da promessa"); });
    await expect(
      runLlmMonitorJob(CONFIG_PADRAO, makeDeps({ salvarHistorico: estouraDireto }), LOGGER_MUDO),
    ).resolves.toMatchObject({ slackOk: true, telegramOk: true });
  });
});
