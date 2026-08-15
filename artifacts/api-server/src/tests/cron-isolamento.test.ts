/**
 * cron-isolamento.test.ts
 *
 * Confirma que o worker de lembretes (executarLembretesPeriodo) dispara e
 * conclui independentemente de uma campanha de 200 clientes rodando no mesmo
 * tick de cron — mesmo que a campanha nunca conclua.
 *
 * Estratégia:
 *   1. Mocka node-cron para capturar os callbacks registrados por startCronJobs.
 *   2. Mocka processarFilaCampanha com um Promise adiado (deferred) criado por
 *      teste — resolve apenas quando o teste liberar manualmente.
 *   3. Mocka executarLembretesPeriodo para resolver imediatamente, enquanto
 *      mantém as funções puras (importActual).
 *   4. Invoca startCronJobs() uma única vez em beforeAll e reutiliza os
 *      callbacks capturados em cada teste (evita o problema do singleton
 *      `started` que faz chamadas subsequentes retornarem sem registrar).
 *   5. Em cada teste que dispara callbacks, limpa os mocks e (quando necessário)
 *      substitui a implementação por uma deferred local.
 *
 * Testes puros (sem I/O):
 *   • partsParaTimezone       — extrai data e hora local em qualquer timezone.
 *   • horarioDentroDaJanela   — lógica de tolerância do tick.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted: variáveis acessíveis dentro das factories de vi.mock
// ---------------------------------------------------------------------------

/** Callbacks registrados via cron.schedule — preenchido quando startCronJobs é chamado. */
const cronCallbacks = vi.hoisted(
  () => [] as Array<{ pattern: string; cb: () => void }>,
);

// ---------------------------------------------------------------------------
// Mocks de módulos (hoistados para o topo do arquivo pelo bundler de testes)
// ---------------------------------------------------------------------------

// node-cron: captura callbacks sem executar nenhum schedule real.
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn((pattern: string, cb: () => void, _opts?: unknown) => {
      cronCallbacks.push({ pattern, cb });
    }),
  },
}));

// avatar-campanha-worker: processarFilaCampanha começa como stub genérico;
// cada teste que precisa de deferred substitui via mockImplementationOnce.
vi.mock("../lib/avatar-campanha-worker", () => ({
  processarFilaCampanha: vi.fn().mockResolvedValue({
    processadas: 200, enviadas: 200, erros: 0, leasesRecuperados: 0,
  }),
  ensureCampanhaSchema: vi.fn().mockResolvedValue(undefined),
}));

// lembrete-periodo: mantém funções puras reais (importActual) e substitui
// apenas executarLembretesPeriodo para resolução imediata.
vi.mock("../lib/lembrete-periodo", async (importActual) => {
  const real = await importActual<typeof import("../lib/lembrete-periodo")>();
  return {
    ...real,
    executarLembretesPeriodo: vi.fn().mockResolvedValue({
      examinados: 3, enviados: 3, falhas: 0, pulados: 0, detalhes: [],
    }),
  };
});

