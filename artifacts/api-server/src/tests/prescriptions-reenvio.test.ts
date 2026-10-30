import { describe, expect, it, vi } from "vitest";
import { auditedDelivery, confirmedTarget, type DeliveryTarget } from "../lib/clinical-delivery";

const target: DeliveryTarget = { channel: "email", recipient: "patient@example.invalid", label: "Paciente sintético" };
describe("contrato de confirmação do reenvio", () => {
  it("exige confirmação literal e não escolhe canal ou destinatário padrão", () => {
    for (const body of [{}, { confirmed: "true" }, { confirmed: 1 }, { ...target, confirmed: true }]) {
      expect(() => confirmedTarget(body, [target])).toThrow();
    }
    expect(confirmedTarget({ confirmed: true, channel: target.channel, recipient: target.recipient }, [target])).toEqual(target);
  });
  it("recusa contato antigo, farmácia errada e cópias extras", () => {
    const body = { confirmed: true, channel: "email", recipient: target.recipient };
    expect(() => confirmedTarget({ ...body, recipient: "old@example.invalid" }, [target])).toThrow();
    expect(() => confirmedTarget({ ...body, pharmacyId: 22 }, [target])).toThrow();
    expect(() => confirmedTarget({ ...body, cc: "owner@example.invalid" }, [target])).toThrow();
  });
  it("registra tentativa antes do provedor e grava erro exato da recusa", async () => {
    const events: string[] = [];
    const finish = vi.fn(async () => { events.push("finish"); });
    const result = await auditedDelivery(async () => { events.push("start"); return 7; },
      async () => { events.push("provider"); return { accepted: false, error: "recusado" }; }, finish);
    expect(events).toEqual(["start", "provider", "finish"]);
    expect(result).toMatchObject({ id: 7, status: "failed", accepted: false, error: "recusado" });
    expect(finish).toHaveBeenCalledWith(7, "failed", "recusado");
  });
  it("falha inicial de auditoria interrompe antes de enviar", async () => {
    const provider = vi.fn();
    await expect(auditedDelivery(async () => { throw new Error("offline"); }, provider, vi.fn())).rejects.toThrow("offline");
    expect(provider).not.toHaveBeenCalled();
  });
  it("exceção do provedor não vira sucesso e não vaza credenciais na mensagem", async () => {
    const finish = vi.fn().mockResolvedValue(undefined);
    const result = await auditedDelivery(async () => 7,
      async () => { throw new Error("sensitive provider response"); }, finish);
    expect(result.status).toBe("failed");
    expect(result.error).not.toContain("sensitive");
    expect(finish).toHaveBeenCalledWith(7, "failed", expect.any(String));
  });
});
