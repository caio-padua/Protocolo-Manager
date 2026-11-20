import { describe, expect, it } from "vitest";
import { nomeBackupGeral, nomeBackupIndividual } from "../lib/backup-mensagens-nome";

const data = new Date("2026-11-20T15:00:00-03:00");
const cliente = { nome: "João Silva", cpf: "00000000000" };

describe("nomenclatura de backup de mensagens", () => {
  it("1. Telegram geral", () => {
    expect(nomeBackupGeral("TG", data)).toBe("26.11.20 BACKUP MSG TG GERAL");
  });
  it("2. WhatsApp geral", () => {
    expect(nomeBackupGeral("WWP", data)).toBe("26.11.20 BACKUP MSG WWP GERAL");
  });
  it("3. Telegram individual", () => {
    expect(nomeBackupIndividual("TG", cliente, data)).toBe(
      "26.11.20 BACKUP MSG TG JOAO SILVA CPF 000.000.000-00",
    );
  });
  it("4. WhatsApp individual", () => {
    expect(nomeBackupIndividual("WWP", cliente, data)).toBe(
      "26.11.20 BACKUP MSG WWP JOAO SILVA CPF 000.000.000-00",
    );
  });
  it("recusa CPF invalido", () => {
    expect(() => nomeBackupIndividual("TG", { nome: "A", cpf: "123" }, data)).toThrow();
  });
});
