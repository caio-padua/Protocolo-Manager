/**
 * Roteamento e pagamento do pedido médico — dados sintéticos, banco simulado (Art. 82).
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

const results: unknown[] = [];
const exec = vi.fn();
function chain(): any {
  const value = results.shift();
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown) => Promise.resolve(value).then(res);
      return () => p;
    },
  });
  return p;
}
vi.mock("@workspace/db", () => ({
  db: { select: () => chain(), execute: (q: unknown) => exec(q) },
  clinicalAccessGrantsTable: {}, locationProfessionalsTable: {}, locationsTable: {},
  professionalsTable: {}, sessionsTable: {},
}));
vi.mock("drizzle-orm", async (orig) => ({ ...(await orig<typeof import("drizzle-orm")>()), eq: vi.fn(), and: vi.fn(), desc: vi.fn(), isNotNull: vi.fn() }));
const responsible = vi.fn();
vi.mock("../lib/clinical-access", () => ({ currentResponsibleDoctor: (...a: unknown[]) => responsible(...a) }));
const certState = vi.fn();
vi.mock("../lib/prescription-signing", () => ({ getPrescriptionCertificateStatus: (...a: unknown[]) => certState(...a) }));
vi.mock("../lib/secure-settings", () => ({ getSetting: vi.fn(async (k: string) => (k.endsWith("receita") ? "80,50" : k.endsWith("pedido_exames") ? "2" : null)) }));

import { markPedidoPaid, resolveAssignee, resolvePedidoAmount } from "../lib/pedido-medico";

const doctor = (id: number) => ({
  prof: { id, crm: "123456", registrationNumber: null, registrationCouncil: "CRM/SP", cpf: "52998224725" },
  grant: { canPrescribe: true, canRequestExams: true },
});

beforeEach(() => { results.length = 0; exec.mockReset(); responsible.mockReset(); certState.mockReset(); });

describe("valor do pedido", () => {
  it("lê o valor configurado, respeita o mínimo do Asaas e não inventa padrão", async () => {
    expect(await resolvePedidoAmount("receita")).toBe(80.5);
    expect(await resolvePedidoAmount("pedido_exames")).toBeNull();
  });
});

describe("roteamento do pedido pago", () => {
  it("usa o médico habitual quando apto (certificado vigente)", async () => {
    results.push([{ professionalId: 2 }], [doctor(2)]);
    certState.mockResolvedValue({ state: "valid" });
    expect(await resolveAssignee(10, 8, 5, "receita")).toEqual({ professionalId: 2, reason: "habitual" });
  });

  it("certificado vencido do habitual: vai ao responsável técnico", async () => {
    results.push([{ professionalId: 2 }], [doctor(2)]);
    certState.mockResolvedValue({ state: "expired" });
    responsible.mockResolvedValue({ id: 1 });
    expect(await resolveAssignee(10, 8, 5, "receita")).toEqual({ professionalId: 1, reason: "responsavel_tecnico" });
  });

  it("habitual sem vínculo/liberação na unidade: vai ao responsável técnico", async () => {
    results.push([{ professionalId: 2 }], []);
    responsible.mockResolvedValue({ id: 1 });
    expect((await resolveAssignee(10, 8, 5, "receita")).reason).toBe("responsavel_tecnico");
  });

  it("sem habitual e sem responsável: sem destino", async () => {
    results.push([]);
    responsible.mockResolvedValue(null);
    expect(await resolveAssignee(10, 8, 5, "pedido_exames")).toEqual({ professionalId: null, reason: "sem_destino" });
  });

  it("liberação da ferramenta é por tipo: sem permissão de receita não recebe receita", async () => {
    results.push([{ professionalId: 2 }], [{ ...doctor(2), grant: { canPrescribe: false, canRequestExams: true } }]);
    responsible.mockResolvedValue(null);
    expect((await resolveAssignee(10, 8, 5, "receita")).reason).toBe("sem_destino");
  });
});

describe("confirmação de pagamento", () => {
  it("webhook repetido não roteia duas vezes", async () => {
    exec.mockResolvedValueOnce({ rows: [] }) // UPDATE não casa: já estava pago
      .mockResolvedValueOnce({ rows: [] });
    expect(await markPedidoPaid("pay_1", "2026-11-06")).toBe(false);
    expect(JSON.stringify(exec.mock.calls[0][0])).toContain("status = 'aguardando_pagamento'");
  });

  it("pagamento de pedido cancelado marca reembolso pendente e não reabre", async () => {
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await markPedidoPaid("pay_1", "2026-11-06");
    expect(JSON.stringify(exec.mock.calls[1][0])).toContain("refund_pending = TRUE");
  });

  it("primeiro pagamento muda para pago e grava o destino", async () => {
    exec.mockResolvedValueOnce({ rows: [{ id: 7, client_id: 10, location_id: 8, empresa_id: 5, kind: "receita" }] })
      .mockResolvedValueOnce({ rows: [] });
    results.push([]);
    responsible.mockResolvedValue({ id: 1 });
    expect(await markPedidoPaid("pay_1", "2026-11-06")).toBe(true);
    expect(JSON.stringify(exec.mock.calls[1][0])).toContain("assigned_professional_id");
  });
});
