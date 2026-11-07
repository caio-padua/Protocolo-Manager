import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  save: vi.fn(), read: vi.fn(), getFiles: vi.fn(),
}));
vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    getPrivateObjectDir() { return "/synthetic-bucket/private"; }
    savePrivateObject = fake.save;
    readPrivateObject = fake.read;
  },
  objectStorageClient: { bucket: () => ({ getFiles: fake.getFiles }) },
}));

import { kindFromId, listDemonstrations, readDemonstration, saveDemonstration } from "../lib/clinical-demonstration-store";

const owner = { empresaId: 1, clinicId: 2, professionalId: 3, clientId: 4 };

describe("armazenamento isolado de demonstrações", () => {
  beforeEach(() => vi.resetAllMocks());

  it("grava fora do prefixo público e inclui todos os vínculos na chave", async () => {
    const bytes = Buffer.from("documento sintético");
    const id = await saveDemonstration(owner, "prescricao", bytes);
    expect(kindFromId(id)).toBe("prescricao");
    expect(fake.save).toHaveBeenCalledWith(
      `clinical-demonstrations/1/2/3/4/${id}.pdf`, bytes, "application/pdf",
    );
    expect(fake.save.mock.calls[0][0]).not.toMatch(/^uploads\//);
  });

  it("lista apenas o tipo e o contexto do médico selecionado", async () => {
    fake.getFiles.mockResolvedValue([[
      { name: "private/clinical-demonstrations/1/2/3/4/exames-11111111-1111-4111-8111-111111111111.pdf",
        metadata: { timeCreated: "2026-11-07T10:00:00Z" } },
      { name: "private/clinical-demonstrations/1/2/3/4/prescricao-11111111-1111-4111-8111-111111111111.pdf",
        metadata: { timeCreated: "2026-11-07T11:00:00Z" } },
    ]]);
    const list = await listDemonstrations(owner, "exames");
    expect(fake.getFiles).toHaveBeenCalledWith({ prefix: "private/clinical-demonstrations/1/2/3/4/exames-" });
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("exames");
  });

  it("recusa identificadores que tentem acessar outro caminho", async () => {
    await expect(readDemonstration(owner, "../certs/pfx/secret")).rejects.toThrow();
    expect(fake.read).not.toHaveBeenCalled();
    await expect(saveDemonstration({ ...owner, clientId: -1 }, "exames", new Uint8Array())).rejects.toThrow();
    expect(fake.save).not.toHaveBeenCalled();
  });
});
