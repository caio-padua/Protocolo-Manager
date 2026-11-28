import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const simulated = vi.hoisted(() => ({
  execute: vi.fn(),
  syncResources: vi.fn(),
}));

vi.mock("@workspace/db", () => ({ db: { execute: simulated.execute } }));
vi.mock("../lib/google-calendar", () => ({
  getUncachableGoogleCalendarClient: vi.fn(),
  verifyClinicAccount: vi.fn(),
}));
vi.mock("../lib/agenda-google-sync-recursos", () => ({
  runSyncRecursos: simulated.syncResources,
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

describe("ciclo periódico da agenda com serviços simulados", () => {
  beforeEach(() => {
    vi.resetModules();
    simulated.execute.mockReset().mockResolvedValue({ rows: [] });
    simulated.syncResources.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("executa imediatamente e repete após sessenta segundos", async () => {
    const { startGoogleAgendaSync } = await import("../lib/agenda-google-sync");
    vi.useFakeTimers();

    startGoogleAgendaSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(simulated.execute).toHaveBeenCalledTimes(1);
    expect(simulated.syncResources).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59_999);
    expect(simulated.execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(simulated.execute).toHaveBeenCalledTimes(2);
    expect(simulated.syncResources).toHaveBeenCalledTimes(2);
    vi.clearAllTimers();
  });

  it("compartilha uma leitura que ainda está em andamento", async () => {
    let finish: ((value: { rows: never[] }) => void) | undefined;
    simulated.execute.mockImplementationOnce(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    const { syncGoogleAgenda } = await import("../lib/agenda-google-sync");

    const first = syncGoogleAgenda();
    const second = syncGoogleAgenda();
    expect(second).toBe(first);
    expect(simulated.execute).toHaveBeenCalledTimes(1);
    expect(finish).toBeDefined();

    finish!({ rows: [] });
    await first;
    expect(simulated.syncResources).toHaveBeenCalledTimes(1);
  });
});
