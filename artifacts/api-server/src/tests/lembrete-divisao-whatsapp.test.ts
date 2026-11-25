import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {} }));

describe("dividirParaWhatsapp", () => {
  it("não divide mensagem curta", async () => {
    const { dividirParaWhatsapp } = await import("../lib/lembrete-periodo");
    expect(dividirParaWhatsapp("Olá.\n\nTomar.")).toEqual(["Olá.\n\nTomar."]);
  });

  it("divide mensagem longa sem perder conteúdo e sem passar de 1500", async () => {
    const { dividirParaWhatsapp } = await import("../lib/lembrete-periodo");
    const blocos = Array.from({ length: 30 }, (_, i) => `Fórmula ${i}: ${"x".repeat(150)}`);
    const texto = blocos.join("\n\n");
    expect(texto.length).toBeGreaterThan(1600);
    const partes = dividirParaWhatsapp(texto);
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) expect(p.length).toBeLessThanOrEqual(1500);
    for (let i = 0; i < 30; i++) expect(partes.join("\n")).toContain(`Fórmula ${i}:`);
    expect(partes.join("").replace(/\s/g, "")).toBe(texto.replace(/\s/g, ""));
  });
});
