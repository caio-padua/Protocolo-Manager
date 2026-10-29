import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock("@workspace/db", () => ({
  db: { execute }, clientsTable: {}, sql: {},
}));
vi.mock("../lib/whatsapp.js", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/telegram.js", () => ({ sendTelegram: vi.fn() }));

import express from "express";
import request from "supertest";
import { onboardingRouter } from "../routes/onboarding.js";

const app = express();
app.use("/api/onboarding", onboardingRouter);

function nextStats(total: number) {
  execute.mockResolvedValueOnce({ rows: [{ total }] })
    .mockResolvedValueOnce({ rows: [{ device: "iphone", total }] })
    .mockResolvedValueOnce({ rows: [{ secao: "login", total }] })
    .mockResolvedValueOnce({ rows: [{ pacientes_unicos: total - 1 }] })
    .mockResolvedValueOnce({ rows: [] });
}

describe("GET /api/onboarding/stats — fresh responses", () => {
  beforeEach(() => {
    execute.mockReset().mockResolvedValue({ rows: [] });
  });

  it("consults all aggregates again on each request, without caching the response", async () => {
    nextStats(11);
    const first = await request(app).get("/api/onboarding/stats").expect(200);
    nextStats(23);
    const second = await request(app).get("/api/onboarding/stats").expect(200);
    for (const [response, total] of [[first, 11], [second, 23]] as const) {
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toEqual({
        ok: true, total, pacientesUnicos: total - 1,
        porDevice: [{ device: "iphone", total }],
        porSecao: [{ secao: "login", total }],
        pacientes: [],
      });
    }
    expect(execute).toHaveBeenCalledTimes(10);
  });

  it("returns an uncached HTTP error if a fresh database query fails", async () => {
    execute.mockRejectedValueOnce(new Error("simulated database failure"));
    const response = await request(app).get("/api/onboarding/stats").expect(500);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.ok).toBe(false);
  });
});
