import { beforeEach, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), log: vi.fn() }));
vi.mock("@workspace/db", () => ({
  db: { execute: vi.fn(async () => ({ rows: [{ nome: "Agente sintético", cargo: "Teste", emoji: "" }] })) },
}));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: {} }));
vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../routes/agentes-integracoes", () => ({ logIntegracao: mocks.log }));
vi.mock("../lib/whatsapp", () => ({
  sendWhatsapp: mocks.send,
  isWhatsappConfigured: async () => true,
  buildWhatsappLink: () => "https://example.invalid/alternativa",
}));
import router from "../routes/agentes-wpp";
const app = express();
app.use(express.json(), router);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.log.mockResolvedValue(undefined);
});

it("mantém falha e link legíveis pelo consumidor que aceita somente respostas 2xx", async () => {
  mocks.send.mockResolvedValue({ sent: false, error: "Falha sintética", via: "link", link: "https://example.invalid/alternativa" });
  const response = await request(app).post("/agentes-wpp/notificar")
    .send({ agente_id: 1, telefone_destino: "00000000000" });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ ok: false, error: "Falha sintética", link_fallback: "https://example.invalid/alternativa" });
  expect(response.body.status).not.toBe("sent");
});

it("declara enviado somente quando o motor confirmou sent=true", async () => {
  mocks.send.mockResolvedValue({ sent: true, via: "twilio", logId: 17 });
  const response = await request(app).post("/agentes-wpp/notificar")
    .send({ agente_id: 1, telefone_destino: "00000000000" });
  expect(response.body).toMatchObject({ ok: true, status: "sent", logId: 17 });
});
