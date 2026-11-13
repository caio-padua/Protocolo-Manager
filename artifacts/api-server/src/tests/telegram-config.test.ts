/** Fonte única do chat de alerta: cofre > ambiente, validação numérica, nunca troca de chat. */
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockGetSecret = vi.hoisted(() => vi.fn());
vi.mock("../lib/secure-settings", () => ({ getSecret: (...a: unknown[]) => mockGetSecret(...a) }));

import { resolverChatAlerta, chatAlertaOuNull, chatIdValido } from "../lib/telegram-config";

beforeEach(() => { vi.clearAllMocks(); delete process.env["PADAXOR_TELEGRAM_CHAT_ID"]; });

describe("chatIdValido", () => {
  it.each([
    ["5511977154000", true], ["-1001234567890", true], ["  123456  ", true],
    ["CEO_CHAT", false], ["12", false], ["12a456", false], ["", false], ["+5511977154000", false],
  ])("%s => %s", (v, esperado) => { expect(chatIdValido(v)).toBe(esperado); });
  it("null/undefined => false", () => { expect(chatIdValido(null)).toBe(false); expect(chatIdValido(undefined)).toBe(false); });
});

describe("resolverChatAlerta", () => {
  it("valor numérico vindo do cofre é usado; consulta a chave do cofre", async () => {
    mockGetSecret.mockResolvedValue("123456789");
    expect(await resolverChatAlerta()).toEqual({ chatId: "123456789", fonte: "cofre", motivo: null });
    expect(mockGetSecret).toHaveBeenCalledWith("telegram.ceoChatId");
  });
  it("sem cofre, valor numérico do ambiente é usado e identificado como ambiente", async () => {
    process.env["PADAXOR_TELEGRAM_CHAT_ID"] = "987654321";
    mockGetSecret.mockResolvedValue("987654321"); // getSecret cai no ambiente
    expect(await resolverChatAlerta()).toEqual({ chatId: "987654321", fonte: "ambiente", motivo: null });
  });
  it("valor não numérico (o Secret errado) é REJEITADO com motivo; não escolhe outro chat", async () => {
    mockGetSecret.mockResolvedValue("texto qualquer");
    expect(await resolverChatAlerta()).toEqual({ chatId: null, fonte: "ausente", motivo: "formato_invalido" });
    expect(await chatAlertaOuNull()).toBeNull();
  });
  it("ausente => motivo ausente", async () => {
    mockGetSecret.mockResolvedValue(null);
    expect(await resolverChatAlerta()).toEqual({ chatId: null, fonte: "ausente", motivo: "ausente" });
  });
  it("cofre fora do ar => motivo cofre_indisponivel (não vira 'não configurado' enganoso)", async () => {
    mockGetSecret.mockRejectedValue(new Error("db fora"));
    expect(await resolverChatAlerta()).toEqual({ chatId: null, fonte: "ausente", motivo: "cofre_indisponivel" });
  });
});
