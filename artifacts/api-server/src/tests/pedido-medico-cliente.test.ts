/**
 * Pedido médico do cliente — dados 100% sintéticos, banco e Asaas simulados (Art. 82).
 * Cobre: sessão do cliente, valor não configurado, IDOR, cobrança idempotente,
 * cancelamento com cobrança, corpo com campo proibido.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const exec = vi.fn();
const selectClient = vi.fn();

vi.mock("@workspace/db", () => {
  const tx = { execute: (q: unknown) => exec(q) };
  return {
    db: {
      execute: (q: unknown) => exec(q),
      transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
      select: () => ({ from: () => ({ where: () => ({ limit: () => selectClient() }) }) }),
    },
    clientsTable: { __n: "clients", id: "id" },
  };
});
vi.mock("drizzle-orm", async (orig) => ({ ...(await orig<typeof import("drizzle-orm")>()), eq: vi.fn() }));
vi.mock("../lib/portal-token", () => ({
  verifyPortalToken: (t: string) => (t === "tok-10" ? 10 : null),
}));
const asaasCreateCustomer = vi.fn(async () => ({ id: "cus_1" }));
const asaasCreateCharge = vi.fn(async () => ({ id: "pay_1", invoiceUrl: "https://x/inv", status: "PENDING", value: 80, billingType: "PIX" }));
vi.mock("../lib/asaas", () => ({
  asaasCreateCustomer: (...a: unknown[]) => (asaasCreateCustomer as any)(...a),
  asaasCreateCharge: (...a: unknown[]) => (asaasCreateCharge as any)(...a),
  asaasGetCharge: vi.fn(async () => ({ status: "PENDING" })),
  asaasGetPixQrCode: vi.fn(async () => ({ encodedImage: "AAA", payload: "000201", expirationDate: null })),
}));
const resolveAmount = vi.fn();
vi.mock("../lib/pedido-medico", async () => {
  const real = await vi.importActual<typeof import("../lib/pedido-medico")>("../lib/pedido-medico").catch(() => null);
  return {
    PEDIDO_LABEL: { receita: "Receita médica", pedido_exames: "Pedido de exames" },
    isPedidoKind: (v: unknown) => v === "receita" || v === "pedido_exames",
    resolvePedidoAmount: (...a: unknown[]) => resolveAmount(...a),
    markPedidoPaid: vi.fn(),
    __real: real,
  };
});

import router from "../routes/area-paciente-pedidos";

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }; next(); });
  a.use("/api", router);
  return a;
}
const auth = { Authorization: "Bearer tok-10" };
const clientOk = { id: 10, name: "Cliente Sintético", cpf: "123.456.789-09", phone: "11999990000", empresaId: 5, locationId: 8 };
const row = (o: Record<string, unknown> = {}) => ({
  id: 7, client_id: 10, kind: "receita", details: "renovar", status: "aguardando_pagamento",
  amount: "80.00", asaas_charge_id: null, asaas_invoice_url: null, created_at: "2026-11-06", paid_at: null, decision_note: null, ...o,
});

beforeEach(() => { exec.mockReset(); selectClient.mockReset(); asaasCreateCharge.mockClear(); resolveAmount.mockReset(); });

describe("pedido médico do cliente", () => {
  it("sem token do cliente: 401 e nada é gravado", async () => {
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos").send({ kind: "receita", details: "preciso renovar" });
    expect(r.status).toBe(401);
    expect(exec).not.toHaveBeenCalled();
  });

  it("valor não configurado: 503 e nenhuma linha criada", async () => {
    selectClient.mockResolvedValue([clientOk]);
    resolveAmount.mockResolvedValue(null);
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos").set(auth).send({ kind: "receita", details: "preciso renovar" });
    expect(r.status).toBe(503);
    expect(exec).not.toHaveBeenCalled();
  });

  it("corpo com clientId vindo do navegador é rejeitado (anti-IDOR)", async () => {
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos").set(auth)
      .send({ kind: "receita", details: "preciso renovar", clientId: 99 });
    expect(r.status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it("cliente sem unidade: 409", async () => {
    selectClient.mockResolvedValue([{ ...clientOk, locationId: null }]);
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos").set(auth).send({ kind: "receita", details: "preciso renovar" });
    expect(r.status).toBe(409);
  });

  it("cria pedido com valor configurado e sem expor ids internos", async () => {
    selectClient.mockResolvedValue([clientOk]);
    resolveAmount.mockResolvedValue(80);
    exec.mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [{ n: 0 }] })
      .mockResolvedValueOnce({ rows: [row()] });
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos").set(auth).send({ kind: "receita", details: "preciso renovar" });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe("aguardando_pagamento");
    expect(r.body.amount).toBe(80);
    expect(JSON.stringify(r.body)).not.toMatch(/client_id|assigned|professional/i);
  });

  it("limite de pedidos abertos sem pagar: 429", async () => {
    selectClient.mockResolvedValue([clientOk]);
    resolveAmount.mockResolvedValue(80);
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ n: 3 }] });
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos").set(auth).send({ kind: "receita", details: "preciso renovar" });
    expect(r.status).toBe(429);
  });

  it("pedido de outro cliente: o filtro no banco devolve vazio e a rota responde 404 sem cobrar", async () => {
    selectClient.mockResolvedValue([clientOk]);
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos/55/cobranca").set(auth).send({});
    expect(r.status).toBe(404);
    expect(asaasCreateCharge).not.toHaveBeenCalled();
    const sqlText = JSON.stringify(exec.mock.calls[1][0]);
    expect(sqlText).toContain("client_id");
  });

  it("cobrança nova cria uma única cobrança; repetida reaproveita a existente", async () => {
    selectClient.mockResolvedValue([clientOk]);
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row()] }).mockResolvedValueOnce({ rows: [] });
    const first = await request(app()).post("/api/area-paciente/pedidos-medicos/7/cobranca").set(auth).send({ method: "pix" });
    expect(first.status).toBe(201);
    expect(first.body.pixPayload).toBe("000201");
    expect(asaasCreateCharge).toHaveBeenCalledTimes(1);

    exec.mockReset();
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row({ asaas_charge_id: "pay_1", asaas_invoice_url: "https://x/inv" })] });
    const second = await request(app()).post("/api/area-paciente/pedidos-medicos/7/cobranca").set(auth).send({});
    expect(second.status).toBe(200);
    expect(asaasCreateCharge).toHaveBeenCalledTimes(1);
  });

  it("pedido já pago não gera nova cobrança: 409", async () => {
    selectClient.mockResolvedValue([clientOk]);
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row({ status: "pago", asaas_charge_id: "pay_1" })] });
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos/7/cobranca").set(auth).send({});
    expect(r.status).toBe(409);
    expect(asaasCreateCharge).not.toHaveBeenCalled();
  });

  it("cancelar com cobrança já gerada é recusado (UPDATE não casa)", async () => {
    exec.mockResolvedValueOnce({ rows: [] });
    const r = await request(app()).post("/api/area-paciente/pedidos-medicos/7/cancelar").set(auth).send({});
    expect(r.status).toBe(409);
    expect(JSON.stringify(exec.mock.calls[0][0])).toContain("asaas_charge_id IS NULL");
  });
});
