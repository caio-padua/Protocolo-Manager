import { describe, expect, it } from "vitest";
import { montarCodigoExame, nickBase, nickUnico } from "../lib/codigo-semantico-exame";

describe("Nomenclatura Universal V4.0 para exames", () => {
  it("monta o codigo no formato aprovado", () => {
    const c = montarCodigoExame("tire", "gbas", "tshx");
    expect(c.semantico).toBe("EXAM TIRE GBAS TSHX 0001");
    expect(c.compacto).toBe("EXAMTIREGBASTSHX0001");
  });
  it("gera nick de 4 caracteres, sem acento e completando com X", () => {
    expect(nickBase("TSH")).toBe("TSHX");
    expect(nickBase("Amilase")).toBe("AMIL");
    expect(nickBase("Creatinina")).toBe("CREA");
    expect(nickBase("17 OH Progesterona")).toBe("17OH");
    expect(nickBase("Ácido úrico")).toBe("ACID");
    expect(nickBase("Anti DNA")).toBe("ANTI");
  });
  it("ignora conectivos no inicio do nome", () => {
    expect(nickBase("de Cortisol")).toBe("CORT");
  });
  it("resolve colisao trocando o ultimo caractere", () => {
    expect(nickUnico("Acido glicolico", new Set(["ACID"]))).toBe("ACI1");
    expect(nickUnico("Acido glicolico", new Set(["ACID", "ACI1"]))).toBe("ACI2");
    expect(nickUnico("Amilase", new Set())).toBe("AMIL");
  });
  it("recusa entradas invalidas", () => {
    expect(() => montarCodigoExame("TI", "GBAS", "TSHX")).toThrow();
    expect(() => montarCodigoExame("TIRE", "XXXX", "TSHX")).toThrow();
    expect(() => montarCodigoExame("TIRE", "GBAS", "TS")).toThrow();
    expect(() => montarCodigoExame("TIRE", "GBAS", "TSHX", 0)).toThrow();
    expect(() => nickBase("---")).toThrow();
  });
});
