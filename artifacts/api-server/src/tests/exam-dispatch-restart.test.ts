import { expect, it } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { sql } from "drizzle-orm";
import { isolatedPostgres } from "./helpers/isolated-postgres";

// Bounded event waits, not sleeps. Listener is installed before the action that
// produces the event, and an early exit reports the child's captured stderr.
function waitForMessage(child: ChildProcess, type: string, stderr: () => string) {
  return new Promise<any>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer); child.off("message", message); child.off("exit", exit); child.off("error", error);
    };
    const error = (cause: Error) => { cleanup(); reject(cause); };
    const exit = (code: number | null, signal: string | null) =>
      error(new Error(`Child exited before ${type}: ${code}/${signal}\n${stderr()}`));
    const message = (value: any) => { if (value.type === type) { cleanup(); resolve(value); } };
    const timer = setTimeout(() => error(new Error(`Timed out waiting for ${type}\n${stderr()}`)), 10_000);
    child.on("message", message); child.once("exit", exit); child.once("error", error);
  });
}

async function kill(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit", { signal: AbortSignal.timeout(5_000) });
  child.kill("SIGKILL");
  return exited;
}

it.each(["before-audit-write", "after-first-channel-persist", "before-completed-response", "before-recovery-write"] as const)(
  "recovers the durable reservation after SIGKILL at %s without contacting providers again", async crashPoint => {
  const children: ChildProcess[] = [];
  const directory = await mkdtemp(join(tmpdir(), "exam-dispatch-process-"));
  let postgres: Awaited<ReturnType<typeof isolatedPostgres>> | undefined;
  const providerCalls: string[][] = [];
  const provider = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      providerCalls.push(JSON.parse(body).channels);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ resultados: [{ sent: true, via: "synthetic-local-provider" }] }));
    });
  });
  try {
    postgres = await isolatedPostgres();
    await postgres.execute(sql`CREATE TABLE synthetic_dispatch_audits (id SERIAL PRIMARY KEY, detail JSONB NOT NULL)`);
    provider.listen(0, "127.0.0.1");
    await once(provider, "listening");
    const providerUrl = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
    const apiDirectory = fileURLToPath(new URL("../..", import.meta.url));
    const adapters = fileURLToPath(new URL("./helpers/exam-dispatch-process-adapters.ts", import.meta.url));
    const entry = join(directory, "server.cjs");
    // Only Express stays external; the actual route, contract, SQL reservation,
    // renderers and table definitions are bundled unchanged. No production boot.
    await symlink(join(apiDirectory, "node_modules"), join(directory, "node_modules"), "dir");
    await build({
      entryPoints: [fileURLToPath(new URL("./helpers/exam-dispatch-process-entry.ts", import.meta.url))],
      outfile: entry, bundle: true, platform: "node", format: "cjs", external: ["express"],
      define: { TEST_DB_PACKAGE_JSON: JSON.stringify(fileURLToPath(new URL("../../../../lib/db/package.json", import.meta.url))) },
      plugins: [{
        name: "synthetic-dispatch-dependencies",
        setup(build) {
          build.onResolve({ filter: /^@workspace\/db$|\/collaborator$|\/clinical-emitter$|\/messaging\/index\.js$/ },
            () => ({ path: adapters }));
        },
      }],
    });
    const start = async (crashPoint?: string) => {
      // Do not inherit database URLs, provider keys, NODE_OPTIONS or app config.
      const child = fork(entry, [JSON.stringify({ connection: postgres!.connection, providerUrl, crashPoint })], {
        env: {}, execArgv: [], stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      children.push(child);
      let errors = "";
      child.stderr!.on("data", chunk => { errors += chunk; });
      child.stdout!.resume();
      const ready = await waitForMessage(child, "ready", () => errors);
      return { child, ready, errors: () => errors };
    };
    const payload = {
      operationKey: "synthetic-crash-operation", clientId: 101, documentIds: [91],
      channels: ["EMAIL", "TELEGRAM"], confirmed: true,
    };
    const send = (port: number, operationKey = payload.operationKey) => fetch(`http://127.0.0.1:${port}/api/exam-requests/send`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-test" },
      body: JSON.stringify({ ...payload, operationKey }), signal: AbortSignal.timeout(10_000),
    });
    const first = await start(crashPoint);
    const atWrite = waitForMessage(first.child, crashPoint, first.errors);
    const failedWrite = crashPoint === "before-recovery-write"
      ? waitForMessage(first.child, "operation-write-failed", first.errors) : undefined;
    // Install all listeners before sending; consume both together so a failed
    // child cannot leave a rejected event waiter unhandled.
    const atFailure = Promise.all([atWrite, failedWrite]);
    // Attach rejection handling immediately: SIGKILL must sever this HTTP call.
    const interruptedRequest = send(first.ready.port).then(
      response => ({ response, interrupted: false }), () => ({ interrupted: true }),
    );
    const [barrier, failure] = await atFailure;
    const partial = crashPoint === "after-first-channel-persist";
    const completed = crashPoint === "before-completed-response";
    const persistenceFailure = crashPoint === "before-recovery-write";
    const auditAccepted = partial || persistenceFailure || completed;
    expect(barrier.pid).toBe(first.ready.pid);
    if (completed) {
      expect(barrier.body).toMatchObject({ state: "completed", replayed: false, needsReview: false });
    } else {
      expect(barrier).toMatchObject(persistenceFailure
        ? { state: "needs_review", attempt: 2,
          results: [{ channel: "EMAIL", success: true, auditId: expect.any(Number) }] }
        : partial
        ? { state: "in_progress", results: [{ channel: "EMAIL", success: true, auditId: expect.any(Number) }] }
        : { state: "provider_accepted", acceptedMessages: 1 });
    }
    if (persistenceFailure) {
      expect(failure).toEqual({ type: "operation-write-failed", pid: first.ready.pid,
        state: "in_progress", results: barrier.results, attempt: 1 });
    }
    const expectedProviderCalls = completed ? [["EMAIL"], ["TELEGRAM"]] : [["EMAIL"]];
    expect(providerCalls).toEqual(expectedProviderCalls);
    expect(await kill(first.child)).toEqual([null, "SIGKILL"]);
    expect(await interruptedRequest).toEqual({ interrupted: true });

    const reservation = async () => (await postgres!.execute(sql`
      SELECT operation_key, request_hash, state, results FROM exam_request_dispatch_operations
    `)).rows;
    const audit = async () => (await postgres!.execute(sql`
      SELECT id, detail FROM synthetic_dispatch_audits ORDER BY id
    `)).rows;
    const savedReservation = await reservation();
    const savedAudits = await audit();
    expect(savedAudits).toHaveLength(2);
    expect(savedAudits.map((row: any) => row.detail.channel)).toEqual(["EMAIL", "TELEGRAM"]);
    expect(new Set(savedAudits.map((row: any) => row.id)).size).toBe(2);
    const expectedResults = completed
      ? savedAudits.map((row: any) => ({ channel: row.detail.channel, success: true, auditId: row.id }))
      : partial ? [{ channel: "EMAIL", success: true, auditId: savedAudits[0].id }] : [];
    expect(savedReservation).toEqual([expect.objectContaining({
      operation_key: payload.operationKey, state: completed ? "completed" : "in_progress", results: expectedResults,
    })]);
    expect(savedAudits.map((row: any) => row.detail.state))
      .toEqual([auditAccepted ? "provider_accepted" : "requested", completed ? "provider_accepted" : "requested"]);
    if (completed) expect(barrier.body.results).toEqual(expectedResults);
    if (partial || persistenceFailure) {
      expect(barrier.results).toEqual([{ channel: "EMAIL", success: true, auditId: savedAudits[0].id }]);
      expect(savedAudits[0].detail).toMatchObject({ acceptedMessages: 1, plannedMessages: 1 });
    }
    for (const row of savedAudits) {
      expect(row.detail).toMatchObject({ operationKey: payload.operationKey,
        clientId: payload.clientId, documentIds: payload.documentIds });
    }

    const restarted = await start();
    expect(restarted.ready.pid).not.toBe(first.ready.pid);
    for (const key of [payload.operationKey, "synthetic-other-window"]) {
      const response = await send(restarted.ready.port, key);
      expect(response.status).toBe(200);
      const recovered = await response.json();
      if (completed) {
        expect(recovered).toEqual({
          ...barrier.body, replayed: true,
          message: "Operação anterior recuperada. Nenhuma mensagem foi reenviada.",
        });
      } else {
        expect(recovered).toMatchObject({
          operationKey: payload.operationKey, replayed: true, state: "in_progress", needsReview: true,
          message: expect.stringContaining("Nenhum novo envio foi iniciado"),
        });
        expect(recovered.message).toContain("confira antes de qualquer novo envio");
      }
      expect(recovered.results).toEqual(expectedResults);
      expect(providerCalls).toEqual(expectedProviderCalls);
      expect(await reservation()).toEqual(savedReservation);
      expect(await audit()).toEqual(savedAudits);
    }
    expect(first.errors()).toBe("");
    expect(restarted.errors()).toBe("");
  } finally {
    // All cleanup paths run even when another resource fails to close.
    try {
      await Promise.all(children.map(child => kill(child)));
    } finally {
      try {
        provider.closeAllConnections();
        if (provider.listening) await new Promise<void>((resolve, reject) =>
          provider.close(error => error ? reject(error) : resolve()));
      } finally {
        try { await postgres?.stop(); }
        finally { await rm(directory, { recursive: true, force: true }); }
      }
    }
  }
}, 40_000);
