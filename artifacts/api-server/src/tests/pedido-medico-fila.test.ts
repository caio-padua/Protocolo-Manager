/**
 * Fila do médico para pedidos pagos — dados sintéticos, banco simulado (Art. 82).
 * Cobre: médico estranho, destino x responsável técnico, conclusão só por quem iniciou,
 * recusa com reembolso pendente, encaminhamento, preços só do titular.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

let actor = 1;
const exec = vi.fn();
let grants: Array<{ locationId: number; empresaId: number }> = [];
const responsibleOf = vi.fn();
const eligible = vi.fn();
const owner = vi.fn();
const setSetting = vi.fn();

vi.mock("../routes/collaborator", () => ({
  requireCollaborator: (req: any, _res: any, next: any) => { req.collaborator = { professionalId: actor }; next(); },
}));
vi.mock("@workspace/db", () => ({
  db: {
    execute: (q: unknown) => exec(q),
    select: () => ({ from: () => ({ where: async () => grants }) }),
  },
  clinicalAccessGrantsTable: { professionalId: "p", isResponsibleDoctor: "r", locationId: "l", empresaId: "e" },
}));
vi.mock("drizzle-orm", async (orig) => ({ ...(await orig<typeof import("drizzle-orm")>()), eq: vi.fn(), and: vi.fn() }));
vi.mock("../lib/clinical-access", () => ({
  currentResponsibleDoctor: (...a: unknown[]) => responsibleOf(...a),
  isPlatformOwner: (...a: unknown[]) => owner(...a),
}));
vi.mock("../lib/pedido-medico", () => ({
  PEDIDO_KINDS: ["receita", "pedido_exames"],
  PEDIDO_LABEL: { receita: "Receita médica", pedido_exames: "Pedido de exames" },
  ASAAS_MIN_VALUE: 5,
  isEligibleDoctor: (...a: unknown[]) => eligible(...a),
  resolvePedidoAmount: vi.fn(async () => 80),
}));
vi.mock("../lib/secure-settings", () => ({ setSetting: (...a: unknown[]) => setSetting(...a) }));

import router from "../routes/pedidos-medicos";

const base = {
  id: 7, client_id: 10, empresa_id: 5, location_id: 8, kind: "receita", details: "renovar",
  status: "pago", amount: "80", paid_at: "2026-11-06", assigned_professional_id: 2,
  assigned_reason: "habitual", decision_note: null, issued_reference: null, refund_pending: false, created_at: "x",
};
function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { (req as any).log = { error: vi.fn(), warn: vi.fn() }; next(); });
  a.use("/api", router);
  return a;
}
beforeEach(() => {
  actor = 2; grants = []; exec.mockReset(); responsibleOf.mockReset(); eligible.mockReset(); owner.mockReset(); setSetting.mockReset();
});

describe("fila do médico — pedidos pagos", () => {
  it("médico sem papel no pedido recebe 404 (isolamento)", async () => {
    actor = 99;
    exec.mockResolvedValueOnce({ rows: [base] });
    const r = await request(app()).post("/api/pedidos-medicos/7/iniciar").send({});
    expect(r.status).toBe(404);
    expect(exec).toHaveBeenCalledTimes(1); // só a leitura, nenhum UPDATE
  });

  it("médico de destino inicia a análise", async () => {
    exec.mockResolvedValueOnce({ rows: [base] }).mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const r = await request(app()).post("/api/pedidos-medicos/7/iniciar").send({});
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("em_analise");
  });

  it("responsável técnico NÃO toma pedido que está com outro médico", async () => {
    actor = 1; grants = [{ locationId: 8, empresaId: 5 }]; responsibleOf.mockResolvedValue({ id: 1 });
    exec.mockResolvedValueOnce({ rows: [base] });
    const r = await request(app()).post("/api/pedidos-medicos/7/iniciar").send({});
    expect(r.status).toBe(403);
  });

  it("responsável técnico assume pedido sem destino", async () => {
    actor = 1; grants = [{ locationId: 8, empresaId: 5 }]; responsibleOf.mockResolvedValue({ id: 1 });
    exec.mockResolvedValueOnce({ rows: [{ ...base, assigned_professional_id: null, assigned_reason: "sem_destino" }] })
      .mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const r = await request(app()).post("/api/pedidos-medicos/7/iniciar").send({});
    expect(r.status).toBe(200);
  });

  it("responsável de OUTRA unidade não tem papel: 404", async () => {
    actor = 1; grants = [{ locationId: 9, empresaId: 5 }]; responsibleOf.mockResolvedValue({ id: 1 });
    exec.mockResolvedValueOnce({ rows: [base] });
    const r = await request(app()).post("/api/pedidos-medicos/7/iniciar").send({});
    expect(r.status).toBe(404);
  });

  it("responsável não conclui pedido de outro médico", async () => {
    actor = 1; grants = [{ locationId: 8, empresaId: 5 }]; responsibleOf.mockResolvedValue({ id: 1 });
    exec.mockResolvedValueOnce({ rows: [{ ...base, status: "em_analise" }] }).mockResolvedValueOnce({ rows: [] });
    const r = await request(app()).post("/api/pedidos-medicos/7/emitido").send({});
    expect(r.status).toBe(409);
    expect(JSON.stringify(exec.mock.calls[1][0])).toContain("assigned_professional_id");
  });

  it("médico que iniciou conclui como emitido", async () => {
    exec.mockResolvedValueOnce({ rows: [{ ...base, status: "em_analise" }] }).mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const r = await request(app()).post("/api/pedidos-medicos/7/emitido").send({ reference: "receita 123" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("emitido");
  });

  it("recusa exige motivo e deixa reembolso pendente", async () => {
    exec.mockResolvedValueOnce({ rows: [base] });
    const short = await request(app()).post("/api/pedidos-medicos/7/recusar").send({ reason: "não" });
    expect(short.status).toBe(400);
    exec.mockReset();
    exec.mockResolvedValueOnce({ rows: [base] }).mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const ok = await request(app()).post("/api/pedidos-medicos/7/recusar").send({ reason: "Precisa de consulta presencial." });
    expect(ok.status).toBe(200);
    expect(ok.body.refundPending).toBe(true);
    expect(JSON.stringify(exec.mock.calls[1][0])).toContain("refund_pending = TRUE");
  });

  it("só o responsável técnico encaminha, e só a médico apto", async () => {
    const destino = await request(app()).post("/api/pedidos-medicos/7/encaminhar").send({ professionalId: 3 });
    expect(destino.status).toBeGreaterThanOrEqual(400); // sem exec simulado ainda
    actor = 2; exec.mockReset();
    exec.mockResolvedValueOnce({ rows: [base] });
    const notResp = await request(app()).post("/api/pedidos-medicos/7/encaminhar").send({ professionalId: 3 });
    expect(notResp.status).toBe(403);

    actor = 1; grants = [{ locationId: 8, empresaId: 5 }]; responsibleOf.mockResolvedValue({ id: 1 });
    exec.mockReset(); exec.mockResolvedValueOnce({ rows: [base] });
    eligible.mockResolvedValue(false);
    const bad = await request(app()).post("/api/pedidos-medicos/7/encaminhar").send({ professionalId: 3 });
    expect(bad.status).toBe(422);

    exec.mockReset(); exec.mockResolvedValueOnce({ rows: [base] }).mockResolvedValueOnce({ rows: [{ id: 7 }] });
    eligible.mockResolvedValue(true);
    const ok = await request(app()).post("/api/pedidos-medicos/7/encaminhar").send({ professionalId: 3 });
    expect(ok.status).toBe(200);
  });

  it("preços: só o titular da plataforma altera, mínimo do Asaas", async () => {
    owner.mockResolvedValue(false);
    const denied = await request(app()).put("/api/pedidos-medicos/precos").send({ receita: 80 });
    expect(denied.status).toBe(403);
    expect(setSetting).not.toHaveBeenCalled();
    owner.mockResolvedValue(true);
    const low = await request(app()).put("/api/pedidos-medicos/precos").send({ receita: 1 });
    expect(low.status).toBe(400);
    const ok = await request(app()).put("/api/pedidos-medicos/precos").send({ receita: 80 });
    expect(ok.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith("pay.pedidoMedico.receita", "80");
  });

  it("fila mostra só pedidos do destino ou da unidade do responsável", async () => {
    actor = 2;
    exec.mockResolvedValueOnce({ rows: [
      { ...base, client_name: "A" },
      { ...base, id: 8, assigned_professional_id: 3, client_name: "B" },
    ] });
    const r = await request(app()).get("/api/pedidos-medicos/fila");
    expect(r.status).toBe(200);
    expect(r.body.map((x: any) => x.id)).toEqual([7]);
  });
});
