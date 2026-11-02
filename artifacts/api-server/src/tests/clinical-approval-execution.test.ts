import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimApprovalInTransaction,
  completeApprovalInTransaction,
} from "../lib/clinical-approval-execution";

const mock = vi.hoisted(() => ({
  claimedRows: [] as Array<{ id: number }>,
  currentRows: [] as Array<{ status: string }>,
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/db")>(),
  db: { transaction: vi.fn() },
}));

function transaction() {
  const updateChain = {
    set: (value: unknown) => { mock.updateSet(value); return updateChain; },
    where: (value: unknown) => { mock.updateWhere(value); return updateChain; },
    returning: () => Promise.resolve(mock.claimedRows),
  };
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: async () => mock.currentRows,
  };
  return {
    update: () => updateChain,
    select: () => selectChain,
    insert: () => ({ values: mock.insertValues }),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.claimedRows = [];
  mock.currentRows = [];
  mock.insertValues.mockResolvedValue(undefined);
});

describe("emissão de solicitação clínica com conferência", () => {
  it("faz uma única reivindicação pendente e registra o início da emissão", async () => {
    mock.claimedRows = [{ id: 7 }];
    const result = await claimApprovalInTransaction(transaction(), 7, 41);
    expect(result).toBe("claimed");
    expect(mock.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "processando",
      decidedByProfessionalId: 41,
    }));
    expect(mock.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 7,
      actorProfessionalId: 41,
      eventType: "emissao_iniciada",
    }));
  });

  it("reconhece repetição já aprovada sem iniciar uma segunda emissão", async () => {
    mock.currentRows = [{ status: "aprovado" }];
    const result = await claimApprovalInTransaction(transaction(), 7, 41);
    expect(result).toBe("already_approved");
    expect(mock.insertValues).not.toHaveBeenCalled();
  });

  it.each(["processando", "rejeitado", "pendente"])(
    "não reivindica novamente um pedido que permaneceu em %s",
    async status => {
      mock.currentRows = [{ status }];
      const result = await claimApprovalInTransaction(transaction(), 7, 41);
      expect(result).toBe("unavailable");
      expect(mock.insertValues).not.toHaveBeenCalled();
    },
  );

  it("conclui emissão e grava IDs dos documentos no histórico", async () => {
    mock.claimedRows = [{ id: 7 }];
    await completeApprovalInTransaction(transaction(), 7, 41, [101, 102]);
    expect(mock.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "aprovado",
      decidedByProfessionalId: 41,
      result: { documentIds: [101, 102] },
    }));
    expect(mock.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 7,
      actorProfessionalId: 41,
      eventType: "aprovado_e_emitido",
      details: { documentIds: [101, 102] },
    }));
  });

  it("interrompe se o estado mudou antes de registrar a conclusão", async () => {
    await expect(completeApprovalInTransaction(transaction(), 7, 41, [101]))
      .rejects.toMatchObject({ status: 409 });
    expect(mock.insertValues).not.toHaveBeenCalled();
  });
});
