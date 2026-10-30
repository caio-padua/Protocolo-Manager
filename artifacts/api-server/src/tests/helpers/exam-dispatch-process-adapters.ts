// Test-only dependencies. This module is substituted at build time; no real
// database connector, identity resolver or messaging provider is imported.
import { createRequire } from "node:module";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { RequestHandler } from "express";
export { clientsTable } from "../../../../../lib/db/src/schema/clients";
export { collaboratorAuditTable } from "../../../../../lib/db/src/schema/collaborator-audit";
export { examRequestPdfsTable } from "../../../../../lib/db/src/schema/exam-requests";

declare const TEST_DB_PACKAGE_JSON: string;
const { Pool } = createRequire(TEST_DB_PACKAGE_JSON)("pg");
const configuration = JSON.parse(process.argv[2]);
if (configuration.connection.host !== "127.0.0.1" || configuration.connection.user !== "synthetic"
  || new URL(configuration.providerUrl).hostname !== "127.0.0.1") {
  throw new Error("Only synthetic local dependencies are permitted");
}
export const pool = new Pool(configuration.connection);
const dialect = new PgDialect();
const document = {
  id: 91, clientId: 101, tipo: "OUTROS", token: "a".repeat(48),
  fileName: "Exame sintetico.pdf", examCount: 1,
  pdfData: Buffer.from("NOT A REAL PDF").toString("base64"),
};
let selections = 0;
export const db = {
  execute(query: SQL) {
    const compiled = dialect.sqlToQuery(query);
    return pool.query(compiled.sql, compiled.params);
  },
  select() {
    const rows = selections++ === 0 ? [document] : [{ telegramChatId: "synthetic-chat" }];
    const chain: any = { then: (yes: any, no: any) => Promise.resolve(rows).then(yes, no) };
    for (const method of ["from", "where", "limit"]) chain[method] = () => chain;
    return chain;
  },
  insert() {
    return { values: (values: any[]) => ({ returning: async () => {
      const rows = [];
      for (const value of values) {
        const saved = await pool.query(
          "INSERT INTO synthetic_dispatch_audits (detail) VALUES ($1::jsonb) RETURNING id, detail",
          [JSON.stringify(value.detail)],
        );
        rows.push(saved.rows[0]);
      }
      return rows;
    } }) };
  },
  update() {
    return { set: (value: any) => ({ where: async () => {
      if (configuration.crashBeforeAuditWrite) {
        // The simulated provider has returned sent:true to the real route.
        // Block at the first result write, outside the route's error handling;
        // the parent now kills this entire process, not just the request.
        process.send!({
          type: "before-audit-write", pid: process.pid,
          state: value.detail.state, acceptedMessages: value.detail.acceptedMessages,
        });
        await new Promise(() => {});
      }
      await pool.query("UPDATE synthetic_dispatch_audits SET detail = $1::jsonb", [JSON.stringify(value.detail)]);
    } }) };
  },
};

export const requireCollaborator: RequestHandler = (req, res, next) =>
  req.get("Authorization") === "Bearer synthetic-test" ? next() : void res.sendStatus(401);
export class ClinicalIdentityError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function resolveClinicalEmitter() {
  return {
    client: { id: 101, name: "Cliente Sintetico", email: "synthetic@example.invalid", phone: "00000000000" },
    professional: { id: 202 }, clinic: { id: 303, empresaId: 404 },
  };
}
export async function enviarMensagemPaxter() {
  const response = await fetch(configuration.providerUrl, { method: "POST", body: "synthetic-message" });
  if (!response.ok) throw new Error("Synthetic provider refused");
  return response.json();
}
