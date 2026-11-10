import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { drizzle } from "drizzle-orm/node-postgres";
import { startIsolatedPostgres } from "./helpers/postgres-isolado";

const state = vi.hoisted(() => ({ database: null as any }));
const sim = vi.hoisted(() => ({
  emails: [] as Array<{ to: string; subject: string; html: string; doc: any }>,
  whats: [] as Array<{ phone: string; message: string; doc: any }>,
  tg: [] as Array<{ chatId: string; text: string; doc: any }>,
  emailOk: true, whatsOk: true, tgOk: true, tgMock: false, agendaOff: false,
}));

vi.mock("@workspace/db", () => ({
  db: new Proxy({}, {
    get(_t, key) {
      const value = state.database?.[key];
      return typeof value === "function" ? value.bind(state.database) : value;
    },
  }),
}));
vi.mock("../routes/collaborator", () => ({
  requireCollaborator(req: any, res: any, next: any) {
    if (!req.headers["x-prof"]) return res.status(401).json({ error: "Não autenticado" });
    req.collaborator = { professionalId: Number(req.headers["x-prof"]), credentialVersion: 0 };
    req.tenantContext = { empresaId: Number(req.headers["x-emp"]), isPlatformOwner: false, authenticated: true };
    next();
  },
}));
vi.mock("../middleware/moduleGuard", () => ({
  moduleGuard: () => (_req: any, res: any, next: any) =>
    sim.agendaOff ? res.status(403).json({ error: "Módulo agenda desativado" }) : next(),
}));
vi.mock("../lib/visit-confirmation-channels", async () => {
  // Os canais simulados recebem o PaxterDoc e o tornam texto com os MESMOS renderizadores do motor
  // Hermes, para os testes verem o que o cliente veria (assunto, e-mail de marca, legendas).
  const { renderPaxterEmail, assuntoPadrao } = await import("../lib/messaging/render-email");
  const { renderWhatsappCaption, renderTelegramCaption } = await import("../lib/messaging/render-text");
  return {
    realChannels: {
      async sendEmail(to: string, doc: any) {
        sim.emails.push({ to, subject: assuntoPadrao(doc), html: renderPaxterEmail(doc, "https://teste.paxter"), doc });
        return sim.emailOk ? { success: true } : { success: false, error: "simulado" };
      },
      async sendWhatsapp(phone: string, doc: any) {
        sim.whats.push({ phone, message: renderWhatsappCaption(doc), doc });
        return sim.whatsOk ? { sent: true, via: "twilio" } : { sent: false, via: "link", error: "simulado" };
      },
      async sendTelegram(chatId: string, doc: any) {
        sim.tg.push({ chatId, text: renderTelegramCaption(doc), doc });
        return sim.tgOk ? { sent: true, mock: sim.tgMock } : { sent: false, mock: false, error: "simulado" };
      },
    },
  };
});

import visitRouter, { visitConfirmationPublicRouter } from "../routes/visit-confirmation";
import { ensureVisitConfirmations } from "../lib/ensure-visit-confirmations";
import * as core from "../lib/visit-confirmation";
import { realChannels } from "../lib/visit-confirmation-channels";
import { availableFields, expectedValue } from "../lib/visit-confirmation-challenge";
import { managerEmail, whenLabel } from "../lib/visit-confirmation-messages";
import { renderPaxterEmail } from "../lib/messaging/render-email";

const channels = realChannels as unknown as core.ChannelSenders;
const app = express();
app.use(express.json());
app.use(visitConfirmationPublicRouter);
app.use(visitRouter);

let isolated: Awaited<ReturnType<typeof startIsolatedPostgres>>;
const q = (text: string, values?: unknown[]) => isolated.pool.query(text, values);
const H = (prof: number, emp: number) => ({ "x-prof": String(prof), "x-emp": String(emp) });
const ref = (sessionId: number, clientId = 10, empresaId = 5, locationId: number | null = 1): core.VisitRef =>
  ({ sessionId, clientId, empresaId, locationId });
const T0 = new Date("2026-11-09T15:00:00.000Z");
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const HOUR = 3_600_000;
const lastKey = () => /\b(\d{6})\b/.exec(sim.whats[sim.whats.length - 1].message)![1];
const rowOf = async (sessionId: number) => (await q("SELECT * FROM visit_confirmations WHERE session_id=$1", [sessionId])).rows[0];

