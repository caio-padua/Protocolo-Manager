import { defineConfig } from "drizzle-kit";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import path from "path";

import * as schema from "./src/schema/index";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

/**
 * O banco tem tabelas que NAO pertencem a este schema: o modulo de agentes do
 * api-server cria as suas por SQL direto no boot (catalogo_agentes,
 * agentes_frases, team_members, delegacoes, sla_monitoring, work_reviews...).
 *
 * Sem filtro, o drizzle-kit ve essas tabelas como "sobrando" e, para cada
 * tabela nova do schema, pergunta se ela e renomeacao de alguma delas:
 *
 *   Is client_preferred_agendas table created or renamed from another table?
 *   > + client_preferred_agendas                     create table
 *     ~ agentes_frases > client_preferred_agendas    rename table
 *
 * Rodando em deploy nao ha quem responda: o processo fica esperando ate o
 * container ser morto e nenhuma tabela e criada. Foi o que aconteceu nos
 * deploys de 27/07 02:26 e 02:32. E `push --force` nao e a saida — ele para
 * de perguntar, mas entao APAGA o que nao esta no schema.
 *
 * tablesFilter restringe o drizzle-kit as tabelas declaradas aqui: cria o que
 * falta, ignora o que nao e dele, nao pergunta nada. A lista sai do proprio
 * schema, entao tabela nova entra sozinha.
 */
const managedTables = Object.values(schema)
  .filter((value): value is PgTable => is(value, PgTable))
  .map(getTableName);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  tablesFilter: managedTables,
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Tabelas criadas via raw SQL (fora do schema Drizzle) — ignorar no push
  // para evitar perguntas interativas ou DROP acidental.
  // Modulos: PADTEAM (padteam.ts) + Agentes (agentes.ts) + Drive watcher + Receituario raw
  tablesFilter: [
    "!agentes_frases",
    "!agentes_motor_escrita",
    "!agentes_personalidade",
    "!agentes_trello_cards",
    "!capacidades_agente",
    "!catalogo_agentes",
    "!commission_events",
    "!delegacao_escalations",
    "!delegacao_justificativas",
    "!delegacoes",
    "!disciplinary_events",
    "!drive_watcher_files",
    "!exam_document_files",
    "!narrativas_agente",
    "!process_responsibilities",
    "!proposta_dominio",
    "!receituario_modelos",
    "!receituario_tokens",
    "!sla_monitoring",
    "!team_email_aliases",
    "!team_members",
    "!team_positions",
    "!work_ratings",
    "!work_reviews",
  ],
});
