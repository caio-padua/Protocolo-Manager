import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/slack-reporter.js", () => ({ postSlackAlertChecked: vi.fn() }));
vi.mock("../lib/logger.js", () => ({ logger: { error: vi.fn() } }));
vi.mock("../lib/brt.js", () => ({ brtDateTime: () => "29/10/2026 10:15" }));

import { notifyConciergeBlocked } from "../lib/concierge-block-alert.js";
import { postSlackAlertChecked } from "../lib/slack-reporter.js";
import { logger } from "../lib/logger.js";

describe("alerta de bloqueio Concierge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postSlackAlertChecked).mockResolvedValue(undefined);
    vi.stubEnv("PADAXOR_SLACK_CHANNEL_ID", "CEO-channel");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["12345678901", "123.456.789-01"])("mascara CPF %s e inclui contexto", async (cpf) => {
    await notifyConciergeBlocked(cpf, 4, "POST /scheduling/requests");
    const [channel, text] = vi.mocked(postSlackAlertChecked).mock.calls[0];
    expect(channel).toBe("CEO-channel");
    expect(text).toContain("123.***.***-01");
    expect(text).not.toContain(cpf);
    expect(text).toContain("Tentativas registradas: 4");
    expect(text).toContain("29/10/2026 10:15 (BRT)");
    expect(text).toContain("POST /scheduling/requests");
  });

  it("usa o canal CEO padrão", async () => {
    vi.stubEnv("PADAXOR_SLACK_CHANNEL_ID", "");
    await notifyConciergeBlocked("12345678901", 3, "GET /scheduling/concierge-offer");
    expect(postSlackAlertChecked).toHaveBeenCalledWith("C0BLW5S7GQL", expect.stringContaining("GET /scheduling/concierge-offer"));
  });

  it.each(["Slack não configurado", "Slack API rejeitou o alerta: channel_not_found", "rede indisponível"])(
    "registra falha sem propagar: %s", async (error) => {
      vi.mocked(postSlackAlertChecked).mockRejectedValue(new Error(error));
      await expect(notifyConciergeBlocked("12345678901", 3, "GET /scheduling/concierge-offer")).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        { path: "GET /scheduling/concierge-offer", cpf: "123.***.***-01" },
        expect.any(String),
      );
    },
  );
});
