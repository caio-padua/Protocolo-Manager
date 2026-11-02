import { and, eq, inArray, or } from "drizzle-orm";
import { catalogoExamesTable, db } from "@workspace/db";

export type ExamCatalogInput = {
  nomeExame: string;
  codigoExame?: string | null;
  grupoPrincipal?: string | null;
  preparo?: string | null;
  tipo: "SANGUE" | "IMAGEM" | "OUTROS";
};

function normalizedName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function validateExamCatalogItems<T extends ExamCatalogInput>(items: T[]): Promise<T[]> {
  if (!items.length) return [];
  const codes = [...new Set(items.map((item) => item.codigoExame).filter((code): code is string => Boolean(code)))];
  const names = [...new Set(items.map((item) => item.nomeExame))];
  const conditions = [
    codes.length ? inArray(catalogoExamesTable.codigoExame, codes) : undefined,
    names.length ? inArray(catalogoExamesTable.nomeExame, names) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const catalog = await db.select({
    codigoExame: catalogoExamesTable.codigoExame,
    nomeExame: catalogoExamesTable.nomeExame,
    grupoPrincipal: catalogoExamesTable.grupoPrincipal,
    ativo: catalogoExamesTable.ativo,
  }).from(catalogoExamesTable).where(and(
    eq(catalogoExamesTable.ativo, true),
    or(...conditions),
  ));
  const byCode = new Map(catalog.map((item) => [item.codigoExame, item]));
  const byName = new Map<string, typeof catalog>();
  for (const item of catalog) {
    const key = normalizedName(item.nomeExame ?? "");
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  return items.map((item) => {
    const bySubmittedCode = item.codigoExame ? byCode.get(item.codigoExame) : undefined;
    const matchingNames = item.codigoExame ? [] : byName.get(normalizedName(item.nomeExame)) ?? [];
    const match = bySubmittedCode ?? (matchingNames.length === 1 ? matchingNames[0] : undefined);
    if (!match?.ativo || !match.codigoExame || !match.nomeExame) {
      throw new Error("EXAM_CATALOG_INVALID: Selecione cada exame no catálogo ativo antes de solicitar.");
    }
    return {
      ...item,
      nomeExame: match.nomeExame,
      codigoExame: match.codigoExame,
      grupoPrincipal: match.grupoPrincipal ?? item.grupoPrincipal ?? null,
    };
  });
}
