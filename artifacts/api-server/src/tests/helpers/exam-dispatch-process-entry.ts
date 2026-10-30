import express from "express";
import router from "../../routes/exam-request-dispatch";

// Deliberately do not import app.ts or index.ts (jobs, real providers, secrets).
const server = express().use(express.json()).use("/api", router).listen(0, "127.0.0.1", () => {
  process.send!({ type: "ready", pid: process.pid, port: (server.address() as { port: number }).port });
});
