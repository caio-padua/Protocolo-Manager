import { randomUUID } from "node:crypto";
import { objectStorageClient, ObjectStorageService } from "./objectStorage";

export type DemonstrationKind = "prescricao" | "exames";
type Owner = { empresaId: number; clinicId: number; professionalId: number; clientId: number };

function prefix(owner: Owner): string {
  for (const value of Object.values(owner)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Identidade inválida.");
  }
  return `clinical-demonstrations/${owner.empresaId}/${owner.clinicId}/${owner.professionalId}/${owner.clientId}/`;
}

export function kindFromId(id: string): DemonstrationKind | null {
  const match = /^(prescricao|exames)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.exec(id);
  return match ? match[1] as DemonstrationKind : null;
}

export async function saveDemonstration(owner: Owner, kind: DemonstrationKind, bytes: Uint8Array) {
  const id = `${kind}-${randomUUID()}`;
  await new ObjectStorageService().savePrivateObject(`${prefix(owner)}${id}.pdf`, Buffer.from(bytes), "application/pdf");
  return id;
}

export async function readDemonstration(owner: Owner, id: string) {
  if (!kindFromId(id)) throw new Error("Identificador inválido.");
  return new ObjectStorageService().readPrivateObject(`${prefix(owner)}${id}.pdf`);
}

export async function listDemonstrations(owner: Owner, kind: DemonstrationKind) {
  const directory = new ObjectStorageService().getPrivateObjectDir().replace(/^\/+|\/+$/g, "");
  const [bucket, ...baseParts] = directory.split("/");
  if (!bucket || !baseParts.length) throw new Error("Diretório privado indisponível.");
  const base = `${baseParts.join("/")}/${prefix(owner)}`;
  const [files] = await objectStorageClient.bucket(bucket).getFiles({ prefix: `${base}${kind}-` });
  return files.flatMap((file) => {
    const name = file.name.slice(base.length);
    const id = name.endsWith(".pdf") ? name.slice(0, -4) : "";
    const createdAt = file.metadata.timeCreated;
    return kindFromId(id) === kind && typeof createdAt === "string"
      ? [{ id, kind, createdAt }]
      : [];
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}
