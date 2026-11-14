import { afterEach, describe, expect, it, vi } from "vitest";

const cfg = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  settings: new Map<string, string>(),
}));

vi.mock("../lib/secure-settings.js", () => ({
  getSecret: vi.fn(async (key: string) => cfg.secrets.get(key) ?? null),
  getSetting: vi.fn(async (key: string) => cfg.settings.get(key) ?? null),
}));

import { asaasCreateCharge, asaasCreateCustomer } from "../lib/asaas";

afterEach(() => {
  cfg.secrets.clear();
  cfg.settings.clear();
  vi.unstubAllGlobals();
});

describe("separação de ambientes do Asaas", () => {
  it("falha antes da rede quando a chave sandbox não existe", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(asaasCreateCustomer({ name: "Cliente sintético", cpfCnpj: "00000000000" }, "sandbox"))
      .rejects.toThrow(/sandbox nao configurado/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recusa chave de produção e host sandbox alternativo antes da rede", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    cfg.secrets.set("asaas.sandbox.apiKey", "$aact_prod_fake");
    await expect(asaasCreateCustomer({ name: "Cliente sintético", cpfCnpj: "00000000000" }, "sandbox"))
      .rejects.toThrow(/de producao/i);
    cfg.secrets.set("asaas.sandbox.apiKey", "chave-sandbox-sintetica");
    cfg.settings.set("asaas.sandbox.baseUrl", "https://api-sandbox.attacker.invalid/v3");
    await expect(asaasCreateCustomer({ name: "Cliente sintético", cpfCnpj: "00000000000" }, "sandbox"))
      .rejects.toThrow(/url do sandbox invalida/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recusa caminho diferente mesmo no host oficial do sandbox", async () => {
    cfg.secrets.set("asaas.sandbox.apiKey", "chave-sandbox-sintetica");
    cfg.settings.set("asaas.sandbox.baseUrl", "https://api-sandbox.asaas.com/v3/fora-da-api");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(asaasCreateCustomer({ name: "Cliente sintético", cpfCnpj: "00000000000" }, "sandbox"))
      .rejects.toThrow(/url do sandbox invalida/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("envia somente chave sandbox ao host oficial e desativa notificação", async () => {
    cfg.secrets.set("asaas.sandbox.apiKey", "chave-sandbox-sintetica");
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ id: "cus_sandbox_sintetico" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    await asaasCreateCustomer({ name: "Cliente sintético", cpfCnpj: "00000000000" }, "sandbox");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://api-sandbox.asaas.com/v3/customers");
    expect((fetch.mock.calls[0][1].headers as Record<string, string>).access_token).toBe("chave-sandbox-sintetica");
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({ notificationDisabled: true });
  });

  it("recusa configuração de produção direcionada a qualquer host que não seja o oficial", async () => {
    cfg.secrets.set("asaas.apiKey", "chave-producao-sintetica");
    cfg.settings.set("asaas.baseUrl", "https://api-sandbox.asaas.com/v3");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(asaasCreateCustomer({ name: "Cliente sintético", cpfCnpj: "00000000000" }))
      .rejects.toThrow(/nao podem se misturar/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cria cobrança sandbox sem notificações externas", async () => {
    cfg.secrets.set("asaas.sandbox.apiKey", "chave-sandbox-sintetica");
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ id: "pay_sandbox_sintetico", status: "PENDING", value: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    await asaasCreateCharge({ customerId: "cus_sandbox_sintetico", value: 1, dueDate: "2026-12-01", externalReference: "teste-local" }, "sandbox");
    const body = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(fetch.mock.calls[0][0]).toBe("https://api-sandbox.asaas.com/v3/payments");
    expect(body).toMatchObject({ notificationDisabled: true, externalReference: "teste-local", value: 1 });
  });
});
