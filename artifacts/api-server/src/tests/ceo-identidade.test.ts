import { describe, expect, it, vi, beforeEach } from "vitest";

const estado = vi.hoisted(() => ({ ativo: true, medicoId: 6 as number | null }));
vi.mock("@workspace/db", () => ({
  db: { execute: async () => ({ rows: [{ foto_path: null, medico_ativo: estado.ativo, medico_professional_id: estado.medicoId }] }) },
}));

import { medicoDoCeoPodeEmitir } from "../lib/ceo-identidade";

describe("interruptor Profissional Médico do CEO", () => {
  beforeEach(() => { estado.ativo = true; estado.medicoId = 6; });

  it("ligado: o médico do CEO emite", async () => {
    expect(await medicoDoCeoPodeEmitir(6)).toBe(true);
  });
  it("desligado: o médico do CEO NÃO emite", async () => {
    estado.ativo = false;
    expect(await medicoDoCeoPodeEmitir(6)).toBe(false);
  });
  it("desligado: outro médico da clínica continua emitindo no próprio nome", async () => {
    estado.ativo = false;
    expect(await medicoDoCeoPodeEmitir(7)).toBe(true);
  });
  it("sem médico vinculado ao CEO: nenhum bloqueio para os demais", async () => {
    estado.medicoId = null; estado.ativo = false;
    expect(await medicoDoCeoPodeEmitir(7)).toBe(true);
  });
});
