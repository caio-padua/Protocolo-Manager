// ===========================================================================
// REGISTRO DECLARATIVO DE INTEGRACOES (motor unico — Padrao 18).
//
// Uma FONTE DA VERDADE para as plataformas de credencial chave/valor que o
// operador edita pela tela. Cada plataforma e UMA entrada; cada campo diz onde
// mora o valor (cofre cifrado = secret; app_settings em claro = config), o
// rotulo amigavel e regras de sanitizacao. As rotas (/api/integrations) e a tela
// (Padrao 18) se montam sozinhas a partir daqui.
//
// LINHA VERMELHA: nunca trocar uma `vaultKey`/`settingKey` ja existente — as
// libs de integracao (asaas.ts, telegram.ts, stripe, webhooks) leem por essa
// MESMA chave via getSecret(); trocar quebra a integracao real.
// ===========================================================================

export type IntegrationFieldKind = "secret" | "config";

export interface IntegrationFieldDef {
  field: string; // nome do campo na tela/payload
  label: string; // rotulo amigavel (PT-BR)
  kind: IntegrationFieldKind; // secret = cofre cifrado; config = app_settings (texto)
  key: string; // chave do cofre (secret) OU chave do app_settings (config)
  secret: boolean; // mascara/olho na tela (config nao-sensivel = false)
  envName?: string; // env equivalente (so para contagem de "faltando")
  placeholder?: string;
  sanitize?: "digits"; // sanitizacao autoritativa no servidor
  minLen?: number;
  maxLen?: number;
}

export interface IntegrationDef {
  provider: string;
  label: string;
  fields: IntegrationFieldDef[];
  enabledKey?: string; // app_settings booleano ("true"/"false") — toggle ligar/desligar
  allowCustom: boolean; // permite o operador criar campos extras pela tela
  webhookPath?: string; // caminho do endpoint de webhook deste sistema (somente-leitura, p/ o operador copiar)
}

export const INTEGRATIONS: Record<string, IntegrationDef> = {
  asaas: {
    provider: "asaas",
    label: "Asaas",
    allowCustom: true,
    webhookPath: "/api/asaas/webhook",
    fields: [
      {
        field: "apiKey",
        label: "Chave de API",
        kind: "secret",
        key: "asaas.apiKey",
        secret: true,
        envName: "ASAAS_API_KEY",
        placeholder: "Cole a chave de API do Asaas",
      },
      {
        field: "webhookToken",
        label: "Token do Webhook",
        kind: "secret",
        key: "asaas.webhookToken",
        secret: true,
        envName: "ASAAS_WEBHOOK_TOKEN",
        placeholder: "Cole o token que valida a notificação recebida",
      },
      {
        field: "baseUrl",
        label: "URL base da API",
        kind: "config",
        key: "asaas.baseUrl",
        secret: false,
        placeholder: "Produção: https://api.asaas.com/v3",
      },
    ],
  },
  stripe: {
    provider: "stripe",
    label: "Stripe",
    enabledKey: "stripe.active",
    allowCustom: true,
    fields: [
      {
        field: "secretKey",
        label: "Chave secreta (Secret Key)",
        kind: "secret",
        key: "stripe.secretKey",
        secret: true,
        envName: "STRIPE_SECRET_KEY",
        placeholder: "sk_live_…",
      },
      {
        field: "webhookSecret",
        label: "Segredo do Webhook (Signing Secret)",
        kind: "secret",
        key: "stripe.webhookSecret",
        secret: true,
        placeholder: "whsec_…",
      },
      {
        field: "publishableKey",
        label: "Chave publicável (Publishable Key)",
        kind: "config",
        key: "stripe.publishableKey",
        secret: false,
        placeholder: "pk_live_…",
      },
    ],
  },
  zapsign: {
    provider: "zapsign",
    label: "ZapSign",
    enabledKey: "zapsign.active",
    allowCustom: true,
    fields: [
      {
        field: "token",
        label: "Token de acesso (API)",
        kind: "secret",
        key: "zapsign.token",
        secret: true,
        envName: "ZAPSIGN_TOKEN",
        placeholder: "Cole o token da ZapSign",
      },
    ],
  },
  telegram: {
    provider: "telegram",
    label: "Telegram",
    enabledKey: "telegram.active",
    allowCustom: true,
    fields: [
      {
        field: "botToken",
        label: "Token do bot (BotFather)",
        kind: "secret",
        key: "telegram.botToken",
        secret: true,
        placeholder: "Cole o token do @BotFather",
      },
      {
        field: "webhookSecret",
        label: "Segredo do Webhook",
        kind: "secret",
        key: "telegram.webhookSecret",
        secret: true,
        placeholder: "Segredo que valida a chamada do Telegram",
      },
    ],
  },
};

export function getIntegration(provider: string): IntegrationDef | undefined {
  return INTEGRATIONS[provider];
}

// Normaliza um rotulo livre em um slug seguro para chave do cofre
// (custom.<provider>.<slug>): minusculas, sem acento, so [a-z0-9_].
export function slugifyCustom(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
