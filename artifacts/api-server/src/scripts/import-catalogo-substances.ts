import { inArray } from "drizzle-orm";
import { db, catalogoItensTable, substancesTable } from "@workspace/db";

// Importa do deposito transmutado (catalogo_itens) para a caixinha operacional
// (substances), que alimenta a tela Substancias. Idempotente por codigo_padcom.
// Regra de ouro: o deposito guarda 100% do dado; aqui so trazemos para operar,
// sem perder nenhum campo da origem (todos foram espelhados em substances).
//
// Escopo: substancias aplicaveis (injetaveis EV/IM + implantes). Formulas vao
// para a caixinha de Prescricao; exames e protocolos tem natureza propria e nao
// sao substancias.

const CATEGORIAS_SUBSTANCIA = ["injetavel_ev", "injetavel_im", "implante"] as const;

const PROCEDURE_BY_CATEGORIA: Record<string, string> = {
  injetavel_ev: "iv",
  injetavel_im: "im",
  implante: "implant",
};

const DURATION_BY_PROCEDURE: Record<string, number> = {
  iv: 30,
  im: 15,
  implant: 60,
};

// Paleta da marca (Padcon Conect): ciano para endovenoso, verde-petroleo para
// intramuscular, verde escuro para implante.
const COLOR_BY_PROCEDURE: Record<string, string> = {
  iv: "#45B8CC",
  im: "#3D7A7A",
  implant: "#2E5E5E",
};

function asText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

async function main() {
  const itens = await db
    .select()
    .from(catalogoItensTable)
    .where(inArray(catalogoItensTable.categoria, [...CATEGORIAS_SUBSTANCIA]));

  const existentes = await db
    .select({ codigoPadcom: substancesTable.codigoPadcom })
    .from(substancesTable);
  const jaExiste = new Set(
    existentes.map((e) => e.codigoPadcom).filter((c): c is string => c != null),
  );

  let criados = 0;
  let atualizados = 0;
  let pulados = 0;
  const porCategoria: Record<string, number> = {};

  await db.transaction(async (tx) => {
  for (const item of itens) {
    const codigoPadcom = asText(item.codigoPadcom);
    const nome = asText(item.nome);
    if (!codigoPadcom || !nome) {
      pulados++;
      continue;
    }

    const categoria = item.categoria ?? "";
    const procedureType = PROCEDURE_BY_CATEGORIA[categoria] ?? "iv";
    porCategoria[categoria] = (porCategoria[categoria] ?? 0) + 1;

    const precoValido = typeof item.preco === "number";

    // Campos vindos do catalogo (atualizados em re-importacao). Campos
    // operacionais/manuais (stock, beneficios) NAO entram aqui para nao serem
    // sobrescritos no update.
    const catalogo = {
      name: nome,
      category: asText(item.areaSemantica) ?? "GERAL",
      color: COLOR_BY_PROCEDURE[procedureType] ?? "#3D7A7A",
      procedureType,
      durationMinutes: DURATION_BY_PROCEDURE[procedureType] ?? 30,
      defaultDose: asText(item.posologia),
      pricePerUnit: precoValido ? (item.preco as number) : 0,
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

    // No update (re-import), so sobrescrevemos o preco quando o catalogo traz um
    // valor valido — assim um preco ajustado manualmente nao e zerado por um
    // catalogo sem preco (regra de ouro: nunca perder dado).
    const { pricePerUnit: _drop, ...catalogoSemPreco } = catalogo;
    const setUpdate = precoValido ? catalogo : catalogoSemPreco;

    const novo = !jaExiste.has(codigoPadcom);

    await tx
      .insert(substancesTable)
      .values(catalogo)
      .onConflictDoUpdate({
        target: substancesTable.codigoPadcom,
        set: setUpdate,
      });

    if (novo) {
      jaExiste.add(codigoPadcom);
      criados++;
    } else {
      atualizados++;
    }
  }
  });

  const totalSubstances = await db.select().from(substancesTable);

  console.log("=== Importacao catalogo_itens -> substances ===");
  console.log("Itens elegiveis (injetaveis+implantes):", itens.length);
  console.log("Criados:", criados);
  console.log("Atualizados:", atualizados);
  console.log("Pulados (sem codigo/nome):", pulados);
  console.log("Por categoria:", porCategoria);
  console.log("Total em substances agora:", totalSubstances.length);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
