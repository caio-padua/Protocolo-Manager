import { afterEach, describe, expect, it } from "vitest";
import { ptBR } from "date-fns/locale";
import { formatCivilDate } from "./civil-date";

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

describe("datas civis de protocolos", () => {
  it.each(["America/Sao_Paulo", "UTC"])(
    "mantém o mesmo dia em %s",
    (timezone) => {
      process.env.TZ = timezone;
      expect(formatCivilDate("2026-11-09", "dd/MM/yyyy")).toBe("09/11/2026");
      expect(formatCivilDate("2026-11-09", "dd")).toBe("09");
      expect(formatCivilDate("2026-11-09", "MMM", { locale: ptBR })).toBe("nov");
    },
  );

  it("recusa uma data civil impossível em vez de normalizá-la", () => {
    expect(() => formatCivilDate("2026-02-30", "dd/MM/yyyy")).toThrow("Data civil inválida.");
  });
});
