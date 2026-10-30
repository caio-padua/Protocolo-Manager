import express from "express";
import router from "../../routes/exam-request-dispatch";

// Deliberately do not import app.ts or index.ts (jobs, real providers, secrets).
const configuration = JSON.parse(process.argv[2]);
// Recovery-only barrier: both processes must have received both keys before
// the parent releases any request to the real route. No production hook.
const waiting: { operationKey: string; next: () => void }[] = [];
let released = false;
process.on("message", (message: { type?: string }) => {
  if (message.type !== "release-replays" || released || !configuration.replayRequestCount) return;
  if (waiting.length !== configuration.replayRequestCount) {
    throw new Error("Cannot release recovery requests before the barrier is full");
  }
  released = true;
  for (const request of waiting) request.next();
});
const server = express().use(express.json()).use((_req, res, next) => {
  const json = res.json.bind(res);
  res.json = body => {
    if (configuration.crashPoint === "before-completed-response" && body.state === "completed" && !body.replayed) {
      // The real route has awaited its final database write. Hold the response
      // before headers or body reach the caller, until the parent sends SIGKILL.
      process.send!({ type: "before-completed-response", pid: process.pid, body });
      return res;
    }
    return json(body);
  };
  next();
}).use((req, _res, next) => {
  if (!configuration.replayRequestCount || released
    || req.method !== "POST" || req.path !== "/api/exam-requests/send") {
    next(); return;
  }
  waiting.push({ operationKey: req.body.operationKey, next });
  if (waiting.length === configuration.replayRequestCount) {
    process.send!({
      type: "replays-waiting", pid: process.pid,
      operationKeys: waiting.map(request => request.operationKey),
    });
  }
}).use("/api", router).listen(0, "127.0.0.1", () => {
  process.send!({ type: "ready", pid: process.pid, port: (server.address() as { port: number }).port });
});