// Dependências restantes de cron.ts (pharmacy, receituario, video worker, logger).
vi.mock("../lib/pharmacy-email",      () => ({ sendNightlyPharmacyBatch:  vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/receituario-worker",  () => ({ processarReceituarioDiario: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/avatar-video-worker", () => ({ processarFilaVideo:         vi.fn().mockResolvedValue({ processadas: 0 }) }));
vi.mock("../lib/logger",              () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Importações do SUT (resolvidas após todos os mocks estarem registrados)
// ---------------------------------------------------------------------------

import { startCronJobs }       from "../lib/cron";
import {
  executarLembretesPeriodo,
  partsParaTimezone,
  horarioDentroDaJanela,
} from "../lib/lembrete-periodo";
import { processarFilaCampanha } from "../lib/avatar-campanha-worker";

// ---------------------------------------------------------------------------
// Bloco 1 — Funções puras (sem mocks de banco, sem I/O)
// ---------------------------------------------------------------------------

describe("partsParaTimezone — extração de hora/data local", () => {
  it("retorna data e horaMin corretos para BRT (UTC-3)", () => {
    // 2026-08-15T10:00:00Z === 07:00 BRT
    const { data, horaMin } = partsParaTimezone(
      new Date("2026-08-15T10:00:00Z"),
      "America/Sao_Paulo",
    );
    expect(data).toBe("2026-08-15");
    expect(horaMin).toBe(7 * 60); // 420 minutos
  });

  it("lida corretamente com meia-noite BRT (03:00 UTC)", () => {
    // 2026-08-16T03:00:00Z === 00:00 BRT
    const { data, horaMin } = partsParaTimezone(
      new Date("2026-08-16T03:00:00Z"),
      "America/Sao_Paulo",
    );
    expect(data).toBe("2026-08-16");
    expect(horaMin).toBe(0);
  });

  it("trata corretamente hora de pico (13:30 BRT)", () => {
    // 2026-08-15T16:30:00Z === 13:30 BRT
    const { horaMin } = partsParaTimezone(
      new Date("2026-08-15T16:30:00Z"),
      "America/Sao_Paulo",
    );
    expect(horaMin).toBe(13 * 60 + 30); // 810 minutos
  });
});

describe("horarioDentroDaJanela — lógica de tolerância", () => {
  it("retorna o horário quando está exatamente no alvo (delta=0)", () => {
    expect(horarioDentroDaJanela(["07:00", "18:00"], 420, 5)).toBe("07:00");
  });

  it("retorna o horário quando está dentro da tolerância (delta=3)", () => {
    expect(horarioDentroDaJanela(["07:00"], 423, 5)).toBe("07:00");
  });

  it("retorna null quando está além da tolerância (delta=6)", () => {
    expect(horarioDentroDaJanela(["07:00"], 426, 5)).toBeNull();
  });

  it("retorna null quando está ANTES do horário (delta negativo)", () => {
    expect(horarioDentroDaJanela(["07:00"], 419, 5)).toBeNull();
  });

  it("retorna o primeiro horário que casa quando há múltiplos", () => {
    // horaMin=1082 (18:02): "07:00" delta negativo, "18:00" delta=2 ≤ 5
    expect(horarioDentroDaJanela(["07:00", "18:00"], 1082, 5)).toBe("18:00");
  });

  it("retorna null para lista vazia", () => {
    expect(horarioDentroDaJanela([], 420, 5)).toBeNull();
  });

  it("ignora horários com formato inválido e avalia apenas os válidos", () => {
    expect(horarioDentroDaJanela(["25:00", "07:60", "07:00"], 420, 5)).toBe("07:00");
  });

  it("retorna null quando todos os horários são inválidos", () => {
    expect(horarioDentroDaJanela(["abc", "25:00"], 420, 5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bloco 2 — Integração com cron.ts: isolamento dos dois schedules "* * * * *"
// ---------------------------------------------------------------------------

describe("startCronJobs — isolamento entre worker de lembrete e worker de campanha", () => {
  /** Callback do tick de lembrete (pattern "* * * * *", posição 0). */
  let cbLembrete: () => void;
  /** Callback do tick de campanha (pattern "* * * * *", posição 1). */
  let cbCampanha: () => void;

  // Chama startCronJobs UMA ÚNICA VEZ para o describe inteiro.
  // Não pode ser chamado em beforeEach porque o singleton `started` de cron.ts
  // bloqueia chamadas repetidas — e após vi.resetModules() o import estático
  // deste arquivo não seria atualizado (causaria cronCallbacks vazios).
  beforeAll(() => {
    cronCallbacks.length = 0; // garante array limpo antes do registro
    startCronJobs();

    const minutos = cronCallbacks.filter((c) => c.pattern === "* * * * *");
    if (minutos.length < 2) {
      throw new Error(
        `startCronJobs deveria registrar ≥2 schedules "* * * * *", ` +
        `mas registrou ${minutos.length}. Verifique cron.ts.`,
      );
    }
    // Conforme cron.ts: lembrete é o 1º "* * * * *", campanha é o 2º.
    cbLembrete = minutos[0].cb;
    cbCampanha = minutos[1].cb;
  });

  // Antes de cada teste: zera contadores de chamada para assertions limpas.
  beforeEach(() => {
    vi.mocked(executarLembretesPeriodo).mockClear();
    vi.mocked(processarFilaCampanha).mockClear();

    // Restaura implementação padrão (resolução imediata) para ambos os workers.
    vi.mocked(executarLembretesPeriodo).mockResolvedValue({
      examinados: 3, enviados: 3, falhas: 0, pulados: 0, detalhes: [],
    });
    vi.mocked(processarFilaCampanha).mockResolvedValue({
      processadas: 200, enviadas: 200, erros: 0, leasesRecuperados: 0,
    });
  });

  // ── Estrutura dos schedules ────────────────────────────────────────────────

  it("registra dois schedules independentes '* * * * *' (lembrete e campanha)", () => {
    const minutos = cronCallbacks.filter((c) => c.pattern === "* * * * *");
    expect(minutos.length).toBeGreaterThanOrEqual(2);
  });

  it("startCronJobs é idempotente — chamada repetida não duplica schedules", () => {
    const antes = cronCallbacks.length;
    startCronJobs(); // `started` já é true; deve retornar sem registrar nada
    expect(cronCallbacks.length).toBe(antes);
  });

  // ── Callbacks são independentes entre si ──────────────────────────────────

  it("o tick de lembrete invoca executarLembretesPeriodo — e apenas ele", () => {
    cbLembrete();

    expect(executarLembretesPeriodo).toHaveBeenCalledOnce();
    expect(processarFilaCampanha).not.toHaveBeenCalled();
  });

  it("o tick de campanha invoca processarFilaCampanha — e apenas ele", () => {
    cbCampanha();

    expect(processarFilaCampanha).toHaveBeenCalledOnce();
    expect(executarLembretesPeriodo).not.toHaveBeenCalled();
  });

  // ── Isolamento de concorrência: lembrete não aguarda campanha ─────────────

  it("executarLembretesPeriodo conclui enquanto campanha deferred permanece pendente", async () => {
    // Deferred local: só resolve quando o teste chamar releaseCampanha().
    let releaseCampanha!: () => void;
    const campanhaPromise = new Promise<{
      processadas: number; enviadas: number; erros: number; leasesRecuperados: number;
    }>((res) => {
      releaseCampanha = () => res({ processadas: 200, enviadas: 200, erros: 0, leasesRecuperados: 0 });
    });
    vi.mocked(processarFilaCampanha).mockImplementationOnce(() => campanhaPromise);

    let lembreteResolveu = false;
    vi.mocked(executarLembretesPeriodo).mockImplementationOnce(async () => {
      await Promise.resolve(); // garante ao menos um microtask de latência
      lembreteResolveu = true;
      return { examinados: 3, enviados: 3, falhas: 0, pulados: 0, detalhes: [] };
    });

    // Dispara os dois callbacks simultaneamente — exatamente como node-cron faz.
    cbLembrete();
    cbCampanha();

    // Drena a fila de microtasks: lembrete deve ter resolvido em poucos ms.
    await new Promise<void>((r) => setTimeout(r, 20));

    // O lembrete resolveu — a campanha ainda está pendente (deferred não liberado).
    expect(lembreteResolveu).toBe(true);
    expect(processarFilaCampanha).toHaveBeenCalledOnce();

    // Libera a campanha para não deixar a promise pendurada.
    releaseCampanha();
    await campanhaPromise; // aguarda resolução para evitar leak
  });

  it("executarLembretesPeriodo conclui dentro da janela de tolerância de 5 minutos (limite real)", async () => {
    const TOLERANCIA_MS = 5 * 60 * 1_000;

    // Deferred local para a campanha.
    let releaseCampanha!: () => void;
    const campanhaPromise = new Promise<{
      processadas: number; enviadas: number; erros: number; leasesRecuperados: number;
    }>((res) => {
      releaseCampanha = () => res({ processadas: 200, enviadas: 200, erros: 0, leasesRecuperados: 0 });
    });
    vi.mocked(processarFilaCampanha).mockImplementationOnce(() => campanhaPromise);

    // Mede quanto tempo levou para o executarLembretesPeriodo ser chamado e resolver.
    let msLembrete = -1;
    vi.mocked(executarLembretesPeriodo).mockImplementationOnce(async () => {
      const t0 = Date.now();
      await Promise.resolve();
      msLembrete = Date.now() - t0;
      return { examinados: 3, enviados: 3, falhas: 0, pulados: 0, detalhes: [] };
    });

    cbLembrete();
    cbCampanha();

    // Aguarda o lembrete resolver via waitFor.
    await vi.waitFor(
      () => { expect(msLembrete).toBeGreaterThanOrEqual(0); },
      { timeout: TOLERANCIA_MS },
    );

    // Certifica que o tempo total ficou dentro da tolerância.
    expect(msLembrete).toBeLessThan(TOLERANCIA_MS);

    releaseCampanha();
    await campanhaPromise;
  });

  it("dois ticks simultâneos do mesmo callback de lembrete são fire-and-forget independentes", async () => {
    // Simula node-cron disparando o callback de lembrete duas vezes
    // antes que o primeiro tenha terminado (tick longo ou sobreposição de minuto).
    let resolveFirst!: () => void;
    const firstDone = new Promise<void>((r) => { resolveFirst = r; });

    let calls = 0;
    vi.mocked(executarLembretesPeriodo)
      .mockImplementationOnce(async () => {
        calls++;
        await firstDone; // bloqueia intencionalmente
        return { examinados: 1, enviados: 1, falhas: 0, pulados: 0, detalhes: [] };
      })
      .mockImplementationOnce(async () => {
        calls++;
        return { examinados: 1, enviados: 0, falhas: 0, pulados: 1, detalhes: [] };
      });

    cbLembrete(); // 1º tick
    cbLembrete(); // 2º tick — não deve aguardar o 1º (fire-and-forget)

    // Drena microtasks: o 2º call já foi despachado pelo cron callback.
    await new Promise<void>((r) => setTimeout(r, 10));

    // Ambos os callbacks foram chamados (2 ticks independentes).
    expect(calls).toBe(2);

    // Libera o primeiro tick.
    resolveFirst();
  });
});
