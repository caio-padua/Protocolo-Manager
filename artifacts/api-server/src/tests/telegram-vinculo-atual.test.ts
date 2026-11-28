import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { vinculoTelegramAtualUnico } from "../lib/telegram-vinculo-atual";

const esperado = { clienteId: 1, empresaId: 5, chatId: "11111" };
describe("vínculo atual para envio Telegram", () => {
  it("confere consulta global parametrizada e identidade completa", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: "1", empresa_id: "5" }] });
    expect(await vinculoTelegramAtualUnico({ execute }, esperado)).toBe(true);
    const q = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(q.params).toEqual(["11111"]);
    expect(q.sql).toContain("LIMIT 2");
  });
  it.each([[], [{ id: 2, empresa_id: 5 }], [{ id: 1, empresa_id: 7 }],
    [{ id: 1, empresa_id: 5 }, { id: 2, empresa_id: 7 }],
  ])("vínculo ausente, divergente ou ambíguo não autoriza (%j)", async (...rows) => {
    const execute = vi.fn().mockResolvedValue({ rows });
    expect(await vinculoTelegramAtualUnico({ execute }, esperado)).toBe(false);
  });
  it("falha de banco propaga sem virar autorização", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("falha sintética"));
    await expect(vinculoTelegramAtualUnico({ execute }, esperado)).rejects.toThrow("falha sintética");
  });
  it.each([
    { ...esperado, clienteId: 0 }, { ...esperado, empresaId: 0 },
    { ...esperado, clienteId: 1.2 }, { ...esperado, chatId: "" },
  ])("entrada inválida não consulta o banco", async (entrada) => {
    const execute = vi.fn();
    expect(await vinculoTelegramAtualUnico({ execute }, entrada)).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
