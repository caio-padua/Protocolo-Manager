import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTelegramWebhookUrl } from "../lib/telegram";

describe("URL do webhook do Telegram", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prioriza PUBLIC_BASE_URL em produção e remove caminho e barra final", () => {
    expect(resolveTelegramWebhookUrl({
      PUBLIC_BASE_URL: "https://paxmed.com.br/qualquer-caminho/",
      RAILWAY_PUBLIC_DOMAIN: "app.railway.app",
      REPLIT_DEV_DOMAIN: "app.replit.dev",
      NODE_ENV: "production",
    })).toEqual({ url: "https://paxmed.com.br/api/webhooks/telegram" });
  });

  it("recusa PUBLIC_BASE_URL temporária do Replit em produção", () => {
    expect(resolveTelegramWebhookUrl({
      PUBLIC_BASE_URL: "https://app.replit.dev",
      NODE_ENV: "production",
    })).toEqual({ url: null, error: "dominio_temporario_nao_permitido_em_producao" });
  });

  it("não usa uma origem configurada sem HTTPS nem faz fallback silencioso", () => {
    expect(resolveTelegramWebhookUrl({
      PUBLIC_BASE_URL: "http://paxmed.com.br",
      RAILWAY_PUBLIC_DOMAIN: "app.railway.app",
    })).toEqual({ url: null, error: "public_base_url_https_required" });
  });

  it("mantém o domínio Railway como fallback permanente em produção", () => {
    expect(resolveTelegramWebhookUrl({
      RAILWAY_PUBLIC_DOMAIN: "https://app.railway.app/",
      REPLIT_DEV_DOMAIN: "app.replit.dev",
      NODE_ENV: "production",
    })).toEqual({ url: "https://app.railway.app/api/webhooks/telegram" });
  });

  it("não usa domínio temporário do Replit como fallback em produção", () => {
    expect(resolveTelegramWebhookUrl({
      REPLIT_DEV_DOMAIN: "app.replit.dev",
      NODE_ENV: "production",
    })).toEqual({ url: null, error: "dominio_publico_ausente" });
  });

  it("rejeita domínio temporário mesmo se informado como domínio Railway em produção", () => {
    expect(resolveTelegramWebhookUrl({
      RAILWAY_PUBLIC_DOMAIN: "app.replit.dev",
      NODE_ENV: "production",
    })).toEqual({ url: null, error: "dominio_temporario_nao_permitido_em_producao" });
  });

  it("usa o domínio de desenvolvimento somente fora de produção", () => {
    expect(resolveTelegramWebhookUrl({
      REPLIT_DEV_DOMAIN: "app.replit.dev",
      NODE_ENV: "development",
    })).toEqual({ url: "https://app.replit.dev/api/webhooks/telegram" });
  });
});