beforeAll(async () => {
  process.env.SESSION_SECRET = "segredo-de-teste-0123456789abcdef";
  process.env.PUBLIC_BASE_URL = "https://exemplo.test";
  isolated = await startIsolatedPostgres();
  state.database = drizzle(isolated.pool);
  await q(`
    CREATE TABLE sessions (id int PRIMARY KEY, empresa_id int, client_id int, protocol_id int, status text,
      agenda_archived boolean DEFAULT false, scheduled_date text, scheduled_time text);
    CREATE TABLE clients (id int PRIMARY KEY, empresa_id int, status text, location_id int, name text, email text,
      phone text, telegram_chat_id text, cpf text, birth_date text, address text);
    CREATE TABLE protocols (id int PRIMARY KEY, empresa_id int, client_id int);
    CREATE TABLE substance_applications (id serial PRIMARY KEY, session_id int, status text);
    CREATE TABLE professionals (id int PRIMARY KEY, name text, email text, active boolean, credential_version int DEFAULT 0);
    CREATE TABLE locations (id int PRIMARY KEY, empresa_id int, active text);
    CREATE TABLE location_professionals (id serial PRIMARY KEY, location_id int, professional_id int);
    CREATE TABLE clinical_access_grants (id serial PRIMARY KEY, empresa_id int, location_id int, professional_id int,
      is_clinic_admin boolean, is_responsible_doctor boolean);
    INSERT INTO locations VALUES (1,5,'true'),(2,6,'true'),(3,5,'true');
    INSERT INTO clients VALUES
      (10,5,'active',1,'Maria Souza','maria@cliente.test','+5511999990001','777','529.982.247-25','1980-05-17','Rua das Flores, 42 - Centro'),
      (11,5,'active',1,'Joana Poucos Dados','joana@cliente.test',null,null,null,null,null),
      (12,5,'active',1,'Ana Sem Contato',null,null,null,'529.982.247-25','1990-01-01',null),
      (13,5,'active',3,'Clara Local Sem Gestao','clara@cliente.test','+5511999990003',null,'529.982.247-25','1985-03-03',null),
      (20,6,'active',2,'Cliente Outra Clinica','outra@cliente.test','+5511999990009',null,'111.444.777-35','1970-01-01',null);
    INSERT INTO protocols VALUES (100,5,10),(101,5,11),(102,5,12),(103,5,13),(200,6,20);
    INSERT INTO sessions VALUES
      (1000,5,10,100,'scheduled',false,'2026-11-09','14:30'),
      (1001,5,10,100,'scheduled',false,'2026-11-16','14:30'),
      (1002,5,10,100,'cancelled',false,'2026-11-23','14:30'),
      (1003,5,10,100,'scheduled',false,'2026-11-30','14:30'),
      (1004,5,10,100,'scheduled',false,'2026-12-07','14:30'),
      (1005,5,10,100,'scheduled',false,'2026-12-14','14:30'),
      (1011,5,11,101,'scheduled',false,'2026-11-09','15:00'),
      (1012,5,12,102,'scheduled',false,'2026-11-09','16:00'),
      (1013,5,13,103,'scheduled',false,'2026-11-09','17:00'),
      (1006,5,10,100,'scheduled',false,'2026-12-21','14:30'),
      (1007,5,10,100,'scheduled',false,'2026-12-28','14:30'),
      (2000,6,20,200,'scheduled',false,'2026-11-09','14:30');
    INSERT INTO substance_applications (session_id, status) VALUES
      (1000,'applied'),(1001,'applied'),(1002,'applied'),(1003,'applied'),(1004,'applied'),(1005,'applied'),
      (1011,'applied'),(1012,'applied'),(1013,'applied'),(1007,'pending');
    INSERT INTO professionals VALUES
      (1,'Enfermeira Teste','enf@clinica.test',true,0),
      (2,'Gestor Admin','Admin@Clinica.test',true,0),
      (3,'Medico Responsavel e Admin','medico@clinica.test',true,0),
      (4,'Gestor Sem Email',null,true,0),
      (5,'Gestor Inativo','inativo@clinica.test',false,0),
      (6,'Gestor Outra Clinica','outra@clinica.test',true,0),
      (7,'Duplicado de E-mail','admin@clinica.test',true,0),
      (9,'Enfermeira Outra Clinica','enf9@clinica.test',true,0),
      (8,'Enfermeira Sem Vinculo','enf8@clinica.test',true,0);
    INSERT INTO location_professionals (location_id, professional_id) VALUES
      (1,1),(1,2),(1,3),(1,4),(1,5),(1,7),(2,6),(2,9),(3,1);
    INSERT INTO clinical_access_grants (empresa_id, location_id, professional_id, is_clinic_admin, is_responsible_doctor) VALUES
      (5,1,2,true,false),(5,1,3,true,true),(5,1,4,true,false),(5,1,5,true,false),(5,1,7,true,false),(6,2,6,true,true);
  `);
  await ensureVisitConfirmations();
}, 120_000);

afterAll(async () => { await isolated?.stop(); }, 60_000);

beforeEach(() => {
  sim.emails.length = 0; sim.whats.length = 0; sim.tg.length = 0;
  sim.emailOk = true; sim.whatsOk = true; sim.tgOk = true; sim.tgMock = false; sim.agendaOff = false;
});

