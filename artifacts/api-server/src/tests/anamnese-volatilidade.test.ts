import { describe, it, expect } from "vitest";
import { volatilidadeDa, herdaResposta } from "../lib/anamnese-volatilidade";

describe("o que muda e o que não muda entre anamneses", () => {
  it("história que não muda ou só cresce é herdada; estado atual não", () => {
    for (const id of [1, 2, 42, 43, 8, 315, 9, 10, 90, 7, 100, 135]) expect(herdaResposta(volatilidadeDa(id))).toBe(true);
    for (const id of [41, 85, 53, 54, 99, 112, 116, 125, 91, 95, 11]) expect(herdaResposta(volatilidadeDa(id))).toBe(false);
  });
  it("diagnosticos com curso sao evolutivos e vem preenchidos", () => {
    for (const id of [6, 82, 83, 84]) { expect(volatilidadeDa(id)).toBe("evolutiva"); expect(herdaResposta("evolutiva")).toBe(true); }
  });
  it("pergunta desconhecida (nova no questionário) vem em branco por segurança", () => { expect(volatilidadeDa(999999)).toBe("muda"); });
  it("nova sessão herda só da última concluída do mesmo cliente e escopa a clínica (rota)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../routes/anamnese-consulta.ts", import.meta.url), "utf8");
    expect(src).toMatch(/AND empresa_id=\$\{empresaId\}/);
    expect(src).toMatch(/pg_advisory_xact_lock/);
    expect(src).not.toMatch(/mode='consulta'.*mode='paciente'/);
  });
});
