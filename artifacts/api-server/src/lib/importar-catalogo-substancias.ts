import { inArray } from "drizzle-orm";
import { db, catalogoItensTable, substancesTable } from "@workspace/db";
import { catalogSubstanceUpdate, configuredDurationSeconds } from "./substance-duration";
import { travarCatalogoClinico } from "./catalogo-via-confirmada";

const categorias = ["injetavel_ev", "injetavel_im", "injetavel_sc", "implante"] as const;
const procedures: Record<string, string> = {
  injetavel_ev: "iv", injetavel_im: "im", injetavel_sc: "sc", implante: "implant",
};
const durations: Record<string, number> = { iv: 30, im: 15, sc: 15, implant: 60 };
const colors: Record<string, string> = {
  iv: "#45B8CC", im: "#3D7A7A", sc: "#2B9DB3", implant: "#2E5E5E",
};
function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

// A operação inteira lê as fontes depois de obter a trava compartilhada.
export async function importarCatalogoSubstancias() {
  const preciseDurations = {
    im: await configuredDurationSeconds("im"),
    sc: await configuredDurationSeconds("sc"),
    implant: await configuredDurationSeconds("implant"),
  };
  let criados = 0;
  let atualizados = 0;
  let pulados = 0;
  let quantidade = 0;
  const porCategoria: Record<string, number> = {};

  await db.transaction(async tx => {
    await travarCatalogoClinico(tx);
    const itens = await tx.select().from(catalogoItensTable)
      .where(inArray(catalogoItensTable.categoria, [...categorias]));
    quantidade = itens.length;
    const existentes = await tx.select({ codigoPadcom: substancesTable.codigoPadcom }).from(substancesTable);
    const jaExiste = new Set(existentes.map(e => e.codigoPadcom).filter((c): c is string => c != null));

    for (const item of itens) {
      const codigoPadcom = asText(item.codigoPadcom);
      const nome = asText(item.nome);
      if (!codigoPadcom || !nome) { pulados++; continue; }
      const categoria = item.categoria ?? "";
      const procedureType = procedures[categoria] ?? "iv";
      porCategoria[categoria] = (porCategoria[categoria] ?? 0) + 1;
      const precoValido = typeof item.preco === "number";
      const catalogo = {
        name: nome,
        category: asText(item.areaSemantica) ?? "GERAL",
        color: colors[procedureType] ?? "#3D7A7A",
        procedureType,
        durationMinutes: durations[procedureType] ?? 30,
        preciseDurationSeconds: preciseDurations[procedureType as keyof typeof preciseDurations] ?? null,
        defaultDose: asText(item.posologia),
        pricePerUnit: precoValido ? item.preco as number : 0,
        description: asText(item.composicao) ?? asText(item.descricao),
        categoryType: asText(item.subCategoria),
        codigoPadcom,
        subCategoria: asText(item.subCategoria),
        disponivel: item.disponivel ?? null,
        tags: item.tags ?? null,
        blocoId: asText(item.blocoId),
        grau: asText(item.grau),
        viaUso: asText(item.viaUso),
        frequenciaBase: asText(item.frequenciaBase),
        composicao: asText(item.composicao),
        posologia: asText(item.posologia),
        areaSemantica: asText(item.areaSemantica),
        exigeValidacaoHumana: item.exigeValidacaoHumana ?? null,
        unidadeId: item.unidadeId ?? null,
        posologiaEstruturada: item.posologiaEstruturada ?? null,
      };
      await tx.insert(substancesTable).values(catalogo).onConflictDoUpdate({
        target: substancesTable.codigoPadcom,
        set: catalogSubstanceUpdate(catalogo, precoValido),
      });
      if (jaExiste.has(codigoPadcom)) atualizados++;
      else { jaExiste.add(codigoPadcom); criados++; }
    }
  });
  const totalSubstances = await db.select({ id: substancesTable.id }).from(substancesTable);
  return { itens: quantidade, criados, atualizados, pulados, porCategoria, total: totalSubstances.length };
}
