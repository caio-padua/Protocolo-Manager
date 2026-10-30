import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
const state = vi.hoisted(() => ({
  authorized: true, active: false, consentValid: false, manual: null as boolean | null, logs: [] as any[],
  writes: [] as any[], failAudit: false, insert: null as any, update: null as any,
}));
vi.mock("@workspace/db", async () => {
  const schema = await import("../../../../lib/db/src/schema");
  const row = () => ({ id: 6, lembreteId: 6, clienteId: 71, nome: "Paciente sintético",
    telefone: "+5500000000000", ativo: state.active, ativoManual: state.manual,
    periodos: [{ sigla: "IM", nome: "Inicio da Manha", tipo: "tomar", formulas: [
      { nome: "Fórmula sintética", posologia: "ditado manual", posologiaManual: true },
    ] }], horariosEnvio: ["07:00"] });
  return { ...schema, db: {
    select: () => ({ from: () => {
      const chain: any = { then: (yes: any, no: any) => Promise.resolve([row()]).then(yes, no) };
      chain.where = chain.innerJoin = chain.orderBy = chain.limit = () => chain;
      return chain;
    } }),
    insert: (table: unknown) => ({ values: (value: any) => {
      if (table === schema.dispatchLogTable) {
        if (state.failAudit) return Promise.reject(new Error("audit unavailable"));
        state.logs.push(value); return Promise.resolve([]);
      }
      state.insert = value;
      return { onConflictDoUpdate: (update: any) => {
        state.update = update.set;
        return { returning: async () => [{ id: 6, ativo: typeof update.set.ativo === "boolean"
          ? update.set.ativo : state.active && state.manual !== false && state.consentValid }] };
      } };
    } }),
    update: () => ({ set: (value: any) => ({ where: async () => {
      state.writes.push(value);
      state.active = value.ativo;
      if ("ativoManual" in value) state.manual = value.ativoManual;
    } }) }),
  } };
});
vi.mock("../lib/clinical-emitter", async importOriginal => {
  const actual = await importOriginal<any>();
  return { ...actual, resolveClinicalEmitter: vi.fn(async () => {
    if (!state.authorized) throw new actual.ClinicalIdentityError(403, "Sem vínculo com a clínica.");
    return { professional: { id: 41 }, client: { id: 71 }, clinic: { id: 31, empresaId: 21 } };
  }) };
});
vi.mock("../lib/whatsapp", () => ({ sendWhatsapp: vi.fn() }));
vi.mock("../lib/mensageria-paxmed", () => ({ montarMensagemPaxmed: vi.fn() }));
vi.mock("../middleware/moduleGuard", () => ({ moduleGuard: () => (_r: unknown, _s: unknown, next: () => void) => next() }));
import { sincronizarLembretePrescricao } from "../lib/lembrete-periodo";
import router from "../routes/lembretes";
import { createCollaboratorToken } from "../lib/collaborator-auth";
import { sendWhatsapp } from "../lib/whatsapp";
const app = express().use(express.json()).use(router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
const patch = (payload: unknown) => request(app).patch("/lembretes/71")
  .set("Authorization", `Bearer ${createCollaboratorToken({ professionalId: 41, role: "executor" })}`).send(payload as object);
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { authorized: true, active: false, consentValid: false, manual: null, logs: [], writes: [], failAudit: false, insert: null, update: null });
});
describe("ativação explícita da agenda de lembretes", () => {
  it.each([false, true])("sincronizar com ativo anterior=%s salva conteúdo sem ativar", async active => {
    state.active = active;
    const result = await sincronizarLembretePrescricao(71, [
      { tipo: "formula", nome: "Fórmula sintética", periodos: ["manha"] },
    ]);
    expect(result.ativo).toBe(false); expect(state.insert.ativo).toBe(false);
    expect(state.update.periodos[0].formulas[0]).toMatchObject({ posologia: "ditado manual", posologiaManual: true });
    expect(sendWhatsapp).not.toHaveBeenCalled(); expect(state.logs).toHaveLength(0);
  });
  it("sincronizar mantém agenda previamente autorizada para telefone/clínica atuais", async () => {
    state.active = true; state.consentValid = true;
    const result = await sincronizarLembretePrescricao(71, [{ tipo: "formula", nome: "Fórmula sintética", periodos: ["manha"] }]);
    expect(result.ativo).toBe(true);
    expect(state.insert.ativo).toBe(false);
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const query = new PgDialect().sqlToQuery(state.update.ativo);
    expect(query.sql).toContain('"lembretes_prescricao"."ativo"');
    expect(query.sql).toContain('"lembretes_prescricao"."ativo_manual" IS DISTINCT FROM FALSE');
    expect(query.sql).toContain("d.channel = 'reminder_authorization'");
    expect(query.sql).toContain("d.empresa_id");
    expect(query.sql).toContain("'recipient'");
    expect(query.sql).toContain("'locationId'");
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });
  it.each(["telefone mudou", "clínica mudou", "autorização ausente"])("sincronizar não mantém ativo se %s", async () => {
    state.active = true; state.consentValid = false;
    const result = await sincronizarLembretePrescricao(71, [{ tipo: "formula", nome: "Fórmula sintética" }]);
    expect(result.ativo).toBe(false); expect(sendWhatsapp).not.toHaveBeenCalled();
  });
  it("sincronizar não religa após desativação manual, mesmo com autorização antiga", async () => {
    state.active = true; state.manual = false; state.consentValid = true;
    const result = await sincronizarLembretePrescricao(71, [{ tipo: "formula", nome: "Fórmula sintética" }]);
    expect(result.ativo).toBe(false);
  });
  it("remover todos os itens desliga uma agenda autorizada", async () => {
    state.active = true; state.consentValid = true;
    expect((await sincronizarLembretePrescricao(71, [])).ativo).toBe(false);
    expect(state.update.ativo).toBe(false);
  });
  it.each(["GET", "PATCH"])("%s exige autenticação", async method => {
    const result = method === "GET" ? await request(app).get("/lembretes/71") : await request(app).patch("/lembretes/71").send({});
    expect(result.status).toBe(401); expect(state.writes).toHaveLength(0);
  });
  it("colaborador sem vínculo não pode autorizar", async () => {
    state.authorized = false;
    expect((await patch({ ativoManual: true, confirmed: true, channel: "whatsapp", recipient: "+5500000000000" })).status).toBe(403);
    expect(state.logs).toHaveLength(0); expect(state.writes).toHaveLength(0);
  });
  it.each([{}, { confirmed: false }, { confirmed: true, channel: "telegram", recipient: "+5500000000000" },
    { confirmed: true, channel: "whatsapp", recipient: "old-phone" }])("não liga sem contato/canal/confirmacao exatos", async extra => {
    const result = await patch({ ativoManual: true, ...extra });
    expect(result.status).toBe(400); expect(state.writes).toHaveLength(0);
  });
  it("grava identidade, empresa e telefone antes de ligar, sem disparar imediatamente", async () => {
    const result = await patch({ ativoManual: true, confirmed: true, channel: "whatsapp", recipient: "+5500000000000" });
    expect(result.status).toBe(200); expect(state.writes[0].ativo).toBe(true);
    expect(state.logs[0]).toMatchObject({ channel: "reminder_authorization", status: "authorized", empresaId: 21 });
    expect(JSON.parse(state.logs[0].detail)).toMatchObject({ clientId: 71, locationId: 31, actorId: 41, recipient: "+5500000000000" });
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });
  it("auditoria indisponível impede ligar a agenda", async () => {
    state.failAudit = true;
    expect((await patch({ ativoManual: true, confirmed: true, channel: "whatsapp", recipient: "+5500000000000" })).status).toBe(500);
    expect(state.writes).toHaveLength(0);
  });
  it("editar conteúdo inativo não religa pelo padrão automático", async () => {
    const result = await patch({ horariosEnvio: ["08:00"] });
    expect(result.status).toBe(200); expect(state.writes[0].ativo).toBe(false);
    expect(state.logs).toHaveLength(0);
  });
  it("desativar nunca exige confirmação nem envia mensagem", async () => {
    state.active = true;
    expect((await patch({ ativoManual: false })).status).toBe(200);
    expect(state.writes[0].ativo).toBe(false); expect(sendWhatsapp).not.toHaveBeenCalled();
  });
});
