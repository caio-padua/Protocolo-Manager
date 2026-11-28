import { describe, it, expect } from "vitest";
import { montarPerguntas } from "../lib/pulso-perguntas";

const H = "2026-11-22", O = "2026-11-21";
const r = (data: string, periodo: string, c: Partial<Record<"sono" | "energia" | "libido", number>>) => ({ data, periodo, sono: null, energia: null, libido: null, ...c });
const campos = (x: ReturnType<typeof montarPerguntas>) => x.map((q) => `${q.campo}${q.gravaEm === "ontem_noite" ? "@ontem" : ""}${q.pendente ? "*" : ""}`);

describe("regra do Pulso: uma nota por período", () => {
  it("manhã sem nada: sono + libido de ontem (grava ontem à noite)", () => {
    expect(campos(montarPerguntas([], H, "manha"))).toEqual(["sono", "libido@ontem*"]);
  });
  it("manhã com libido de ontem já respondida: só sono", () => {
    expect(campos(montarPerguntas([r(O, "noite", { libido: 7 })], H, "manha"))).toEqual(["sono"]);
  });
  it("tarde: energia; sono pendente se não respondeu; libido de ontem NÃO é mais perguntada (prazo acabou)", () => {
    expect(campos(montarPerguntas([], H, "tarde"))).toEqual(["energia", "sono*"]);
    expect(campos(montarPerguntas([r(H, "manha", { sono: 8 })], H, "tarde"))).toEqual(["energia"]);
  });
  it("noite: libido; sono e energia pendentes", () => {
    expect(campos(montarPerguntas([], H, "noite"))).toEqual(["libido", "sono*", "energia*"]);
    expect(campos(montarPerguntas([r(H, "manha", { sono: 8 }), r(H, "tarde", { energia: 6 })], H, "noite"))).toEqual(["libido"]);
  });
  it("textos dizem a que momento a nota se refere", () => {
    const [sono, lib] = montarPerguntas([], H, "manha");
    expect(sono!.enunciado).toContain("noite passada (de 21/11 para 22/11)");
    expect(lib!.pendente).toContain("libido de ontem à noite (21/11)");
    expect(montarPerguntas([], H, "tarde")[1]!.pendente).toContain("sono da noite passada (de 21/11 para 22/11)");
  });
});
