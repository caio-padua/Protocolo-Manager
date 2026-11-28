/**
 * A Área do Cliente nunca assina PDF: assina só o médico logado com o próprio certificado.
 * Teste estático sobre a rota (sem banco, sem certificado).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "../routes/area-paciente.ts"), "utf8");

describe("Área do Cliente sem certificado global", () => {
  it("não importa nem chama o gerador de PDF assinado", () => {
    expect(src).not.toMatch(/pdf-signer/);
    expect(src).not.toMatch(/generateSignedRASPdf|generateProtocolDocumentPdf/);
  });
  it("as duas rotas de PDF exigem sessão do cliente e respondem 409", () => {
    for (const rota of ["/area-paciente/ras/:id/pdf", "/area-paciente/protocolo/:id/pdf"]) {
      const i = src.indexOf(`router.get("${rota}"`);
      expect(i).toBeGreaterThan(-1);
      const trecho = src.slice(i, i + 300);
      expect(trecho).toContain("unauthorized(res)");
      expect(trecho).toContain("res.status(409)");
    }
  });
});
