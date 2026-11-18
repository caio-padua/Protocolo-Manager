import { eq } from "drizzle-orm";
import { db, professionalsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

export type FotoProfissional = { bytes: Buffer; formato: "jpg" | "png" };

const PREFIXO = "/api/storage/objects/";

/**
 * Foto do PROFISSIONAL que atende o cliente (capa dos documentos).
 * Nunca devolve a foto de outra pessoa: sem foto cadastrada, volta null e a capa sai sem foto.
 */
export async function carregarFotoProfissional(professionalId: number | null | undefined): Promise<FotoProfissional | null> {
  if (!professionalId) return null;
  try {
    const [p] = await db.select({ photoUrl: professionalsTable.photoUrl }).from(professionalsTable)
      .where(eq(professionalsTable.id, professionalId)).limit(1);
    const url = p?.photoUrl;
    if (!url || !url.startsWith(PREFIXO)) return null;
    const relativo = url.slice(PREFIXO.length);
    if (!/^uploads\/photos\/[A-Za-z0-9._-]+$/.test(relativo)) return null;
    const bytes = await new ObjectStorageService().readPrivateObject(relativo);
    if (bytes.length > 0 && bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, formato: "jpg" };
    if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { bytes, formato: "png" };
    return null;
  } catch {
    return null;
  }
}