describe("K8a — chave por visita", () => {
  it("T-K8-1: chave é criptográfica de 6 dígitos (não constante, sempre 6 posições)", () => {
    const keys = Array.from({ length: 2000 }, () => core.generateKey());
    expect(keys.every((k) => /^\d{6}$/.test(k))).toBe(true);
    expect(new Set(keys).size).toBeGreaterThan(1800);
  });

  it("T-K8-2: só o hash fica no banco; a rota de envio nunca devolve a chave; canais recebem a chave", async () => {
    const res = await request(app).post("/sessions/1000/confirmacao/chave/enviar").set(H(1, 5));
    expect(res.status).toBe(200);
    const key = lastKey();
    expect(JSON.stringify(res.body)).not.toContain(key);
    expect(res.body.canais.map((c: any) => `${c.canal}:${c.estado}`)).toEqual(["email:aceito", "whatsapp:aceito", "telegram:aceito"]);
    const row = await rowOf(1000);
    expect(row.key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.key_hash).not.toContain(key);
    expect(JSON.stringify(row)).not.toContain(`"${key}"`);
    expect(sim.emails[0].subject).not.toContain(key);
    expect(sim.emails[0].html).toContain(key);
    expect(res.body.resumo.estado).toBe("chave_enviada");
  });

  it("T-K8-13: status honesto por canal (aceito, falhou, simulado, sem contato)", async () => {
    sim.whatsOk = false; sim.tgMock = true;
    const res = await request(app).post("/sessions/1001/confirmacao/chave/enviar").set(H(1, 5));
    expect(res.status).toBe(200);
    expect(res.body.canais).toEqual([
      { canal: "email", estado: "aceito" }, { canal: "whatsapp", estado: "falhou" }, { canal: "telegram", estado: "simulado" },
    ]);
    const semContato = await request(app).post("/sessions/1012/confirmacao/chave/enviar").set(H(1, 5));
    expect(semContato.status).toBe(502); // sem e-mail, telefone nem Telegram: ninguém recebeu a chave
    expect(semContato.body.canais.every((c: any) => c.estado === "sem_contato")).toBe(true);
  });

  it("T-K8-12: nenhum canal aceitou -> 502 claro, estado volta e a enfermeira repete na hora (sem esperar 60 s)", async () => {
    sim.emailOk = false; sim.whatsOk = false; sim.tgOk = false;
    const falha = await request(app).post("/sessions/1003/confirmacao/chave/enviar").set(H(1, 5));
    expect(falha.status).toBe(502);
    expect(falha.body.resumo.estado).toBe("sem_pedido");
    expect(falha.body.resumo.chaveAtiva).toBe(false);
    sim.emailOk = true; sim.whatsOk = true; sim.tgOk = true;
    const ok = await request(app).post("/sessions/1003/confirmacao/chave/enviar").set(H(1, 5));
    expect(ok.status).toBe(200);
  });

  it("T-K8-3: 5 erros matam a chave; reenvio só após 60 s; nova chave invalida a anterior", async () => {
    const issued = await core.issueKey(ref(1004), 1, T0);
    expect(issued.ok).toBe(true);
    const first = (issued as any).key as string;
    const wrong = first === "000000" ? "111111" : "000000";
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await core.verifyKey(ref(1004), wrong, 1, plus(T0, 1000));
      seen.push(r.ok ? "ok" : r.reason);
    }
    expect(seen).toEqual(["incorreta", "incorreta", "incorreta", "incorreta", "tentativas_esgotadas"]);
    const afterDeath = await core.verifyKey(ref(1004), first, 1, plus(T0, 2000));
    expect(afterDeath).toMatchObject({ ok: false, reason: "tentativas_esgotadas" });

    const tooSoon = await core.issueKey(ref(1004), 1, plus(T0, 30_000));
    expect(tooSoon).toMatchObject({ ok: false, reason: "aguarde" });
    const second = await core.issueKey(ref(1004), 1, plus(T0, 61_000));
    expect(second.ok).toBe(true);
    const secondKey = (second as any).key as string;
    if (secondKey !== first) {
      expect(await core.verifyKey(ref(1004), first, 1, plus(T0, 62_000))).toMatchObject({ ok: false });
    }
    expect(await core.verifyKey(ref(1004), secondKey, 1, plus(T0, 63_000))).toEqual({ ok: true });
  });

  it("chave expira em 10 minutos e formato inválido nem conta tentativa", async () => {
    const issued = await core.issueKey(ref(1005), 1, T0);
    const key = (issued as any).key as string;
    expect(await core.verifyKey(ref(1005), "12ab56", 1, T0)).toMatchObject({ reason: "formato" });
    expect((await rowOf(1005)).key_attempts).toBe(0);
    expect(await core.verifyKey(ref(1005), key, 1, plus(T0, 10 * 60_000 + 1000))).toMatchObject({ ok: false, reason: "expirada" });
  });

  it("T-K8-4/5: chave amarrada à visita/cliente/empresa e de uso único", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id IN (1000,1001)");
    const now = new Date();
    const issued = await core.issueKey(ref(1000), 1, now);
    const key = (issued as any).key as string;
    // outra visita do mesmo cliente nunca aceita a chave desta
    expect(await core.verifyKey(ref(1001), key, 1, now)).toMatchObject({ ok: false });
    // outra empresa/cliente: sem acesso à linha
    expect(await core.verifyKey({ sessionId: 1000, clientId: 10, empresaId: 6, locationId: 1 }, key, 1)).toMatchObject({ reason: "sem_chave" });
    expect(await core.verifyKey({ sessionId: 1000, clientId: 99, empresaId: 5, locationId: 1 }, key, 1)).toMatchObject({ reason: "sem_chave" });
    const ok = await request(app).post("/sessions/1000/confirmacao/chave/validar").set(H(1, 5)).send({ codigo: key });
    expect(ok.status).toBe(200);
    expect(ok.body.resumo.estado).toBe("rubrica_chave");
    expect(JSON.stringify(ok.body)).not.toContain(key);
    const reuse = await request(app).post("/sessions/1000/confirmacao/chave/validar").set(H(1, 5)).send({ codigo: key });
    expect(reuse.status).toBe(409);
  });

  it("T-K8-5/6: uso único e duas validações simultâneas — só uma vale", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1000");
    const now = new Date();
    const issued = await core.issueKey(ref(1000), 1, now);
    const key = (issued as any).key as string;
    const results = await Promise.all(Array.from({ length: 6 }, () => core.verifyKey(ref(1000), key, 1, now)));
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(await core.verifyKey(ref(1000), key, 1, now)).toMatchObject({ ok: false, reason: "ja_completa" });
    const row = await rowOf(1000);
    expect(row.state).toBe("rubrica_chave");
    expect(row.rubrica_method).toBe("chave");
    expect(row.key_hash).toBeNull();
  });

  it("tentativas erradas simultâneas nunca passam de 5", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1001");
    const now = new Date();
    const issued = await core.issueKey(ref(1001), 1, now);
    const key = (issued as any).key as string;
    const wrong = key === "999999" ? "888888" : "999999";
    await Promise.all(Array.from({ length: 12 }, () => core.verifyKey(ref(1001), wrong, 1, now)));
    expect((await rowOf(1001)).key_attempts).toBeLessThanOrEqual(5);
    expect(await core.verifyKey(ref(1001), key, 1, now)).toMatchObject({ ok: false });
  });

  it("T-K8-18: enfermeira de outra clínica, sem vínculo, token errado ou visita cancelada não passam", async () => {
    expect((await request(app).post("/sessions/1000/confirmacao/chave/enviar").set(H(9, 6))).status).toBe(404); // outra empresa
    expect((await request(app).post("/sessions/2000/confirmacao/chave/enviar").set(H(1, 5))).status).toBe(404); // visita de outra empresa
    expect((await request(app).post("/sessions/1000/confirmacao/chave/enviar").set(H(8, 5))).status).toBe(404); // sem vínculo no local
    expect((await request(app).post("/sessions/1000/confirmacao/chave/enviar")).status).toBe(401);
    expect((await request(app).post("/sessions/1002/confirmacao/chave/enviar").set(H(1, 5))).status).toBe(409); // cancelada
    expect((await request(app).get("/sessions/abc/confirmacao").set(H(1, 5))).status).toBe(404);
  });

  it("T-K8-17: data e hora da visita aparecem como foram agendadas (Brasília), sem deslocar", () => {
    expect(whenLabel("2026-11-09", "14:30")).toBe("09/11/2026 às 14:30");
    expect(whenLabel("2026-01-01", "00:05")).toBe("01/01/2026 às 00:05");
  });
});

