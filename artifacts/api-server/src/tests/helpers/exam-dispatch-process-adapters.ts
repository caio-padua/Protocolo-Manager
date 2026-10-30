// Test-only dependencies. This module is substituted at build time; no real
// database connector, identity resolver or messaging provider is imported.
import { createRequire } from "node:module";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { RequestHandler } from "express";
import { syntheticDispatchDocuments } from "./exam-dispatch-documents";
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
const documents = syntheticDispatchDocuments(configuration.documentCount ?? 1);
let selections = 0;
let operationWriteAttempts = 0;
export const db = {
  async execute(query: SQL) {
    const compiled = dialect.sqlToQuery(query);
    if (configuration.crashPoint === "before-recovery-write"
      && /^\s*UPDATE exam_request_dispatch_operations\b/.test(compiled.sql)) {
      const attempt = ++operationWriteAttempts;
      const [state, serializedResults] = compiled.params;
      const results = JSON.parse(serializedResults as string);
      if (attempt === 1 && state === "in_progress") {
        // Reject the per-channel operation write AFTER the real audit committed.
        // The real route must catch this failure and attempt its recovery write.
        process.send!({ type: "operation-write-failed", pid: process.pid, state, results, attempt });
        throw new Error("Synthetic operation persistence failure");
      }
      if (attempt !== 2 || state !== "needs_review") {
        throw new Error("Expected recovery write after failed per-channel persistence");
      }
      process.send!({ type: "before-recovery-write", pid: process.pid, state, results, attempt });
      // Neither operation UPDATE reaches PostgreSQL. Hold before the recovery
      // write so SIGKILL discards the only in-memory copy of the channel result.
      await new Promise(() => {});
    }
    const result = await pool.query(compiled.sql, compiled.params);
    if (configuration.crashPoint === "after-first-channel-persist"
      && /^\s*UPDATE exam_request_dispatch_operations\b/.test(compiled.sql)) {
      // The real SQL has committed. Hold its return so the real route cannot
      // start the next channel before the parent kills the process.
      const saved = await pool.query("SELECT state, results FROM exam_request_dispatch_operations");
      const operation = saved.rows[0];
      if (result.rowCount !== 1 || saved.rows.length !== 1
        || operation.state !== "in_progress" || operation.results.length !== 1) {
        throw new Error("Expected exactly one persisted channel before crash");
      }
      process.send!({
        type: "after-first-channel-persist", pid: process.pid,
        state: operation.state, results: operation.results,
      });
      await new Promise(() => {});
    }
    return result;
  },
  select() {
    const rows = selections++ === 0 ? documents : [{ telegramChatId: "synthetic-chat" }];
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
    return { set: (value: any) => ({ where: async (condition: SQL) => {
      if (configuration.crashPoint === "before-audit-write") {
        // The simulated provider has returned sent:true to the real route.
        // Block at the first result write, outside the route's error handling;
        // the parent now kills this entire process, not just the request.
        process.send!({
          type: "before-audit-write", pid: process.pid,
          state: value.detail.state, acceptedMessages: value.detail.acceptedMessages,
        });
        await new Promise(() => {});
      }
      // Preserve the real route's per-channel audit ID predicate.
      const predicate = dialect.sqlToQuery(condition);
      await pool.query("UPDATE synthetic_dispatch_audits SET detail = $1::jsonb WHERE id = $2",
        [JSON.stringify(value.detail), predicate.params[0]]);
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
let acceptedMessages = 0;
export async function enviarMensagemPaxter(doc: unknown, _destination: unknown, channels: string[]) {
  if (configuration.crashPoint === "between-telegram-batches" && acceptedMessages === 1) {
    // The real route consumed the first sent:true response and advanced its
    // messageBatches loop. Stop BEFORE contacting the provider for batch two.
    process.send!({
      type: "between-telegram-batches", pid: process.pid,
      state: "provider_accepted", acceptedMessages, channels, pendingMessage: doc,
    });
    await new Promise(() => {});
  }
  const response = await fetch(configuration.providerUrl, { method: "POST", body: JSON.stringify({ channels, doc }) });
  if (!response.ok) throw new Error("Synthetic provider refused");
  const result = await response.json();
  if (result.resultados[0]?.sent === true) acceptedMessages++;
  return result;
}
