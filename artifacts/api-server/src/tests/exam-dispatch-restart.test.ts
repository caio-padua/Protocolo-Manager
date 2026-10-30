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

it("recovers the durable reservation after SIGKILL and restart without contacting providers again", async () => {
  const children: ChildProcess[] = [];
  const directory = await mkdtemp(join(tmpdir(), "exam-dispatch-process-"));
  let postgres: Awaited<ReturnType<typeof isolatedPostgres>> | undefined;
  let providerCalls = 0;
  const provider = createServer((req, res) => {
    providerCalls++;
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ resultados: [{ sent: true, via: "synthetic-local-provider" }] }));
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
    const start = async (crashBeforeAuditWrite: boolean) => {
      // Do not inherit database URLs, provider keys, NODE_OPTIONS or app config.
      const child = fork(entry, [JSON.stringify({ connection: postgres!.connection, providerUrl, crashBeforeAuditWrite })], {
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
    const first = await start(true);
    const atWrite = waitForMessage(first.child, "before-audit-write", first.errors);
    // Attach rejection handling immediately: SIGKILL must sever this HTTP call.
    const interruptedRequest = send(first.ready.port).then(
      response => ({ response, interrupted: false }), () => ({ interrupted: true }),
    );
    const barrier = await atWrite;
    expect(barrier).toMatchObject({
      pid: first.ready.pid, state: "provider_accepted", acceptedMessages: 1,
    });
    expect(providerCalls).toBe(1);
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
    expect(savedReservation).toEqual([expect.objectContaining({
      operation_key: payload.operationKey, state: "in_progress", results: [],
    })]);
    expect(savedAudits).toHaveLength(2);
    expect(savedAudits.map((row: any) => row.detail.state)).toEqual(["requested", "requested"]);

    const restarted = await start(false);
    expect(restarted.ready.pid).not.toBe(first.ready.pid);
    for (const key of [payload.operationKey, "synthetic-other-window"]) {
      const response = await send(restarted.ready.port, key);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        operationKey: payload.operationKey, replayed: true, state: "in_progress", needsReview: true, results: [],
        message: expect.stringContaining("Nenhum novo envio foi iniciado"),
      });
    }
    expect(providerCalls).toBe(1); // Counts both processes, including any later channel.
    expect(await reservation()).toEqual(savedReservation);
    expect(await audit()).toEqual(savedAudits);
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
