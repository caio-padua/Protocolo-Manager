import { describe, it, expect } from "vitest";
import { criarTokenExame, verificarTokenExame, decidirAcessoExame, ehTokenLegado, ehTokenNovo, tokenParaEnvio } from "../lib/exam-link";

const DIA = 86_400_000;
const linha = (o: Partial<{ id: number; clientId: number; revogadoEm: Date | null }> = {}) => ({ id: 10, clientId: 5, revogadoEm: null, ...o });

describe("link novo de exame (v1)", () => {
  it("válido: assinatura boa, dentro da validade, mesma pessoa", () => {
    const t = criarTokenExame({ pdfId: 10, clientId: 5 });
    expect(ehTokenNovo(t)).toBe(true); expect(ehTokenLegado(t)).toBe(false);
    const v = verificarTokenExame(t);
    expect(v).toMatchObject({ ok: true, pdfId: 10, clientId: 5 });
    expect(decidirAcessoExame(v, linha())).toBe("liberar");
  });
  it("validade padrão de 30 dias: vale no dia 29, vence depois do dia 30", () => {
    const t = criarTokenExame({ pdfId: 10, clientId: 5, agora: 1_000_000 });
    expect(verificarTokenExame(t, 1_000_000 + 29 * DIA).ok).toBe(true);
    const v = verificarTokenExame(t, 1_000_000 + 31 * DIA);
    expect(v).toEqual({ ok: false, motivo: "expirado" });
    expect(decidirAcessoExame(v, linha())).toBe("negar_expirado");
  });
  it("adulterado: trocar o id do documento, o cliente ou a assinatura é recusado", () => {
    const t = criarTokenExame({ pdfId: 10, clientId: 5 });
    const [v1, payload, sig] = t.split(".");
    const falso = Buffer.from(Buffer.from(payload, "base64url").toString().replace(":10:5:", ":11:5:")).toString("base64url");
    expect(verificarTokenExame(`${v1}.${falso}.${sig}`)).toEqual({ ok: false, motivo: "assinatura" });
    expect(verificarTokenExame(`${v1}.${payload}.${sig.slice(0, -2)}xx`)).toEqual({ ok: false, motivo: "assinatura" });
    expect(verificarTokenExame("v1.lixo")).toEqual({ ok: false, motivo: "formato" });
    expect(verificarTokenExame("")).toEqual({ ok: false, motivo: "formato" });
  });
  it("revogado: mesmo com assinatura e validade boas, é negado", () => {
    const v = verificarTokenExame(criarTokenExame({ pdfId: 10, clientId: 5 }));
    expect(decidirAcessoExame(v, linha({ revogadoEm: new Date() }))).toBe("negar_revogado");
  });
  it("outra pessoa: token do cliente 5 não abre documento do cliente 6; documento inexistente é 404", () => {
    const v = verificarTokenExame(criarTokenExame({ pdfId: 10, clientId: 5 }));
    expect(decidirAcessoExame(v, linha({ clientId: 6 }))).toBe("negar_invalido");
    expect(decidirAcessoExame(v, undefined)).toBe("negar_inexistente");
    expect(decidirAcessoExame(v, linha({ id: 99 }))).toBe("negar_inexistente");
  });
  it("o token não carrega dado clínico e as recusas não devolvem o token", () => {
    const t = criarTokenExame({ pdfId: 10, clientId: 5 });
    expect(Buffer.from(t.split(".")[1], "base64url").toString()).toMatch(/^exame:10:5:\d+$/);
    expect(JSON.stringify(verificarTokenExame(t.slice(0, -3) + "abc"))).not.toContain(t);
  });
  it("emissão: padrão continua legado (sem mudar produção); ligada por EXAME_LINK_NOVO=1", () => {
    const row = { id: 10, clientId: 5, token: "a".repeat(48) };
    delete process.env.EXAME_LINK_NOVO;
    expect(tokenParaEnvio(row)).toBe(row.token);
    process.env.EXAME_LINK_NOVO = "1";
    expect(ehTokenNovo(tokenParaEnvio(row))).toBe(true);
    delete process.env.EXAME_LINK_NOVO;
  });
  it("legado de 48 hexadecimais continua reconhecido (não é invalidado)", () => {
    expect(ehTokenLegado("a1".repeat(24))).toBe(true);
    expect(ehTokenLegado("g".repeat(48))).toBe(false);
  });
});
