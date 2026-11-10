import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import {
  protocolItemsTable,
  type Substance,
  type SubstanceBlendComponent,
} from "@workspace/db/schema";
import { buildProtocolSubstanceCatalogSnapshot } from "../lib/protocol-substance-catalog";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;

function createTableSql(table: Parameters<typeof getTableConfig>[0]): string {
  const config = getTableConfig(table);
  const dialect = new PgDialect();
  const columns = config.columns.map(column => {
    if (column.name === "id") return `"id" SERIAL PRIMARY KEY`;
    let defaultSql = "";
    if (column.default !== undefined) {
      const value = column.default as any;
      if (value?.queryChunks) {
        defaultSql = ` DEFAULT ${dialect.sqlToQuery(value).sql}`;
      } else {
        const encoded = column.mapToDriverValue(value);
        const literal = typeof encoded === "number" || typeof encoded === "boolean"
          ? String(encoded)
          : `'${String(encoded).replaceAll("'", "''")}'`;
        defaultSql = ` DEFAULT ${literal}`;
      }
    }
    return `"${column.name}" ${column.getSQLType()}${defaultSql}${column.notNull ? " NOT NULL" : ""}`;
  });
  return `CREATE TABLE "${config.name}" (${columns.join(", ")})`;
}

const substance = {
  id: 99,
  name: "Substância sintética",
  category: "injetável",
  color: "#336699",
  defaultDose: "dose padrão sintética",
  unit: "ampola",
  maxSessionsPerWeek: null,
  intervalDays: 15,
  notes: null,
  stockQuantity: 8,
  stockUnit: "ampola",
  pricePerUnit: 49.47,
  procedureType: "im",
  doctorParticipation: true,
  durationMinutes: 30,
  preciseDurationSeconds: 150,
  description: "Descrição sintética",
  mainFunction: null,
  perceivedEffects: null,
  timeToEffect: null,
  starRating: 5,
  bodySystemEffects: {},
  categoryMeters: {},
  longevityBenefit: null,
  qualityOfLifeImpact: null,
  sleepBenefit: null,
  energyBenefit: null,
  libidoBenefit: null,
  physicalPerformance: null,
  muscleStrength: null,
  mentalClarity: null,
  skinHairNails: null,
  immuneSupport: null,
  contraindications: null,
  scientificEvidence: null,
  categoryType: null,
  codigoPadcom: null,
  subCategoria: null,
  disponivel: true,
  tags: ["teste sintético"],
  blocoId: null,
  grau: null,
  viaUso: "IM",
  frequenciaBase: "a cada quinze dias",
  composicao: "Composição sintética",
  posologia: "Posologia sintética",
  areaSemantica: null,
  exigeValidacaoHumana: false,
  unidadeId: null,
  posologiaEstruturada: null,
  concentrationMg: "100 MG",
  volumeAmpola: "2 ML",
  isBlend: true,
  presentationQuantity: 1,
  presentationUnit: "ampola",
  ampouleVolumeMl: 2,
  createdAt: new Date("2030-01-01T12:00:00Z"),
} as Substance;

const component = {
  id: 501,
  substanceId: 99,
  componentSubstanceId: 14,
  sortOrder: 0,
  componentName: "Componente sintético",
  doseValue: 100,
  doseUnit: "MG",
  quantity: 1,
  quantityUnit: "ampola",
  notes: "Nota sintética",
  createdAt: new Date("2030-01-01T12:00:00Z"),
} as SubstanceBlendComponent;

beforeAll(async () => {
  isolated = await startIsolatedPostgres();
  await isolated.pool.query(createTableSql(protocolItemsTable));
}, 60_000);

afterAll(async () => {
  if (isolated) await isolated.stop();
}, 60_000);

describe("Fotografia do cadastro persistida no PostgreSQL isolado", () => {
  it("grava a apresentação exata sem misturar estoque com dados clínicos", async () => {
    const database = drizzle(isolated.pool);
    const snapshot = buildProtocolSubstanceCatalogSnapshot(substance, [component]);
    await database.insert(protocolItemsTable).values({
      protocolId: 1,
      substanceId: 99,
      dose: "dose revisada pelo profissional",
      unitPrice: 49.47,
      totalSessions: 2,
      intervalDays: 15,
      startDate: "2030-01-07",
      frequency: "biweekly",
      catalogSnapshot: snapshot,
    });

    const [stored] = await database.select().from(protocolItemsTable);
    expect(stored.substanceId).toBe(99);
    expect(stored.dose).toBe("dose revisada pelo profissional");
    expect(stored.catalogSnapshot).toMatchObject({
      id: 99,
      defaultDose: "dose padrão sintética",
      viaUso: "IM",
      concentrationMg: "100 MG",
      volumeAmpola: "2 ML",
      pricePerUnit: 49.47,
      durationMinutes: 2.5,
      intervalDays: 15,
      components: [{ id: 501, componentSubstanceId: 14 }],
    });
    expect(stored.catalogSnapshot).not.toHaveProperty("stockQuantity");
    expect(stored.catalogSnapshot).not.toHaveProperty("stockUnit");
  });
});
