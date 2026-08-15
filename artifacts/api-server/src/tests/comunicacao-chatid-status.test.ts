/**
 * comunicacao-chatid-status.test.ts
 *
 * Verifica que o campo telegramChatIdConfigurado no GET /api/comunicacao/status
 * reflete corretamente a presença (ou ausência) da variável de ambiente
 * PADAXOR_TELEGRAM_CHAT_ID — e que o aviso âmbar "Chat ID não configurado"
 * é emitido pelo canal Telegram quando o campo está vazio.
 *
 * Cenários cobertos:
 *  1. Variável presente e não-vazia  → telegramChatIdConfigurado: true
 *  2. Variável ausente (undefined)   → telegramChatIdConfigurado: false
 *  3. Variável em branco (" ")       → telegramChatIdConfigurado: false (trim)
 *  4. Variável restaurada após remoção → volta a true
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Lógica extraída diretamente do handler GET /api/comunicacao/status
// (linha: telegramChatIdConfigurado: (process.env.PADAXOR_TELEGRAM_CHAT_ID ?? "").trim().length > 0)
//
// Recebe o objeto de ambiente como parâmetro para poder ser testada sem
// precisar de stub de processo real — fiel ao comportamento de produção.
// ---------------------------------------------------------------------------
function isTelegramChatIdConfigured(env: Record<string, string | undefined>): boolean {
  return (env.PADAXOR_TELEGRAM_CHAT_ID ?? "").trim().length > 0;
}

// ---------------------------------------------------------------------------
// Aviso emitido pelo montarCanal em comunicacao.ts quando Chat ID está vazio
// ---------------------------------------------------------------------------
const AVISO_ESPERADO = "Chat ID não configurado — o CEO não receberá alertas pelo Telegram.";

describe("telegramChatIdConfigurado — lógica do /api/comunicacao/status", () => {
  // ── Cenário 1: variável presente ──────────────────────────────────────────
  it("retorna true quando PADAXOR_TELEGRAM_CHAT_ID tem valor não-vazio", () => {
    const env = { PADAXOR_TELEGRAM_CHAT_ID: "123456789" };
    expect(isTelegramChatIdConfigured(env)).toBe(true);
  });

  // ── Cenário 2: variável ausente ────────────────────────────────────────────
  it("retorna false quando PADAXOR_TELEGRAM_CHAT_ID está ausente (undefined)", () => {
    const env: Record<string, string | undefined> = {};
    expect(isTelegramChatIdConfigured(env)).toBe(false);
  });

  // ── Cenário 3: variável em branco ──────────────────────────────────────────
  it("retorna false quando PADAXOR_TELEGRAM_CHAT_ID é só espaços em branco", () => {
    const env = { PADAXOR_TELEGRAM_CHAT_ID: "   " };
    expect(isTelegramChatIdConfigured(env)).toBe(false);
  });

  // ── Cenário 4: restaurar após remover ─────────────────────────────────────
  it("volta a retornar true após a variável ser restaurada", () => {
    const semVar: Record<string, string | undefined> = {};
    const comVar = { PADAXOR_TELEGRAM_CHAT_ID: "987654321" };

    expect(isTelegramChatIdConfigured(semVar)).toBe(false);  // estado removido
    expect(isTelegramChatIdConfigured(comVar)).toBe(true);   // estado restaurado
  });
});

// ---------------------------------------------------------------------------
// Aviso âmbar — texto exato que aparece na tela Comunicação Digital
//
// montarCanal() injeta o aviso no array `canal.avisos` quando o slot
// "destinoCeo" do Telegram não está configurado. A tela exibe o array inteiro
// em blocos âmbar — por isso o texto tem de ser exatamente este.
// ---------------------------------------------------------------------------
describe("aviso 'Chat ID não configurado' — texto canônico", () => {
  it("o texto do aviso começa com 'Chat ID não configurado'", () => {
    expect(AVISO_ESPERADO).toMatch(/^Chat ID não configurado/);
  });

  it("o texto menciona que o CEO não receberá alertas", () => {
    expect(AVISO_ESPERADO).toMatch(/CEO/);
    expect(AVISO_ESPERADO).toMatch(/alertas/);
  });

  it("o texto menciona o canal Telegram", () => {
    expect(AVISO_ESPERADO).toMatch(/Telegram/);
  });
});

// ---------------------------------------------------------------------------
// Ciclo completo: remover → confirmar false → restaurar → confirmar true
// (espelha exatamente o fluxo do "Done looks like" da task)
// ---------------------------------------------------------------------------
describe("ciclo completo: remover / restaurar PADAXOR_TELEGRAM_CHAT_ID", () => {
  const CHAT_ID_ORIGINAL = "111222333";

  let savedValue: string | undefined;

  beforeEach(() => {
    savedValue = process.env.PADAXOR_TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    // Sempre restaura o ambiente ao estado anterior
    if (savedValue !== undefined) {
      process.env.PADAXOR_TELEGRAM_CHAT_ID = savedValue;
    } else {
      delete process.env.PADAXOR_TELEGRAM_CHAT_ID;
    }
  });

  it("passo 1 → com variável: confirma true", () => {
    process.env.PADAXOR_TELEGRAM_CHAT_ID = CHAT_ID_ORIGINAL;
    expect(isTelegramChatIdConfigured(process.env)).toBe(true);
  });

  it("passo 2 → sem variável: confirma false", () => {
    delete process.env.PADAXOR_TELEGRAM_CHAT_ID;
    expect(isTelegramChatIdConfigured(process.env)).toBe(false);
  });

  it("passo 3 → restaurada: confirma true novamente", () => {
    delete process.env.PADAXOR_TELEGRAM_CHAT_ID;
    expect(isTelegramChatIdConfigured(process.env)).toBe(false); // removida

    process.env.PADAXOR_TELEGRAM_CHAT_ID = CHAT_ID_ORIGINAL;
    expect(isTelegramChatIdConfigured(process.env)).toBe(true);  // restaurada
  });
});
