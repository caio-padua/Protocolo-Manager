import { describe, it, expect } from "vitest";
import { resolverIdentidadeWhatsapp } from "../lib/evolution-client-identity";

const exec = (rows: unknown[]) => ({ execute: async () => ({ rows }) });
const T = "5562982696656";

describe("identidade por telefone completo", () => {
  it("telefone repetido sem vínculo explícito continua ambíguo", async () => {
    expect(await resolverIdentidadeWhatsapp(exec([
      { id: 11, location_id: 30, explicito: null }, { id: 3482, location_id: 30, explicito: null }]), 5, T)).toBeNull();
  });
  it("vínculo administrativo não sobrepõe telefone de outra pessoa", async () => {
    expect(await resolverIdentidadeWhatsapp(exec([
      { id: 11, location_id: 30, explicito: true }, { id: 3482, location_id: 30, explicito: null }]), 5, T))
      .toBeNull();
  });
  it("dois vínculos confirmados continuam ambíguos", async () => {
    expect(await resolverIdentidadeWhatsapp(exec([
      { id: 11, location_id: 30, explicito: true }, { id: 3482, location_id: 30, explicito: true }]), 5, T)).toBeNull();
  });
  it("sufixo nunca identifica", async () => {
    expect(await resolverIdentidadeWhatsapp(exec([{ id: 11, location_id: 30, explicito: true }]), 5, "6656")).toBeNull();
  });
});
