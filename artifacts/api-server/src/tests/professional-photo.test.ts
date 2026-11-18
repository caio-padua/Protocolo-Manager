import { describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => ({ photo: null as string | null }));
vi.mock("@workspace/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ photoUrl: rows.photo }] }) }) }) },
  professionalsTable: { photoUrl: "photoUrl", id: "id" },
}));
const leitura = vi.hoisted(() => vi.fn());
vi.mock("../lib/objectStorage", () => ({ ObjectStorageService: class { readPrivateObject = leitura; } }));

import { carregarFotoProfissional } from "../lib/professional-photo";

describe("foto da capa vem do profissional que atende", () => {
  it("sem id ou sem foto: null (nunca a foto de outra pessoa)", async () => {
    expect(await carregarFotoProfissional(null)).toBeNull();
    rows.photo = null;
    expect(await carregarFotoProfissional(7)).toBeNull();
  });
  it("lê JPEG e PNG do cadastro do profissional", async () => {
    rows.photo = "/api/storage/objects/uploads/photos/7-abc.jpg";
    leitura.mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
    expect((await carregarFotoProfissional(7))?.formato).toBe("jpg");
    expect(leitura).toHaveBeenCalledWith("uploads/photos/7-abc.jpg");
    leitura.mockResolvedValueOnce(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    expect((await carregarFotoProfissional(7))?.formato).toBe("png");
  });
  it("recusa caminho fora de uploads/photos, arquivo estranho e falha de leitura", async () => {
    rows.photo = "/api/storage/objects/uploads/photos/../certs/x.pfx";
    expect(await carregarFotoProfissional(7)).toBeNull();
    rows.photo = "/api/storage/objects/uploads/photos/7-abc.jpg";
    leitura.mockResolvedValueOnce(Buffer.from("texto qualquer"));
    expect(await carregarFotoProfissional(7)).toBeNull();
    leitura.mockRejectedValueOnce(new Error("falha"));
    expect(await carregarFotoProfissional(7)).toBeNull();
  });
});
