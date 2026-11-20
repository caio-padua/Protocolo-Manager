/** Liberação automática (opção B) e linha do tempo do cliente — banco e assinatura simulados. */
import { vi, describe, it, expect, beforeEach } from "vitest";

const exec = vi.fn();
let validacao = "true";
const assinar = vi.fn();
vi.mock("@workspace/db", () => ({ db: { execute: (q: unknown) => exec(q) } }));
vi.mock("../lib/secure-settings", () => ({ getSetting: async () => validacao, setSetting: vi.fn() }));
vi.mock("../routes/pedidos-medicos-documento", () => ({
  assinarEEnviarPedido: (...a: unknown[]) => assinar(...a),
  itensDoTexto: (t: string) => String(t).split("\n").filter(Boolean),
}));
vi.mock("../lib/ai-central", () => ({ requireAiTenant: () => ({ headers: {} }) }));
vi.mock("../lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { rodarLiberacaoAutomatica } from "../lib/liberacao-automatica";
import { linhaDoTempoPedido, previsaoPedido } from "../lib/linha-tempo-pedido";

const pedido = { id: 7, empresa_id: 5, details: "TSH", draft_items: null, assigned_professional_id: 6, kind: "pedido_exames", status: "pago" };

beforeEach(() => { exec.mockReset(); assinar.mockReset(); validacao = "true"; delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY; });

describe("liberação automática", () => {
  it("validação LIGADA: nunca assina e zera a contagem", async () => {
    exec.mockResolvedValue({ rows: [] });
    const r = await rodarLiberacaoAutomatica();
    expect(r.liberados).toBe(0);
    expect(assinar).not.toHaveBeenCalled();
    expect(JSON.stringify(exec.mock.calls[0][0])).toContain("liberar_em = NULL");
  });

  it("validação DESLIGADA: assina só o vencido, com o médico destino", async () => {
    validacao = "false";
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [pedido] }).mockResolvedValue({ rows: [] });
    assinar.mockResolvedValue({ ok: true, docToken: "t", envio: { status: "enviado", error: null } });
    const r = await rodarLiberacaoAutomatica();
    expect(r.liberados).toBe(1);
    expect(assinar.mock.calls[0][2]).toBe(6);
    const sqls = exec.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(sqls.some((q) => q.includes("liberado_auto = TRUE"))).toBe(true);
  });

  it("falha de assinatura não marca liberado e reagenda", async () => {
    validacao = "false";
    exec.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [pedido] }).mockResolvedValue({ rows: [] });
    assinar.mockResolvedValue({ ok: false, status: 403, error: "Certificado vencido" });
    const r = await rodarLiberacaoAutomatica();
    expect(r).toEqual({ liberados: 0, falhas: 1 });
    expect(exec.mock.calls.map((c) => JSON.stringify(c[0])).some((q) => q.includes("liberado_auto = TRUE"))).toBe(false);
  });
});

describe("linha do tempo do cliente", () => {
  it("é a mesma com a validação ligada ou desligada", () => {
    const e = linhaDoTempoPedido({ status: "pago" })!;
    expect(e.map((x) => x.rotulo)).toEqual(["Solicitação recebida", "Solicitação aguardando análise", "Solicitação analisada", "Solicitação liberada", "Solicitação encaminhada"]);
    expect(e.map((x) => x.estado)).toEqual(["feito", "atual", "pendente", "pendente", "pendente"]);
    expect(previsaoPedido({ status: "pago", isento: true, validacaoAtiva: false })).toContain("10 minutos");
  });
  it("encaminhada só depois do envio aceito", () => {
    expect(linhaDoTempoPedido({ status: "emitido", doc_send_status: "enviado" })!.every((x) => x.estado === "feito")).toBe(true);
    expect(linhaDoTempoPedido({ status: "emitido", doc_send_status: "falha" })![4].estado).toBe("atual");
    expect(linhaDoTempoPedido({ status: "recusado" })).toBeNull();
  });
});