describe("K8b — Cliente confirma depois", () => {
  const sessionId = 1011;

  it("T-K8-9/12: gestão = administrador + responsável técnico, sem repetir e-mail; falha de canal não bloqueia", async () => {
    sim.emailOk = false;
    const res = await request(app).post(`/sessions/${sessionId}/confirmacao/pendente`).set(H(1, 5)).send({ motivo: "Cliente sem celular" });
    expect(res.status).toBe(200);
    expect(res.body.resumo.estado).toBe("pendente");
    expect(res.body.avisos.length).toBeGreaterThan(0);
    const row = await rowOf(sessionId);
    expect(row.state).toBe("pendente");
    expect(row.pending_reason).toBe("Cliente sem celular");
    const gestao = sim.emails.filter((e) => e.to.includes("clinica.test")).map((e) => e.to).sort();
    expect(gestao).toEqual(["admin@clinica.test", "medico@clinica.test"]);
  });

  it("T-K8-9: sem nenhum gestor com e-mail, avisa e nunca bloqueia", async () => {
    const res = await request(app).post("/sessions/1013/confirmacao/pendente").set(H(1, 5)).send({});
    expect(res.status).toBe(200);
    expect(res.body.avisos.join(" ")).toMatch(/Nenhum gestor/);
    expect((await rowOf(1013)).state).toBe("pendente");
    expect(sim.emails.filter((e) => e.to.includes("clinica.test")).length).toBe(0);
    expect(sim.emails.filter((e) => e.to === "clara@cliente.test").length).toBe(1);
  });

  it("pendente é idempotente: segundo clique não reenvia nem troca o link", async () => {
    await request(app).post("/sessions/1012/confirmacao/pendente").set(H(1, 5)).send({});
    const before = await rowOf(1012);
    sim.emails.length = 0;
    const again = await request(app).post("/sessions/1012/confirmacao/pendente").set(H(1, 5)).send({});
    expect(again.status).toBe(200);
    expect(again.body.jaEstavaPendente).toBe(true);
    expect(sim.emails.length).toBe(0);
    expect((await rowOf(1012)).link_nonce).toBe(before.link_nonce);
  });

  it("T-K8-7/8: abrir o link NÃO confirma; só o POST confirma; link inválido, adulterado ou reutilizado é neutro", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1003");
    const now = new Date();
    await core.markPending(ref(1003), { professionalId: 1, origin: "enfermeira" }, now);
    const row = await rowOf(1003);
    const token = core.buildLinkToken(row)!;

    const page = await request(app).get(`/confirmacao-visita/${token}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Confirmo");
    expect(page.text).not.toContain(token);
    expect((await rowOf(1003)).state).toBe("pendente");

    const invalid = await request(app).get("/confirmacao-visita/lixo");
    const tampered = await request(app).get(`/confirmacao-visita/${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`);
    const otherId = await request(app).get(`/confirmacao-visita/9999.${token.split(".")[1]}`);
    for (const r of [invalid, tampered, otherId]) { expect(r.status).toBe(404); expect(r.text).toBe(invalid.text); }

    const posted = await request(app).post(`/confirmacao-visita/${token}`);
    expect(posted.status).toBe(200);
    expect(posted.text).toContain("Obrigado");
    const done = await rowOf(1003);
    expect(done.state).toBe("confirmada_email");
    expect(done.confirmed_fingerprint).toMatch(/^[0-9a-f]{32}$/);
    const second = await request(app).post(`/confirmacao-visita/${token}`);
    expect(second.text).toContain("já estava registrada");
  });

  it("T-K8-8: link vale 7 dias; depois disso é neutro e não confirma", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1004");
    await core.markPending(ref(1004), { professionalId: 1, origin: "enfermeira" }, T0);
    const token = core.buildLinkToken(await rowOf(1004))!;
    expect(await core.confirmByLink(token, "fp", plus(T0, 8 * 24 * HOUR))).toEqual({ status: "expirado" });
    expect((await rowOf(1004)).state).toBe("pendente");
  });

  it("T-K8-10/11: 3 e-mails (no ato, +24 h, +48 h), aviso final +24 h depois, sem duplicar; clique tardio vale 'com atraso'", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1005");
    await core.markPending(ref(1005), { professionalId: 1, origin: "enfermeira" }, T0);
    const id = (await rowOf(1005)).id;
    const run = (now: Date) => core.dispatchDue(channels, { now, onlyId: id });
    const sentTo = () => sim.emails.filter((e) => e.to === "maria@cliente.test").length;
    const mgr = (s: string) => sim.emails.filter((e) => e.to.includes("clinica.test") && e.subject.includes(s)).length;

    // duas rotinas ao mesmo tempo no mesmo instante: só um e-mail ao cliente e um à gestão por destinatário
    await Promise.all([run(T0), run(T0)]);
    expect(sentTo()).toBe(1);
    expect(mgr("Confirmação pendente")).toBe(2);

    await run(plus(T0, 23 * HOUR));
    expect(sentTo()).toBe(1);
    await run(plus(T0, 24 * HOUR));
    expect(sentTo()).toBe(2);
    await run(plus(T0, 48 * HOUR));
    expect(sentTo()).toBe(3);
    expect(mgr("NÃO CONFIRMADA")).toBe(0);
    await run(plus(T0, 71 * HOUR));
    expect(mgr("NÃO CONFIRMADA")).toBe(0);
    await Promise.all([run(plus(T0, 72 * HOUR)), run(plus(T0, 72 * HOUR))]);
    expect(mgr("NÃO CONFIRMADA")).toBe(2);
    expect((await rowOf(1005)).state).toBe("nao_confirmada");
    await run(plus(T0, 200 * HOUR));
    expect(sentTo()).toBe(3);
    expect(mgr("NÃO CONFIRMADA")).toBe(2);

    const token = core.buildLinkToken(await rowOf(1005))!;
    expect(await core.confirmByLink(token, "fp", plus(T0, 100 * HOUR))).toEqual({ status: "confirmada", late: true });
    const fin = await rowOf(1005);
    expect(fin.state).toBe("confirmada_email");
    expect(fin.confirmed_late).toBe(true);
    expect(fin.manager_final_sent_at).not.toBeNull(); // o histórico do atraso nunca é apagado
  });

  it("T-K8-11: depois da confirmação (ou da chave) nenhum lembrete sai", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id IN (1000,1001)");
    await core.markPending(ref(1000), { professionalId: 1, origin: "enfermeira" }, T0);
    await core.dispatchDue(channels, { now: T0, onlyId: (await rowOf(1000)).id });
    const afterFirst = sim.emails.length;
    await core.confirmByLink(core.buildLinkToken(await rowOf(1000))!, "fp", plus(T0, HOUR));
    const id0 = (await rowOf(1000)).id;
    await core.dispatchDue(channels, { now: plus(T0, 25 * HOUR), onlyId: id0 });
    await core.dispatchDue(channels, { now: plus(T0, 100 * HOUR), onlyId: id0 });
    expect(sim.emails.length).toBe(afterFirst);

    // pendente + chave correta depois: a rubrica plena também encerra os lembretes
    await core.markPending(ref(1001), { professionalId: 1, origin: "enfermeira" }, T0);
    const issued = await core.issueKey(ref(1001), 1, plus(T0, HOUR));
    await core.verifyKey(ref(1001), (issued as any).key, 1, plus(T0, HOUR + 1000));
    sim.emails.length = 0;
    await core.dispatchDue(channels, { now: plus(T0, 30 * HOUR), onlyId: (await rowOf(1001)).id });
    expect(sim.emails.length).toBe(0);
    expect((await rowOf(1001)).state).toBe("rubrica_chave");
  });

  it("R5: sem endereço público o link não é montado, a falha é registrada e a gestão é avisada", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1005");
    await core.markPending(ref(1005), { professionalId: 1, origin: "enfermeira" }, T0);
    const id = (await rowOf(1005)).id;
    for (const nome of ["PUBLIC_BASE_URL", "REPLIT_DOMAINS", "REPLIT_DEV_DOMAIN", "RAILWAY_PUBLIC_DOMAIN"]) vi.stubEnv(nome, "");
    const antes = sim.emails.filter((e) => e.to === "maria@cliente.test").length;
    try {
      const stats = await core.dispatchDue(channels, { now: T0, onlyId: id });
      expect(stats.falhas).toBe(1);
      expect(stats.clienteEmails).toBe(0);
      expect(stats.avisos.some((a) => a.includes("Endereço público do sistema não configurado"))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(sim.emails.filter((e) => e.to === "maria@cliente.test").length).toBe(antes);
    const ev = await q("SELECT count(*)::int AS n FROM visit_confirmation_events WHERE session_id=1005 AND event='sem_url_publica'");
    expect(ev.rows[0].n).toBe(1);
    expect((await rowOf(1005)).client_email_failures).toBe(1);
  });

  it("cliente sem e-mail: registra a falha, avisa a gestão e nunca bloqueia", async () => {
    await core.markPending(ref(1012, 12), { professionalId: 1, origin: "enfermeira" }, T0).catch(() => undefined);
    const row = await rowOf(1012);
    expect(row.state).toBe("pendente");
    expect(row.client_email_failures).toBeGreaterThanOrEqual(1);
  });

  it("visita cancelada depois do pedido: rotina pula sem enviar", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1002");
    await core.markPending(ref(1002), { professionalId: 1, origin: "enfermeira" }, T0);
    const stats = await core.dispatchDue(channels, { now: T0, onlyId: (await rowOf(1002)).id });
    expect(stats.clienteEmails).toBe(0);
    expect(stats.pulados).toBeGreaterThan(0);
  });
});

describe("K8c — desafio presencial", () => {
  const prep = async (sessionId: number, clientId: number, protocol = 100) => {
    await q("DELETE FROM visit_confirmations WHERE session_id=$1", [sessionId]);
    const ctx = (await core.loadContext(sessionId))!;
    return { r: ref(sessionId, clientId), ctx, protocol };
  };
  const solve = async (sessionId: number, ctx: core.VisitContext) => {
    const row = await rowOf(sessionId);
    return { metade1: expectedValue(row.challenge_field_a, ctx)!, metade2: expectedValue(row.challenge_field_b, ctx)! };
  };

  it("T-K8-15: a tela recebe só as legendas, nunca o valor do cadastro", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1000");
    const res = await request(app).get("/sessions/1000/confirmacao/desafio").set(H(1, 5));
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("disponivel");
    const text = JSON.stringify(res.body.desafio);
    for (const secret of ["725", "529", "042", "980", "FLO"]) expect(text).not.toContain(secret);
    expect(res.body.desafio.metades[0].rotulo.length).toBeGreaterThan(5);
    expect(res.body.desafio).toMatchObject({ rodada: 1, maxRodadas: 3, tentativasRestantes: 3 });
  });

  it("T-K8-14: acerto grava rubrica 'por dados do cadastro', NÃO completa a confirmação e liga o e-mail de um clique", async () => {
    const { ctx } = await prep(1000, 10);
    await request(app).get("/sessions/1000/confirmacao/desafio").set(H(1, 5));
    const answers = await solve(1000, ctx);
    const res = await request(app).post("/sessions/1000/confirmacao/desafio").set(H(1, 5))
      .send({ metade1: ` ${answers.metade1.toLowerCase()} `, metade2: answers.metade2 });
    expect(res.status).toBe(200);
    expect(res.body.metodo).toBe("desafio");
    expect(res.body.resumo.estado).toBe("rubrica_desafio");
    expect(res.body.resumo.completa).toBe(false);
    expect(res.body.resumo.rubrica.metodo).toBe("desafio");
    const row = await rowOf(1000);
    expect(row.pending_origin).toBe("desafio");
    expect(sim.emails.filter((e) => e.to === "maria@cliente.test").length).toBe(1); // e-mail de confirmação continua
    expect(sim.emails.filter((e) => e.to.includes("clinica.test")).length).toBe(2);
    const token = core.buildLinkToken(row)!;
    expect((await core.confirmByLink(token, "fp")).status).toBe("confirmada");
    expect((await rowOf(1000)).state).toBe("confirmada_email");
  });

  it("T-K8-19/20/21: 3 rodadas x 3 tentativas, par nunca repete, depois trava e liga 'Cliente confirma depois'", async () => {
    const { r, ctx } = await prep(1001, 10);
    await request(app).get("/sessions/1001/confirmacao/desafio").set(H(1, 5));
    const outcomes: string[] = [];
    const pairs = new Set<string>();
    for (let i = 0; i < 9; i++) {
      const before = await rowOf(1001);
      pairs.add([before.challenge_field_a, before.challenge_field_b].sort().join("|"));
      const res = await request(app).post("/sessions/1001/confirmacao/desafio").set(H(1, 5)).send({ metade1: "ZZZ", metade2: "ZZZ" });
      outcomes.push(res.body.motivo);
      if (res.body.motivo === "nova_rodada") {
        const text = JSON.stringify(res.body.desafio);
        for (const secret of ["725", "529", "042", "980"]) expect(text).not.toContain(secret);
      }
    }
    expect(outcomes).toEqual([
      "incorreta", "incorreta", "nova_rodada", "incorreta", "incorreta", "nova_rodada", "incorreta", "incorreta", "travou",
    ]);
    expect(pairs.size).toBe(3); // três pares diferentes
    const row = await rowOf(1001);
    expect(row.challenge_locked).toBe(true);
    expect(row.pending_origin).toBe("desafio_travado");
    expect(row.state).toBe("pendente");
    expect(sim.emails.filter((e) => e.to === "maria@cliente.test").length).toBe(1);
    expect(sim.emails.filter((e) => e.to.includes("clinica.test")).length).toBe(2);
    // travado: nem a resposta certa passa
    const right = await solve(1001, ctx);
    const after = await request(app).post("/sessions/1001/confirmacao/desafio").set(H(1, 5)).send(right);
    expect(after.status).toBe(423);
    expect(r.sessionId).toBe(1001);
  });

  it("T-K8-20: respostas erradas simultâneas nunca ultrapassam 9 tentativas no total", async () => {
    await prep(1003, 10);
    await request(app).get("/sessions/1003/confirmacao/desafio").set(H(1, 5));
    await Promise.all(Array.from({ length: 24 }, () =>
      request(app).post("/sessions/1003/confirmacao/desafio").set(H(1, 5)).send({ metade1: "QQQ", metade2: "QQQ" })));
    const wrong = await q("SELECT count(*)::int AS n FROM visit_confirmation_events WHERE session_id=1003 AND event='desafio_incorreto'");
    expect(wrong.rows[0].n).toBeLessThanOrEqual(9);
    const row = await rowOf(1003);
    expect(row.challenge_round).toBeLessThanOrEqual(3);
  });

  it("T-K8-16: cliente sem dados suficientes fica 'indisponível'; só CPF e nascimento ainda formam pares", async () => {
    await prep(1011, 11);
    const none = await request(app).get("/sessions/1011/confirmacao/desafio").set(H(1, 5));
    expect(none.body).toEqual({ estado: "indisponivel", motivo: "dados_insuficientes" });
    const ctx = (await core.loadContext(1012))!;
    expect(availableFields(ctx).sort()).toEqual(["cpf_pri3", "cpf_ult3", "nasc_ano3"]);
  });

  it("auto-cura: desafio acertado sem o caminho por e-mail ligado é religado pela rotina", async () => {
    await q("DELETE FROM visit_confirmations WHERE session_id=1004");
    await core.getOrCreate(ref(1004));
    await q("UPDATE visit_confirmations SET state='rubrica_desafio', rubrica_method='desafio', rubrica_at=now(), rubrica_by_professional_id=1 WHERE session_id=1004");
    const stats = await core.dispatchDue(channels, { now: T0 });
    expect(stats.curados).toBeGreaterThanOrEqual(1);
    const row = await rowOf(1004);
    expect(row.pending_at).not.toBeNull();
    expect(row.state).toBe("rubrica_desafio");
  });
});

describe("Revisão independente — pré-condições e guardas", () => {
  it("sem aplicação registrada (ou só pendente) nada de chave, 'confirma depois' ou desafio; a consulta continua aberta", async () => {
    for (const id of [1006, 1007]) {
      const enviar = await request(app).post(`/sessions/${id}/confirmacao/chave/enviar`).set(H(1, 5));
      const pend = await request(app).post(`/sessions/${id}/confirmacao/pendente`).set(H(1, 5)).send({});
      const desG = await request(app).get(`/sessions/${id}/confirmacao/desafio`).set(H(1, 5));
      const desP = await request(app).post(`/sessions/${id}/confirmacao/desafio`).set(H(1, 5)).send({ metade1: "123", metade2: "456" });
      for (const r of [enviar, pend, desG, desP]) { expect(r.status).toBe(409); expect(r.body.motivo).toBe("sem_aplicacao"); }
      const resumo = await request(app).get(`/sessions/${id}/confirmacao`).set(H(1, 5));
      expect(resumo.status).toBe(200);
      expect(resumo.body.resumo.aplicacaoRegistrada).toBe(false);
    }
    expect(sim.emails.length + sim.whats.length + sim.tg.length).toBe(0);
    expect((await q("SELECT count(*)::int AS n FROM visit_confirmations WHERE session_id IN (1006,1007)")).rows[0].n).toBe(0);
    await q("INSERT INTO substance_applications (session_id, status) VALUES (1006, 'applied')");
    const ok = await request(app).get("/sessions/1006/confirmacao").set(H(1, 5));
    expect(ok.body.resumo.aplicacaoRegistrada).toBe(true);
    expect((await request(app).post("/sessions/1006/confirmacao/pendente").set(H(1, 5)).send({})).status).toBe(200);
  });

  it("T-K10-8: entrega ao painel o estado e o relato dos canais do aviso", async () => {
    await q("DELETE FROM visit_application_notices WHERE session_id=1000");
    const canais = [
      { canal: "email", estado: "aceito" },
      { canal: "whatsapp", estado: "falhou" },
      { canal: "telegram", estado: "sem_contato" },
    ];
    await q(`INSERT INTO visit_application_notices
      (session_id, empresa_id, client_id, state, applied_count, due_count, channels)
      VALUES (1000,5,10,'enviado',1,2,$1::jsonb)`, [JSON.stringify(canais)]);

    try {
      const response = await request(app).get("/sessions/1000/confirmacao").set(H(1, 5));
      expect(response.status, response.text).toBe(200);
      expect(response.body.resumo.avisoAplicacao).toMatchObject({
        estado: "enviado", aplicadas: 1, previstas: 2, canais,
      });
      expect(response.body.resumo.avisoAplicacao.em).toBeTruthy();
      expect(response.body.resumo).not.toHaveProperty("key_hash");
    } finally {
      await q("DELETE FROM visit_application_notices WHERE session_id=1000");
    }
  });

  it("empresa com o módulo Agenda desligado recebe 403 em todas as rotas da confirmação e nada é gravado", async () => {
    sim.agendaOff = true;
    const calls = [
      request(app).get("/sessions/1013/confirmacao").set(H(1, 5)),
      request(app).post("/sessions/1013/confirmacao/chave/enviar").set(H(1, 5)),
      request(app).post("/sessions/1013/confirmacao/chave/validar").set(H(1, 5)).send({ codigo: "123456" }),
      request(app).post("/sessions/1013/confirmacao/pendente").set(H(1, 5)).send({}),
      request(app).get("/sessions/1013/confirmacao/desafio").set(H(1, 5)),
      request(app).post("/sessions/1013/confirmacao/desafio").set(H(1, 5)).send({ metade1: "123", metade2: "456" }),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(403);
    expect(sim.emails.length + sim.whats.length + sim.tg.length).toBe(0);
  });

  it("aviso final não afirma que e-mails 'saíram' quando o provedor recusou", () => {
    const base = { kind: "final" as const, clientName: "Maria", when: "09/11/2026 às 14:30" };
    const full = { ...base, nurseName: null, origin: "enfermeira", clientHasEmail: true };
    const html = (a: Parameters<typeof managerEmail>[0]) => renderPaxterEmail(managerEmail(a), "https://teste.paxter");
    const todos = html({ ...full, emailsSent: 3, emailsFailed: 0 });
    expect(todos).toContain("foram aceitos pelo provedor");
    const nenhum = html({ ...full, emailsSent: 3, emailsFailed: 3 });
    expect(nenhum).toContain("nenhuma foi aceita");
    expect(nenhum).not.toContain("saíram");
    const parcial = html({ ...full, emailsSent: 3, emailsFailed: 1 });
    expect(parcial).toContain("2 aceitas e 1 recusadas");
  });
});
