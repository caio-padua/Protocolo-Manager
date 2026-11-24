import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type pino from "pino";

vi.mock("../lib/concierge-device-throttle.js", () => ({
  purgeOldDeviceOfferLimits: vi.fn(),
}));
vi.mock("../lib/slack-reporter.js", () => ({
  postSlackAlertChecked: vi.fn(),
}));

import { purgeOldDeviceOfferLimits } from "../lib/concierge-device-throttle.js";
import { postSlackAlertChecked } from "../lib/slack-reporter.js";
import { iniciarJobLimpezaDeviceOfferLimits } from "../../../api-worker/src/worker.js";

describe("limpeza diária de device_offer_limits — alerta do CEO", () => {
  const info = vi.fn();
  const error = vi.fn();
  const logger = { info, error } as unknown as pino.Logger;
  let tick: () => Promise<void>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-25T01:15:00Z"));
    vi.stubEnv("PADAXOR_SLACK_CHANNEL_ID", " C-CEO-TEST ");
    vi.mocked(postSlackAlertChecked).mockResolvedValue(undefined);
    const schedule = vi.fn();
    iniciarJobLimpezaDeviceOfferLimits(logger, { schedule });
    expect(schedule).toHaveBeenCalledExactlyOnceWith(
      "0 3 * * *", expect.any(Function), { timezone: "America/Sao_Paulo" },
    );
    tick = schedule.mock.calls[0][1];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([0, 17])("registra %i linhas removidas sem enviar Slack", async (removed) => {
    vi.mocked(purgeOldDeviceOfferLimits).mockResolvedValue(removed);
    await tick();
    expect(info).toHaveBeenCalledWith({ removed }, "Worker: limpeza de device_offer_limits concluída");
    expect(error).not.toHaveBeenCalled();
    expect(postSlackAlertChecked).not.toHaveBeenCalled();
  });

  it("envia erro e timestamp BRT ao canal configurado", async () => {
    vi.mocked(purgeOldDeviceOfferLimits).mockRejectedValue(new Error("DB timeout"));
    await tick();
    expect(postSlackAlertChecked).toHaveBeenCalledExactlyOnceWith(
      "C-CEO-TEST",
      "*Concierge — falha na limpeza diária de device_offer_limits*\nErro: DB timeout\nHorário: 24/11/2026 22:15 (BRT)",
    );
    expect(error).toHaveBeenCalledWith({ err: "DB timeout" }, "Worker: falha na limpeza de device_offer_limits");
    expect(info).not.toHaveBeenCalled();
  });

  it("protege credenciais e não transforma o erro em menção Slack", async () => {
    vi.mocked(purgeOldDeviceOfferLimits).mockRejectedValue(
      new Error("DB <!channel> & postgres://user:senha@db/test token=segredo"),
    );
    await tick();
    const text = vi.mocked(postSlackAlertChecked).mock.calls[0][1];
    expect(text).toContain("&lt;!channel&gt; &amp;");
    expect(text).not.toContain("senha");
    expect(text).not.toContain("segredo");
    expect(JSON.stringify(error.mock.calls)).not.toContain("senha");
  });

  it("inclui o motivo mesmo quando a exceção é texto", async () => {
    vi.mocked(purgeOldDeviceOfferLimits).mockRejectedValue("DB indisponível");
    await tick();
    expect(postSlackAlertChecked).toHaveBeenCalledWith(
      "C-CEO-TEST", expect.stringContaining("Erro: DB indisponível"),
    );
  });

  it.each(["Slack API rejeitou o alerta: channel_not_found", "network timeout"])(
    "registra falha secundária sem rejeição e permite novo ciclo: %s",
    async (message) => {
      vi.mocked(purgeOldDeviceOfferLimits).mockRejectedValueOnce(new Error("DB timeout")).mockResolvedValueOnce(3);
      vi.mocked(postSlackAlertChecked).mockRejectedValueOnce(new Error(message));
      await expect(tick()).resolves.toBeUndefined();
      expect(error).toHaveBeenLastCalledWith(
        { err: message }, "Worker: falha ao alertar CEO no Slack sobre limpeza de device_offer_limits",
      );
      await tick();
      expect(info).toHaveBeenCalledWith({ removed: 3 }, expect.any(String));
      expect(postSlackAlertChecked).toHaveBeenCalledTimes(1);
    },
  );

  it.each([undefined, "   "])("não inventa destino quando o canal está ausente: %s", async (channel) => {
    vi.stubEnv("PADAXOR_SLACK_CHANNEL_ID", channel);
    vi.mocked(purgeOldDeviceOfferLimits).mockRejectedValue(new Error("DB timeout"));
    await expect(tick()).resolves.toBeUndefined();
    expect(postSlackAlertChecked).not.toHaveBeenCalled();
    expect(error).toHaveBeenLastCalledWith(
      { err: "PADAXOR_SLACK_CHANNEL_ID não configurado" },
      "Worker: falha ao alertar CEO no Slack sobre limpeza de device_offer_limits",
    );
  });
});
