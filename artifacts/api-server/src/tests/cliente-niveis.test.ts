/**
 * Niveis do cliente (clients.plano): Prata, Ouro, Platinum e Diamond.
 * Decisao do CEO em 14/11/2026. Teste estatico e de contrato: sem banco, sem rede.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CreateClientBody, UpdateClientBody } from "@workspace/api-zod";
import { clientsTable } from "@workspace/db";
import { NIVEIS_CLIENTE, NIVEL_ENTRADA, PALETA_NIVEL, nivelLegado, rotuloNivel } from "../../../padcom/src/lib/nivel-cliente";

const raiz = join(__dirname, "../../../..");
const base = { name: "Cliente Sintetico", cpf: "52998224725", email: "sintetico@example.com", phone: "11999990000", status: "active" as const };
const problemasDe = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) => (r.error?.issues ?? []).map((i) => i.path.join("."));

describe("Niveis do cliente", () => {
  it("a lista da interface e a do contrato sao a mesma, na ordem de progressao", () => {
    expect([...NIVEIS_CLIENTE]).toEqual(["prata", "ouro", "platinum", "diamond"]);
    expect(NIVEL_ENTRADA).toBe("prata");
  });

  it("o contrato aceita os quatro niveis novos (criar e atualizar)", () => {
    for (const plano of NIVEIS_CLIENTE) {
      expect(UpdateClientBody.safeParse({ ...base, plano }).success).toBe(true);
      expect(CreateClientBody.safeParse({ ...base, plano }).success).toBe(true);
    }
  });

  it("o contrato recusa os nomes antigos, e o unico motivo da recusa e o campo plano", () => {
    for (const plano of ["bronze", "platina", "noir", "PRATA", ""]) {
      for (const Corpo of [UpdateClientBody, CreateClientBody]) {
        const r = Corpo.safeParse({ ...base, plano });
        expect(r.success).toBe(false);
        expect(problemasDe(r)).toEqual(["plano"]);
      }
    }
  });

  it("o padrao do banco para quem chega e prata", () => {
    expect(clientsTable.plano.default).toBe("prata");
  });

  it("o rotulo mostra o nome do nivel e traco para valor ausente ou antigo", () => {
    expect(NIVEIS_CLIENTE.map(rotuloNivel)).toEqual(["Prata", "Ouro", "Platinum", "Diamond"]);
    for (const v of [null, undefined, "bronze", "platina"]) expect(rotuloNivel(v)).toBe("—");
    expect(Object.keys(PALETA_NIVEL)).toEqual([...NIVEIS_CLIENTE]);
  });

  it("nivel antigo sem equivalente seguro aparece como A revisar e preserva o valor anterior", () => {
    expect(nivelLegado("legado:ouro")).toBe("ouro");
    expect(nivelLegado("legado:rodio")).toBe("rodio");
    expect(nivelLegado("ouro")).toBeNull();
    expect(nivelLegado(null)).toBeNull();
    expect(rotuloNivel("legado:ouro")).toBe("A revisar");
    expect(rotuloNivel("legado:prata")).toBe("A revisar");
  });

  it("o contrato nao aceita gravar o marcador de pendencia pela API", () => {
    expect(UpdateClientBody.safeParse({ ...base, plano: "legado:ouro" }).success).toBe(false);
  });

  it("contraste texto/fundo atinge o minimo AA (4,5:1) no ponto mais escuro de cada degrade", () => {
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const razao = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    for (const n of NIVEIS_CLIENTE) {
      const p = PALETA_NIVEL[n];
      expect(razao(p.texto, p.fundoDe)).toBeGreaterThanOrEqual(4.5);
      expect(razao(p.texto, p.fundoAte)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a migracao registra o fluxo, tem rollback fora de migrations.sql e nao apaga dados", () => {
    const sql = readFileSync(join(raiz, "scripts/migrations/20261125_cliente_plano_niveis.sql"), "utf8");
    expect(sql).toContain("SET DEFAULT 'prata'");
    expect(sql).toMatch(/WHEN plano = 'bronze' THEN 'prata'/);
    expect(sql).toContain("'legado:' || plano");
    expect(sql).not.toMatch(/\bDELETE\b|\bDROP\b|TRUNCATE/i);
    const todas = readFileSync(join(raiz, "scripts/migrations.sql"), "utf8");
    expect(todas).toContain("20261125_cliente_plano_niveis.sql");
    expect(todas).not.toContain("rollback/");
  });
});
