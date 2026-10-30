import express from "express";
import router from "../../routes/exam-request-dispatch";

// Deliberately do not import app.ts or index.ts (jobs, real providers, secrets).
const configuration = JSON.parse(process.argv[2]);
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
}).use("/api", router).listen(0, "127.0.0.1", () => {
  process.send!({ type: "ready", pid: process.pid, port: (server.address() as { port: number }).port });
});
