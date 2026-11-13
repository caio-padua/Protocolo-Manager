import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseWorkerProfile, startWorkerJobs } from "../../../api-worker/src/worker";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as never;

describe("perfil restrito do api-worker", () => {
  const schedule = vi.fn();
  const scheduler = { schedule } as never;

  beforeEach(() => {
    schedule.mockReset();
    vi.clearAllMocks();
  });

  it("mantém o perfil completo como padrão legado e aceita o perfil restrito", () => {
    expect(parseWorkerProfile(undefined)).toBe("full");
    expect(parseWorkerProfile("full")).toBe("full");
    expect(parseWorkerProfile("telegram-relay-dev")).toBe("telegram-relay-dev");
  });

  it("falha fechado para um perfil desconhecido", () => {
    expect(() => parseWorkerProfile("telegram-and-everything")).toThrow(
      "Perfil de api-worker inválido"
    );
  });

  it("registra somente um cron do outbox e impede duplicação ou perfil misto", () => {
    startWorkerJobs(logger, "telegram-relay-dev", scheduler);
    startWorkerJobs(logger, "telegram-relay-dev", scheduler);

    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(
      "* * * * *",
      expect.any(Function),
      { timezone: "America/Sao_Paulo" }
    );
    expect(() => startWorkerJobs(logger, "full")).toThrow(
      "não pode iniciar também full"
    );
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
