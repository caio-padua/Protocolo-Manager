import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
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
