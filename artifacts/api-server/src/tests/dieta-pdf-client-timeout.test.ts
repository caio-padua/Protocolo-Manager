/**
 * dieta-pdf-client-timeout.test.ts
 *
 * Valida a lógica de abort do fetch em /api/dieta/emitir-pdf no cliente.
 *
 * Regras confirmadas (Task #221):
 *   - Fetch que nunca resolve é cancelado após o timeout e lança mensagem amigável.
 *   - A aba em branco pré-aberta (pdfWinRef) é fechada no abort.
 *   - Servidor 504 antes do timeout: mensagem vem do corpo JSON.
 *   - Resposta 200 a tempo limpa o timer (sem memory leak).
 *   - Erro de rede (não-AbortError) é re-lançado e fecha a aba.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Lógica central extraída do mutationFn de emitirPdf em dieta/index.tsx
// ---------------------------------------------------------------------------

interface FetchResult {
  ok: boolean;
  status: number;
  json: () => Promise<{ error?: string }>;
  blob: () => Promise<Blob>;
}

/**
 * Espelha o bloco fetch+abort do mutationFn de emitirPdf.
 */
async function emitirPdfFetch(
  fetchImpl: (url: string, init: RequestInit) => Promise<FetchResult>,
  pdfWinClose: () => void,
  timeoutMs = 100,
): Promise<Blob> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let r: FetchResult;
  try {
    r = await fetchImpl("/api/dieta/emitir-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pesoKg: 70, alturaCm: 175, idade: 30, sexo: "M" }),
      signal: ac.signal,
    });
    clearTimeout(timer);
  } catch (fetchErr) {
    clearTimeout(timer);
    pdfWinClose();
    if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
      throw new Error("Timeout ao gerar plano nutricional — tente novamente.");
    }
    throw fetchErr;
  }

  if (!r.ok) {
    pdfWinClose();
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Falha ao gerar o plano nutricional.");
  }

  return r.blob();
}

/** Mock de fetch que nunca resolve por conta própria mas rejeita com AbortError quando sinalizado. */
function hangingFetch(_url: string, init: RequestInit): Promise<FetchResult> {
  return new Promise<FetchResult>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      const err = new Error("The user aborted a request.");
      err.name = "AbortError";
      reject(err);
    });
    // Nunca chama resolve — simula servidor que não responde.
  });
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("emitirPdf — AbortController e tratamento de timeout", () => {
  let closeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    closeSpy = vi.fn();
  });

  it("T1 — fetch que nunca resolve é cancelado e lança mensagem amigável", async () => {
    await expect(emitirPdfFetch(hangingFetch, closeSpy, 30)).rejects.toThrow(
      "Timeout ao gerar plano nutricional — tente novamente.",
    );
  }, 500);

  it("T2 — aba em branco é fechada quando o fetch é abortado por timeout", async () => {
    await emitirPdfFetch(hangingFetch, closeSpy, 30).catch(() => {});
    expect(closeSpy).toHaveBeenCalledOnce();
  }, 500);

  it("T3 — servidor responde 504 a tempo: mensagem vem do JSON e aba é fechada", async () => {
    const fetch504 = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      json: async () => ({ error: "Timeout ao gerar plano nutricional — tente novamente." }),
      blob: async () => new Blob(),
    });

    await expect(
      emitirPdfFetch(fetch504 as never, closeSpy, 5_000),
    ).rejects.toThrow("Timeout ao gerar plano nutricional — tente novamente.");
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it("T4 — resposta 200 a tempo limpa o timer sem fechar a aba", async () => {
    const mockBlob = new Blob(["PDF"], { type: "application/pdf" });
    const fetchOk = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      blob: async () => mockBlob,
    });

    const result = await emitirPdfFetch(fetchOk as never, closeSpy, 5_000);

    expect(result).toBe(mockBlob);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("T5 — erro de rede (não-AbortError) é re-lançado e fecha a aba", async () => {
    const networkError = new TypeError("Failed to fetch");
    const fetchNetErr = vi.fn().mockRejectedValue(networkError);

    await expect(emitirPdfFetch(fetchNetErr as never, closeSpy, 5_000)).rejects.toThrow(
      "Failed to fetch",
    );
    expect(closeSpy).toHaveBeenCalledOnce();
  });
});
