import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  values: new Map<string, { nomeExame: string; direcaoFavoravel: string; grupoExame: string }>(),
}));
vi.mock("@workspace/db", () => ({
  direcaoFavoravelExameTable: { nomeExame: "nome", id: "id" },
  db: {
    insert: () => ({
      values: (row: { nomeExame: string; direcaoFavoravel: string; grupoExame: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (state.values.has(row.nomeExame)) return [];
            state.values.set(row.nomeExame, row);
            return [{ id: state.values.size }];
          },
        }),
      }),
    }),
  },
}));

import { seedDirecoesExames } from "../lib/exam-extraction/seed-direcoes";

it("preserva uma direção manual e não duplica na segunda execução", async () => {
  state.values.clear();
  state.values.set("GLICOSE", { nomeExame: "GLICOSE", direcaoFavoravel: "ALVO", grupoExame: "MANUAL" });
  const primeiro = await seedDirecoesExames();
  expect(primeiro.inseridos).toBeGreaterThan(0);
  expect(state.values.get("GLICOSE")).toEqual({
    nomeExame: "GLICOSE", direcaoFavoravel: "ALVO", grupoExame: "MANUAL",
  });
  expect((await seedDirecoesExames()).inseridos).toBe(0);
});
