import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTelegramWebhookUrl } from "../lib/telegram";

describe("URL do webhook do Telegram", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prioriza PUBLIC_BASE_URL e remove caminho e barra final", () => {
    expect(resolveTelegramWebhookUrl({
      PUBLIC_BASE_URL: "https://paxmed.com.br/qualquer-caminho/",
      RAILWAY_PUBLIC_DOMAIN: "app.railway.app",
      REPLIT_DEV_DOMAIN: "app.replit.dev",
    })).toEqual({ url: "https://paxmed.com.br/api/webhooks/telegram" });
  });

  it("não usa uma origem configurada sem HTTPS nem faz fallback silencioso", () => {
    expect(resolveTelegramWebhookUrl({
      PUBLIC_BASE_URL: "http://paxmed.com.br",
      RAILWAY_PUBLIC_DOMAIN: "app.railway.app",
    })).toEqual({ url: null, error: "public_base_url_https_required" });
  });

  it("mantém o domínio Railway como fallback quando PUBLIC_BASE_URL está ausente", () => {
    expect(resolveTelegramWebhookUrl({
      RAILWAY_PUBLIC_DOMAIN: "https://app.railway.app/",
      REPLIT_DEV_DOMAIN: "app.replit.dev",
    })).toEqual({ url: "https://app.railway.app/api/webhooks/telegram" });
  });

  it("usa o domínio de desenvolvimento quando não há Railway nem domínio oficial", () => {
    expect(resolveTelegramWebhookUrl({
      REPLIT_DEV_DOMAIN: "app.replit.dev",
    })).toEqual({ url: "https://app.replit.dev/api/webhooks/telegram" });
  });
});
