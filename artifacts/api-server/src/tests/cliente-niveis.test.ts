/**
 * Niveis do cliente (clients.plano): Prata, Ouro, Platinum e Diamond.
 * Decisao do CEO em 14/11/2026. Teste estatico e de contrato: sem banco, sem rede.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CreateClientBody, UpdateClientBody } from "@workspace/api-zod";
import { clientsTable } from "@workspace/db";
import { NIVEIS_CLIENTE, NIVEL_ENTRADA, PALETA_NIVEL, rotuloNivel } from "../../../padcom/src/lib/nivel-cliente";

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

  it("a migracao converte bronze e platina, preserva o resto e e idempotente", () => {
    const sql = readFileSync(join(raiz, "scripts/migrations/20261125_cliente_plano_niveis.sql"), "utf8");
    expect(sql).toContain("SET DEFAULT 'prata'");
    expect(sql).toMatch(/SET plano = 'prata' WHERE plano = 'bronze'/);
    expect(sql).toMatch(/SET plano = 'platinum' WHERE plano = 'platina'/);
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE/i);
    expect(readFileSync(join(raiz, "scripts/migrations.sql"), "utf8")).toContain("20261125_cliente_plano_niveis.sql");
  });
});
