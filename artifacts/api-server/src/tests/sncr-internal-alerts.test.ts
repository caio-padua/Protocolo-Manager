import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ cards: [] as any[], insert: vi.fn(), mail: vi.fn(), connected: vi.fn() }));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema"),
  db: { insert: state.insert },
}));
vi.mock("../lib/google-gmail", () => ({ sendGmailMessage: state.mail, isGmailConnected: state.connected }));
import { handleSncrAlert } from "../lib/sncr-alerts";
beforeEach(() => {
  vi.clearAllMocks(); state.cards = [];
  state.insert.mockReturnValue({ values: async (card: any) => { state.cards.push(card); } });
});
describe("alertas regulatórios internos independem de comunicação externa", () => {
  it.each(["exhausted", "no_range"] as const)("SNCR %s mantém dois cartões urgentes sem acessar Gmail", async status => {
    await handleSncrAlert({ status, controlledType: "A", uf: "SP", remaining: 0,
      prescriptionId: 101, clientId: 71, professionalName: "Médico sintético", message: "Sem numeração" },
    { notifyEmail: false });
    expect(state.cards).toHaveLength(2);
    expect(state.cards.map(c => c.assignedRole).sort()).toEqual(["adm_01", "medico_01"]);
    expect(state.cards.every(c => c.priority === "urgent" && c.clientId === 71)).toBe(true);
    expect(state.mail).not.toHaveBeenCalled(); expect(state.connected).not.toHaveBeenCalled();
  });
  it("SNCR baixo mantém cartão administrativo sem e-mail", async () => {
    await handleSncrAlert({ status: "low", controlledType: "B1", uf: "SP", remaining: 3,
      prescriptionId: 101, clientId: 71, professionalName: "Médico sintético", message: "Numeração baixa" },
    { notifyEmail: false });
    expect(state.cards).toMatchObject([{ type: "sncr_low", priority: "high", assignedRole: "adm_01" }]);
    expect(state.mail).not.toHaveBeenCalled();
  });
  it("falha ao criar cartão não bloqueia documento nem recorre a e-mail", async () => {
    state.insert.mockReturnValue({ values: async () => { throw new Error("db unavailable"); } });
    await expect(handleSncrAlert({ status: "exhausted", controlledType: "A", uf: "SP", remaining: 0,
      prescriptionId: 101, clientId: 71, professionalName: null, message: "Sem numeração" },
    { notifyEmail: false })).resolves.toBeUndefined();
    expect(state.insert).toHaveBeenCalledTimes(2);
    expect(state.mail).not.toHaveBeenCalled();
  });
});
